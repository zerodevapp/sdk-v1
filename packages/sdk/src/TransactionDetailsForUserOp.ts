import { BigNumberish } from 'ethers'
import { StateOverrides } from './HttpRpcClient'

export interface TransactionDetailsForUserOp {
  target: string
  data: string
  value?: BigNumberish
  gasLimit?: BigNumberish
  maxFeePerGas?: BigNumberish
  maxPriorityFeePerGas?: BigNumberish
  nonce?: BigNumberish
  dummySig?: string
  stateOverrides?: StateOverrides
}
