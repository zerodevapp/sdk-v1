import { AccountAPIConstructor, BaseAccountAPI, BaseApiParams } from './BaseAccountAPI'
import { GnosisAccountAPI, GnosisAccountApiParams } from './GnosisAccountAPI'
import { KernelAccountAPI, KernelAccountApiParams } from './KernelAccountAPI'
import { KernelAccountV2API } from './KernelAccountV2API'
import { SimpleAccountAPI, SimpleAccountApiParams } from './SimpleAccountAPI'

export interface AccountImplementation<T extends BaseAccountAPI = BaseAccountAPI, A extends BaseApiParams = BaseApiParams> {
  factoryAddress: string
  accountAPIClass: AccountAPIConstructor<T, A>
}

export const gnosisSafeAccount_v1_unaudited: AccountImplementation<GnosisAccountAPI, GnosisAccountApiParams> = {
  factoryAddress: '0x3e9fCFf3E490881855cBE07f23A674E91d163894',
  accountAPIClass: GnosisAccountAPI
}

export const kernelAccount_v1_audited: AccountImplementation<KernelAccountAPI, KernelAccountApiParams> = {
  factoryAddress: '0x4E4946298614FC299B50c947289F4aD0572CB9ce',
  accountAPIClass: KernelAccountAPI
}

export const kernelAccount_v2_audited: AccountImplementation<KernelAccountV2API, KernelAccountApiParams> = {
  factoryAddress: '0x5D006d3880645ec6e254E18C1F879DAC9Dd71A39',
  accountAPIClass: KernelAccountV2API
}

export const simpleAccount_v1_audited: AccountImplementation<SimpleAccountAPI, SimpleAccountApiParams> = {
  factoryAddress: '0x3d33f1267F570F18C2AEaE8cf05A9c9583F8127f',
  accountAPIClass: SimpleAccountAPI
}
