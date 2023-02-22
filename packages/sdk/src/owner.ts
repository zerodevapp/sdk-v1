import { ExternalProvider } from "@ethersproject/providers";
import { Signer, ethers } from "ethers";

export function getPrivateKeyOwner(privateKey: string): Signer {
  return new ethers.Wallet(privateKey)
}

export function getRPCProviderOwner(web3Provider: any): Signer {
  const provider = new ethers.providers.Web3Provider(
    web3Provider as ExternalProvider
  )
  return provider.getSigner()
}