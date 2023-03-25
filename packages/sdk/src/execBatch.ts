import { BigNumberish } from 'ethers'

export type Call<T = {}> = {
  to: string
  data: string
  value?: BigNumberish
} & T
