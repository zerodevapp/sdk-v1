import { Call } from './execBatch'

interface ExecBatchParams {
  dest: string[]
  func: string[]
}
export const getExecBatchParams = (calls: Call[]): ExecBatchParams => {
  const dest = calls.map(({ to }) => to)
  const func = calls.map(({ data }) => data)
  return { dest, func }
}
