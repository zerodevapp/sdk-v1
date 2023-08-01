import { UserOperationStruct } from '@zerodevapp/contracts'
import { Signer } from 'ethers'
import { hexlify, arrayify, Bytes } from 'ethers/lib/utils'
import { BaseValidatorAPI, ValidatorMode, BaseValidatorAPIParams } from './BaseValidator'
import { ECDSAValidator__factory, Kernel__factory } from '@zerodevapp/kernel-contracts-v2';

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

  async isPluginEnabled (kernelAccountAddress: string, selector: string): Promise<boolean> {
    const kernel = Kernel__factory.connect(kernelAccountAddress, this.entrypoint.provider)
    const ecdsaValidator = ECDSAValidator__factory.connect(this.validatorAddress, this.entrypoint.provider)
    const execDetail = await kernel.getExecution(selector)
    const enableData = await ecdsaValidator.ecdsaValidatorStorage(kernelAccountAddress)
    return execDetail.validator.toLowerCase() === this.validatorAddress.toLowerCase() &&
        enableData.toLowerCase() === (await this.getEnableData()).toLowerCase()
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

  async signMessage (message: Bytes | string): Promise<string> {
    return await this.owner.signMessage(message)
  }
}
