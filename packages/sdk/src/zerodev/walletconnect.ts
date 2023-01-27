import { Core } from '@walletconnect/core'
import { ICore } from '@walletconnect/types'
import LegacySignClient from '@walletconnect/client'
import { SignClientTypes } from '@walletconnect/types'
import { Web3Wallet, IWeb3Wallet } from '@walletconnect/web3wallet'
import { WALLET_CONNECT_PROJECT_ID, WALLET_CONNECT_RELAY_URL } from './constants'
import { Signer, Wallet } from 'ethers'
import { formatJsonRpcError, formatJsonRpcResult } from '@json-rpc-tools/utils'

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
}
export const setupWalletConnect = (signer: Signer, hooks: WalletConnectHooks) => {
  // core = new Core({
  //   logger: 'debug',
  //   projectId: WALLET_CONNECT_PROJECT_ID,
  //   relayUrl: WALLET_CONNECT_RELAY_URL,
  // })

  // console.log('initializing web3wallet')
  // web3wallet = await Web3Wallet.init({
  //   core,
  //   metadata: {
  //     name: 'ZeroDev',
  //     description: 'Smart wallet in every DApp',
  //     url: 'zerodev.app',
  //     icons: [],
  //   },
  // })

  // await sleep(5000)

  // console.log('setting up event handlers')
  // web3wallet.on('session_proposal', async (proposal) => {
  //   console.log('session proposal:', proposal)
  // })
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
    switch (payload.method) {
      case EIP155_SIGNING_METHODS.ETH_SIGN:
      case EIP155_SIGNING_METHODS.PERSONAL_SIGN:
        console.log('signing message')
        console.log(payload)
        console.log(this.client!.session)
        break
      case EIP155_SIGNING_METHODS.ETH_SIGN_TYPED_DATA:
      case EIP155_SIGNING_METHODS.ETH_SIGN_TYPED_DATA_V3:
      case EIP155_SIGNING_METHODS.ETH_SIGN_TYPED_DATA_V4:
        console.log('signing data')
        console.log(payload)
        console.log(this.client!.session)
        break
      case EIP155_SIGNING_METHODS.ETH_SEND_TRANSACTION:
      case EIP155_SIGNING_METHODS.ETH_SIGN_TRANSACTION:
        console.log('sending transaction')
        console.log(payload)
        console.log(this.client!.session)
        const { id, method, params } = payload
        this.hooks.onSendTransaction(
          payload, this.client!.session,
          // approve
          async () => {
            const { result } = (await this.approveEIP155Request({
              id,
              topic: '',
              params: { request: { method, params }, chainId: '1' }
            }))!

            this.client!.approveRequest({
              id,
              result
            })
          },
          // reject
          async () => {
            this.client!.rejectSession({
              message: 'User rejected session',
            })

            const { error } = this.rejectEIP155Request({
              id,
              topic: '',
              params: { request: { method, params }, chainId: '1' }
            })
            this.client!.rejectRequest({
              id,
              error
            })
          },
        )
        break
      default:
        alert(`${payload.method} is not supported for WalletConnect v1`)
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
        // const message = getSignParamsMessage(request.params)
        // const signedMessage = await wallet.signMessage(message)
        // return formatJsonRpcResult(id, signedMessage)
        break

      case EIP155_SIGNING_METHODS.ETH_SIGN_TYPED_DATA:
      case EIP155_SIGNING_METHODS.ETH_SIGN_TYPED_DATA_V3:
      case EIP155_SIGNING_METHODS.ETH_SIGN_TYPED_DATA_V4:
        // const { domain, types, message: data } = getSignTypedDataParamsData(request.params)
        // // https://github.com/ethers-io/ethers.js/issues/687#issuecomment-714069471
        // delete types.EIP712Domain
        // const signedData = await wallet._signTypedData(domain, types, data)
        // return formatJsonRpcResult(id, signedData)
        break

      case EIP155_SIGNING_METHODS.ETH_SEND_TRANSACTION:
        const sendTransaction = request.params[0]
        // TODO: why does it have a `gas` parameter that breaks our SDK?
        delete sendTransaction.gas
        console.log('sending transaction through zerodev:', sendTransaction)
        const { hash } = await this.signer.sendTransaction(sendTransaction)
        console.log('user op hash:', hash)
        // TODO: get the actual txn hash
        return formatJsonRpcResult(id, '0x4efc8d06e8d7110082b725d449753e707555017aa7f6ef02aa3f3893b0d797db')

      case EIP155_SIGNING_METHODS.ETH_SIGN_TRANSACTION:
        // const signTransaction = request.params[0]
        // const signature = await wallet.signTransaction(signTransaction)
        // return formatJsonRpcResult(id, signature)
        break

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