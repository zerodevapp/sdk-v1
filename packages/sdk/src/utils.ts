import { Provider } from '@ethersproject/abstract-provider'
import { Contract, ethers } from 'ethers'
import { hexValue } from 'ethers/lib/utils'

import * as constants from './constants'

export const getRpcUrl = (chainId: number): string => {
  return `https://${constants.CHAIN_ID_TO_INFURA_NAME[chainId]}.infura.io/v3/${constants.INFURA_API_KEY}`
}

export const hexifyUserOp = (resolvedUserOp: any) => {
  return Object.keys(resolvedUserOp)
    .map((key) => {
      let val = (resolvedUserOp as any)[key]
      if (typeof val !== 'string' || !val.startsWith('0x')) {
        val = hexValue(val)
      }
      return [key, val]
    })
    .reduce(
      (set, [k, v]) => ({
        ...set,
        [k]: v,
      }),
      {}
    )
}

// Some signers do not return signed data with 0x prefix, which makes it 
// an invalid hex byte string.  So we first check if it's a hex string,
// and if it's not, we prepend 0x and check if it's a valid hex string.
// If it's still not, we throw an error.
export const fixSignedData = (sig: string) => {
  if (ethers.utils.isHexString(sig)) {
    return sig
  }
  const fixedSig = `0x${sig}`
  if (ethers.utils.isHexString(fixedSig)) {
    return fixedSig
  }
  throw new Error('Invalid signed data ' + sig)
}

export const getERC721Contract = (provider: Provider, address: string): Contract => {
  return new Contract(address, constants.ERC721_ABI, provider)
}

export const getERC20Contract = (provider: Provider, address: string): Contract => {
  return new Contract(address, constants.ERC20_ABI, provider)
}

export const getERC1155Contract = (provider: Provider, address: string): Contract => {
  return new Contract(address, constants.ERC1155_ABI, provider)
}
