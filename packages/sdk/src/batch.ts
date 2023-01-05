import { TransactionResponse } from "@ethersproject/abstract-provider";
import { BigNumberish, Contract, utils } from "ethers";
import { ERC4337EthersSigner } from "./ERC4337EthersSigner";

// The deterministic address using solidity 0.8.15
const MULTISEND_ADDR = '0x8ae01fcf7c655655ff2c6ef907b8b4718ab4e17c'

export interface Call {
  to: string,
  data: string,
  value?: BigNumberish,
  delegateCall?: boolean,
}

// Adopted from: https://github.com/safe-global/safe-contracts/blob/821d5fbdc2a4e7776d66c9f232b000b81e60bffc/src/utils/multisend.ts
const encodeCall = (call: Call): string => {
  const data = utils.arrayify(call.data)
  const encoded = utils.solidityPack(
    ["uint8", "address", "uint256", "uint256", "bytes"],
    [call.delegateCall ? 1 : 0, call.to, call.value || 0, data.length, data]
  )
  return encoded.slice(2)
}

export const encodeMultiSend = (calls: Call[]): string => {
  return "0x" + calls.map((call) => encodeCall(call)).join("")
}

export default function batch(calls: Call[], signer: ERC4337EthersSigner): Promise<TransactionResponse> {

  const delegateSigner = signer.delegateCopy()
  const multiSend = new Contract(MULTISEND_ADDR, [
    'function multiSend(bytes memory transactions)',
  ], delegateSigner)

  // TODO: hardcoding gas is bad.  we have to do this because the gas
  // estimation is failing due to internally when it calls populateTransaction()
  // in sendTransaction(), it estimates the call using call not delegate call
  return multiSend.multiSend(encodeMultiSend(calls), {
    gasLimit: 1000000,
  })

}