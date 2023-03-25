import { utils } from 'ethers'
import { Call } from './execBatch'

// The deterministic address using solidity 0.8.15
export const MULTISEND_ADDR = '0x8ae01fcf7c655655ff2c6ef907b8b4718ab4e17c'

export interface MultiSendCall extends Call {
  delegateCall?: boolean
}

// Adopted from: https://github.com/safe-global/safe-contracts/blob/821d5fbdc2a4e7776d66c9f232b000b81e60bffc/src/utils/multisend.ts
const encodeCall = (call: MultiSendCall): string => {
  const data = utils.arrayify(call.data)
  const encoded = utils.solidityPack(
    ["uint8", "address", "uint256", "uint256", "bytes"],
    [call.delegateCall ? 1 : 0, call.to, call.value || 0, data.length, data]
  )
  return encoded.slice(2)
}

export const encodeMultiSend = (calls: MultiSendCall[]): string => {
  return "0x" + calls.map((call) => encodeCall(call)).join("")
}