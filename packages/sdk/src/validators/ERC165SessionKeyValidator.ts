import { UserOperationStruct } from '@zerodevapp/contracts'
import { Signer } from 'ethers'
import { arrayify, hexConcat, hexZeroPad, hexlify } from 'ethers/lib/utils'
import { BaseValidatorAPI, BaseValidatorAPIParams } from './BaseValidator'

export interface ERC165SessionKeyValidatorParams extends BaseValidatorAPIParams {
  sessionKey: Signer
  erc165InterfaceId: string
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
  sessionKey: Signer
  erc165InterfaceId: string
  addressOffset: number

  constructor (params: ERC165SessionKeyValidatorParams) {
    super(params)
    this.sessionKey = params.sessionKey
    this.erc165InterfaceId = params.erc165InterfaceId
    this.addressOffset = params.addressOffset
  }

  async signer (): Promise<Signer> {
    return await Promise.resolve(this.sessionKey)
  }

  async getEnableData (): Promise<string> {
    return hexConcat([
      await this.sessionKey.getAddress(),
      hexZeroPad(this.erc165InterfaceId, 4),
      hexZeroPad(this.selector!, 4),
      hexZeroPad(hexlify(this.validUntil), 6),
      hexZeroPad(hexlify(this.validAfter), 6),
      hexZeroPad(hexlify(this.addressOffset), 4)
    ])
  }

  async signUserOp (userOperation: UserOperationStruct): Promise<string> {
    const userOpHash = await this.entrypoint.getUserOpHash({
      ...userOperation,
      signature: '0x'
    })
    return hexlify(await this.sessionKey.signMessage(arrayify(userOpHash)))
  }

  async signMessage (message: Uint8Array): Promise<string> {
    return await this.sessionKey.signMessage(message)
  }
}
