import { Signer } from "ethers";
import { ERC4337EthersSigner } from "../ERC4337EthersSigner";

// Create a delegate copy of the signer, which is different than the
// original signer in that every call is executed as a delegatecall.
export function delegate(signer: Signer): Signer {
  if (!(signer instanceof ERC4337EthersSigner)) {
    throw new Error('execBatch only works with a ZeroDev signer')
  }

  return (signer as ERC4337EthersSigner).delegateCopy()
}