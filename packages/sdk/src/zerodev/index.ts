import '@ethersproject/shims'
import { Buffer } from 'buffer'
global.Buffer = Buffer

import { BigNumberish, ContractTransaction, ethers, Signer } from 'ethers'
import {
  wrapProvider,
  PaymasterAPI,
  ERC4337EthersSigner,
  ERC4337EthersProvider,
} from '../'
import { resolveProperties } from 'ethers/lib/utils'
import { UserOperationStruct } from '@account-abstraction/contracts'

import { getRpcUrl, hexifyUserOp } from './utils'
import { ErrNoIdentifierProvided, ErrTransactionFailedGasChecks } from './errors'
import * as api from './api'
import * as constants from './constants'

export {
  ERC4337EthersProvider, ERC4337EthersSigner, DeterministicDeployer, calcPreVerificationGas,
  execBatch, Call,
} from '../'

export { onramp, OnrampOptions, OnrampUserInfo } from './onramp'
export { enableModule } from '../module'

export interface Params {
  projectId: string
  identity?: string
  token?: string
  privateKey?: string
  web3Provider?: any
}

export interface AdvancedParams {
  rpcUrl?: string
  backendUrl?: string
  paymasterUrl?: string
  bundlerUrl?: string
  contractAddresses?: {
    entrypoint?: string
    paymaster?: string
    walletFactory?: string
  }
}

/*
 * @param {SignerParams} You may provide a private key, identity token, or Web3 provider
 * @param {AdvancedParams} Allows you to specify custom parts of the Account Abstraction stack
 * @returns {ERC4337EthersProvider} object that can be used as a provider
 */
export async function getProvider(
  params: Params,
  advancedParams?: AdvancedParams
): Promise<ERC4337EthersProvider> {
  const backendUrl = advancedParams?.backendUrl ?? constants.BACKEND_URL
  const chainId = await api.getChainId(params.projectId, backendUrl)
  const rpcUrl = advancedParams?.rpcUrl ?? getRpcUrl(chainId)

  const { provider, signer } = await extractProviderAndSigner(
    params,
    rpcUrl,
    backendUrl
  )

  const paymasterAddress =
    advancedParams?.contractAddresses?.paymaster ??
    constants.PAYMASTER_ADDRESS
  const entrypointAddress =
    advancedParams?.contractAddresses?.entrypoint ??
    constants.ENTRYPOINT_ADDRESS
  const accountFactoryAddress =
    advancedParams?.contractAddresses?.walletFactory ??
    constants.ACCOUNT_FACTORY_ADDRESS

  const paymaster = new ethers.Contract(
    paymasterAddress,
    constants.PAYMASTER_ABI,
    signer
  )

  const bundlerUrl =
    advancedParams?.bundlerUrl ?? constants.BUNDLER_URL[chainId]
  const paymasterUrl = advancedParams?.paymasterUrl ?? constants.PAYMASTER_URL

  const aaConfig = {
    chainId: chainId,
    entryPointAddress: entrypointAddress,
    bundlerUrl: bundlerUrl,
    paymasterAPI: new VerifyingPaymasterAPI(
      params.projectId,
      paymaster,
      backendUrl,
      paymasterUrl
    ),
    accountFactoryAddress: accountFactoryAddress,
  }
  const aaProvider = await wrapProvider(provider, aaConfig, signer)
  return aaProvider
}

/*
 * @param {SignerParams} You may provide a private key, identity token, or Web3 provider
 * @param {AdvancedParams} Allows you to specify custom parts of the Account Abstraction stack
 * @returns {Signer} object that can be used as a signer 
 */
export async function getSigner(
  params: Params,
  advancedParams?: AdvancedParams
): Promise<Signer> {
  const aaProvider = await getProvider(params, advancedParams)
  const aaSigner = aaProvider.getSigner()

  return aaSigner
}

const extractProviderAndSigner = async (
  params: Params,
  rpcUrl: string,
  backendUrl: string
) => {
  let provider, signer

  if (params.privateKey) {
    provider = new ethers.providers.JsonRpcProvider(rpcUrl)
    signer = new ethers.Wallet(params.privateKey, provider)
  } else if (params.web3Provider) {
    provider = new ethers.providers.Web3Provider(
      params.web3Provider as ethers.providers.ExternalProvider
    )
    signer = provider.getSigner()
  } else if (params.identity && params.token) {
    const privateKey = await api.getPrivateKeyByToken(
      params.projectId,
      params.identity,
      params.token,
      backendUrl
    )
    provider = new ethers.providers.JsonRpcProvider(rpcUrl)
    signer = new ethers.Wallet(privateKey, provider)
  } else {
    throw ErrNoIdentifierProvided
  }

  return { provider, signer }
}

class VerifyingPaymasterAPI extends PaymasterAPI {
  constructor(
    readonly projectId: string,
    readonly paymaster: ethers.Contract,
    readonly backendUrl?: string,
    readonly paymasterUrl?: string
  ) {
    super()
    this.projectId = projectId
    this.paymaster = paymaster
    this.backendUrl = backendUrl
    this.paymasterUrl = paymasterUrl
  }

  async getPaymasterAndData(
    userOp: Partial<UserOperationStruct>
  ): Promise<string | undefined> {
    const resolvedUserOp = await resolveProperties(userOp)

    const hexifiedUserOp: any = hexifyUserOp(resolvedUserOp)

    const signature = await api.signUserOp(
      this.projectId,
      hexifiedUserOp,
      this.paymasterUrl
    )
    if (!signature) {
      throw ErrTransactionFailedGasChecks
    }

    return ethers.utils.hexConcat([this.paymaster.address, signature])
  }
}
