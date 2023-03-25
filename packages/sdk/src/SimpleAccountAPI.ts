import { BigNumber, BigNumberish, Contract, ContractTransaction } from 'ethers'
import {
  SimpleAccountFactory,
  SimpleAccount__factory,
  SimpleAccount,
  SimpleAccountFactory__factory
} from '@zerodevapp/contracts'

import { arrayify, hexConcat } from 'ethers/lib/utils'
import { Signer } from '@ethersproject/abstract-signer'
import { BaseApiParams, BaseAccountAPI, BaseAccountAPIExecBatchArgs } from './BaseAccountAPI'
import { AssetTransfer, AssetType, ZeroDevSigner } from './ZeroDevSigner'
import { getExecBatchParams } from './simpleAccountExecuteBatch'
import { getERC1155Contract, getERC20Contract, getERC721Contract } from './utils'
import { Call } from './execBatch'
import { TransactionDetailsForUserOp } from './TransactionDetailsForUserOp'

/**
 * constructor params, added on top of base params:
 * @param owner the signer object for the account owner
 * @param index nonce value used when creating multiple accounts for the same owner
 * @param factoryAddress address of factory to deploy new contracts (not needed if account already deployed)
 */
export interface SimpleAccountApiParams extends BaseApiParams {
  owner: Signer
  index?: number
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
  owner: Signer
  index: number

  accountContract?: SimpleAccount
  factory?: SimpleAccountFactory
  nativeExecuteBatchMode: boolean

  constructor (params: SimpleAccountApiParams) {
    super(params)
    this.factoryAddress = params.factoryAddress
    this.owner = params.owner
    this.index = params.index ?? 0
    this.nativeExecuteBatchMode = false
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

  nativeExecuteBatchCopy(signer: ZeroDevSigner): ZeroDevSigner {
    // copy the account API except with nativeExecuteBatch mode set to true
    const nativeExecuteBatchAccountAPI = Object.assign({}, this)
    Object.setPrototypeOf(nativeExecuteBatchAccountAPI, Object.getPrototypeOf(this))
    nativeExecuteBatchAccountAPI.nativeExecuteBatchMode = true
    return new ZeroDevSigner(signer.config, signer.originalSigner, signer.zdProvider, signer.httpRpcClient, nativeExecuteBatchAccountAPI)
  }

  async execBatch(calls: Call[], signer: ZeroDevSigner, options?: BaseAccountAPIExecBatchArgs): Promise<ContractTransaction> {
    const nativeExecuteBatchSigner = this.nativeExecuteBatchCopy(signer)

    const { dest, func } = getExecBatchParams(calls)
    const simpleAccount = new Contract(this.accountAddress!, [
      'function executeBatch(address[] calldata dest, bytes[] calldata func)',
    ], nativeExecuteBatchSigner)
    
    return simpleAccount.connect(nativeExecuteBatchSigner).executeBatch(dest, func, {
      gasLimit: options?.gasLimit,
      gasPrice: options?.gasPrice,
    })
  }

  async transferAllAssets(to: string, assets: AssetTransfer[], signer: ZeroDevSigner, options?: BaseAccountAPIExecBatchArgs): Promise<ContractTransaction> {
    const selfAddress = await signer.getAddress()
    const calls = assets.map(async asset => {
      switch (asset.assetType) {
        case AssetType.ETH:
          throw Error('Native token transfer not supported')
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
    const awaitedCall = await Promise.all(calls);
    return this.execBatch(awaitedCall, signer, options);
  }

  async encodeUserOpCallDataAndGasLimit (detailsForUserOp: TransactionDetailsForUserOp): Promise<{ callData: string, callGasLimit: BigNumber }> {
    function parseNumber (a: any): BigNumber | null {
      if (a == null || a === '') return null
      return BigNumber.from(a.toString())
    }

    const value = parseNumber(detailsForUserOp.value) ?? BigNumber.from(0)
    let callData
    if (this.nativeExecuteBatchMode) {
      callData = detailsForUserOp.data
    } else {
      callData = await this.encodeExecute(detailsForUserOp.target, value, detailsForUserOp.data)
    }

    const callGasLimit = parseNumber(detailsForUserOp.gasLimit) ?? await this.provider.estimateGas({ // TODO : we may need to multiply by 1.2
      from: this.entryPointAddress,
      to: this.getAccountAddress(),
      data: callData
    })

    return {
      callData,
      callGasLimit
    }
  }

  async signUserOpHash (userOpHash: string): Promise<string> {
    return await this.owner.signMessage(arrayify(userOpHash))
  }
}
