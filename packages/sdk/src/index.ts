import '@ethersproject/shims'
import { Buffer } from 'buffer'

import { ethers, Signer } from 'ethers'

import { getRpcUrl } from './utils'
import * as api from './api'
import * as constants from './constants'
import { Hooks } from './ClientConfig'
import { ZeroDevSigner } from './ZeroDevSigner'
import { ZeroDevProvider } from './ZeroDevProvider'
import { wrapProvider } from './Provider'
import { AccountImplementation, gnosisSafeAccount_v1_unaudited, kernelAccount_v1_audited } from './accounts'
import { BaseAccountAPI, BaseApiParams } from './BaseAccountAPI'
import { SupportedGasToken } from './types'
import { getPaymaster } from './paymasters'
import { InfuraProvider, InfuraWebSocketProvider, JsonRpcProvider } from '@ethersproject/providers'
global.Buffer = Buffer

export { ZeroDevSigner, AssetTransfer, AssetType } from './ZeroDevSigner'
export { ZeroDevProvider } from './ZeroDevProvider'
export { UserOperationReceipt } from './HttpRpcClient'
export { getPrivateKeyOwner, getRPCProviderOwner } from './owner'
export { createSessionKey, createSessionKeySigner, revokeSessionKey } from './session'

export type AccountParams = {
  projectId: string
  owner: Signer
  index?: number
  rpcProvider?: JsonRpcProvider
  bundlerUrl?: string
  hooks?: Hooks
  address?: string
  implementation?: AccountImplementation<BaseAccountAPI, BaseApiParams>
  skipFetchSetup?: boolean
  gasToken?: SupportedGasToken
  useWebsocketProvider?: boolean
}

export async function getZeroDevProvider(params: AccountParams): Promise<ZeroDevProvider> {
  const chainId = await api.getChainId(params.projectId, constants.BACKEND_URL)
  const providerUrl = getRpcUrl(chainId)
  let provider = params.rpcProvider
  if (provider === undefined) {
    if (providerUrl.includes(constants.INFURA_API_KEY) && ![43114, 43113].includes(chainId)) {
      try {
        provider = new (params.useWebsocketProvider === true && ![137, 80001].includes(chainId) ? InfuraWebSocketProvider : InfuraProvider)(chainId, constants.INFURA_API_KEY)
        await provider.detectNetwork()
      } catch (_) {
        provider = new InfuraProvider(chainId, constants.INFURA_API_KEY)
      }
    } else {
      provider = new ethers.providers.JsonRpcProvider({ url: providerUrl, skipFetchSetup: params.skipFetchSetup ?? undefined })
    }
  }
  // console.log(provider)

  const aaConfig = {
    projectId: params.projectId,
    chainId,
    entryPointAddress: constants.ENTRYPOINT_ADDRESS,
    bundlerUrl: params.bundlerUrl ?? constants.BUNDLER_URL,
    paymasterAPI: await getPaymaster(
      params.projectId,
      constants.PAYMASTER_URL,
      chainId,
      constants.ENTRYPOINT_ADDRESS,
      params.gasToken
    ),
    hooks: params.hooks,
    walletAddress: params.address,
    index: params.index,
    implementation: params.implementation ?? kernelAccount_v1_audited,
  }

  const aaProvider = await wrapProvider(provider, aaConfig, params.owner, { skipFetchSetup: params.skipFetchSetup })
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

export async function initiateProject(projectIds: string[]): Promise<void> {
  void api.getProjectsConfiguration(projectIds, constants.BACKEND_URL)
}

export const getProjectsConfiguration = api.getProjectsConfiguration
