// https://github.com/stackup-wallet/userop.js/blob/main/src/preset/middleware/gasPrice.ts
import { resolveProperties } from 'ethers/lib/utils'
import { BigNumber, BigNumberish, ethers } from 'ethers'

interface GasPriceResult {
  maxFeePerGas: BigNumberish | null
  maxPriorityFeePerGas: BigNumberish | null
}

const eip1559GasPrice = async (provider: ethers.providers.JsonRpcProvider): Promise<GasPriceResult> => {
  const [fee, block] = await Promise.all([
    provider.send('eth_maxPriorityFeePerGas', []),
    provider.getBlock('latest')
  ])

  const tip = ethers.BigNumber.from(fee)
  const buffer = tip.div(100).mul(13)
  const maxPriorityFeePerGas = tip.add(buffer)
  const maxFeePerGas = (block.baseFeePerGas != null)
    ? block.baseFeePerGas.mul(2).add(maxPriorityFeePerGas)
    : maxPriorityFeePerGas

  return { maxFeePerGas, maxPriorityFeePerGas }
}

export const getGasPrice = async (provider: ethers.providers.JsonRpcProvider, fallback: () => Promise<GasPriceResult>): Promise<GasPriceResult> => {
  let eip1559Error
  try {
    return await eip1559GasPrice(
      provider
    )
  } catch (error: any) {
    eip1559Error = error
    console.warn(
      'getGas: eth_maxPriorityFeePerGas failed, falling back to legacy gas price.'
    )
  }

  try {
    return await fallback()
  } catch (error) {
    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
    throw new Error(`${eip1559Error}, ${error}`)
  }
}
