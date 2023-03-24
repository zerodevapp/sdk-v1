import { BaseAccountAPI } from "./BaseAccountAPI";
import { GnosisAccountAPI } from "./GnosisAccountAPI";
import { SimpleAccountAPI } from "./SimpleAccountAPI";

export type AccountImplementation = {
  factoryAddress: string;
  accountAPIClass: typeof BaseAccountAPI;
}

export const gnosisSafeAccount_unaudited: AccountImplementation = {
  factoryAddress: '0x3e9fCFf3E490881855cBE07f23A674E91d163894',
  accountAPIClass: GnosisAccountAPI,
}

export const simpleAccount_audited: AccountImplementation = {
  factoryAddress: '0x3d33f1267F570F18C2AEaE8cf05A9c9583F8127f',
  accountAPIClass: SimpleAccountAPI,
}