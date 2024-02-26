import { Deferrable, defineReadOnly, resolveProperties } from '@ethersproject/properties'
import { Provider, TransactionRequest, TransactionResponse } from '@ethersproject/providers'
import { Signer } from '@ethersproject/abstract-signer'
import { TypedDataUtils, SignTypedDataVersion } from '@metamask/eth-sig-util'

import { BigNumber, Bytes, BigNumberish, ContractTransaction, Contract } from 'ethers'
import { ZeroDevProvider } from './ZeroDevProvider'
import { ClientConfig } from './ClientConfig'
import { HttpRpcClient, StateOverrides, UserOperationReceipt } from './HttpRpcClient'
import { BaseAccountAPI, ExecuteType } from './BaseAccountAPI'
import { DelegateCall } from './types'
import { UserOperationStruct } from '@zerodevapp/contracts'
import { _TypedDataEncoder, hexConcat, hexZeroPad, hexlify } from 'ethers/lib/utils'
import { fixSignedData, getERC1155Contract, getERC20Contract, getERC721Contract, randomHexString } from './utils'
import MoralisApiService from './services/MoralisApiService'
import { MultiSendCall, getMultiSendAddress } from './multisend'
import * as constants from './constants'
import { KernelAccountV2API } from './KernelAccountV2API';
import { ValidatorMode } from './validators';

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

export interface ExecArgs {
  gasLimit?: number
  maxFeePerGas?: BigNumberish
  maxPriorityFeePerGas?: BigNumberish
}

export function isKernelAccountV2Api (
  smartAccountAPI: any
): smartAccountAPI is KernelAccountV2API {
  return smartAccountAPI?.validator !== undefined
}

export class ZeroDevSigner extends Signer {
  // TODO: we have 'erc4337provider', remove shared dependencies or avoid two-way reference
  constructor (
    readonly config: ClientConfig,
    readonly originalSigner: Signer,
    readonly zdProvider: ZeroDevProvider,
    httpRpcClient: HttpRpcClient,
    readonly smartAccountAPI: BaseAccountAPI
  ) {
    super()
    defineReadOnly(this, 'provider', zdProvider)
    this.httpRpcClient = httpRpcClient
  }

  address?: string
  httpRpcClient: HttpRpcClient

  async getDummySignature (
    kernelAccountAddress: string,
    calldata: string
  ): Promise<string> {
    if (isKernelAccountV2Api(this.smartAccountAPI)) {
      const validator = this.smartAccountAPI.validator
      const dummyECDSASig =
        '0x870fe151d548a1c527c3804866fab30abf28ed17b79d5fc5149f19ca0819fefc3c57f3da4fdf9b10fab3f2f3dca536467ae44943b9dbb8433efe7760ddd72aaa1c'
      const validatorMode =
        await validator.resolveValidatorMode(
          kernelAccountAddress,
          calldata
        )
      if (validatorMode === ValidatorMode.enable) {
        const enableDataLength =
            (await this.smartAccountAPI.validator.getEnableData()).length / 2 - 1
        const enableSigLength = 65
        // ((await this.validator.getEnableSignature()) ?? "0x").length / 2 - 1
        const staticDummySig = hexConcat([
          '0x000000000000000000000000',
          validator.getAddress(),
          '0x53dd285022D1512635823952d109dB39467a457E'
        ])
        const enableDummyData = randomHexString(enableDataLength)
        // [TODO] - Current dummy enable signature is hardcoded, need to generate it dynamically
        // Only works if the actual enable signature is 65 bytes long ECDSA signature without extra encoding
        // const enableDummySig = concatHex([randomHexString(enableSigLength - 1), "0x1c"])
        return hexConcat([
          ValidatorMode.enable,
          staticDummySig,
          hexZeroPad(hexlify(enableDataLength), 32),
          enableDummyData,
          hexZeroPad(hexlify(enableSigLength), 32),
          // enableDummySig,
          dummyECDSASig,
          dummyECDSASig
        ])
      }
      return hexConcat([validatorMode, dummyECDSASig])
    } else {
      return '0x4046ab7d9c387d7a5ef5ca0777eded29767fd9863048946d35b3042d2f7458ff7c62ade2903503e15973a63a296313eab15b964a18d79f4b06c8c01c7028143c1c'
    }
  }

  // This one is called by Contract. It signs the request and passes in to Provider to be sent.
  async sendTransaction (transaction: Deferrable<TransactionRequest>, stateOverrides?: StateOverrides, executeBatchType: ExecuteType = ExecuteType.EXECUTE, retryCount: number = 0, fallbackMode: boolean = false): Promise<TransactionResponse> {
    const gasLimit = await transaction.gasLimit
    const target = transaction.to as string ?? ''
    const data = transaction.data?.toString() ?? '0x'
    const value = transaction.value as BigNumberish
    const maxFeePerGas = transaction.maxFeePerGas as BigNumberish
    const maxPriorityFeePerGas = transaction.maxPriorityFeePerGas as BigNumberish

    let userOperation: UserOperationStruct
    userOperation = await this.smartAccountAPI.createSignedUserOp(
      {
        target,
        data,
        value,
        gasLimit,
        maxFeePerGas,
        maxPriorityFeePerGas,
        dummySig: await this.getDummySignature(await this.getAddress(), await this.smartAccountAPI.getEncodedCallData({ target, data, value }, executeBatchType)),
        stateOverrides
      }, executeBatchType, retryCount)
    if (this.config.hooks?.userOperationStarted != null) {
      const proceed = await this.config.hooks?.userOperationStarted(await resolveProperties(userOperation))
      if (!proceed) {
        throw new Error('user operation rejected by user')
      }
    }

    try {
      await this.httpRpcClient.sendUserOpToBundler(userOperation)
    } catch (error: any) {
      console.error('sendUserOpToBundler failed', error)
      if (this.isReplacementOpError(error)) {
        console.error('Resending tx with Increased Gas fees')
        if (retryCount >= (this.config.maxTxRetries ?? constants.DEFAULT_MAX_TX_RETRIES)) {
          throw new Error('Maximum retry attempts exceeded')
        }
        return await this.resendTransactionWithIncreasedGasFees(transaction, userOperation, executeBatchType, retryCount, stateOverrides)
      } else if (!fallbackMode && this.config.shouldFallback === true) {
        console.error(`Bundler/Paymaster failed! Retrying the tx with fallback provider ${this.config.fallbackBundlerProvider}`)
        const tempClient = this.httpRpcClient
        this.httpRpcClient = this.httpRpcClient.newClient(this.config.fallbackBundlerProvider)
        const tempPaymasterProvider = this.smartAccountAPI.paymasterAPI?.paymasterProvider
        this.smartAccountAPI.paymasterAPI?.setPaymasterProvider(this.config.fallbackPaymasterProvider)
        const txResponse = await this.sendTransaction(transaction, stateOverrides, executeBatchType, 0, true)
        this.httpRpcClient = tempClient
        this.smartAccountAPI.paymasterAPI?.setPaymasterProvider(tempPaymasterProvider)
        return txResponse
      }
      throw this.unwrapError(error)
    }

    const transactionResponse = await this.zdProvider.constructUserOpTransactionResponse(userOperation)

    // Invoke the transaction hook
    const from = transaction.from as string
    const to = transaction.to as string
    this.config.hooks?.transactionStarted?.({
      hash: transactionResponse.hash,
      from,
      to,
      value: value ?? 0,
      sponsored: userOperation.paymasterAndData !== '0x'
    })

    // TODO: handle errors - transaction that is "rejected" by bundler is _not likely_ to ever resolve its "wait()"
    return transactionResponse
  }

  isReplacementOpError (errorIn: any): boolean {
    if (errorIn.body != null) {
      const errorBody = JSON.parse(errorIn.body)
      const failedOpMessage: string | undefined = errorBody?.error?.message
      return failedOpMessage !== undefined &&
        (failedOpMessage?.includes(
          'replacement op must increase maxFeePerGas and MaxPriorityFeePerGas'
        ) ||
          failedOpMessage?.match(/.*replacement.*underpriced.*/) !== null)
    }
    return false
  }

  async resendTransactionWithIncreasedGasFees (transaction: Deferrable<TransactionRequest>, userOperation: UserOperationStruct, executeBatchType: ExecuteType, retryCount: number, stateOverrides?: StateOverrides): Promise<TransactionResponse> {
    retryCount++
    const maxFeePerGas = BigNumber.from(userOperation.maxFeePerGas).mul(113).div(100)
    const maxPriorityFeePerGas = BigNumber.from(userOperation.maxPriorityFeePerGas).mul(113).div(100)
    return await this?.sendTransaction({ ...transaction, maxFeePerGas, maxPriorityFeePerGas }, stateOverrides, executeBatchType, retryCount)
  }

  unwrapError (errorIn: any): Error {
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
      const error = new Error(`The bundler has failed to include UserOperation in a batch: ${failedOpMessage} ${paymasterInfo}`)
      error.stack = errorIn.stack
      return error
    }
    return errorIn
  }

  async estimateGas (transaction: Deferrable<TransactionRequest>, executeBatchType: ExecuteType = ExecuteType.EXECUTE): Promise<BigNumber> {
    const tx = await resolveProperties(this.checkTransaction(transaction))
    const userOperation: UserOperationStruct = await this.smartAccountAPI.createUnsignedUserOp({
      target: tx.to ?? '',
      data: tx.data?.toString() ?? '0x',
      value: tx.value,
      maxFeePerGas: tx.maxFeePerGas,
      maxPriorityFeePerGas: tx.maxPriorityFeePerGas
    }, executeBatchType)

    return BigNumber.from(await userOperation.preVerificationGas).add(BigNumber.from(await userOperation.verificationGasLimit)).add(BigNumber.from(await userOperation.callGasLimit))
  }

  async getUserOperationReceipt (hash: string): Promise<UserOperationReceipt> {
    return await this.httpRpcClient.getUserOperationReceipt(hash)
  }

  async verifyAllNecessaryFields (transactionRequest: TransactionRequest): Promise<void> {
    if (transactionRequest.to == null) {
      throw new Error('Missing call target')
    }
    if (transactionRequest.data == null && transactionRequest.value == null) {
      // TBD: banning no-op UserOps seems to make sense on provider level
      throw new Error('Missing call data or value')
    }
  }

  connect (provider: Provider): Signer {
    throw new Error('changing providers is not supported')
  }

  async getAddress (): Promise<string> {
    if (this.address == null) {
      this.address = await this.zdProvider.getSenderAccountAddress()
    }
    return this.address
  }

  async signMessage (message: Bytes | string): Promise<string> {
    return await this.smartAccountAPI.signMessage(message)
  }

  async approvePlugin (plugin: Contract, validUntil: BigNumber, validAfter: BigNumber, data: string): Promise<string> {
    const sender = await this.getAddress()
    const ownerSig = await (this.originalSigner as any)._signTypedData(
      {
        name: 'Kernel',
        version: '0.0.1',
        chainId: (await this.provider!.getNetwork()).chainId,
        verifyingContract: sender
      },
      {
        ValidateUserOpPlugin: [
          { name: 'plugin', type: 'address' },
          { name: 'validUntil', type: 'uint48' },
          { name: 'validAfter', type: 'uint48' },
          { name: 'data', type: 'bytes' }
        ]
      },
      {
        plugin: plugin.address,
        validUntil,
        validAfter,
        data: hexlify(data)
      }
    )
    return fixSignedData(ownerSig)
  }

  async signTypedData (typedData: any): Promise<string> {
    const digest = TypedDataUtils.eip712Hash(typedData, SignTypedDataVersion.V4)
    return fixSignedData(await this.originalSigner.signMessage(digest))
  }

  async _signTypedData (domain: any, types: any, value: any): Promise<string> {
    const message = _TypedDataEncoder.getPayload(domain, types, value)
    return await this.signTypedData(message)
  }

  async signTransaction (transaction: Deferrable<TransactionRequest>): Promise<string> {
    throw new Error('not implemented')
  }

  async signUserOperation (userOperation: UserOperationStruct): Promise<string> {
    const message = await this.smartAccountAPI.getUserOpHash(userOperation)
    return await this.originalSigner.signMessage(message)
  }

  async getExecBatchTransaction (calls: MultiSendCall[], options?: ExecArgs): Promise<Deferrable<TransactionRequest>> {
    const calldata = await this.smartAccountAPI.encodeExecuteBatch(calls)
    return {
      ...options,
      to: getMultiSendAddress(),
      value: 0,
      data: calldata
    }
  }

  async execBatch (calls: MultiSendCall[], stateOverrides?: StateOverrides, options?: ExecArgs): Promise<ContractTransaction> {
    const transaction: Deferrable<TransactionRequest> = await this.getExecBatchTransaction(calls, options)
    return await this.sendTransaction(transaction, stateOverrides, ExecuteType.EXECUTE_BATCH)
  }

  async execDelegateCall (call: DelegateCall, stateOverrides?: StateOverrides, options?: ExecArgs): Promise<ContractTransaction> {
    return await this.sendTransaction({
      ...options,
      to: call.to,
      data: call.data
    }, stateOverrides, ExecuteType.EXECUTE_DELEGATE)
  }

  async listAssets (): Promise<AssetTransfer[]> {
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

  async transferAllAssets (to: string, assets: AssetTransfer[], options?: ExecArgs): Promise<ContractTransaction> {
    const selfAddress = await this.getAddress()
    const calls = assets.map(async asset => {
      switch (asset.assetType) {
        case AssetType.ETH:
          return {
            to,
            value: asset.amount ? asset.amount : await this.provider!.getBalance(selfAddress),
            data: '0x'
          }
        case AssetType.ERC20:
          const erc20 = getERC20Contract(this.provider!, asset.address!)
          return {
            to: asset.address!,
            value: 0,
            data: erc20.interface.encodeFunctionData('transfer', [to, asset.amount ? asset.amount : await erc20.balanceOf(selfAddress)])
          }
        case AssetType.ERC721:
          const erc721 = getERC721Contract(this.provider!, asset.address!)
          return {
            to: asset.address!,
            value: 0,
            data: erc721.interface.encodeFunctionData('transferFrom', [selfAddress, to, asset.tokenId!])
          }
        case AssetType.ERC1155:
          const erc1155 = getERC1155Contract(this.provider!, asset.address!)
          return {
            to: asset.address!,
            value: 0,
            data: erc1155.interface.encodeFunctionData('safeTransferFrom', [selfAddress, to, asset.tokenId!, asset.amount ? asset.amount : await erc1155.balanceOf(selfAddress, asset.tokenId!), '0x'])
          }
      }
    })
    const awaitedCall = await Promise.all(calls)
    return await this.execBatch(awaitedCall, undefined, options)
  }
}
