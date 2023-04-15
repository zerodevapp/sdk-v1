import {
  EntryPoint__factory,
  ZeroDevSessionKeyPlugin,
  ZeroDevSessionKeyPlugin__factory,
} from '@zerodevapp/contracts-new';

import * as base64 from 'base64-js';
import { MerkleTree } from "merkletreejs";
import { ZeroDevSigner } from '../ZeroDevSigner';
import { Signer, Wallet, BigNumber, ethers, VoidSigner } from 'ethers';
import { hexConcat, hexZeroPad, keccak256, hexlify } from 'ethers/lib/utils';
import { SessionSigner } from './SessionSigner';
import * as api from '../api';
import * as constants from '../constants';
import { getRpcUrl } from '../utils'
import { KernelAccountAPI } from '../KernelAccountAPI';
import { VerifyingPaymasterAPI } from '../paymaster';
import { HttpRpcClient } from '../HttpRpcClient';
import { ZeroDevProvider } from '../ZeroDevProvider';
import { kernelAccount_audited } from '../accounts';

const DEFAULT_SESSION_KEY_PLUGIN = '0x6E2631aF80bF7a9cEE83F590eE496bCc2E40626D'; // TODO need set this after deploying

export interface SessionPolicy {
  to: string;
  selectors?: string[];
}

export interface SessionKeyData {
  ownerAddress: string;
  ownerIndex: number;
  sessionKey: string;
  signature: string;
  whitelist: SessionPolicy[];
  validUntil: number;
}

export async function createSessionKey(
  from: ZeroDevSigner,
  whitelist: SessionPolicy[],
  validUntil: number,
  sessionKeyPlugin?: ZeroDevSessionKeyPlugin,
): Promise<string> {
  const sessionSigner = Wallet.createRandom().connect(from.provider!);
  const sessionKey = await sessionSigner.getAddress();
  const plugin = sessionKeyPlugin ? sessionKeyPlugin : ZeroDevSessionKeyPlugin__factory.connect(DEFAULT_SESSION_KEY_PLUGIN, from.provider!);
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
  const merkleTree = policyPacked.length == 0 ? new MerkleTree([hexZeroPad("0x00", 32)], keccak256, { hashLeaves: false }) : new MerkleTree(policyPacked, keccak256, { sortPairs: true, hashLeaves: true });
  const data = hexConcat([
    hexZeroPad(sessionKey, 20),
    hexZeroPad("0x" + merkleTree.getRoot().toString('hex'), 32),
  ])
  const sig = await from.approvePlugin(plugin, BigNumber.from(validUntil), BigNumber.from(0), hexlify(data));

  from.smartAccountAPI.owner

  const sessionKeyData = {
    ownerAddress: await from.originalSigner.getAddress(),
    ownerIndex: await from.smartAccountAPI.index,
    sessionKey: sessionSigner.privateKey,
    signature: sig,
    whitelist: whitelist,
    validUntil: validUntil,
  };

  return serializeSessionKeyData(sessionKeyData);
}


export type SessionKeySignerParams = {
  projectId: string
  sessionKeyData: string,
  rpcProviderUrl?: string
  bundlerUrl?: string
}

export async function createSessionKeySigner(
  params: SessionKeySignerParams,
): Promise<SessionSigner> {
  const sessionKeyData = deserializeSessionKeyData(params.sessionKeyData);
  console.log('sessionKeyData', sessionKeyData)

  const projectChainId = await api.getChainId(params.projectId, constants.BACKEND_URL)
  const provider = new ethers.providers.JsonRpcProvider(params.rpcProviderUrl || getRpcUrl(projectChainId))

  const config = {
    projectId: params.projectId,
    chainId: projectChainId,
    entryPointAddress: constants.ENTRYPOINT_ADDRESS,
    bundlerUrl: params.bundlerUrl || constants.BUNDLER_URL,
    paymasterAPI: new VerifyingPaymasterAPI(
      params.projectId,
      constants.PAYMASTER_URL,
      projectChainId,
    ),
    implementation: kernelAccount_audited,
  }

  const entryPoint = EntryPoint__factory.connect(config.entryPointAddress, provider)
  const chainId = await provider.getNetwork().then(net => net.chainId)
  if (projectChainId !== chainId) {
    throw new Error(`Project is on chain ${projectChainId} but provider is on chain ${chainId}`)
  }

  const accountAPI = new KernelAccountAPI({
    provider: chainId === 31337 ? provider : new ethers.providers.JsonRpcProvider(getRpcUrl(chainId)),
    entryPointAddress: entryPoint.address,
    owner: new VoidSigner(sessionKeyData.ownerAddress, provider),
    index: sessionKeyData.ownerIndex,
    paymasterAPI: config.paymasterAPI,
    factoryAddress: config.implementation.factoryAddress,
  })

  const httpRpcClient = new HttpRpcClient(config.bundlerUrl, config.entryPointAddress, chainId, config.projectId)

  const aaProvider = await new ZeroDevProvider(
    chainId,
    config,
    accountAPI.owner,
    provider,
    httpRpcClient,
    entryPoint,
    accountAPI
  )

  return new SessionSigner(
    config,
    aaProvider,
    httpRpcClient,
    accountAPI,
    sessionKeyData.validUntil,
    [],
    sessionKeyData.signature,
    sessionKeyData.sessionKey,
  );
}

// Serialize SessionKeyData
export function serializeSessionKeyData(sessionKeyData: SessionKeyData): string {
  const jsonString = JSON.stringify(sessionKeyData);
  const uint8Array = new TextEncoder().encode(jsonString);
  const base64String = base64.fromByteArray(uint8Array);
  return base64String;
}

// Deserialize SessionKeyData
export function deserializeSessionKeyData(base64String: string): SessionKeyData {
  const uint8Array = base64.toByteArray(base64String);
  const jsonString = new TextDecoder().decode(uint8Array);
  const sessionKeyData = JSON.parse(jsonString) as SessionKeyData;
  return sessionKeyData;
}
