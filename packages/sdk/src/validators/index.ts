import { IEntryPoint, UserOperationStruct } from "@zerodevapp/contracts";
import { Kernel__factory } from "@zerodevapp/kernel-contracts-v2";
import { Signer } from "ethers";
import { arrayify, hexConcat, hexZeroPad, hexlify } from "ethers/lib/utils";

export enum ValidatorMode {
    sudo = '0x00000000',
    plugin = '0x00000001',
    enable = '0x00000002',
}

export interface BaseValidatorAPIParams {
    kernelValidator : string
    entrypoint: IEntryPoint
    mode : ValidatorMode
    enableSignature?: string
    validUntil?: number
    validAfter?: number
    executor?: string
    selector?: string
}

export abstract class BaseValidatorAPI {
    kernelValidator : string
    entrypoint: IEntryPoint
    enableSignature?: string
    validUntil: number
    validAfter: number
    executor?: string
    selector?: string
    mode: ValidatorMode

    constructor(params: BaseValidatorAPIParams) {
        this.kernelValidator = params.kernelValidator
        this.entrypoint = params.entrypoint
        this.executor = params.executor
        this.enableSignature = params.enableSignature
        this.selector = params.selector
        this.validUntil = params.validUntil ?? 0
        this.validAfter = params.validAfter ?? 0
        this.mode = params.mode
    }

    getAddress(): string {
        return this.kernelValidator
    }

    setEnableSignature(enableSignature: string) {
        this.enableSignature = enableSignature
    }

    abstract getEnableData(): Promise<string>

    abstract signer(): Promise<Signer>

    async approveExecutor(kernel: string, selector: string, executor: string, validUntil: number, validAfter: number, validator: BaseValidatorAPI): Promise<string> {
      const sender = kernel
      const ownerSig = await (await this.signer() as any)._signTypedData(
        {
          name: "Kernel",
          version: "0.0.2",
          chainId: (await this.entrypoint.provider!.getNetwork()).chainId,
          verifyingContract: sender,
        },
        {
          ValidatorApproved: [
            { name: "sig", type: "bytes4" },
            { name: "validatorData", type: "uint256" },
            { name: "executor", type: "address" },
            { name: "enableData", type: "bytes" },
          ]
        },
        {
          sig: selector,
          validatorData: hexConcat([hexZeroPad(hexlify(validUntil),6), hexZeroPad(hexlify(validAfter),6), validator.getAddress()]),
          executor: executor,
          enableData: hexlify(await validator.getEnableData())
        }
      );
      return ownerSig
    }

    async getSignature(userOperation: UserOperationStruct): Promise<string> {
        const kernel = Kernel__factory.connect(await userOperation.sender, this.entrypoint.provider)
        let mode : ValidatorMode;
        try {
          if( (await kernel.getDefaultValidator()).toLowerCase() === this.kernelValidator.toLowerCase()) {
            mode = ValidatorMode.sudo
          } else if ( (await kernel.getExecution(userOperation.callData.toString().slice(0,6))).validator.toLowerCase() === this.kernelValidator.toLowerCase()) {
            mode = ValidatorMode.plugin
          } else {
            mode = ValidatorMode.enable
          }
        } catch(e) {
          if(this.mode === ValidatorMode.plugin) {
            mode = ValidatorMode.enable
          } else {
            mode = this.mode
          }
        }

        if(mode === ValidatorMode.sudo || mode === ValidatorMode.plugin) {
            return hexConcat([this.mode, await this.signUserOp(userOperation)]);
        } else {
            const enableData = await this.getEnableData()
            const enableSignature = this.enableSignature!
            return hexConcat([
                mode,
                hexZeroPad(hexlify(this.validUntil!),6),
                hexZeroPad(hexlify(this.validAfter!),6),
                hexZeroPad(this.kernelValidator, 20),
                hexZeroPad(this.executor!, 20),
                hexZeroPad((hexlify(enableData.length/2 - 1)), 32),
                enableData,
                hexZeroPad(hexlify(enableSignature.length/2 - 1), 32),
                enableSignature,
                await this.signUserOp(userOperation),
            ])
        }
    }

    abstract signUserOp(userOperation: UserOperationStruct): Promise<string>

    abstract signMessage(message: Uint8Array): Promise<string>
}

export interface ECDSAValidatorParams extends BaseValidatorAPIParams {
    owner: Signer
}

export class ECDSAValidator extends BaseValidatorAPI {
    owner : Signer
    mode : ValidatorMode

    constructor(params: ECDSAValidatorParams) {
        super(params)
        this.owner = params.owner
        this.mode = params.mode
    }

    signer(): Promise<Signer> {
        return Promise.resolve(this.owner)
    }

    async getEnableData(): Promise<string> {
        return await this.owner.getAddress()
    }

    async signUserOp(userOperation: UserOperationStruct): Promise<string> {
        const userOpHash = await this.entrypoint.getUserOpHash({
            ...userOperation,
            signature: '0x',
        })
        return hexlify(await this.owner.signMessage(arrayify(userOpHash)));
    }

    async signMessage(message: Uint8Array): Promise<string> {
        return await this.owner.signMessage(message)
    }
}

export interface ERC165SessionKeyValidatorParams extends BaseValidatorAPIParams {
    sessionKey: Signer,
    erc165InterfaceId: string,
    addressOffset: number
}

/*
address sessionKey = address(bytes20(_data[0:20]));
bytes4 interfaceId = bytes4(_data[20:24]);
bytes4 selector = bytes4(_data[24:28]);
uint48 validUntil = uint48(bytes6(_data[28:34]));
uint48 validAfter = uint48(bytes6(_data[34:40]));
uint32 addressOffset = uint32(bytes4(_data[40:44]));
*/

export class ERC165SessionKeyValidator extends BaseValidatorAPI {
    sessionKey : Signer
    erc165InterfaceId: string
    addressOffset: number

    constructor(params: ERC165SessionKeyValidatorParams) {
        super(params)
        this.sessionKey = params.sessionKey
        this.erc165InterfaceId = params.erc165InterfaceId
        this.addressOffset = params.addressOffset
    }
    
    signer(): Promise<Signer> {
        return Promise.resolve(this.sessionKey)
    }

    async getEnableData(): Promise<string> {
        return hexConcat([
            await this.sessionKey.getAddress(),
            hexZeroPad(this.erc165InterfaceId,4),
            hexZeroPad(this.selector!,4),
            hexZeroPad(hexlify(this.validUntil!),6),
            hexZeroPad(hexlify(this.validAfter!),6),
            hexZeroPad(hexlify(this.addressOffset),4)
        ])
    }

    async signUserOp(userOperation: UserOperationStruct): Promise<string> {
        const userOpHash = await this.entrypoint.getUserOpHash({
            ...userOperation,
            signature: '0x',
        })
        return hexlify(await this.sessionKey.signMessage(arrayify(userOpHash)));
    }

    async signMessage(message: Uint8Array): Promise<string> {
        return await this.sessionKey.signMessage(message)
    }
}
