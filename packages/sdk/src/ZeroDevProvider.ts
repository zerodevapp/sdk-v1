import { BaseProvider, TransactionReceipt, TransactionResponse } from '@ethersproject/providers'
import { BigNumber, Signer } from 'ethers'
import { Network } from '@ethersproject/networks'
import { hexValue, resolveProperties } from 'ethers/lib/utils'

import { ClientConfig } from './ClientConfig'
import { ZeroDevSigner } from './ZeroDevSigner'
import { HttpRpcClient } from './HttpRpcClient'
import { UserOperationStruct } from '@zerodevapp/contracts'
import { EntryPoint } from '@zerodevapp/contracts-new'
import { BaseAccountAPI } from './BaseAccountAPI'
import Debug from 'debug'
import { getUserOpReceipt } from './utils'
const debug = Debug('aa.provider')

export class ZeroDevProvider extends BaseProvider {
  initializedBlockNumber!: number

  readonly signer: ZeroDevSigner

  constructor(
    readonly chainId: number,
    readonly config: ClientConfig,
    readonly originalSigner: Signer,
    readonly originalProvider: BaseProvider,
    readonly httpRpcClient: HttpRpcClient,
    readonly entryPoint: EntryPoint,
    readonly smartAccountAPI: BaseAccountAPI,
  ) {
    super({
      name: 'ERC-4337 Custom Network',
      chainId
    })
    this.signer = new ZeroDevSigner(config, originalSigner, this, httpRpcClient, smartAccountAPI)
  }

  /**
   * finish intializing the provider.
   * MUST be called after construction, before using the provider.
   */
  async init(): Promise<this> {
    // await this.httpRpcClient.validateChainId()
    this.initializedBlockNumber = await this.originalProvider.getBlockNumber()
    await this.smartAccountAPI.init()
    // await this.signer.init()
    return this
  }

  getSigner(): ZeroDevSigner {
    return this.signer
  }

  async perform(method: string, params: any): Promise<any> {
    debug('perform', method, params)
    if (method === 'sendTransaction' || method === 'getTransactionReceipt') {
      // TODO: do we need 'perform' method to be available at all?
      // there is nobody out there to use it for ERC-4337 methods yet, we have nothing to override in fact.
      throw new Error('Should not get here. Investigate.')
    }
    return await this.originalProvider.perform(method, params)
  }

  async getTransaction(transactionHash: string | Promise<string>): Promise<TransactionResponse> {
    // TODO
    return await super.getTransaction(transactionHash)
  }

  async getTransactionReceipt(transactionHash: string | Promise<string>): Promise<TransactionReceipt> {
    const userOpHash = await transactionHash
    const sender = await this.getSenderAccountAddress()
    return await getUserOpReceipt(this.entryPoint, sender, userOpHash, this.chainId)
  }

  async getSenderAccountAddress(): Promise<string> {
    return await this.smartAccountAPI.getAccountAddress()
  }

  async waitForTransaction(transactionHash: string, confirmations?: number, timeout?: number): Promise<TransactionReceipt> {
    const sender = await this.getSenderAccountAddress()

    return await new Promise<TransactionReceipt>((resolve, reject) => {
      getUserOpReceipt(this.entryPoint, sender, transactionHash, this.chainId).then(userOpReceipt => {
        this.config.hooks?.transactionConfirmed?.(transactionHash)
        resolve(userOpReceipt)
      }).catch((reason) => {
        this.config.hooks?.transactionReverted?.(transactionHash)
        reject(reason)
      })
    })
  }

  // fabricate a response in a format usable by ethers users...
  async constructUserOpTransactionResponse(userOp1: UserOperationStruct): Promise<TransactionResponse> {
    const userOp = await resolveProperties(userOp1)
    const userOpHash = await this.entryPoint.getUserOpHash(userOp)
    const waitPromise = getUserOpReceipt(this.entryPoint, userOp.sender, userOpHash, this.chainId)

    // session key nonces use 2D nonces, so it's going to overflow Ethers
    // https://github.com/ethers-io/ethers.js/blob/0802b70a724321f56d4c170e4c8a46b7804dfb48/src.ts/transaction/transaction.ts#L44
    // so we manually set the nonce to 0 here
    let nonce = BigNumber.from(userOp.nonce)
    if (nonce.gt(Number.MAX_SAFE_INTEGER - 1)) {
      nonce = BigNumber.from(0)
    }

    return {
      hash: userOpHash,
      confirmations: 0,
      from: userOp.sender,
      nonce: nonce.toNumber(),
      gasLimit: BigNumber.from(userOp.callGasLimit), // ??
      value: BigNumber.from(0),
      data: hexValue(userOp.callData), // should extract the actual called method from this "execFromEntryPoint()" call
      chainId: this.chainId,
      wait: async (confirmations?: number): Promise<TransactionReceipt> => {
        const transactionReceipt = await waitPromise
        if (userOp.initCode.length !== 0) {
          // checking if the wallet has been deployed by the transaction; it must be if we are here
          await this.smartAccountAPI.checkAccountPhantom()
        }
        return transactionReceipt
      }
    }
  }

  async detectNetwork(): Promise<Network> {
    return (this.originalProvider as any).detectNetwork()
  }
}
