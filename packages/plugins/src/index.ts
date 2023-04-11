import {
    ZeroDevSessionKeyPlugin,
    ZeroDevSessionKeyPlugin__factory,
} from '@zerodevapp/contracts-new';

import { MerkleTree } from "merkletreejs";
import { ZeroDevSigner } from '@zerodevapp/sdk/src/ZeroDevSigner';
import { Signer, Wallet, BigNumber } from 'ethers';
import { hexConcat, hexZeroPad, keccak256, hexlify } from 'ethers/lib/utils';
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

export async function createSessionKey(
    from: ZeroDevSigner,
    sessionPolicy: SessionPolicy[],
    validUntil: number,
    sessionKeyPlugin?: ZeroDevSessionKeyPlugin,
): Promise<SessionKeyResult> {
    const sessionSigner = Wallet.createRandom().connect(from.provider!);
    const sessionKey = await sessionSigner.getAddress();
    const plugin = sessionKeyPlugin? sessionKeyPlugin : ZeroDevSessionKeyPlugin__factory.connect(DEFAULT_SESSION_KEY_PLUGIN, from.provider!);
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
    const sig = await from.approvePlugin(plugin, BigNumber.from(validUntil), BigNumber.from(0), hexlify(data));
    return {
        sessionKey : sessionSigner,
        signature : sig,
        merkleTree : merkleTree
    };
}