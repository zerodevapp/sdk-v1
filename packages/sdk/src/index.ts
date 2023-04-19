import '@ethersproject/shims'
import { Buffer } from 'buffer'

import { ethers, Signer } from 'ethers'

import { getRpcUrl } from './utils'
import * as api from './api'
import * as constants from './constants'
import { Hooks } from './ClientConfig'
import { VerifyingPaymasterAPI } from './paymaster'
import { ZeroDevSigner } from './ZeroDevSigner'
import { ZeroDevProvider } from './ZeroDevProvider'
import { wrapProvider } from './Provider'
import { AccountImplementation, gnosisSafeAccount_unaudited } from './accounts'
import { BaseAccountAPI, BaseApiParams } from './BaseAccountAPI'
global.Buffer = Buffer

export { ZeroDevSigner, AssetTransfer, AssetType } from './ZeroDevSigner'
export { ZeroDevProvider } from './ZeroDevProvider'
export { UserOperationReceipt } from './HttpRpcClient'
export { getPrivateKeyOwner, getRPCProviderOwner, getSocialWalletOwner } from './owner'

type AccountParams = {
  projectId: string
  owner: Signer
  index?: number
  rpcProviderUrl?: string
  bundlerUrl?: string
  hooks?: Hooks
  address?: string
  implementation?: AccountImplementation<BaseAccountAPI, BaseApiParams>
  options?: {[key: string]: any}
}

export async function getZeroDevProvider(params: AccountParams): Promise<ZeroDevProvider> {
  const chainId = await api.getChainId(params.projectId, constants.BACKEND_URL)
  const provider = new ethers.providers.JsonRpcProvider({url: params.rpcProviderUrl || getRpcUrl(chainId), skipFetchSetup: params.options?.skipFetchSetup ?? undefined})

  const aaConfig = {
    projectId: params.projectId,
    chainId,
    entryPointAddress: constants.ENTRYPOINT_ADDRESS,
    bundlerUrl: params.bundlerUrl || constants.BUNDLER_URL,
    paymasterAPI: new VerifyingPaymasterAPI(
      params.projectId,
      constants.PAYMASTER_URL,
      chainId
    ),
    hooks: params.hooks,
    walletAddress: params.address,
    index: params.index,
    implementation: params.implementation || gnosisSafeAccount_unaudited,
  }

  const aaProvider = await wrapProvider(provider, aaConfig, params.owner, params.options)
  return aaProvider
}

export async function getZeroDevSigner(
  params: AccountParams
): Promise<ZeroDevSigner> {
  const aaProvider = await getZeroDevProvider(params)
  const aaSigner = aaProvider.getSigner()

  return aaSigner
}

// Check if a signer is a ZeroDevSigner
export async function isZeroDevSigner(signer: any) {
  return signer instanceof ZeroDevSigner
}

// Typecast a signer to a ZeroDevSigner, or throw if it's not a ZeroDevSigner
export function asZeroDevSigner(signer: Signer): ZeroDevSigner {
  if (!(signer instanceof ZeroDevSigner)) {
    throw new Error('not a ZeroDevSigner')
  }
  return signer
}

export async function initiateProject (projectId: string): Promise<void> {
  void api.getProjectConfiguration(projectId, constants.BACKEND_URL)
}

export const getProjectConfiguration = api.getProjectConfiguration
