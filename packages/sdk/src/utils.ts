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
//
// Also make sure the v value is 27/28 instead of 0/1, or it wouldn't
// work with on-chain validation.
export const fixSignedData = (sig: string) => {
  let signature = sig
  if (!ethers.utils.isHexString(signature)) {
    signature = `0x${signature}`
    if (!ethers.utils.isHexString(signature)) {
      throw new Error('Invalid signed data ' + sig)
    }
  }
  let { r, s, v } = ethers.utils.splitSignature(signature)
  if (v == 0) v = 27
  if (v == 1) v = 28
  const joined = ethers.utils.joinSignature({ r, s, v })
  return joined
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

export const addBuffer = (value: any, buffer: number = 1): BigNumber => {
  return BigNumber.from(value).mul(BigNumber.from(100 * buffer)).div(100)
}
