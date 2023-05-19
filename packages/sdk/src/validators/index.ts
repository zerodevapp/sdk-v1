import { IEntryPoint, UserOperationStruct } from "@zerodevapp/contracts";
import { IKernelValidator } from "@zerodevapp/kernel-contracts-v2";
import { Signer } from "ethers";
import { arrayify, hexConcat, hexlify } from "ethers/lib/utils";
import { getUserOpHash } from "@account-abstraction/utils";

export interface BaseValidatorAPIParams {
    kernelValidator : string
    entrypoint: IEntryPoint
}

export abstract class BaseValidatorAPI {
    kernelValidator : string
    entrypoint: IEntryPoint

    constructor(params: BaseValidatorAPIParams) {
        this.kernelValidator = params.kernelValidator
        this.entrypoint = params.entrypoint
    }

    getAddress(): string {
        return this.kernelValidator
    }

    abstract getEnableData(): Promise<string>

    abstract signUserOp(userOperation: UserOperationStruct): Promise<string>

    abstract signMessage(message: Uint8Array): Promise<string>
}

export interface ECDSAValidatorParams extends BaseValidatorAPIParams {
    owner: Signer
}

export class ECDSAValidator extends BaseValidatorAPI {
    owner : Signer

    constructor(params: ECDSAValidatorParams) {
        super(params)
        this.owner = params.owner
    }

    async getEnableData(): Promise<string> {
        return await this.owner.getAddress()
    }

    async signUserOp(userOperation: UserOperationStruct): Promise<string> {
        const userOpHash = await this.entrypoint.getUserOpHash({
            ...userOperation,
            signature: '0x',
        })
      
        return await this.owner.signMessage(arrayify(userOpHash))
    }

    async signMessage(message: Uint8Array): Promise<string> {
        console.log("ECDSA")
        return await this.owner.signMessage(message)
    }
}