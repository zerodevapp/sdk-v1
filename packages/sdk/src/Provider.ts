import { FallbackProvider, JsonRpcProvider } from '@ethersproject/providers'

import { EntryPoint__factory } from '@zerodevapp/contracts-new'
import { getRpcUrl } from './utils'

import { ClientConfig } from './ClientConfig'
import { ZeroDevProvider } from './ZeroDevProvider'
import { HttpRpcClient } from './HttpRpcClient'
import { Signer } from '@ethersproject/abstract-signer'
import Debug from 'debug'
import { AccountAPIConstructor, BaseAccountAPI } from './BaseAccountAPI'
import { BaseValidatorAPI, ECDSAValidator, ValidatorMode } from './validators'
import { ECDSAKernelFactory__factory } from '@zerodevapp/kernel-contracts-v2'
import { KernelAccountV2API } from './KernelAccountV2API'
import { BundlerProvider } from './types'

const debug = Debug('aa.wrapProvider')

/**
 * wrap an existing provider to tunnel requests through Account Abstraction.
 * @param originalProvider the normal provider
 * @param config see ClientConfig for more info
 * @param originalSigner use this signer as the owner. of this wallet. By default, use the provider's signer
 */
export async function wrapProvider (
  originalProvider: JsonRpcProvider | FallbackProvider,
  config: ClientConfig,
  originalSigner: Signer,
  options: {
    skipFetchSetup?: boolean
    bundlerGasCalculation?: boolean
    transactionTimeout?: number
    bundlerProvider?: BundlerProvider
  } = { bundlerGasCalculation: true }
): Promise<ZeroDevProvider> {
  const entryPoint = EntryPoint__factory.connect(config.entryPointAddress, originalProvider)
  const chainId = await originalProvider.getNetwork().then(net => net.chainId)
  const httpRpcClient = new HttpRpcClient(config.bundlerUrl, config.entryPointAddress, chainId, config.projectId, options.skipFetchSetup, options.bundlerProvider)

  const accountAPI = BaseAccountAPI.create(config.implementation.accountAPIClass as unknown as AccountAPIConstructor<any, {}>, {
    // Use our own provider because some providers like Magic doesn't support custom errors, which
    // we rely on for getting counterfactual address
    // Unless it's hardhat.
    provider: originalProvider,
    entryPointAddress: entryPoint.address,
    owner: originalSigner,
    index: config.index,
    factoryAddress: config.implementation.factoryAddress,
    paymasterAPI: config.paymasterAPI,
    accountAddress: config.walletAddress,
    httpRpcClient: options?.bundlerGasCalculation === true ? httpRpcClient : undefined
  })
  debug('config=', config)
  return await new ZeroDevProvider(
    chainId,
    config,
    originalSigner,
    originalProvider,
    httpRpcClient,
    entryPoint,
    accountAPI,
    options.transactionTimeout
  ).init()
}

/**
 * wrap an existing provider to tunnel requests through Account Abstraction.
 * @param originalProvider the normal provider
 * @param config see ClientConfig for more info
 * @param originalSigner use this signer as the owner. of this wallet. By default, use the provider's signer
 */
export async function wrapV2Provider (
  originalProvider: JsonRpcProvider | FallbackProvider,
  config: ClientConfig,
  originalSigner: Signer,
  defaultValidator: BaseValidatorAPI,
  validator: BaseValidatorAPI,
  options: {skipFetchSetup?: boolean, bundlerGasCalculation?: boolean, transactionTimeout?: number} = { bundlerGasCalculation: true }
): Promise<ZeroDevProvider> {
  const entryPoint = EntryPoint__factory.connect(config.entryPointAddress, originalProvider)
  const chainId = await originalProvider.getNetwork().then(net => net.chainId)
  const httpRpcClient = new HttpRpcClient(config.bundlerUrl, config.entryPointAddress, chainId, config.projectId, options?.skipFetchSetup)
  //  const validator = new ECDSAValidator({
  //    entrypoint: entryPoint,
  //    mode: mode,
  //    kernelValidator: config.validatorAddress!,
  //    owner : originalSigner
  //  })
  const accountAPI = new KernelAccountV2API({
    // Use our own provider because some providers like Magic doesn't support custom errors, which
    // we rely on for getting counterfactual address
    // Unless it's hardhat.
    provider: originalProvider,
    entryPointAddress: entryPoint.address,
    owner: originalSigner,
    index: config.index,
    factoryAddress: config.implementation.factoryAddress,
    paymasterAPI: config.paymasterAPI,
    accountAddress: config.walletAddress,
    httpRpcClient: options?.bundlerGasCalculation === true ? httpRpcClient : undefined,
    validator,
    defaultValidator
  })
  debug('config=', config)
  return await new ZeroDevProvider(
    chainId,
    config,
    originalSigner,
    originalProvider,
    httpRpcClient,
    entryPoint,
    accountAPI,
    options.transactionTimeout

  ).init()
}
