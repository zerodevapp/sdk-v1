import { BigNumber, BigNumberish, Contract, ContractTransaction } from 'ethers'
import {
  ZeroDevPluginSafe__factory,
  ZeroDevPluginSafe, ZeroDevGnosisSafeAccountFactory,
  ZeroDevGnosisSafeAccountFactory__factory,
  GnosisSafe__factory
} from '@zerodevapp/contracts'

import { arrayify, hexConcat, hexZeroPad } from 'ethers/lib/utils'
import { Signer } from '@ethersproject/abstract-signer'
import { BaseApiParams, BaseAccountAPI, BaseAccountAPIExecBatchArgs } from './BaseAccountAPI'
import { encodeMultiSend, MultiSendCall, MULTISEND_ADDR } from './multisend'
import { AssetTransfer, AssetType, ZeroDevSigner } from './ZeroDevSigner'
import { getERC1155Contract, getERC20Contract, getERC721Contract } from './utils'
import { TransactionDetailsForUserOp } from './TransactionDetailsForUserOp'

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

export interface GnosisAccountApiExecBatchArgs extends BaseAccountAPIExecBatchArgs {
  multiSendAddress?: string
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
  delegateMode: boolean

  accountContract?: ZeroDevPluginSafe
  factory?: ZeroDevGnosisSafeAccountFactory

  constructor(params: GnosisAccountApiParams) {
    super(params)
    this.factoryAddress = params.factoryAddress
    this.owner = params.owner
    this.index = params.index ?? 0
    this.delegateMode = false
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

  delegateCopy(signer: ZeroDevSigner): ZeroDevSigner {
    // copy the account API except with delegate mode set to true
    const delegateAccountAPI = Object.assign({}, this)
    Object.setPrototypeOf(delegateAccountAPI, Object.getPrototypeOf(this))
    delegateAccountAPI.delegateMode = true
    return new ZeroDevSigner(signer.config, signer.originalSigner, signer.zdProvider, signer.httpRpcClient, delegateAccountAPI)
  }

  /**
   * Executes a batch of calls using the multi-send contract.
   * @async
   * @param calls - An array of Call objects representing the contract calls to be executed in a batch.
   * @param signer - A ZeroDevSigner instance responsible for signing the transactions.
   * @param options - Optional parameters for the execution, including multiSendAddress, gasLimit, and gasPrice.
   * @returns A Promise that resolves to a ContractTransaction containing the details of the executed batch transaction.
   */
  async execBatch(calls: MultiSendCall[], signer: ZeroDevSigner, options?: GnosisAccountApiExecBatchArgs): Promise<ContractTransaction> {
    const delegateSigner = this.delegateCopy(signer)
    const multiSend = new Contract(options?.multiSendAddress ?? MULTISEND_ADDR, [
      'function multiSend(bytes memory transactions)',
    ], delegateSigner)

    return multiSend.multiSend(encodeMultiSend(calls), {
      gasLimit: options?.gasLimit,
      gasPrice: options?.gasPrice,
    })
  }

  async enableModule(moduleAddress: string, signer: ZeroDevSigner): Promise<ContractTransaction> { 
    const signerAddress = await signer.getAddress()
    const safe = GnosisSafe__factory.connect(signerAddress, signer)

    return safe.enableModule(moduleAddress, {
      gasLimit: 200000,
    })
  }

  async transferOwnership(newOwner: string, signer: ZeroDevSigner): Promise<ContractTransaction> {
    const selfAddress = await signer.getAddress()
    const safe = GnosisSafe__factory.connect(selfAddress, signer)

    const owners = await safe.getOwners()
    if (owners.length !== 1) {
      throw new Error('transferOwnership is only supported for single-owner safes')
    }

    // prevOwner is address(1) for single-owner safes
    const prevOwner = hexZeroPad('0x01', 20)

    return safe.swapOwner(prevOwner, signer.originalSigner.getAddress(), newOwner, {
      gasLimit: 200000,
    });
  }

  async transferAllAssets(to: string, assets: AssetTransfer[], signer: ZeroDevSigner, options?: GnosisAccountApiExecBatchArgs): Promise<ContractTransaction> {
    const selfAddress = await signer.getAddress()
    const calls = assets.map(async asset => {
      switch (asset.assetType) {
        case AssetType.ETH:
          return {
            to: to,
            value: asset.amount ? asset.amount : await signer.provider!.getBalance(selfAddress),
            data: '0x',
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
    if (this.delegateMode) {
      callData = await this.encodeExecuteDelegate(detailsForUserOp.target, value, detailsForUserOp.data)
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

  async signUserOpHash(userOpHash: string): Promise<string> {
    return await this.owner.signMessage(arrayify(userOpHash))
  }
}
