import { PaymasterProvider, SupportedGasToken } from '../types'
import { PaymasterAPI } from './PaymasterAPI'
import * as constants from '../constants'
import * as api from '../api'
import { TokenPaymasterAPI } from './TokenPaymasterAPI'
import { VerifyingPaymasterAPI } from './VerifyingPaymasterAPI'

export async function getPaymaster (projectId: string, paymasterUrl: string, chainId: number, entryPointAddress: string, paymasterProvider?: PaymasterProvider, gasToken?: SupportedGasToken): Promise<PaymasterAPI> {
  let gasTokenAddress
  if (gasToken === 'TEST_ERC20') gasTokenAddress = '0x3870419Ba2BBf0127060bCB37f69A1b1C090992B'
  if (gasToken === 'USDC') {
    gasTokenAddress = constants.USDC_ADDRESS[chainId]
  }
  if (gasToken === 'PEPE') {
    gasTokenAddress = constants.PEPE_ADDRESS[chainId]
  }
  if (gasTokenAddress !== undefined) {
    const paymasterAddress = await api.getPaymasterAddress(chainId, entryPointAddress, paymasterProvider)
    if (paymasterAddress !== undefined) {
      return new TokenPaymasterAPI(
        projectId,
        paymasterUrl,
        chainId,
        entryPointAddress,
        gasTokenAddress,
        paymasterAddress,
        paymasterProvider
      )
    }
  }
  return new VerifyingPaymasterAPI(
    projectId,
    paymasterUrl,
    chainId,
    entryPointAddress,
    paymasterProvider
  )
}
