import { IEntryPoint, UserOperationStruct } from '@zerodevapp/contracts'
import { Kernel__factory } from '@zerodevapp/kernel-contracts-v2'
import { Signer } from 'ethers'
import { Bytes, BytesLike, hexConcat, hexZeroPad, hexlify } from 'ethers/lib/utils'
import { PromiseOrValue } from '../../typechain-types/common';

export enum ValidatorMode {
  sudo = '0x00000000',
  plugin = '0x00000001',
  enable = '0x00000002',
}

export interface BaseValidatorAPIParams {
  validatorAddress: string
  entrypoint: IEntryPoint
  mode: ValidatorMode
  enableSignature?: string
  validUntil?: number
  validAfter?: number
  executor?: string
  selector?: string
}

export abstract class BaseValidatorAPI {
  validatorAddress: string
  entrypoint: IEntryPoint
  enableSignature?: string
  validUntil: number
  validAfter: number
  executor?: string
  selector?: string
  mode: ValidatorMode

  constructor (params: BaseValidatorAPIParams) {
    this.validatorAddress = params.validatorAddress
    this.entrypoint = params.entrypoint
    this.executor = params.executor
    this.enableSignature = params.enableSignature
    this.selector = params.selector
    this.validUntil = params.validUntil ?? 0
    this.validAfter = params.validAfter ?? 0
    this.mode = params.mode
  }

  getAddress (): string {
    return this.validatorAddress
  }

  setEnableSignature (enableSignature: string) {
    this.enableSignature = enableSignature
  }

  abstract getEnableData (): Promise<string>

  abstract signer (): Promise<Signer>

  async approveExecutor (kernel: string, selector: string, executor: string, validUntil: number, validAfter: number, validator: BaseValidatorAPI): Promise<string> {
    const sender = kernel
    const ownerSig = await (await this.signer() as any)._signTypedData(
      {
        name: 'Kernel',
        version: '0.0.2',
        chainId: (await this.entrypoint.provider.getNetwork()).chainId,
        verifyingContract: sender
      },
      {
        ValidatorApproved: [
          { name: 'sig', type: 'bytes4' },
          { name: 'validatorData', type: 'uint256' },
          { name: 'executor', type: 'address' },
          { name: 'enableData', type: 'bytes' }
        ]
      },
      {
        sig: selector,
        validatorData: hexConcat([hexZeroPad(hexlify(validUntil), 6), hexZeroPad(hexlify(validAfter), 6), validator.getAddress()]),
        executor,
        enableData: hexlify(await validator.getEnableData())
      }
    )
    return ownerSig
  }

  async resolveValidatorMode (
    kernelAccountAddress: PromiseOrValue<string>,
    callData: PromiseOrValue<BytesLike>
  ): Promise<ValidatorMode> {
    const kernelAccountAddressResolved = kernelAccountAddress instanceof Promise ? await kernelAccountAddress : kernelAccountAddress
    const callDataResolved = callData instanceof Promise ? await callData : callData
    const kernel = Kernel__factory.connect(kernelAccountAddressResolved, this.entrypoint.provider)
    let mode: ValidatorMode
    try {
      if ((await kernel.getDefaultValidator()).toLowerCase() === this.validatorAddress.toLowerCase()) {
        mode = ValidatorMode.sudo
      } else if ((await kernel.getExecution(callDataResolved.toString().slice(0, 10))).validator.toLowerCase() === this.validatorAddress.toLowerCase()) {
        mode = ValidatorMode.plugin
      } else {
        mode = ValidatorMode.enable
      }
    } catch (e) {
      if (this.mode === ValidatorMode.plugin) {
        mode = ValidatorMode.enable
      } else {
        mode = this.mode
      }
    }
    return mode
  }

  async getSignature (userOperation: UserOperationStruct): Promise<string> {
    const mode: ValidatorMode = await this.resolveValidatorMode(userOperation.sender, userOperation.callData)

    if (mode === ValidatorMode.sudo || mode === ValidatorMode.plugin) {
      const res = hexConcat([this.mode, await this.signUserOp(userOperation)])
      return res
    } else {
      const enableData = await this.getEnableData()
      const enableSignature = this.enableSignature!
      return hexConcat([
        mode,
        hexZeroPad(hexlify(this.validUntil), 6),
        hexZeroPad(hexlify(this.validAfter), 6),
        hexZeroPad(this.validatorAddress, 20),
        hexZeroPad(this.executor!, 20),
        hexZeroPad((hexlify(enableData.length / 2 - 1)), 32),
        enableData,
        hexZeroPad(hexlify(enableSignature.length / 2 - 1), 32),
        enableSignature,
        await this.signUserOp(userOperation)
      ])
    }
  }

  abstract signUserOp (userOperation: UserOperationStruct): Promise<string>

  abstract signMessage (message: Bytes | string): Promise<string>
}
