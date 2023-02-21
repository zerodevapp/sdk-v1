// @ts-ignore
import transakSDK from '@transak/transak-sdk'
import { Signer } from "@ethersproject/abstract-signer";
import { TRANSAK_STAGING_API_KEY, TRANSAK_PRODUCTION_API_KEY, CHAIN_ID_TO_TRANSAK_NAME } from "./constants";

export type OnrampUserInfo = TransakOnrampUserInfo | SardineOnrampUserInfo

export interface OnrampOptions {
  signer: Signer
  userInfo?: OnrampUserInfo
  defaultToken?: string
  staging?: boolean
}

// Refer to https://docs.transak.com/docs/query-parameters-examples#userdata
// for the format of each field
export interface TransakOnrampUserInfo {
  firstName: string
  lastName: string
  email: string
  mobileNumber: string
  dob: string
  address: {
    addressLine1: string
    addressLine2: string
    city: string
    state: string
    postCode: string
    countryCode: string
  }
}

export interface SardineOnrampUserInfo {
}

// Trigger an onramp flow for the given user
export async function onramp(options: OnrampOptions) {
  const chainId = await options.signer.getChainId()
  const transakNetworkName = CHAIN_ID_TO_TRANSAK_NAME[chainId]
  if (!transakNetworkName) {
    throw new Error(`Unsupported network ID ${chainId}`)
  }

  const transak = new transakSDK({
    apiKey: options.staging ? TRANSAK_STAGING_API_KEY : TRANSAK_PRODUCTION_API_KEY,
    widgetHeight: '625px',
    widgetWidth: '500px',
    environment: options.staging ? 'STAGING' : 'PRODUCTION',
    walletAddress: await options.signer.getAddress(),
    defaultCryptoCurrency: options.defaultToken || 'ETH',
    userData: options.userInfo,
    network: transakNetworkName,
  })
  await transak.init()
}