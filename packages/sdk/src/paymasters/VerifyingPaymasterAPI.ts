import { resolveProperties } from '@ethersproject/properties'
import { UserOperationStruct } from '@zerodevapp/contracts'
import { signUserOp } from '../api'
import { ErrTransactionFailedGasChecks } from '../errors'
import { PaymasterAPI } from './PaymasterAPI'
import { hexifyUserOp } from '../utils'
import { PaymasterProvider } from '../types'

export class VerifyingPaymasterAPI extends PaymasterAPI {
  constructor (
    readonly projectId: string,
    readonly paymasterUrl: string,
    readonly chainId: number,
    readonly entryPointAddress: string,
    readonly paymasterProvider?: PaymasterProvider
  ) {
    super()
  }

  async getPaymasterResp (
    userOp: Partial<UserOperationStruct>,
    shouldOverrideFee: boolean = false
  ): Promise<object | undefined> {
    const resolvedUserOp = await resolveProperties(userOp)

    const hexifiedUserOp: any = hexifyUserOp(resolvedUserOp)

    const paymasterResp = await signUserOp(
      this.projectId,
      this.chainId,
      hexifiedUserOp,
      this.entryPointAddress,
      shouldOverrideFee,
      this.paymasterUrl,
      this.paymasterProvider
    )
    if (paymasterResp === undefined) {
      throw ErrTransactionFailedGasChecks
    }

    return paymasterResp
  }
}
