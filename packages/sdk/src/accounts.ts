import { AccountAPIConstructor, BaseAccountAPI, BaseApiParams } from './BaseAccountAPI'
import { GnosisAccountAPI, GnosisAccountApiParams } from './GnosisAccountAPI'
import { KernelAccountAPI, KernelAccountApiParams } from './KernelAccountAPI'
import { SimpleAccountAPI, SimpleAccountApiParams } from './SimpleAccountAPI'

export interface AccountImplementation<T extends BaseAccountAPI = BaseAccountAPI, A extends BaseApiParams = BaseApiParams> {
  factoryAddress: string
  accountAPIClass: AccountAPIConstructor<T, A>
}

export const gnosisSafeAccount_unaudited: AccountImplementation<GnosisAccountAPI, GnosisAccountApiParams> = {
  factoryAddress: '0x3e9fCFf3E490881855cBE07f23A674E91d163894',
  accountAPIClass: GnosisAccountAPI
}

export const kernelAccount_audited: AccountImplementation<KernelAccountAPI, KernelAccountApiParams> = {
  factoryAddress: '0x6D7b653D58B017eA0E15c073AcF18508Ea82B1bF',
  accountAPIClass: KernelAccountAPI
}

export const simpleAccount_audited: AccountImplementation<SimpleAccountAPI, SimpleAccountApiParams> = {
  factoryAddress: '0x3d33f1267F570F18C2AEaE8cf05A9c9583F8127f',
  accountAPIClass: SimpleAccountAPI
}
