import { UserOperationStruct } from '@zerodevapp/contracts'
import { Signer } from 'ethers'
import { Bytes, arrayify, hexConcat, hexZeroPad, hexlify } from 'ethers/lib/utils'
import { BaseValidatorAPI, BaseValidatorAPIParams } from './BaseValidator'

export interface KillSwithValidatorParams extends BaseValidatorAPIParams {
  owner:Signer
  guardian: Signer
}

export class KillSwitchValidator extends BaseValidatorAPI {
  owner: Signer
  guardian: Signer
  guardianMode : boolean

  constructor (params: KillSwithValidatorParams) {
    super(params)
    this.owner = params.owner
    this.guardian = params.guardian
    this.guardianMode = false
  }

  async signer (): Promise<Signer> {
    return this.guardianMode ? this.guardian : this.owner
  }

  setGuardianMode (flag : boolean) {
    this.guardianMode = flag
  }

  async getEnableData (): Promise<string> {
    const data= hexConcat([
      await this.owner.getAddress(),
      await this.guardian.getAddress(),
    ])
    console.log("getEnableData", data)
    return data
  }

  async signUserOp (userOperation: UserOperationStruct): Promise<string> {
    const userOpHash = await this.entrypoint.getUserOpHash({
      ...userOperation,
      signature: '0x'
    })
    const signer = await this.signer()
    const signature = await signer.signMessage(arrayify(userOpHash))
    return signature;
  }

  async signMessage (message: Bytes | string): Promise<string> {
    const signer = await this.signer()
    const signature = await signer.signMessage(arrayify(message))
    return signature;
  }
}
