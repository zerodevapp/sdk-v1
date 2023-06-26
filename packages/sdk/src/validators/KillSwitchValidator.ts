import { UserOperationStruct } from '@zerodevapp/contracts'
import { BigNumber, Signer } from 'ethers'
import { Bytes, arrayify, hexConcat, hexZeroPad, hexlify, keccak256 } from 'ethers/lib/utils'
import { BaseValidatorAPI, BaseValidatorAPIParams } from './BaseValidator'
import { Kernel, Kernel__factory } from '@zerodevapp/kernel-contracts-v2'

export interface KillSwithValidatorParams extends BaseValidatorAPIParams {
  guardian: Signer
  delaySeconds: number
}

export class KillSwitchValidator extends BaseValidatorAPI {
  guardian: Signer
  delaySeconds: number

  constructor (params: KillSwithValidatorParams) {
    super(params)
    this.guardian = params.guardian
    this.delaySeconds = params.delaySeconds
  }

  async signer (): Promise<Signer> {
    return this.guardian
  }

  async getEnableData (): Promise<string> {
    const data= hexConcat([
      await this.guardian.getAddress(),
    ])
    return data
  }

  async signUserOp (userOperation: UserOperationStruct): Promise<string> {
    const pausedUntil = Math.floor(Date.now() / 1000) + this.delaySeconds
    const userOpHash = await this.entrypoint.getUserOpHash({
      ...userOperation,
      signature: '0x'
    })
    const signer = await this.signer()
    const hash = keccak256(hexConcat([hexZeroPad(BigNumber.from(pausedUntil).toHexString(),6), userOpHash]))
    const signature = hexConcat([hexZeroPad(BigNumber.from(pausedUntil).toHexString(),6),await signer.signMessage(arrayify(hash))])
    console.log("signature", signature)
    return signature;
  }

  async signMessage (message: Bytes | string): Promise<string> {
    const signer = await this.signer()
    const signature = await signer.signMessage(arrayify(message))
    return signature;
  }
}
