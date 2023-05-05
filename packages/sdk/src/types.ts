import { BigNumberish } from "ethers";

export interface TransactionInfo {
  // hash of the transaction
  hash: string

  // sender addr
  from: string

  // receiver addr
  to: string

  // value
  value: BigNumberish

  // whether the transaction is sponsored
  sponsored: boolean
}

export interface SessionProposal {

}

export interface Call {
  to: string
  data: string
  value?: BigNumberish
}

export interface DelegateCall {
  to: string
  data: string
}

export interface ProjectConfiguration {
  projects: Array<{id: string, chainId: number}>
  signature?: string
  authenticationProviders: Array<{
    config: any
    provider: string
    verifierId: string | null
  }>
}

// export type SupportedToken = '0x3870419Ba2BBf0127060bCB37f69A1b1C090992B'
export type SupportedToken = 'USDC' | 'TEST_ERC20'
