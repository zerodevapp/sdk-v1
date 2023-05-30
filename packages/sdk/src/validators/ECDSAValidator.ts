import { UserOperationStruct } from '@zerodevapp/contracts'
import { Signer } from 'ethers'
import { hexlify, arrayify } from 'ethers/lib/utils'
import { BaseValidatorAPI, ValidatorMode, BaseValidatorAPIParams } from './BaseValidator'

export interface ECDSAValidatorParams extends BaseValidatorAPIParams {
  owner: Signer
}

export class ECDSAValidator extends BaseValidatorAPI {
  owner: Signer
  mode: ValidatorMode

  constructor (params: ECDSAValidatorParams) {
    super(params)
    this.owner = params.owner
    this.mode = params.mode
  }

  async signer (): Promise<Signer> {
    return await Promise.resolve(this.owner)
  }

  async getEnableData (): Promise<string> {
    return await this.owner.getAddress()
  }

  async signUserOp (userOperation: UserOperationStruct): Promise<string> {
    const userOpHash = await this.entrypoint.getUserOpHash({
      ...userOperation,
      signature: '0x'
    })
    return hexlify(await this.owner.signMessage(arrayify(userOpHash)))
  }

  async signMessage (message: Uint8Array): Promise<string> {
    return await this.owner.signMessage(message)
  }
}
