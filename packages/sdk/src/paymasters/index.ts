import { SupportedGasToken } from "../types";
import { PaymasterAPI } from "./PaymasterAPI";
import * as constants from '../constants'
import * as api from '../api'
import { TokenPaymasterAPI } from "./TokenPaymasterAPI";
import { VerifyingPaymasterAPI } from "./VerifyingPaymasterAPI";

export async function getPaymaster (projectId: string, paymasterUrl: string, chainId: number, entryPointAddress: string, gasToken?: SupportedGasToken): Promise<PaymasterAPI> {
  let gasTokenAddress
  const paymasterAddress = await api.getPaymasterAddress(chainId, entryPointAddress)
  if (gasToken === 'TEST_ERC20') gasTokenAddress = '0x3870419Ba2BBf0127060bCB37f69A1b1C090992B'
  if (gasToken === 'USDC') {
    gasTokenAddress = constants.USDC_ADDRESS[chainId]
  }
  if (gasTokenAddress !== undefined && paymasterAddress !== undefined) {
    return new TokenPaymasterAPI(
      projectId,
      paymasterUrl,
      chainId,
      entryPointAddress,
      gasTokenAddress,
      paymasterAddress
    )
  }
  return new VerifyingPaymasterAPI(
    projectId,
    paymasterUrl,
    chainId,
    entryPointAddress
  )
}
