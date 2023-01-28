import { Core } from '@walletconnect/core'
import { ICore } from '@walletconnect/types'
import LegacySignClient from '@walletconnect/client'
import { SignClientTypes } from '@walletconnect/types'
import { Web3Wallet, IWeb3Wallet } from '@walletconnect/web3wallet'
import { WALLET_CONNECT_PROJECT_ID, WALLET_CONNECT_RELAY_URL } from './constants'
import { Signer, Wallet } from 'ethers'
import { formatJsonRpcError, formatJsonRpcResult } from '@json-rpc-tools/utils'
import { utils } from 'ethers'
import { TypedDataUtils } from 'ethers-eip712'

let web3wallet: IWeb3Wallet
let core: ICore

// sleep function
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

interface WalletConnectHooks {
  onSessionRequest(
    request: any,
    approve: () => void,
    reject: () => void,
  ): void

  onSendTransaction(
    request: any,
    session: any,
    approve: () => void,
    reject: () => void,
  ): void

  onSignMessage(
    request: any,
    session: any,
    approve: () => void,
    reject: () => void,
  ): void

  onSignTypedData(
    request: any,
    session: any,
    approve: () => void,
    reject: () => void,
  ): void
}
export const setupWalletConnect = (signer: Signer, hooks: WalletConnectHooks) => {
  return new WalletConnect(signer, hooks)
}

export class WalletConnect {
  signer: Signer
  hooks: WalletConnectHooks
  client?: LegacySignClient

  constructor(signer: Signer, hooks: WalletConnectHooks) {
    this.signer = signer
    this.hooks = hooks
  }

  pair(uri: string) {
    // console.log("bp1")
    // console.log(await core.pairing.pair({ uri }))
    // console.log("bp2")
    this.client = new LegacySignClient({ uri })

    this.client.on('session_request', (error: any, payload: any) => {
      if (error) {
        throw new Error(`legacySignClient > session_request failed: ${error}`)
      }

      this.hooks.onSessionRequest(
        payload,
        // approve
        async () => {
          const address = await this.signer.getAddress()
          const chainId = await this.signer.getChainId()
          this.client!.approveSession({
            accounts: [address],
            chainId: chainId,
          })
        },
        // reject
        async () => {
          this.client!.rejectSession({
            message: 'User rejected session',
          })
        },
      )
    })

    this.client.on('call_request', (error: any, payload: any) => {
      if (error) {
        throw new Error(`legacySignClient > call_request failed: ${error}`)
      }
      this.onCallRequest(payload)
    })
  }

  async onCallRequest(payload: { id: number; method: string; params: any[] }) {
    const { id, method, params } = payload
    const approve = async () => {
      const { result } = (await this.approveEIP155Request({
        id,
        topic: '',
        params: { request: { method, params }, chainId: '1' }
      }))!

      this.client!.approveRequest({
        id,
        result
      })
    }
    const reject = async () => {
      const { error } = this.rejectEIP155Request({
        id,
        topic: '',
        params: { request: { method, params }, chainId: '1' }
      })
      this.client!.rejectRequest({
        id,
        error
      })
    }

    switch (method) {
      case EIP155_SIGNING_METHODS.ETH_SIGN:
      case EIP155_SIGNING_METHODS.PERSONAL_SIGN:
        return this.hooks.onSignMessage(
          payload, this.client!.session,
          approve, reject,
        )
      case EIP155_SIGNING_METHODS.ETH_SIGN_TYPED_DATA:
      case EIP155_SIGNING_METHODS.ETH_SIGN_TYPED_DATA_V3:
      case EIP155_SIGNING_METHODS.ETH_SIGN_TYPED_DATA_V4:
        return this.hooks.onSignMessage(
          payload, this.client!.session,
          approve, reject,
        )
      case EIP155_SIGNING_METHODS.ETH_SEND_TRANSACTION:
      case EIP155_SIGNING_METHODS.ETH_SIGN_TRANSACTION:
        return this.hooks.onSendTransaction(
          payload, this.client!.session,
          approve, reject,
        )
      default:
        alert(`${method} is not supported for WalletConnect v1`)
    }
  }

  async approveEIP155Request(
    requestEvent: SignClientTypes.EventArguments['session_request']
  ) {
    const { params, id } = requestEvent
    const { chainId, request } = params

    switch (request.method) {
      case EIP155_SIGNING_METHODS.PERSONAL_SIGN:
      case EIP155_SIGNING_METHODS.ETH_SIGN:
        const message = getSignParamsMessage(request.params)
        const signedMessage = await this.signer.signMessage(message)
        return formatJsonRpcResult(id, signedMessage)

      case EIP155_SIGNING_METHODS.ETH_SIGN_TYPED_DATA:
      case EIP155_SIGNING_METHODS.ETH_SIGN_TYPED_DATA_V3:
      case EIP155_SIGNING_METHODS.ETH_SIGN_TYPED_DATA_V4:
        const typedData = getSignTypedDataParamsData(request.params)
        const digest = TypedDataUtils.encodeDigest(typedData)
        const signedData = this.signer.signMessage(digest)
        return formatJsonRpcResult(id, signedData)

      case EIP155_SIGNING_METHODS.ETH_SEND_TRANSACTION:
        const sendTransaction = request.params[0]

        // our SDK expects `gasLimit` and breaks when `gas` is set 
        sendTransaction.gasLimit = sendTransaction.gas
        delete sendTransaction.gas

        // get the actual txn hash
        const resp = await this.signer.sendTransaction(sendTransaction)
        const receipt = await resp.wait()
        return formatJsonRpcResult(id, (receipt as any)['bundleTransactionHash'])

      case EIP155_SIGNING_METHODS.ETH_SIGN_TRANSACTION:
        const signTransaction = request.params[0]
        const signature = await this.signer.signTransaction(signTransaction)
        return formatJsonRpcResult(id, signature)

      default:
      // throw new Error(getSdkError('INVALID_METHOD').message)
    }
  }

  rejectEIP155Request(request: SignClientTypes.EventArguments['session_request']) {
    const { id } = request
    return formatJsonRpcError(id, 'User rejected request')
  }

}

const EIP155_SIGNING_METHODS = {
  PERSONAL_SIGN: 'personal_sign',
  ETH_SIGN: 'eth_sign',
  ETH_SIGN_TRANSACTION: 'eth_signTransaction',
  ETH_SIGN_TYPED_DATA: 'eth_signTypedData',
  ETH_SIGN_TYPED_DATA_V3: 'eth_signTypedData_v3',
  ETH_SIGN_TYPED_DATA_V4: 'eth_signTypedData_v4',
  ETH_SEND_RAW_TRANSACTION: 'eth_sendRawTransaction',
  ETH_SEND_TRANSACTION: 'eth_sendTransaction'
}

/**
 * Converts hex to utf8 string if it is valid bytes
 */
export function convertHexToUtf8(value: string) {
  if (utils.isHexString(value)) {
    return utils.toUtf8String(value)
  }

  return value
}

/**
 * Gets message from various signing request methods by filtering out
 * a value that is not an address (thus is a message).
 * If it is a hex string, it gets converted to utf8 string
 */
export function getSignParamsMessage(params: string[]) {
  const message = params.filter(p => !utils.isAddress(p))[0]

  return convertHexToUtf8(message)
}

/**
 * Gets data from various signTypedData request methods by filtering out
 * a value that is not an address (thus is data).
 * If data is a string convert it to object
 */
export function getSignTypedDataParamsData(params: string[]) {
  const data = params.filter(p => !utils.isAddress(p))[0]

  if (typeof data === 'string') {
    return JSON.parse(data)
  }

  return data
}