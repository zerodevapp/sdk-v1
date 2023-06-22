import { UserOperationStruct } from '@zerodevapp/contracts'
import { BigNumber, Signer } from 'ethers'
import { Bytes, arrayify, hexConcat, hexZeroPad, hexlify } from 'ethers/lib/utils'
import { BaseValidatorAPI, BaseValidatorAPIParams } from './BaseValidator'
import { Kernel, Kernel__factory } from '@zerodevapp/kernel-contracts-v2'

export interface KillSwithValidatorParams extends BaseValidatorAPIParams {
  owner:Signer
  guardian: Signer
  delaySeconds: number
}

export class KillSwitchValidator extends BaseValidatorAPI {
  owner: Signer
  guardian: Signer
  guardianMode : boolean
  delaySeconds: number

  constructor (params: KillSwithValidatorParams) {
    super(params)
    this.owner = params.owner
    this.guardian = params.guardian
    this.guardianMode = false
    this.delaySeconds = params.delaySeconds
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
    return data
  }

  async signUserOp (userOperation: UserOperationStruct): Promise<string> {
    const kernel = Kernel__factory.connect(await userOperation.sender, (await this.signer()).provider!)
    const pausedUntil = Math.floor(Date.now() / 1000) + this.delaySeconds
    if(userOperation.callData.toString().substring(0,10).toLowerCase() === kernel.interface.getSighash('disableMode').substring(0,10).toLowerCase()) {
        const data = kernel.interface.decodeFunctionData('disableMode', await userOperation.callData)
        if(data[0] === '0xffffffff') {
            this.setGuardianMode(true)
            const userOpHash = await this.entrypoint.getUserOpHash({
                ...userOperation,
                signature: '0x'
              })
              const signature = await this.signMessage(arrayify(userOpHash))
              const res = hexConcat([
                hexZeroPad(BigNumber.from(pausedUntil).toHexString(), 6),
                signature
              ])
              return res;
        }
    }
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
