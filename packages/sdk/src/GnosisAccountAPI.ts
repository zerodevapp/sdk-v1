import { BigNumber, BigNumberish } from 'ethers'
import {
  ZeroDevPluginSafe__factory,
  ZeroDevPluginSafe, ZeroDevGnosisSafeAccountFactory,
  ZeroDevGnosisSafeAccountFactory__factory
} from '@zerodevapp/contracts'

import { arrayify, hexConcat } from 'ethers/lib/utils'
import { Signer } from '@ethersproject/abstract-signer'
import { BaseApiParams, BaseAccountAPI } from './BaseAccountAPI'

/**
 * constructor params, added on top of base params:
 * @param owner the signer object for the account owner
 * @param index nonce value used when creating multiple accounts for the same owner
 * @param factoryAddress address of factory to deploy new contracts (not needed if account already deployed)
 */
export interface GnosisAccountApiParams extends BaseApiParams {
  owner: Signer
  index?: number
  factoryAddress?: string
}

/**
 * An implementation of the BaseAccountAPI using Gnosis Safe.
 * - Pass "owner" address and "index" nonce to the factory
 * - owner signs requests using normal "Ethereum Signed Message" (ether's signer.signMessage())
 * - nonce is a public variable "nonce"
 * - execute method is "execTransactionFromModule()", since the entrypoint is set as a module
 */
export class GnosisAccountAPI extends BaseAccountAPI {
  factoryAddress?: string
  owner: Signer
  index: number

  accountContract?: ZeroDevPluginSafe
  factory?: ZeroDevGnosisSafeAccountFactory

  constructor(params: GnosisAccountApiParams) {
    super(params)
    this.factoryAddress = params.factoryAddress
    this.owner = params.owner
    this.index = params.index ?? 0
  }

  async _getAccountContract(): Promise<ZeroDevPluginSafe> {
    if (this.accountContract == null) {
      this.accountContract = ZeroDevPluginSafe__factory.connect(await this.getAccountAddress(), this.provider)
    }
    return this.accountContract
  }

  /**
   * return the value to put into the "initCode" field, if the account is not yet deployed.
   * this value holds the "factory" address, followed by this account's information
   */
  async getAccountInitCode(): Promise<string> {
    return hexConcat([
      await this.getFactoryAddress(),
      await this.getFactoryAccountInitCode(),
    ])
  }

  async getFactoryAddress(): Promise<string> {
    if (this.factoryAddress != null) {
      return this.factoryAddress
    }
    throw new Error('no factory address')
  }

  async getFactoryAccountInitCode(): Promise<string> {
    const ownerAddress = await this.owner.getAddress()
    if (this.factory == null) {
      if (this.factoryAddress != null && this.factoryAddress !== '') {
        this.factory = ZeroDevGnosisSafeAccountFactory__factory.connect(this.factoryAddress, this.provider)
      } else {
        throw new Error('no factory to get initCode')
      }
    }
    return this.factory.interface.encodeFunctionData('createAccount', [ownerAddress, this.index])
  }

  async getNonce(): Promise<BigNumber> {
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
  async encodeExecute(target: string, value: BigNumberish, data: string): Promise<string> {
    const accountContract = await this._getAccountContract()

    // the executeAndRevert method is defined on the manager
    const managerContract = ZeroDevPluginSafe__factory.connect(accountContract.address, accountContract.provider)
    return managerContract.interface.encodeFunctionData(
      'executeAndRevert',
      [
        target,
        value,
        data,
        0,
      ])
  }

  /**
   * encode a method call from entryPoint to our contract
   * @param target
   * @param value
   * @param data
   */
  async encodeExecuteDelegate(target: string, value: BigNumberish, data: string): Promise<string> {
    const accountContract = await this._getAccountContract()

    // the executeAndRevert method is defined on the manager
    const managerContract = ZeroDevPluginSafe__factory.connect(accountContract.address, accountContract.provider)
    return managerContract.interface.encodeFunctionData(
      'executeAndRevert',
      [
        target,
        value,
        data,
        1,
      ])
  }

  async signUserOpHash(userOpHash: string): Promise<string> {
    return await this.owner.signMessage(arrayify(userOpHash))
  }
}
