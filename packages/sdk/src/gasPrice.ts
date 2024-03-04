// https://github.com/stackup-wallet/userop.js/blob/main/src/preset/middleware/gasPrice.ts
import { BigNumber, BigNumberish, ethers } from 'ethers'

interface GasPriceResult {
  maxFeePerGas: BigNumberish | null
  maxPriorityFeePerGas: BigNumberish | null
}



const eip1559GasPrice = async (provider: ethers.providers.JsonRpcProvider, priorityFeeBuffer: number): Promise<GasPriceResult> => {
  const maxPriorityFeePerGasRPCMethod = provider.network.chainId === 42161 ? 'rundler_maxPriorityFeePerGas' : 'eth_maxPriorityFeePerGas'
  const [fee, block] = await Promise.all([
    provider.send(maxPriorityFeePerGasRPCMethod, []),
    provider.getBlock('latest')
  ])

  if (block.baseFeePerGas === null || block.baseFeePerGas === undefined) {
    throw new Error('Eip1559FeesNotSupportedError')
  }

  const baseFeeMultiplier = 1.2
  const decimals = baseFeeMultiplier.toString().split('.')[1].length
  const denominator = 10 ** decimals
  const multiply = (base: BigNumber): BigNumber =>
    (base.mul(ethers.BigNumber.from(baseFeeMultiplier * denominator))).div(ethers.BigNumber.from(denominator))

  const maxPriorityFeePerGas = BigNumber.from(fee)

  const baseFeePerGas = multiply(block.baseFeePerGas)
  const maxFeePerGas = baseFeePerGas.add(maxPriorityFeePerGas)

  return { maxFeePerGas, maxPriorityFeePerGas }
}

export const getGasPrice = async (provider: ethers.providers.JsonRpcProvider, fallback: () => Promise<GasPriceResult>, priorityFeeBuffer: number): Promise<GasPriceResult> => {
  let eip1559Error
  try {
    return await eip1559GasPrice(
      provider,
      priorityFeeBuffer
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
