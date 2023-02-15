import { GnosisSafe__factory } from "@zerodevapp/contracts";
import { ContractTransaction, Signer } from "ethers";
import { ERC4337EthersSigner } from "./ERC4337EthersSigner";

const MODULE_NAMES: { [key: string]: any } = {
  '0xa9947501d0d98dc699409930fc15db7e5b027f3e': 'NFT Subscription',
}

export function getModuleName(address: string): string {
  return MODULE_NAMES[address.toLowerCase()] || 'Unknown Module'
}

export async function enableModule(signer: Signer, moduleAddress: string): Promise<ContractTransaction> {
  if (!(signer instanceof ERC4337EthersSigner)) {
    throw new Error('enableModule only works with a ZeroDev signer')
  }

  const selfAddress = await signer.getAddress()
  const safe = GnosisSafe__factory.connect(selfAddress, signer)

  return safe.enableModule(moduleAddress, {
    gasLimit: 200000,
  })
}