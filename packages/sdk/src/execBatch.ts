import { BigNumberish } from 'ethers'

export interface Call {
  to: string
  data: string
  value?: BigNumberish
}
