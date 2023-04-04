import {
    Kernel__factory,
    Kernel,
    ZeroDevSessionKeyPlugin,
    ZeroDevSessionKeyPlugin__factory,
} from '@zerodevapp/contracts-new';

import { MerkleTree } from "merkletreejs";

import { TransactionRequest, TransactionResponse } from '@ethersproject/providers'

import { ZeroDevSigner } from '@zerodevapp/sdk/src/ZeroDevSigner';
import { Signer, Wallet, utils, BigNumber } from 'ethers';
import { Deferrable, hexConcat, hexZeroPad,defaultAbiCoder, keccak256 } from 'ethers/lib/utils';
import { UserOperationStruct } from '@zerodevapp/contracts'
import { getModuleInfo } from '@zerodevapp/sdk/src/types';


const DEFAULT_SESSION_KEY_PLUGIN = '0xC8791E01De15Db08f2A9E7A964AA9C1069E72A5c'; // TODO need set this after deploying

interface SessionPolicy {
    to : string;
    selectors? : string[];
}

export class PolicySessionKeyPlugin extends ZeroDevSigner {
    sessionKeyPlugin: ZeroDevSessionKeyPlugin;
    sessionKey : Signer;
    validUntil: number;
    whitelist: SessionPolicy[];
    merkleTree: MerkleTree;

    constructor(
        from : ZeroDevSigner,
        validUntil: number,
        whitelist : SessionPolicy[],
        sessionKeyPlugin? : ZeroDevSessionKeyPlugin,
    ) {
        super(
            from.config,
            from.originalSigner,
            from.zdProvider,
            from.httpRpcClient,
            from.smartAccountAPI
        );
        this.sessionKeyPlugin = sessionKeyPlugin ? sessionKeyPlugin : 
            ZeroDevSessionKeyPlugin__factory.connect(DEFAULT_SESSION_KEY_PLUGIN, this.provider!);
        this.sessionKey = Wallet.createRandom().connect(this.provider!);
        this.validUntil = validUntil;
        this.whitelist = whitelist;
        let policyPacked : string[] = [];
        for(let policy of whitelist) {
            if(policy.selectors === undefined || policy.selectors.length == 0) {
                policyPacked.push(hexZeroPad(policy.to, 20));
            }
            else {
                for(let selector of policy.selectors) {
                    policyPacked.push(hexConcat([policy.to, selector]));
                }
            }
        }
        this.merkleTree = new MerkleTree(policyPacked, keccak256, { sortPairs: true , hashLeaves: true });
    }

    extendSessionKey(validUntil: number) {
        this.validUntil = validUntil;
    }

    refreshSessionKey() {
        this.sessionKey = Wallet.createRandom().connect(this.provider!);
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
            gasLimit: tx.gasLimit,
            maxFeePerGas: tx.maxFeePerGas,
            maxPriorityFeePerGas: tx.maxPriorityFeePerGas,
        })
        console.log('-- sign userOp start --')
        userOperation.signature = await this.signUserOperation(userOperation)
        console.log('-- sign success --')
        const transactionResponse = await this.zdProvider.constructUserOpTransactionResponse(userOperation)
        
        // Invoke the transaction hook
        this.config.hooks?.transactionStarted?.({
            hash: transactionResponse.hash,
            from: tx.from!,
            to: tx.to!,
            value: tx.value || 0,
            sponsored: userOperation.paymasterAndData !== '0x',
            module: getModuleInfo(tx),
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


    async signUserOperation(userOp: UserOperationStruct): Promise<string> { // this should return userOp.signature
        userOp.signature = await this.approvePlugin()
        return await this.signUserOpWithSessionKey(userOp);
    }

    async currentSessionNonce(): Promise<number> {
        return await this.getSessionNonce(await this.sessionKey.getAddress());
    }

    async getSessionNonce(address : string) : Promise<number> {
        let number = await Kernel__factory.connect(this.address!, this.provider!).callStatic
        .queryPlugin(this.sessionKeyPlugin.address, this.sessionKeyPlugin.interface.encodeFunctionData('sessionNonce', [address]))
        .catch(e => {
            if (e.errorName !== 'QueryResult') {
                throw e;
            }
            return e.errorArgs.result;
        })
        if(typeof number !== 'string') { // this happens when contract is not deployed yet
            return 0;
        }
        return BigNumber.from(number).toNumber();
    }

    async approvePlugin(): Promise<string> {
        const sender = await this.getAddress();
        const ownerSig = await this.originalSigner._signTypedData(
            {
            name : "Kernel",
            version : "0.0.1",
            chainId: (await this.provider!.getNetwork()).chainId,
            verifyingContract: sender,
            },
            {
            ValidateUserOpPlugin: [
                { name: "plugin", type: "address" },
                { name: "validUntil", type: "uint48" },
                { name: "validAfter", type: "uint48" },
                { name: "data", type: "bytes" },
            ]
            },
            {
            plugin : this.sessionKeyPlugin.address,
            validUntil: this.validUntil,
            validAfter : 0,
            data : hexConcat([
                hexZeroPad(this.sessionKeyPlugin.address, 20),
                hexZeroPad(this.merkleTree.getHexRoot(), 32),
            ])
            }
        );    
        return ownerSig;
    }

    async signUserOpWithSessionKey(
        userOp: UserOperationStruct,
    ): Promise<string> {
        const opHash = await this.smartAccountAPI.getUserOpHash(userOp)

        const addr = "0x" + (await userOp.callData).toString().slice(34,74);
        const selector = "0x"+(await userOp.callData).toString().slice(330,338);
        console.log("addr: ", addr)
        console.log("selector: ", selector)
        console.log("whitelist: ", this.whitelist)
        const found = this.whitelist.find((item) => {
            return item.to.toLowerCase() == addr.toLowerCase(); 
        });
        let merkleLeaf : string = "";
        if(found) {
            if(found.selectors === undefined || found.selectors.length == 0) {
                merkleLeaf = hexZeroPad(addr, 20);
            }
            else if(found.selectors.includes(selector)) {
                console.log("found");
                merkleLeaf = hexConcat([addr, hexZeroPad(selector, 4)]).toString();
            }
        } else {
            throw new Error("Address not in whitelist");
        }
        console.log("merkleLeaf: ", keccak256(merkleLeaf));
        console.log("length ", (merkleLeaf.length - 2) / 2)
        const nonce =  await this.currentSessionNonce()
        const sessionsig = await this.sessionKey._signTypedData(
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
        const proof = this.merkleTree.getProof(keccak256(merkleLeaf));
        console.log(proof);
        console.log("root", this.merkleTree.getRoot().toString('hex'));
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
            ],[
              hexConcat([
                await this.sessionKey.getAddress(),
                hexZeroPad("0x" + this.merkleTree.getRoot().toString('hex'), 32),
              ]),
              hexConcat([
                hexZeroPad("0x"+((merkleLeaf.length - 2) / 2).toString(16), 1),
                merkleLeaf,
                hexZeroPad(sessionsig, 65),
                defaultAbiCoder.encode([
                  "bytes32[]"
                ],[
                  proof
                ]),
              ])
            ])])
        }
                
    }