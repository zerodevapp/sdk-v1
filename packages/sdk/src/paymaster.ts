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
    readonly paymasterAddress: string,
    readonly paymasterUrl: string
  ) {
    super()
  }

  async getPaymasterAndData(
    userOp: Partial<UserOperationStruct>
  ): Promise<string | undefined> {
    const resolvedUserOp = await resolveProperties(userOp)

    const hexifiedUserOp: any = hexifyUserOp(resolvedUserOp)

    const signature = await signUserOp(
      this.projectId,
      hexifiedUserOp,
      this.paymasterUrl
    )
    if (!signature) {
      throw ErrTransactionFailedGasChecks
    }

    return ethers.utils.hexConcat([this.paymasterAddress, signature])
  }
}