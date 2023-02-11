import { Signer } from "ethers"
import { TypedDataUtils } from 'ethers-eip712'

// Sign ERC-712 typed data for validation with ERC-1271
export async function signTypedData(signer: Signer, typedData: any) {
  const digest = TypedDataUtils.encodeDigest(typedData)
  return await signer.signMessage(digest)
}