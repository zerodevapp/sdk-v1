import { AccountAPIConstructor, BaseAccountAPI, BaseApiParams } from './BaseAccountAPI'
import { KernelAccountAPI, KernelAccountApiParams } from './KernelAccountAPI'

export interface AccountImplementation<T extends BaseAccountAPI = BaseAccountAPI, A extends BaseApiParams = BaseApiParams> {
  factoryAddress: string
  accountAPIClass: AccountAPIConstructor<T, A>
}

export const kernelAccount_v1_audited: AccountImplementation<KernelAccountAPI, KernelAccountApiParams> = {
  factoryAddress: '0x4E4946298614FC299B50c947289F4aD0572CB9ce',
  accountAPIClass: KernelAccountAPI
}