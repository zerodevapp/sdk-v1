import { ExternalProvider } from "@ethersproject/providers";
import { Signer, ethers } from "ethers";
import * as api from './api'
import * as constants from './constants'

export function getPrivateKeyOwner(privateKey: string): Signer {
  return new ethers.Wallet(privateKey)
}

export function getRPCProviderOwner(web3Provider: any): Signer {
  const provider = new ethers.providers.Web3Provider(
    web3Provider as ExternalProvider
  )
  return provider.getSigner()
}

export async function getSocialWalletOwner(projectId: string, socialWallet: any): Promise<Signer> {
  const response = await api.getProjectConfiguration(projectId, constants.BACKEND_URL)
  let openloginAdapterSettings: {originData?: {[origin: string]: string}} = {}
  if (response.signature !== undefined) {
    openloginAdapterSettings = {
      originData: {
        [window.location.origin]: response.signature
      }
    }
  }

  const provider = new ethers.providers.Web3Provider(
    await socialWallet.connect(response.chainId, openloginAdapterSettings)
  )
  return provider.getSigner()
}
