import { resolveProperties } from '@ethersproject/properties'
import { UserOperationStruct } from '@zerodevapp/contracts'
import { signUserOp } from '../api'
import { ErrTransactionFailedGasChecks } from '../errors'
import { PaymasterAPI } from './PaymasterAPI'
import { hexifyUserOp } from '../utils'
import { BigNumber, ethers } from 'ethers'
import { ERC20_ABI, ERC20_APPROVAL_AMOUNT } from '../constants'
import { Provider } from '@ethersproject/abstract-provider'
import { MultiSendCall } from '../multisend'
import { PaymasterProvider } from '../types'

export class TokenPaymasterAPI extends PaymasterAPI {
  constructor (
    readonly projectId: string,
    readonly paymasterUrl: string,
    readonly chainId: number,
    readonly entryPointAddress: string,
    readonly gasTokenAddress: string,
    readonly paymasterAddress: string,
    readonly paymasterProvider?: PaymasterProvider
  ) {
    super()
  }

  async createGasTokenApprovalRequest (provider: Provider): Promise<MultiSendCall> {
    const erc20 = new ethers.Contract(this.gasTokenAddress, ERC20_ABI, provider)

    return {
      to: erc20.address,
      value: BigNumber.from(0),
      data: erc20.interface.encodeFunctionData('approve', [this.paymasterAddress, ERC20_APPROVAL_AMOUNT[erc20.address]])
    }
  }

  async getPaymasterResp (
    userOp: Partial<UserOperationStruct>,
    erc20UserOp: Partial<UserOperationStruct>
  ): Promise<object | undefined> {
    const resolvedUserOp = await resolveProperties(userOp)

    const hexifiedUserOp: any = hexifyUserOp(resolvedUserOp)

    const resolvedERC20UserOp = await resolveProperties(erc20UserOp)

    const hexifiedERC20UserOp: any = hexifyUserOp(resolvedERC20UserOp)

    const paymasterResp = await signUserOp(
      this.projectId,
      this.chainId,
      hexifiedUserOp,
      this.entryPointAddress,
      this.paymasterUrl,
      this.paymasterProvider,
      resolvedUserOp.callData,
      this.gasTokenAddress,
      hexifiedERC20UserOp,
      resolvedERC20UserOp.callData
    )
    if (paymasterResp === undefined) {
      throw ErrTransactionFailedGasChecks
    }

    return paymasterResp
  }
}
