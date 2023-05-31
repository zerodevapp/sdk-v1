import { BigNumber, BigNumberish, Contract, ethers } from 'ethers'

import { Bytes, BytesLike, Result, arrayify, hexConcat } from 'ethers/lib/utils'
import { Signer } from '@ethersproject/abstract-signer'
import { BaseApiParams, BaseAccountAPI } from './BaseAccountAPI'
import { MultiSendCall, encodeMultiSend, getMultiSendAddress } from './multisend'
import { Call } from './types'
import { Kernel, KernelFactory, KernelFactory__factory, Kernel__factory } from '@zerodevapp/contracts-new'
import { fixSignedData } from './utils'

/**
 * constructor params, added on top of base params:
 * @param owner the signer object for the account owner
 * @param index nonce value used when creating multiple accounts for the same owner
 * @param factoryAddress address of factory to deploy new contracts (not needed if account already deployed)
 */
export interface KernelAccountApiParams extends BaseApiParams {
  owner: Signer
  index?: number
  factoryAddress?: string
  templateAddress?: string
}

/**
 * An implementation of the BaseAccountAPI using Gnosis Safe.
 * - Pass "owner" address and "index" nonce to the factory
 * - owner signs requests using normal "Ethereum Signed Message" (ether's signer.signMessage())
 * - nonce is a public variable "nonce"
 * - execute method is "execTransactionFromModule()", since the entrypoint is set as a module
 */
export class KernelAccountAPI extends BaseAccountAPI {
  factoryAddress?: string
  owner: Signer

  accountContract?: Kernel
  factory?: KernelFactory

  constructor (params: KernelAccountApiParams) {
    super(params)
    this.factoryAddress = params.factoryAddress
    this.owner = params.owner
  }

  async _getAccountContract (): Promise<Kernel> {
    if (this.accountContract == null) {
      this.accountContract = Kernel__factory.connect(await this.getAccountAddress(), this.provider)
    }
    return this.accountContract
  }

  /**
   * return the value to put into the "initCode" field, if the account is not yet deployed.
   * this value holds the "factory" address, followed by this account's information
   */
  async getAccountInitCode (): Promise<string> {
    const factoryAddr = await this.getFactoryAddress()
    const factoryInitCode = await this.getFactoryAccountInitCode()
    return hexConcat([
      factoryAddr,
      factoryInitCode
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
        this.factory = KernelFactory__factory.connect(this.factoryAddress, this.provider)
      } else {
        throw new Error('no factory to get initCode')
      }
    }
    return this.factory.interface.encodeFunctionData('createAccount', [ownerAddress, this.index])
  }

  async getNonce (): Promise<BigNumber> {
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
  async encodeExecute (target: string, value: BigNumberish, data: string): Promise<string> {
    const accountContract = await this._getAccountContract()

    // the executeAndRevert method is defined on the manager
    const managerContract = Kernel__factory.connect(accountContract.address, accountContract.provider)
    return managerContract.interface.encodeFunctionData(
      'executeAndRevert',
      [
        target,
        value,
        data,
        0
      ])
  }

  /**
   * encode a method call from entryPoint to our contract
   * @param target
   * @param value
   * @param data
   */
  async encodeExecuteDelegate (target: string, value: BigNumberish, data: string): Promise<string> {
    const accountContract = await this._getAccountContract()

    // the executeAndRevert method is defined on the manager
    const managerContract = Kernel__factory.connect(accountContract.address, accountContract.provider)
    return managerContract.interface.encodeFunctionData(
      'executeAndRevert',
      [
        target,
        value,
        data,
        1
      ])
  }

  /**
   * encode a method call from entryPoint to our contract
   * @param target
   * @param value
   * @param data
   */
  async decodeExecuteDelegate (data: BytesLike): Promise<Result> {
    const accountContract = await this._getAccountContract()

    // the executeAndRevert method is defined on the manager
    const managerContract = Kernel__factory.connect(accountContract.address, accountContract.provider)
    return managerContract.interface.decodeFunctionData(
      'executeAndRevert',
      data
    )
  }

  async encodeExecuteBatch (
    calls: MultiSendCall[]
  ): Promise<string> {
    const multiSend = new Contract(getMultiSendAddress(), [
      'function multiSend(bytes memory transactions)'
    ])

    const multiSendCalldata = multiSend.interface.encodeFunctionData(
      'multiSend',
      [encodeMultiSend(calls)]
    )
    return await this.encodeExecuteDelegate(multiSend.address, 0, multiSendCalldata)
  }

  async signUserOpHash (userOpHash: string): Promise<string> {
    return await this.owner.signMessage(arrayify(userOpHash))
  }

  async signMessage (message: Bytes | string): Promise<string> {
    const dataHash = ethers.utils.arrayify(ethers.utils.hashMessage(message))
    let sig = fixSignedData(await this.owner.signMessage(dataHash))

    // If the account is undeployed, use ERC-6492
    if (await this.checkAccountPhantom()) {
      const coder = new ethers.utils.AbiCoder()
      sig = coder.encode(['address', 'bytes', 'bytes'], [
        await this.getFactoryAddress(),
        await this.getFactoryAccountInitCode(),
        sig
      ]) + '6492649264926492649264926492649264926492649264926492649264926492' // magic suffix
    }

    return sig
  }
}
