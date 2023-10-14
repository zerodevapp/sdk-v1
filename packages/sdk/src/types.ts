import { BigNumberish } from 'ethers'

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
  newSignature?: string
  authenticationProviders: Array<{
    config: any
    provider: string
    verifierId: string | null
  }>
}

export type SupportedGasToken = 'USDC' | 'PEPE' | 'TEST_ERC20'

export type PaymasterProvider = 'STACKUP' | 'PIMLICO' | 'ALCHEMY'
export type BundlerProvider = 'STACKUP' | 'PIMLICO' | 'ALCHEMY'
