import { Provider } from '@ethersproject/abstract-provider'
import { BigNumber, Contract, ethers } from 'ethers'
import { hexValue } from 'ethers/lib/utils'

import * as constants from './constants'

export function parseNumber(a: any): BigNumber | null {
  if (a == null || a === '') return null
  return BigNumber.from(a.toString())
}

export const getRpcUrl = (chainId: number): string => {
  return constants.CHAIN_ID_TO_NODE[chainId]
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
