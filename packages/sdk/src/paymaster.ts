import { resolveProperties } from "@ethersproject/properties"
import { UserOperationStruct } from "@zerodevapp/contracts"
import { ethers } from "ethers"
import { signUserOp } from "./api"
import { ErrTransactionFailedGasChecks } from "./errors"
import { PaymasterAPI } from "./PaymasterAPI"
import { hexifyUserOp } from "./utils"

export class VerifyingPaymasterAPI extends PaymasterAPI {
  constructor(
    readonly projectId: string,
    readonly paymasterUrl: string,
    readonly chainId: number,
    readonly entryPointAddress: string,
  ) {
    super()
  }

  async getPaymasterAndData(
    userOp: Partial<UserOperationStruct>
  ): Promise<string | undefined> {
    const resolvedUserOp = await resolveProperties(userOp)

    const hexifiedUserOp: any = hexifyUserOp(resolvedUserOp)

    const paymasterAndData = await signUserOp(
      this.projectId,
      this.chainId,
      hexifiedUserOp,
      this.entryPointAddress,
      this.paymasterUrl,
    )
    if (!paymasterAndData) {
      throw ErrTransactionFailedGasChecks
    }

    return paymasterAndData
  }
}