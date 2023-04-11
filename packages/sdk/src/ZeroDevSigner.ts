import { Deferrable, defineReadOnly, resolveProperties } from '@ethersproject/properties'
import { Provider, TransactionRequest, TransactionResponse } from '@ethersproject/providers'
import { Signer } from '@ethersproject/abstract-signer'
import { TypedDataUtils } from 'ethers-eip712'

import { BigNumber, Bytes, BigNumberish, ContractTransaction, ethers, Contract } from 'ethers'
import { ZeroDevProvider } from './ZeroDevProvider'
import { ClientConfig } from './ClientConfig'
import { HttpRpcClient, UserOperationReceipt } from './HttpRpcClient'
import { BaseAccountAPI, ExecuteType } from './BaseAccountAPI'
import { getModuleInfo } from './types'
import { Call } from './execBatch'
import { UserOperationStruct, GnosisSafe__factory } from '@zerodevapp/contracts'
import { hexZeroPad, _TypedDataEncoder, hexlify } from 'ethers/lib/utils'
import { fixSignedData, getERC1155Contract, getERC20Contract, getERC721Contract } from './utils'
import MoralisApiService from './services/MoralisApiService'

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

export interface ExecBatchArgs {
  gasLimit?: number
  gasPrice?: BigNumberish
}

export class ZeroDevSigner extends Signer {
  // TODO: we have 'erc4337provider', remove shared dependencies or avoid two-way reference
  constructor(
    readonly config: ClientConfig,
    readonly originalSigner: Signer,
    readonly zdProvider: ZeroDevProvider,
    readonly httpRpcClient: HttpRpcClient,
    readonly smartAccountAPI: BaseAccountAPI
  ) {
    super()
    defineReadOnly(this, 'provider', zdProvider)
  }

  address?: string

  // This one is called by Contract. It signs the request and passes in to Provider to be sent.
  async sendTransaction(transaction: Deferrable<TransactionRequest>, executeBatchType: ExecuteType = ExecuteType.EXECUTE): Promise<TransactionResponse> {
    const gasLimit = await transaction.gasLimit || await this.estimateGas({ ...transaction }, executeBatchType)
    const target = transaction.to as string ?? ''
    const data = transaction.data?.toString() ?? '0x'
    const value = transaction.value as BigNumberish
    const maxFeePerGas = transaction.maxFeePerGas as BigNumberish
    const maxPriorityFeePerGas = transaction.maxPriorityFeePerGas as BigNumberish

    let userOperation: UserOperationStruct
    userOperation = await this.smartAccountAPI.createSignedUserOp({
      target,
      data,
      value,
      gasLimit,
      maxFeePerGas,
      maxPriorityFeePerGas
    }, executeBatchType)
    const transactionResponse = await this.zdProvider.constructUserOpTransactionResponse(userOperation)

    // Invoke the transaction hook
    let from, to
    from = transaction.from! as string
    to = transaction.to! as string
    this.config.hooks?.transactionStarted?.({
      hash: transactionResponse.hash,
      from,
      to,
      value: value ?? 0,
      sponsored: userOperation.paymasterAndData !== '0x',
      module: getModuleInfo(transaction)
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

  async estimateGas(transaction: Deferrable<TransactionRequest>, executeBatchType: ExecuteType = ExecuteType.EXECUTE): Promise<BigNumber> {
    const tx = await resolveProperties(this.checkTransaction(transaction))
    let userOperation: UserOperationStruct
    userOperation = await this.smartAccountAPI.createUnsignedUserOp({
      target: tx.to ?? '',
      data: tx.data?.toString() ?? '0x',
      value: tx.value,
      maxFeePerGas: tx.maxFeePerGas,
      maxPriorityFeePerGas: tx.maxPriorityFeePerGas
    }, executeBatchType)

    const gasInfo: any = await this.httpRpcClient.estimateUserOpGas({
      ...userOperation,
      // random dummy signature, because some bundlers (e.g. StackUp's)
      // require that the signature length is correct, in order to estimate
      // preverification gas properly.
      signature: '0x4046ab7d9c387d7a5ef5ca0777eded29767fd9863048946d35b3042d2f7458ff7c62ade2903503e15973a63a296313eab15b964a18d79f4b06c8c01c7028143c1c'
    })
    return BigNumber.from(gasInfo.preVerificationGas).add(BigNumber.from(gasInfo.verificationGas)).add(BigNumber.from(gasInfo.callGasLimit))
  }

  async getUserOperationReceipt(hash: string): Promise<UserOperationReceipt> {
    return await this.httpRpcClient.getUserOperationReceipt(hash)
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
        sig
      ]) + '6492649264926492649264926492649264926492649264926492649264926492' // magic suffix
    }

    return sig
  }

  async approvePlugin(plugin : Contract, validUntil: BigNumber, validAfter: BigNumber, data: string): Promise<string> {
    const sender = await this.getAddress();
    const ownerSig = await this.originalSigner._signTypedData(
        {
            name: "Kernel",
            version: "0.0.1",
            chainId: (await this.provider!.getNetwork()).chainId,
            verifyingContract: sender,
        },
        {
            ValidateUserOpPlugin: [
                { name: "plugin", type: "address" },
                { name: "validUntil", type: "uint48" },
                { name: "validAfter", type: "uint48" },
                { name: "data", type: "bytes" },
            ]
        },
        {
            plugin : plugin.address,
            validUntil: validUntil,
            validAfter : validAfter,
            data : hexlify(data)
        }
    );
    return ownerSig;
}

  async signTypedData(typedData: any): Promise<string> {
    const digest = TypedDataUtils.encodeDigest(typedData)
    return await this.signMessage(digest)
  }

  async _signTypedData(domain: any, types: any, value: any): Promise<string> {
    const message = _TypedDataEncoder.getPayload(domain, types, value)
    return await this.signTypedData(message)
  }

  async signTransaction(transaction: Deferrable<TransactionRequest>): Promise<string> {
    throw new Error('not implemented')
  }

  async signUserOperation(userOperation: UserOperationStruct): Promise<string> {
    const message = await this.smartAccountAPI.getUserOpHash(userOperation)
    return await this.originalSigner.signMessage(message)
  }

  async getExecBatchTransaction(calls: Array<Call>, options?: ExecBatchArgs): Promise<Deferrable<TransactionRequest>> {
    const calldata = await this.smartAccountAPI.encodeExecuteBatch(calls)
    return {
      ...options,
      data: calldata
    }
  }

  async execBatch(calls: Array<Call>, options?: ExecBatchArgs): Promise<ContractTransaction> {
    const transaction: Deferrable<TransactionRequest> = await this.getExecBatchTransaction(calls, options)
    return await this.sendTransaction(transaction, ExecuteType.EXECUTE_BATCH)
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

  async transferAllAssets(to: string, assets: AssetTransfer[], options?: ExecBatchArgs): Promise<ContractTransaction> {
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
    return await this.execBatch(awaitedCall, options)
  }
}
