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
import { DEFAULT_SESSION_KEY_PLUGIN, SessionSigner } from './SessionSigner';
import * as api from '../api';
import * as constants from '../constants';
import { getRpcUrl } from '../utils'
import { KernelAccountAPI } from '../KernelAccountAPI';
import { HttpRpcClient } from '../HttpRpcClient';
import { ZeroDevProvider } from '../ZeroDevProvider';
import { AccountImplementation, kernelAccount_v1_audited } from '../accounts';
import { SupportedGasToken } from '../types';
import { getPaymaster } from '../paymasters';
import { BaseAccountAPI, BaseApiParams } from '../BaseAccountAPI';

export interface SessionPolicy {
  to: string;
  selectors?: string[];
}

export interface SessionKeyData {
  ownerAddress: string;
  ownerIndex: number;
  signature: string;
  whitelist: SessionPolicy[];
  validUntil: number;
  sessionPrivateKey?: string;
}

export async function createSessionKey(
  from: ZeroDevSigner,
  whitelist: SessionPolicy[],
  validUntil: number,
  sessionKeyAddr?: string,
  sessionKeyPlugin?: ZeroDevSessionKeyPlugin
): Promise<string> {
  let sessionPublicKey, sessionPrivateKey;
  if (sessionKeyAddr) {
    sessionPublicKey = sessionKeyAddr;
  } else {
    const sessionSigner = Wallet.createRandom().connect(from.provider!);
    sessionPublicKey = await sessionSigner.getAddress();
    sessionPrivateKey = sessionSigner.privateKey;
  }
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
    hexZeroPad(sessionPublicKey, 20),
    hexZeroPad("0x" + merkleTree.getRoot().toString('hex'), 32),
  ])
  const sig = await from.approvePlugin(plugin, BigNumber.from(validUntil), BigNumber.from(0), hexlify(data));

  from.smartAccountAPI.owner

  const sessionKeyData = {
    ownerAddress: await from.originalSigner.getAddress(),
    ownerIndex: await from.smartAccountAPI.index,
    sessionPrivateKey,
    signature: sig,
    whitelist: whitelist,
    validUntil: validUntil,
  };

  return serializeSessionKeyData(sessionKeyData);
}


export type SessionKeySignerParams = {
  projectId: string
  sessionKeyData: string
  privateSigner?: Signer
  rpcProviderUrl?: string
  bundlerUrl?: string
  skipFetchSetup?: boolean
  gasToken?: SupportedGasToken
  implementation?: AccountImplementation<BaseAccountAPI, BaseApiParams>
}

export async function createSessionKeySigner(
  params: SessionKeySignerParams,
): Promise<SessionSigner> {
  const sessionKeyData = deserializeSessionKeyData(params.sessionKeyData);
  if (!sessionKeyData.sessionPrivateKey && !params.privateSigner) {
    throw new Error('Session key data does not contain session private key and no session key signer was provided')
  }
  if (sessionKeyData.sessionPrivateKey && params.privateSigner) {
    throw new Error('Session key data contains session private key and session key signer was provided')
  }

  const projectChainId = await api.getChainId(params.projectId, constants.BACKEND_URL)
  const provider = new ethers.providers.JsonRpcProvider({ url: params.rpcProviderUrl || getRpcUrl(projectChainId), skipFetchSetup: params?.skipFetchSetup ?? undefined })

  const config = {
    projectId: params.projectId,
    chainId: projectChainId,
    entryPointAddress: constants.ENTRYPOINT_ADDRESS,
    bundlerUrl: params.bundlerUrl || constants.BUNDLER_URL,
    paymasterAPI: await getPaymaster(
      params.projectId,
      constants.PAYMASTER_URL,
      projectChainId,
      constants.ENTRYPOINT_ADDRESS,
      params.gasToken
    ),
    implementation: params.implementation ?? kernelAccount_v1_audited
  }

  const entryPoint = EntryPoint__factory.connect(config.entryPointAddress, provider)
  const chainId = await provider.getNetwork().then(net => net.chainId)
  if (projectChainId !== chainId) {
    throw new Error(`Project is on chain ${projectChainId} but provider is on chain ${chainId}`)
  }

  const accountAPI = new KernelAccountAPI({
    provider: chainId === 31337 ? provider : new ethers.providers.JsonRpcProvider({ url: getRpcUrl(chainId), skipFetchSetup: params?.skipFetchSetup ?? undefined }),
    entryPointAddress: entryPoint.address,
    owner: new VoidSigner(sessionKeyData.ownerAddress, provider),
    index: sessionKeyData.ownerIndex,
    paymasterAPI: config.paymasterAPI,
    factoryAddress: config.implementation.factoryAddress,
  })

  const httpRpcClient = new HttpRpcClient(config.bundlerUrl, config.entryPointAddress, chainId, config.projectId, params.skipFetchSetup)

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
    sessionKeyData.whitelist,
    sessionKeyData.signature,
    params.privateSigner ?? new Wallet(sessionKeyData.sessionPrivateKey!),
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

export async function revokeSessionKey(
  signer: ZeroDevSigner, 
  sessionPublicKey: string
) {
  const sessionKeyPlugin = ZeroDevSessionKeyPlugin__factory.connect(DEFAULT_SESSION_KEY_PLUGIN, signer);
  const transaction = await sessionKeyPlugin.revokeSessionKey(sessionPublicKey)
  return await signer.execDelegateCall(
    {
      to: transaction.to ?? sessionKeyPlugin.address,
      data: transaction.data
    }
  )

}
