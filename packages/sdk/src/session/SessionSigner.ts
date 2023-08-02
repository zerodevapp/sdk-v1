import {
  Kernel__factory,
  Kernel,
  ZeroDevSessionKeyPlugin,
  ZeroDevSessionKeyPlugin__factory
} from '@zerodevapp/contracts-new'

import { MerkleTree } from 'merkletreejs'

import { TransactionRequest, TransactionResponse } from '@ethersproject/providers'

import { ZeroDevSigner } from '../ZeroDevSigner'
import { Signer, Wallet, utils, BigNumber, Contract, BigNumberish } from 'ethers'
import { Deferrable, hexConcat, hexZeroPad, defaultAbiCoder, keccak256, hexlify } from 'ethers/lib/utils'
import { UserOperationStruct } from '@zerodevapp/contracts'
import { ClientConfig } from '../ClientConfig'
import { ZeroDevProvider } from '../ZeroDevProvider'
import { HttpRpcClient } from '../HttpRpcClient'
import { BaseAccountAPI, ExecuteType } from '../BaseAccountAPI'
import * as constants from '../constants'

// Deterministically deployed against 0.6 EntryPoint
export const DEFAULT_SESSION_KEY_PLUGIN = '0xA08c304A85b8C73c5847b08DBcfD3bF7E6CC607A'

interface SessionPolicy {
  to: string
  selectors?: string[]
}

export class SessionSigner extends ZeroDevSigner {
  sessionKeyPlugin: ZeroDevSessionKeyPlugin
  sessionKey: Signer
  validUntil: number
  whitelist: SessionPolicy[]
  merkleTree: MerkleTree
  signature: string

  constructor (
    config: ClientConfig,
    provider: ZeroDevProvider,
    httpRpcClient: HttpRpcClient,
    smartAccountAPI: BaseAccountAPI,
    validUntil: number,
    whitelist: SessionPolicy[],
    signature: string,
    sessionKeySigner: Signer,
    sessionKeyPlugin?: ZeroDevSessionKeyPlugin | string
  ) {
    super(
      config,
      sessionKeySigner,
      provider,
      httpRpcClient,
      smartAccountAPI
    )
    if (sessionKeyPlugin === undefined) {
      this.sessionKeyPlugin = ZeroDevSessionKeyPlugin__factory.connect(DEFAULT_SESSION_KEY_PLUGIN, this.provider!)
    } else if (typeof sessionKeyPlugin === 'string') {
      this.sessionKeyPlugin = ZeroDevSessionKeyPlugin__factory.connect(sessionKeyPlugin, this.provider!)
    } else {
      this.sessionKeyPlugin = sessionKeyPlugin
    }
    this.sessionKey = sessionKeySigner
    this.validUntil = validUntil
    this.whitelist = whitelist
    const policyPacked: string[] = []
    for (const policy of whitelist) {
      if (policy.selectors === undefined || policy.selectors.length == 0) {
        policyPacked.push(hexConcat([policy.to]))
      } else {
        for (const selector of policy.selectors) {
          policyPacked.push(hexConcat([policy.to, selector]))
        }
      }
    }
    this.signature = signature
    this.merkleTree = policyPacked.length == 0 ? new MerkleTree([hexZeroPad('0x00', 32)], keccak256, { hashLeaves: false }) : new MerkleTree(policyPacked, keccak256, { sortPairs: true, hashLeaves: true })
  }

  // This one is called by Contract. It signs the request and passes in to Provider to be sent.
  async sendTransaction (transaction: Deferrable<TransactionRequest>, executeBatchType: ExecuteType = ExecuteType.EXECUTE, retryCount: number = 0): Promise<TransactionResponse> {
    if (transaction.maxFeePerGas || transaction.maxPriorityFeePerGas) {
      transaction.maxFeePerGas = 0
      transaction.maxPriorityFeePerGas = 0
    } else {
      transaction.gasPrice = 0
    }
    let userOperation: UserOperationStruct
    let userOpInfo = {
      target: transaction.to as string ?? '',
      data: transaction.data?.toString() ?? '0x',
      value: transaction.value as BigNumberish,
      nonce: await this.currentSessionNonce(),
      gasLimit: await transaction.gasLimit,
      maxFeePerGas: transaction.maxFeePerGas,
      maxPriorityFeePerGas: transaction.maxPriorityFeePerGas,
    }
    userOperation = await this.smartAccountAPI.createUnsignedUserOp(userOpInfo, executeBatchType)
    userOperation.signature = await this.getDummySig(userOperation);
    userOperation = await this.smartAccountAPI.getPaymasterResp(userOperation, userOpInfo, executeBatchType)
    userOperation.signature = await this.signUserOperation(userOperation)
    const transactionResponse = await this.zdProvider.constructUserOpTransactionResponse(userOperation)

    // Invoke the transaction hook
    this.config.hooks?.transactionStarted?.({
      hash: transactionResponse.hash,
      from: transaction.from! as string,
      to: transaction.to! as string,
      value: (transaction.value || 0) as BigNumberish,
      sponsored: userOperation.paymasterAndData !== '0x'
    })

    try {
      await this.httpRpcClient.sendUserOpToBundler(userOperation)
    } catch (error: any) {
      // console.error('sendUserOpToBundler failed', error)
      if (this.isReplacementOpError(error)) {
        console.error('Resending tx with Increased Gas fees')
        if (retryCount >= (this.config.maxTxRetries ?? constants.DEFAULT_MAX_TX_RETRIES)) {
          throw new Error('Maximum retry attempts exceeded')
        }
        return await this.resendTransactionWithIncreasedGasFees(transaction, userOperation, executeBatchType, retryCount)
      }
      throw this.unwrapError(error)
    }
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

  async resendTransactionWithIncreasedGasFees (transaction: Deferrable<TransactionRequest>, userOperation: UserOperationStruct, executeBatchType: ExecuteType, retryCount: number): Promise<TransactionResponse> {
    retryCount++
    const maxFeePerGas = BigNumber.from(userOperation.maxFeePerGas).mul(113).div(100)
    const maxPriorityFeePerGas = BigNumber.from(userOperation.maxPriorityFeePerGas).mul(113).div(100)
    return await this?.sendTransaction({ ...transaction, maxFeePerGas, maxPriorityFeePerGas }, executeBatchType, retryCount)
  }


  async approvePlugin (plugin: Contract, validUntil: BigNumber, validAfter: BigNumber, data: string): Promise<string> {
    throw new Error('Cannot approve plugin for session signer')
  }

  async signUserOperation (userOp: UserOperationStruct): Promise<string> { // this should return userOp.signature
    userOp.signature = this.signature // reuse same proof for all transactions

    const opHash = await this.smartAccountAPI.getUserOpHash(userOp)
    const nonce = await this.currentSessionNonce()
    const sessionsig = await (this.sessionKey as any)._signTypedData(
      {
        name: 'ZeroDevSessionKeyPlugin',
        version: '0.0.1',
        chainId: await this.provider!.getNetwork().then(net => net.chainId),
        verifyingContract: await userOp.sender
      },
      {
        Session: [
          { name: 'userOpHash', type: 'bytes32' },
          { name: 'nonce', type: 'uint256' }
        ]
      },
      {
        userOpHash: hexZeroPad(opHash, 32),
        nonce
      }
    )
    return await this.signUserOpWithSessionKey(userOp, sessionsig)
  }

  async getDummySig(userOp: UserOperationStruct): Promise<string> {
    userOp.signature = this.signature
    const dummySig = hexZeroPad("0xfffffffffffffffffffffffffffffff0000000000000000000000000000000007aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1c", 65)
    return await this.signUserOpWithSessionKey(userOp, dummySig);
  }

  async currentSessionNonce (): Promise<BigNumber> {
    return await this.getSessionNonce(await this.sessionKey.getAddress())
  }

  async getSessionNonce (address: string): Promise<BigNumber> {
    return await Kernel__factory.connect(await this.getAddress(), this.provider!)['getNonce(uint192)'](BigNumber.from(address)).catch(
      e => {
        // this happens when the account hasn't been deployed
        if (e.method === 'getNonce(uint192)' && e.data === '0x') {
          return BigNumber.from(0)
        }
        return Promise.reject(e)
      }
    )
  }

  async signUserOpWithSessionKey (
    userOp: UserOperationStruct,
    sessionsig: string
  ): Promise<string> {

    const addr = '0x' + (await userOp.callData).toString().slice(34, 74)
    const selector = '0x' + (await userOp.callData).toString().slice(330, 338)
    const found = this.whitelist.find((item) => {
      return item.to.toLowerCase() == addr.toLowerCase()
    })
    let merkleLeaf: string = ''
    if ((found != null) && this.whitelist.length > 0) {
      if (found.selectors === undefined || found.selectors.length == 0) {
        merkleLeaf = hexZeroPad(addr, 20)
      } else if (found.selectors.includes(selector)) {
        merkleLeaf = hexConcat([addr, hexZeroPad(selector, 4)])
      }
    } else if (this.whitelist.length == 0) {
      merkleLeaf = hexZeroPad('0x00', 32)
    } else {
      throw new Error('Address not in whitelist')
    }
    if (this.validUntil <= Math.floor(Date.now() / 1000)) {
      throw new Error('Session key is expired.')
    }

    const proof = this.whitelist.length > 0 ? this.merkleTree.getHexProof(keccak256(merkleLeaf)) : [hexZeroPad('0x00', 32)]
    return hexConcat([
      hexConcat([
        this.sessionKeyPlugin.address,
        hexZeroPad('0x' + this.validUntil.toString(16), 6),
        hexZeroPad('0x000000000000', 6), // validUntil + validAfter
        hexZeroPad(userOp.signature.toString(), 65) // signature
      ]),
      defaultAbiCoder.encode([
        'bytes',
        'bytes'
      ], [
        hexConcat([
          await this.sessionKey.getAddress(),
          hexZeroPad('0x' + this.merkleTree.getRoot().toString('hex'), 32)
        ]),
        hexConcat([
          hexZeroPad('0x' + ((merkleLeaf.length - 2) / 2).toString(16), 1),
          hexZeroPad(merkleLeaf, (merkleLeaf.length - 2) / 2),
          hexZeroPad(sessionsig, 65),
          defaultAbiCoder.encode([
            'bytes32[]'
          ], [
            proof
          ])
        ])
      ])])
  }
}
