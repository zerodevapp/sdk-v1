import { JsonRpcProvider } from '@ethersproject/providers'

import { EntryPoint__factory } from '@zerodevapp/contracts-new'

import { ClientConfig } from './ClientConfig'
import { ZeroDevProvider } from './ZeroDevProvider'
import { HttpRpcClient } from './HttpRpcClient'
import { Signer } from '@ethersproject/abstract-signer'
import Debug from 'debug'
import { ethers } from 'ethers'
import { getRpcUrl } from './utils'
import { AccountAPIConstructor, BaseAccountAPI } from './BaseAccountAPI'

const debug = Debug('aa.wrapProvider')

/**
 * wrap an existing provider to tunnel requests through Account Abstraction.
 * @param originalProvider the normal provider
 * @param config see ClientConfig for more info
 * @param originalSigner use this signer as the owner. of this wallet. By default, use the provider's signer
 */
export async function wrapProvider(
  originalProvider: JsonRpcProvider,
  config: ClientConfig,
  originalSigner: Signer = originalProvider.getSigner(),
  options?: {skipFetchSetup?: boolean}
): Promise<ZeroDevProvider> {
  const entryPoint = EntryPoint__factory.connect(config.entryPointAddress, originalProvider)
  const chainId = await originalProvider.getNetwork().then(net => net.chainId)

  const accountAPI = BaseAccountAPI.create(config.implementation.accountAPIClass as unknown as AccountAPIConstructor<any, {}>, {
    // Use our own provider because some providers like Magic doesn't support custom errors, which
    // we rely on for getting counterfactual address
    // Unless it's hardhat.
    provider: chainId === 31337 ? originalProvider : new ethers.providers.JsonRpcProvider({url: getRpcUrl(chainId), skipFetchSetup: options?.skipFetchSetup ?? undefined}),
    entryPointAddress: entryPoint.address,
    owner: originalSigner,
    index: config.index,
    factoryAddress: config.implementation.factoryAddress,
    paymasterAPI: config.paymasterAPI,
    accountAddress: config.walletAddress
  })
  debug('config=', config)
  const httpRpcClient = new HttpRpcClient(config.bundlerUrl, config.entryPointAddress, chainId, config.projectId, options?.skipFetchSetup)
  return await new ZeroDevProvider(
    chainId,
    config,
    originalSigner,
    originalProvider,
    httpRpcClient,
    entryPoint,
    accountAPI

  ).init()
}
