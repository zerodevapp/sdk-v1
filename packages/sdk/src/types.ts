import { Deferrable } from "@ethersproject/properties";
import { TransactionRequest } from "@ethersproject/providers";
import { BigNumberish, BytesLike, ethers } from "ethers";
import { getModuleName } from "./module";

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

  // if this transaction enables a module, this is the module info
  module?: ModuleInfo
}

export interface ModuleInfo {
  name: string
  address: string
}

export interface SessionProposal {

}

// we determine if a transaction enables a module by checking:
// - if the sender is equal to the receiver
// - if the function selector is `enableModule`
export const getModuleInfo = (tx: TransactionRequest | Deferrable<TransactionRequest>): ModuleInfo | undefined => {
  if (tx.to !== tx.from) return undefined

  // parse calldata
  const iface = new ethers.utils.Interface(['function enableModule(address)'])
  try {
    const res = iface.decodeFunctionData('enableModule(address)', tx.data as BytesLike || '0x')
    return {
      name: getModuleName(res[0]),
      address: res[0],
    }
  } catch (e: any) {
    return undefined
  }
}