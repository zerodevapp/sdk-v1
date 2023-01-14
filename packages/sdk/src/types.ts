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