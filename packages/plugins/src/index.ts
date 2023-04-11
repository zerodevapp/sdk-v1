import {
    Kernel__factory,
    Kernel,
    ZeroDevSessionKeyPlugin,
    ZeroDevSessionKeyPlugin__factory,
} from '@zerodevapp/contracts-new';

import { MerkleTree } from "merkletreejs";

import { TransactionRequest, TransactionResponse } from '@ethersproject/providers'

import { ZeroDevSigner } from '@zerodevapp/sdk/src/ZeroDevSigner';
import { Signer, Wallet, utils, BigNumber, Contract } from 'ethers';
import { Deferrable, hexConcat, hexZeroPad, defaultAbiCoder, keccak256, hexlify } from 'ethers/lib/utils';
import { UserOperationStruct } from '@zerodevapp/contracts'
import { getModuleInfo } from '@zerodevapp/sdk/src/types';


const DEFAULT_SESSION_KEY_PLUGIN = '0xC8791E01De15Db08f2A9E7A964AA9C1069E72A5c'; // TODO need set this after deploying

interface SessionPolicy {
    to: string;
    selectors?: string[];
}

interface SessionKeyResult {
    sessionKey : Signer;
    signature : string;
    merkleTree : MerkleTree;
}

export class SessionKeyPlugin extends ZeroDevSigner {
    constructor(
        from : ZeroDevSigner,
    ) {
        super(
            from.config,
            from.originalSigner,
            from.zdProvider,
            from.httpRpcClient,
            from.smartAccountAPI
        );
    }

    async approvePlugin(plugin : Contract, validUntil: BigNumber, validAfter: BigNumber, data: string): Promise<string> {
        const sender = await this.getAddress();
        const ownerSig = await this.originalSigner._signTypedData(
            {
                name: "Kernel",
                version: "0.0.1",
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
                plugin : plugin.address,
                validUntil: validUntil,
                validAfter : validAfter,
                data : hexlify(data)
            }
        );
        return ownerSig;
    }

    async createSessionKey(sessionPolicy : SessionPolicy[], validUntil: number, sessionKeyPlugin?: ZeroDevSessionKeyPlugin): Promise<SessionKeyResult> {
        const sessionSigner = Wallet.createRandom().connect(this.provider!);
        const sessionKey = await sessionSigner.getAddress();
        const plugin = sessionKeyPlugin? sessionKeyPlugin : ZeroDevSessionKeyPlugin__factory.connect(DEFAULT_SESSION_KEY_PLUGIN, this.provider!);
        let policyPacked: string[] = [];
        for (let policy of sessionPolicy) {
            if (policy.selectors === undefined || policy.selectors.length == 0) {
                policyPacked.push(hexConcat([policy.to]));
            }
            else {
                for (let selector of policy.selectors) {
                    policyPacked.push(hexConcat([policy.to, selector]));
                }
            }
        }
        const merkleTree = policyPacked.length == 0 ? new MerkleTree([hexZeroPad("0x00", 32)], keccak256, { hashLeaves: false }) : new MerkleTree(policyPacked, keccak256, { sortPairs: true, hashLeaves: true });
        const data = hexConcat([
            hexZeroPad(sessionKey, 20),
            hexZeroPad("0x" + merkleTree.getRoot().toString('hex'), 32),
        ])
        const sig = await this.approvePlugin(plugin, BigNumber.from(validUntil), BigNumber.from(0), hexlify(data));
        return {
            sessionKey : sessionSigner,
            signature : sig,
            merkleTree : merkleTree
        };
    }
}