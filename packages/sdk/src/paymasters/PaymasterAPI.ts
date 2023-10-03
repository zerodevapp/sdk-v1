import { UserOperationStruct } from '@zerodevapp/contracts'
import { PaymasterProvider } from '../types'

/**
 * an API to external a UserOperation with paymaster info
 */
export class PaymasterAPI {
  paymasterProvider?: PaymasterProvider
  constructor (paymasterProvider?: PaymasterProvider) {
    this.paymasterProvider = paymasterProvider
  }

  setPaymasterProvider (paymasterProvider?: PaymasterProvider): void {
    this.paymasterProvider = paymasterProvider
  }

  /**
   * @param userOp a partially-filled UserOperation (without signature and paymasterAndData
   *  note that the "preVerificationGas" is incomplete: it can't account for the
   *  paymasterAndData value, which will only be returned by this method..
   * @returns the value to put into the PaymasterAndData, undefined to leave it empty
   */
  async getPaymasterResp (userOp: Partial<UserOperationStruct>, shouldOverrideFee: boolean = false, manualGasEstimation: boolean = false, erc20UserOp?: Partial<UserOperationStruct>): Promise<object | undefined> {
    return {
      paymasterAndData: '0x'
    }
  }
}
