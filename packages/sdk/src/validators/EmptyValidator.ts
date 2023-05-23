import { UserOperationStruct } from "@zerodevapp/contracts";
import { Signer } from "ethers";
import { BaseValidatorAPI, ValidatorMode, BaseValidatorAPIParams } from "./BaseValidator";

export interface EmptyValidatorParams extends BaseValidatorAPIParams {
  enableData: string
}

export class EmptyValidator extends BaseValidatorAPI {
    enableData: string

    constructor(params: EmptyValidatorParams) {
        super(params)
        this.enableData = params.enableData
    }

    static async fromValidator(validator: BaseValidatorAPI) : Promise<EmptyValidator> {
      return new EmptyValidator({
        mode: validator.mode,
        enableData: await validator.getEnableData(),
        entrypoint: validator.entrypoint,
        kernelValidator: validator.kernelValidator,
      })
    }

    signer(): Promise<Signer> {
        throw new Error("Method not implemented.");
    }

    async getEnableData(): Promise<string> {
        return this.enableData
    }

    async signUserOp(_userOperation: UserOperationStruct): Promise<string> {
      throw new Error("Method not implemented.");
    }

    async signMessage(_message: Uint8Array): Promise<string> {
      throw new Error("Method not implemented.");
    }
}
