import { GnosisSafe__factory } from "@zerodevapp/contracts";
import { ContractTransaction, Signer } from "ethers";
import { ERC4337EthersSigner } from "./ERC4337EthersSigner";

export async function enableModule(signer: Signer, moduleAddress: string): Promise<ContractTransaction> {
  if (!(signer instanceof ERC4337EthersSigner)) {
    throw new Error('enableModule only works with a ZeroDev signer')
  }

  const selfAddress = await signer.getAddress()
  const safe = GnosisSafe__factory.connect(selfAddress, signer)

  return safe.enableModule(moduleAddress)
}