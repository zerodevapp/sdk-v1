import {
    Kernel__factory,
    Kernel,
    ZeroDevSessionKeyPlugin,
    ZeroDevSessionKeyPlugin__factory,
} from '@zerodevapp/contracts-new';

import { MerkleTree } from "merkletreejs";

import { TransactionRequest, TransactionResponse } from '@ethersproject/providers'

import { ZeroDevSigner } from '../ZeroDevSigner';
import { Signer, Wallet, utils, BigNumber, Contract } from 'ethers';
import { Deferrable, hexConcat, hexZeroPad, defaultAbiCoder, keccak256, hexlify } from 'ethers/lib/utils';
import { UserOperationStruct } from '@zerodevapp/contracts'
import { ClientConfig } from '../ClientConfig';
import { ZeroDevProvider } from '../ZeroDevProvider';
import { HttpRpcClient } from '../HttpRpcClient';
import { BaseAccountAPI } from '../BaseAccountAPI';

// Deterministically deployed against 0.6 EntryPoint
export const DEFAULT_SESSION_KEY_PLUGIN = '0x6E2631aF80bF7a9cEE83F590eE496bCc2E40626D';

interface SessionPolicy {
    to: string;
    selectors?: string[];
}

export class SessionSigner extends ZeroDevSigner {
    sessionKeyPlugin: ZeroDevSessionKeyPlugin;
    sessionKey: Signer;
    validUntil: number;
    whitelist: SessionPolicy[];
    merkleTree: MerkleTree;
    signature: string;

    constructor(
        config: ClientConfig,
        provider: ZeroDevProvider,
        httpRpcClient: HttpRpcClient,
        smartAccountAPI: BaseAccountAPI,
        validUntil: number,
        whitelist: SessionPolicy[],
        signature: string,
        sessionKey: string,
        sessionKeyPlugin?: ZeroDevSessionKeyPlugin,
    ) {
        const _sessionKey = new Wallet(sessionKey, provider);
        super(
            config,
            _sessionKey,
            provider,
            httpRpcClient,
            smartAccountAPI
        );
        this.sessionKeyPlugin = sessionKeyPlugin ? sessionKeyPlugin :
            ZeroDevSessionKeyPlugin__factory.connect(DEFAULT_SESSION_KEY_PLUGIN, this.provider!);
        this.sessionKey = _sessionKey;
        this.validUntil = validUntil;
        this.whitelist = whitelist;
        let policyPacked: string[] = [];
        for (let policy of whitelist) {
            if (policy.selectors === undefined || policy.selectors.length == 0) {
                policyPacked.push(hexConcat([policy.to]));
            }
            else {
                for (let selector of policy.selectors) {
                    policyPacked.push(hexConcat([policy.to, selector]));
                }
            }
        }
        this.signature = signature;
        this.merkleTree = policyPacked.length == 0 ? new MerkleTree([hexZeroPad("0x00", 32)], keccak256, { hashLeaves: false }) : new MerkleTree(policyPacked, keccak256, { sortPairs: true, hashLeaves: true });
    }

    // This one is called by Contract. It signs the request and passes in to Provider to be sent.
    async sendTransaction(transaction: Deferrable<TransactionRequest>): Promise<TransactionResponse> {
        // `populateTransaction` internally calls `estimateGas`.
        // Some providers revert if you try to call estimateGas without the wallet first having some ETH,
        // which is going to be the case here if we use paymasters.  Therefore we set the gas price to
        // 0 to ensure that estimateGas works even if the wallet has no ETH.
        if (transaction.maxFeePerGas || transaction.maxPriorityFeePerGas) {
            transaction.maxFeePerGas = 0
            transaction.maxPriorityFeePerGas = 0
        } else {
            transaction.gasPrice = 0
        }
        const tx: TransactionRequest = await this.populateTransaction(transaction)
        await this.verifyAllNecessaryFields(tx)
        let userOperation: UserOperationStruct
        userOperation = await this.smartAccountAPI.createUnsignedUserOp({
            target: tx.to ?? '',
            data: tx.data?.toString() ?? '',
            value: tx.value,
            nonce: await this.currentSessionNonce(),
            gasLimit: tx.gasLimit,
            maxFeePerGas: tx.maxFeePerGas,
            maxPriorityFeePerGas: tx.maxPriorityFeePerGas,
        })
        userOperation.signature = await this.signUserOperation(userOperation)
        const transactionResponse = await this.zdProvider.constructUserOpTransactionResponse(userOperation)

        // Invoke the transaction hook
        this.config.hooks?.transactionStarted?.({
            hash: transactionResponse.hash,
            from: tx.from!,
            to: tx.to!,
            value: tx.value || 0,
            sponsored: userOperation.paymasterAndData !== '0x',
        })

        try {
            await this.httpRpcClient.sendUserOpToBundler(userOperation)
        } catch (error: any) {
            // console.error('sendUserOpToBundler failed', error)
            throw this.unwrapError(error)
        }
        // TODO: handle errors - transaction that is "rejected" by bundler is _not likely_ to ever resolve its "wait()"
        return transactionResponse
    }

    async approvePlugin(plugin: Contract, validUntil: BigNumber, validAfter: BigNumber, data: string): Promise<string> {
        throw new Error('Cannot approve plugin for session signer');
    }

    async signUserOperation(userOp: UserOperationStruct): Promise<string> { // this should return userOp.signature
        userOp.signature = this.signature; // reuse same proof for all transactions
        return await this.signUserOpWithSessionKey(userOp);
    }

    async currentSessionNonce(): Promise<BigNumber> {
        return await this.getSessionNonce(await this.sessionKey.getAddress());
    }

    async getSessionNonce(address: string): Promise<BigNumber> {
        return await Kernel__factory.connect(this.address!, this.provider!)['getNonce(uint192)'](BigNumber.from(address)).catch(
            e => {
                // this happens when the account hasn't been deployed
                if (e.method === 'getNonce(uint192)' && e.data === '0x') {
                    return BigNumber.from(0)
                }
                return Promise.reject(e)
            }
        )
    }

    async signUserOpWithSessionKey(
        userOp: UserOperationStruct,
    ): Promise<string> {
        const opHash = await this.smartAccountAPI.getUserOpHash(userOp)

        const addr = "0x" + (await userOp.callData).toString().slice(34, 74);
        const selector = "0x" + (await userOp.callData).toString().slice(330, 338);
        const found = this.whitelist.find((item) => {
            return item.to.toLowerCase() == addr.toLowerCase();
        });
        let merkleLeaf: string = "";
        if (found && this.whitelist.length > 0) {
            if (found.selectors === undefined || found.selectors.length == 0) {
                merkleLeaf = hexZeroPad(addr, 20);
            }
            else if (found.selectors.includes(selector)) {
                merkleLeaf = hexConcat([addr, hexZeroPad(selector, 4)]);
            }
        } else if (this.whitelist.length == 0) {
            merkleLeaf = hexZeroPad("0x00", 32);
        } else {
            throw new Error("Address not in whitelist");
        }
        const nonce = await this.currentSessionNonce()
        const sessionsig = await (this.sessionKey as any)._signTypedData(
            {
                name: "ZeroDevSessionKeyPlugin",
                version: "0.0.1",
                chainId: await this.provider!.getNetwork().then(net => net.chainId),
                verifyingContract: await userOp.sender,
            },
            {
                Session: [
                    { name: "userOpHash", type: "bytes32" },
                    { name: "nonce", type: "uint256" },
                ]
            },
            {
                userOpHash: hexZeroPad(opHash, 32),
                nonce: nonce
            }
        );
        const proof = this.whitelist.length > 0 ? this.merkleTree.getHexProof(keccak256(merkleLeaf)) : [hexZeroPad("0x00", 32)];
        return hexConcat([
            hexConcat([
                this.sessionKeyPlugin.address,
                hexZeroPad("0x" + this.validUntil.toString(16), 6),
                hexZeroPad("0x000000000000", 6), // validUntil + validAfter
                hexZeroPad(userOp.signature.toString(), 65), // signature
            ]),
            defaultAbiCoder.encode([
                "bytes",
                "bytes"
            ], [
                hexConcat([
                    await this.sessionKey.getAddress(),
                    hexZeroPad("0x" + this.merkleTree.getRoot().toString('hex'), 32),
                ]),
                hexConcat([
                    hexZeroPad("0x" + ((merkleLeaf.length - 2) / 2).toString(16), 1),
                    hexZeroPad(merkleLeaf, (merkleLeaf.length - 2) / 2),
                    hexZeroPad(sessionsig, 65),
                    defaultAbiCoder.encode([
                        "bytes32[]"
                    ], [
                        proof
                    ]),
                ])
            ])])
    }
}
