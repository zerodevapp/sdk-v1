import { BigNumber, BigNumberish, Contract } from 'ethers'
import {
  SimpleAccountFactory,
  SimpleAccount__factory,
  SimpleAccount,
  SimpleAccountFactory__factory
} from '@zerodevapp/contracts'

import { BytesLike, Result, arrayify, hexConcat } from 'ethers/lib/utils'
import { BaseApiParams, BaseAccountAPI } from './BaseAccountAPI'
import { getExecBatchParams } from './simpleAccountExecuteBatch'
import { MultiSendCall } from './multisend'

/**
 * constructor params, added on top of base params:
 * @param index nonce value used when creating multiple accounts for the same owner
 * @param factoryAddress address of factory to deploy new contracts (not needed if account already deployed)
 */
export interface SimpleAccountApiParams extends BaseApiParams {
  factoryAddress?: string
}

/**
 * An implementation of the BaseAccountAPI.
 * - Pass "owner" address and "index" nonce to the factory
 * - owner signs requests using normal "Ethereum Signed Message" (ether's signer.signMessage())
 * - nonce is a public variable "nonce"
 * - execute method is "execTransactionFromModule()", since the entrypoint is set as a module
 */
export class SimpleAccountAPI extends BaseAccountAPI {
  factoryAddress?: string
  accountContract?: SimpleAccount
  factory?: SimpleAccountFactory

  constructor (params: SimpleAccountApiParams) {
    super(params)
    this.factoryAddress = params.factoryAddress
  }

  async _getAccountContract (): Promise<SimpleAccount> {
    if (this.accountContract == null) {
      this.accountContract = SimpleAccount__factory.connect(
        await this.getAccountAddress(),
        this.provider
      )
    }
    return this.accountContract
  }

  /**
   * return the value to put into the "initCode" field, if the account is not yet deployed.
   * this value holds the "factory" address, followed by this account's information
   */
  async getAccountInitCode (): Promise<string> {
    return hexConcat([
      await this.getFactoryAddress(),
      await this.getFactoryAccountInitCode()
    ])
  }

  async getFactoryAddress (): Promise<string> {
    if (this.factoryAddress != null) {
      return this.factoryAddress
    }
    throw new Error('no factory address')
  }

  async getFactoryAccountInitCode (): Promise<string> {
    const ownerAddress = await this.owner.getAddress()
    if (this.factory == null) {
      if (this.factoryAddress != null && this.factoryAddress !== '') {
        this.factory = SimpleAccountFactory__factory.connect(
          this.factoryAddress,
          this.provider
        )
      } else {
        throw new Error('no factory to get initCode')
      }
    }
    return this.factory.interface.encodeFunctionData('createAccount', [
      ownerAddress,
      this.index
    ])
  }

  async getNonce (): Promise<BigNumber> {
    if (await this.checkAccountPhantom()) {
      return BigNumber.from(0)
    }
    const accountContract = await this._getAccountContract()
    return await accountContract.nonce()
  }

  /**
   * encode a method call from entryPoint to our contract
   * @param target
   * @param value
   * @param data
   */
  async encodeExecute (
    target: string,
    value: BigNumberish,
    data: string
  ): Promise<string> {
    const accountContract = await this._getAccountContract()

    return accountContract.interface.encodeFunctionData('execute', [
      target,
      value,
      data
    ])
  }

  async encodeExecuteBatch (
    calls: MultiSendCall[]
  ): Promise<string> {
    const accountContract = await this._getAccountContract()

    const { dest, func } = getExecBatchParams(calls)
    const simpleAccount = new Contract(this.accountAddress!, [
      'function executeBatch(address[] calldata dest, bytes[] calldata func)'
    ], accountContract.provider)
    return simpleAccount.interface.encodeFunctionData(
      'executeBatch',
      [
        dest,
        func
      ]
    )
  }

  async signUserOpHash (userOpHash: string): Promise<string> {
    return await this.owner.signMessage(arrayify(userOpHash))
  }

  async encodeExecuteDelegate (target: string, value: BigNumberish, data: string): Promise<string> {
    throw new Error('encodeExecuteDelegate not implemented')
  }

  async decodeExecuteDelegate (data: BytesLike): Promise<Result> {
    throw new Error('decodeExecuteDelegate not implemented')
  }
}
