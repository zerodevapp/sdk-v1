import { JsonRpcProvider } from '@ethersproject/providers'

import { EntryPoint__factory } from '@zerodevapp/contracts'

import { ClientConfig } from './ClientConfig'
import { ERC4337EthersProvider } from './ERC4337EthersProvider'
import { HttpRpcClient } from './HttpRpcClient'
import { Signer } from '@ethersproject/abstract-signer'
import Debug from 'debug'
import { GnosisAccountAPI } from './GnosisAccountAPI'
import { ethers } from 'ethers'
import { INFURA_API_KEY } from './zerodev/constants'
import { getRpcUrl } from './zerodev/utils'

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
  originalSigner: Signer = originalProvider.getSigner()
): Promise<ERC4337EthersProvider> {
  const entryPoint = EntryPoint__factory.connect(config.entryPointAddress, originalProvider)
  const chainId = await originalProvider.getNetwork().then(net => net.chainId)
  // Initial SimpleAccount instance is not deployed and exists just for the interface
  const accountAPI = new GnosisAccountAPI({
    // Use our own provider because some providers like Magic doesn't support custom errors, which
    // we rely on for getting counterfactual address
    provider: new ethers.providers.JsonRpcProvider(getRpcUrl(chainId)),
    entryPointAddress: entryPoint.address,
    owner: originalSigner,
    factoryAddress: config.accountFactoryAddress,
    paymasterAPI: config.paymasterAPI
  })
  debug('config=', config)
  const httpRpcClient = new HttpRpcClient(config.bundlerUrl, config.entryPointAddress, chainId)
  return await new ERC4337EthersProvider(
    chainId,
    config,
    originalSigner,
    originalProvider,
    httpRpcClient,
    entryPoint,
    accountAPI,
  ).init()
}
