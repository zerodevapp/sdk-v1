import { BigNumber, BigNumberish, Contract } from 'ethers'

import { BytesLike, Result, arrayify, hexConcat } from 'ethers/lib/utils'
import { Signer } from '@ethersproject/abstract-signer'
import { BaseApiParams, BaseAccountAPI } from './BaseAccountAPI'
import { MultiSendCall, encodeMultiSend, getMultiSendAddress } from './multisend'
import { KernelFactory, KernelFactory__factory } from '@zerodevapp/contracts-new'
import { Kernel, Kernel__factory } from '@zerodevapp/kernel-contracts-v2'
import { KernelAccountApiParams } from './KernelAccountAPI'

/**
 * An implementation of the BaseAccountAPI using Gnosis Safe.
 * - Pass "owner" address and "index" nonce to the factory
 * - owner signs requests using normal "Ethereum Signed Message" (ether's signer.signMessage())
 * - nonce is a public variable "nonce"
 * - execute method is "execTransactionFromModule()", since the entrypoint is set as a module
 */
export class KernelAccountV2API extends BaseAccountAPI {
  factoryAddress?: string
  owner: Signer

  accountContract?: Kernel
  factory?: KernelFactory

  constructor(params: KernelAccountApiParams) {
    super(params)
    this.factoryAddress = params.factoryAddress
    this.owner = params.owner
  }

  async _getAccountContract(): Promise<Kernel> {
    if (this.accountContract == null) {
      this.accountContract = Kernel__factory.connect(await this.getAccountAddress(), this.provider)
    }
    return this.accountContract
  }

  /**
   * return the value to put into the "initCode" field, if the account is not yet deployed.
   * this value holds the "factory" address, followed by this account's information
   */
  async getAccountInitCode(): Promise<string> {
    const factoryAddr = await this.getFactoryAddress()
    const factoryInitCode = await this.getFactoryAccountInitCode()
    return hexConcat([
      factoryAddr,
      factoryInitCode,
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
        this.factory = KernelFactory__factory.connect(this.factoryAddress, this.provider)
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
    return await accountContract['getNonce()']()
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
    const managerContract = Kernel__factory.connect(accountContract.address, accountContract.provider)
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
    const managerContract = Kernel__factory.connect(accountContract.address, accountContract.provider)
    return managerContract.interface.encodeFunctionData(
      'executeAndRevert',
      [
        target,
        value,
        data,
        1,
      ])
  }

  /**
   * encode a method call from entryPoint to our contract
   * @param target
   * @param value
   * @param data
   */
  async decodeExecuteDelegate(data: BytesLike): Promise<Result> {
    const accountContract = await this._getAccountContract()

    // the executeAndRevert method is defined on the manager
    const managerContract = Kernel__factory.connect(accountContract.address, accountContract.provider)
    return managerContract.interface.decodeFunctionData(
      'executeAndRevert',
      data
    )
  }

  async encodeExecuteBatch(
    calls: MultiSendCall[],
  ): Promise<string> {
    const multiSend = new Contract(getMultiSendAddress(), [
      'function multiSend(bytes memory transactions)',
    ])

    const multiSendCalldata = multiSend.interface.encodeFunctionData(
      'multiSend',
      [encodeMultiSend(calls)]
    )
    return this.encodeExecuteDelegate(multiSend.address, 0, multiSendCalldata)
  }

  async signUserOpHash(userOpHash: string): Promise<string> {
    return await this.owner.signMessage(arrayify(userOpHash))
  }
}
