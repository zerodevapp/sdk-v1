import { Deferrable, defineReadOnly, resolveProperties } from '@ethersproject/properties'
import { Provider, TransactionRequest, TransactionResponse } from '@ethersproject/providers'
import { Signer } from '@ethersproject/abstract-signer'
import { TypedDataUtils } from 'ethers-eip712'

import { BigNumber, Bytes, BigNumberish, ContractTransaction, ethers } from 'ethers'
import { ZeroDevProvider } from './ZeroDevProvider'
import { ClientConfig } from './ClientConfig'
import { HttpRpcClient, UserOperationReceipt } from './HttpRpcClient'
import { BaseAccountAPI, BaseAccountAPIExecBatchArgs } from './BaseAccountAPI'
import { getModuleInfo } from './types'
import { UserOperationStruct } from '@zerodevapp/contracts'
import { logTransactionReceipt } from './api'
import MoralisApiService from './services/MoralisApiService'
import { Call } from './execBatch'
import { fixSignedData } from './utils'


export enum AssetType {
  ETH = 1,
  ERC20 = 2,
  ERC721 = 3,
  ERC1155 = 4,
}

export interface AssetTransfer {
  assetType: AssetType
  address?: string
  tokenId?: BigNumberish
  amount?: BigNumberish
}

export class ZeroDevSigner extends Signer {
  // TODO: we have 'erc4337provider', remove shared dependencies or avoid two-way reference
  constructor(
    readonly config: ClientConfig,
    readonly originalSigner: Signer,
    readonly zdProvider: ZeroDevProvider,
    readonly httpRpcClient: HttpRpcClient,
    readonly smartAccountAPI: BaseAccountAPI,
  ) {
    super()
    defineReadOnly(this, 'provider', zdProvider)
  }

  address?: string

  // This one is called by Contract. It signs the request and passes in to Provider to be sent.
  async sendTransaction(transaction: Deferrable<TransactionRequest>): Promise<TransactionResponse> {
    // `populateTransaction` internally calls `estimateGas`.
    // Some providers revert if you try to call estimateGas without the wallet first having some ETH,
    // which is going to be the case here if we use paymasters.  Therefore we set the gas price to
    // 0 to ensure that estimateGas works even if the wallet has no ETH.
    if (transaction.maxFeePerGas || transaction.maxPriorityFeePerGas) {
      transaction.maxFeePerGas = 0
      transaction.maxPriorityFeePerGas = 0
    } else {
      transaction.gasPrice = 0
    }
    const tx: TransactionRequest = await this.populateTransaction(transaction)
    await this.verifyAllNecessaryFields(tx)
    let userOperation: UserOperationStruct
    userOperation = await this.smartAccountAPI.createSignedUserOp({
      target: tx.to ?? '',
      data: tx.data?.toString() ?? '0x',
      value: tx.value,
      gasLimit: tx.gasLimit,
      maxFeePerGas: tx.maxFeePerGas,
      maxPriorityFeePerGas: tx.maxPriorityFeePerGas,
    })
    const transactionResponse = await this.zdProvider.constructUserOpTransactionResponse(userOperation)

    void transactionResponse.wait().then(logTransactionReceipt(this.config.projectId))

    // Invoke the transaction hook
    this.config.hooks?.transactionStarted?.({
      hash: transactionResponse.hash,
      from: tx.from!,
      to: tx.to!,
      value: tx.value || 0,
      sponsored: userOperation.paymasterAndData !== '0x',
      module: getModuleInfo(tx),
    })

    try {
      await this.httpRpcClient.sendUserOpToBundler(userOperation)
    } catch (error: any) {
      // console.error('sendUserOpToBundler failed', error)
      throw this.unwrapError(error)
    }
    // TODO: handle errors - transaction that is "rejected" by bundler is _not likely_ to ever resolve its "wait()"
    return transactionResponse
  }

  unwrapError(errorIn: any): Error {
    if (errorIn.body != null) {
      const errorBody = JSON.parse(errorIn.body)
      let paymasterInfo: string = ''
      let failedOpMessage: string | undefined = errorBody?.error?.message
      if (failedOpMessage?.includes('FailedOp') === true) {
        // TODO: better error extraction methods will be needed
        const matched = failedOpMessage.match(/FailedOp\((.*)\)/)
        if (matched != null) {
          const split = matched[1].split(',')
          paymasterInfo = `(paymaster address: ${split[1]})`
          failedOpMessage = split[2]
        }
      }
      const error = new Error(`The bundler has failed to include UserOperation in a batch: ${failedOpMessage} ${paymasterInfo})`)
      error.stack = errorIn.stack
      return error
    }
    return errorIn
  }

  async estimateGas(transaction: Deferrable<TransactionRequest>): Promise<BigNumber> {
    const tx = await resolveProperties(this.checkTransaction(transaction));
    let userOperation: UserOperationStruct
    userOperation = await this.smartAccountAPI.createUnsignedUserOp({
      target: tx.to ?? '',
      data: tx.data?.toString() ?? '0x',
      value: tx.value,
      maxFeePerGas: tx.maxFeePerGas,
      maxPriorityFeePerGas: tx.maxPriorityFeePerGas,
    })

    const gasInfo: any = await this.httpRpcClient.estimateUserOpGas({
      ...userOperation,
      // random dummy signature, because some bundlers (e.g. StackUp's)
      // require that the signature length is correct, in order to estimate
      // preverification gas properly.
      signature: '0x4046ab7d9c387d7a5ef5ca0777eded29767fd9863048946d35b3042d2f7458ff7c62ade2903503e15973a63a296313eab15b964a18d79f4b06c8c01c7028143c1c',
    })
    return BigNumber.from(gasInfo.preVerificationGas).add(BigNumber.from(gasInfo.verificationGas)).add(BigNumber.from(gasInfo.callGasLimit));
  }

  async getUserOperationReceipt(hash: string): Promise<UserOperationReceipt> {
    return this.httpRpcClient.getUserOperationReceipt(hash)
  }

  async verifyAllNecessaryFields(transactionRequest: TransactionRequest): Promise<void> {
    if (transactionRequest.to == null) {
      throw new Error('Missing call target')
    }
    if (transactionRequest.data == null && transactionRequest.value == null) {
      // TBD: banning no-op UserOps seems to make sense on provider level
      throw new Error('Missing call data or value')
    }
  }

  connect(provider: Provider): Signer {
    throw new Error('changing providers is not supported')
  }

  async getAddress(): Promise<string> {
    if (this.address == null) {
      this.address = await this.zdProvider.getSenderAccountAddress()
    }
    return this.address
  }

  async signMessage(message: Bytes | string): Promise<string> {
    const dataHash = ethers.utils.arrayify(ethers.utils.hashMessage(message))
    let sig = fixSignedData(await this.originalSigner.signMessage(dataHash))

    // If the account is undeployed, use ERC-6492
    if (await this.smartAccountAPI.checkAccountPhantom()) {
      const coder = new ethers.utils.AbiCoder()
      sig = coder.encode(['address', 'bytes', 'bytes'], [
        await this.smartAccountAPI.getFactoryAddress(),
        await this.smartAccountAPI.getFactoryAccountInitCode(),
        sig,
      ]) + '6492649264926492649264926492649264926492649264926492649264926492' // magic suffix
    }

    return sig
  }

  async signTypedData(typedData: any) {
    const digest = TypedDataUtils.encodeDigest(typedData)
    return await this.signMessage(digest)
  }

  async signTransaction(transaction: Deferrable<TransactionRequest>): Promise<string> {
    throw new Error('not implemented')
  }

  async signUserOperation(userOperation: UserOperationStruct): Promise<string> {
    const message = await this.smartAccountAPI.getUserOpHash(userOperation)
    return await this.originalSigner.signMessage(message)
  }

  async execBatch<A, T>(calls: Array<Call<T>>, options?: BaseAccountAPIExecBatchArgs<A>): Promise<ContractTransaction> {
    return await this.smartAccountAPI.execBatch(calls, this, options)
  }

  async enableModule(moduleAddress: string): Promise<ContractTransaction> {
    return await this.smartAccountAPI.enableModule(moduleAddress, this)
  }

  async listAssets(): Promise<AssetTransfer[]> {
    const moralisApiService = new MoralisApiService()
    const chainId = await this.getChainId()
    const address = await this.getAddress()
    const assets: AssetTransfer[] = []

    const nativeAsset = await moralisApiService.getNativeBalance(chainId, address)
    if (nativeAsset !== undefined) assets.push(nativeAsset)

    const tokenAssets = await moralisApiService.getTokenBalances(chainId, address)
    if (tokenAssets !== undefined) assets.push(...tokenAssets)

    const nftAssets = await moralisApiService.getNFTBalances(chainId, address)
    if (nftAssets !== undefined) assets.push(...nftAssets)

    return assets
  }

  async transferAllAssets<A>(to: string, assets: AssetTransfer[], options?: BaseAccountAPIExecBatchArgs<A>): Promise<ContractTransaction> {
    return await this.smartAccountAPI.transferAllAssets(to, assets, this, options)
  }

  async transferOwnership(newOwner: string): Promise<ContractTransaction> {
    return await this.smartAccountAPI.transferOwnership(newOwner, this)
  }
}
