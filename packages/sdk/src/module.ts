import { GnosisSafe__factory } from "@zerodevapp/contracts";
import { ContractTransaction, Signer } from "ethers";

const MODULE_NAMES: { [key: string]: any } = {
  '0xa9947501d0d98dc699409930fc15db7e5b027f3e': 'NFT Subscription',
}

export function getModuleName(address: string): string {
  return MODULE_NAMES[address.toLowerCase()] || 'Unknown Module'
}