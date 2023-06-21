import * as constants from './constants'
import { PaymasterProvider, ProjectConfiguration } from './types'
import { BytesLike } from 'ethers'

export const signUserOp = async (
  projectId: string,
  chainId: number,
  userOp: any,
  entryPointAddress: string,
  paymasterUrl?: string,
  paymasterProvider?: PaymasterProvider,
  callData?: BytesLike,
  gasTokenAddress?: string,
  erc20UserOp?: string,
  erc20CallData?: BytesLike
): Promise<any> => {
  try {
    const resp = await fetch(`${paymasterUrl ?? constants.PAYMASTER_URL}/sign`, {
      method: 'POST',
      body: JSON.stringify({
        projectId,
        chainId,
        userOp,
        entryPointAddress,
        paymasterProvider,
        callData,
        tokenAddress: gasTokenAddress,
        erc20UserOp,
        erc20CallData
      }),
      headers: { 'Content-Type': 'application/json' }
    })
    const paymasterResp = await resp.json()
    return paymasterResp
  } catch (e) {
    console.log(e)
    return undefined
  }
}

export const getChainId = async (
  projectId: string,
  backendUrl?: string
): Promise<number> => {
  const resp = await fetch(
    `${backendUrl ?? constants.BACKEND_URL}/v1/projects/get-chain-id`,
    {
      method: 'POST',
      body: JSON.stringify({
        projectId
      }),
      headers: { 'Content-Type': 'application/json' }
    }
  )
  const { chainId } = await resp.json()
  return chainId
}

const projectConfigurationCache: { [key: string]: Promise<ProjectConfiguration> } = {}

export const getProjectsConfiguration = async (
  projectIds: string[],
  backendUrl?: string
): Promise<ProjectConfiguration> => {
  // If the result is already cached, return it
  const projectIdsKey = projectIds.join('-')
  if (projectConfigurationCache[projectIdsKey] === undefined) {
    projectConfigurationCache[projectIdsKey] = new Promise<ProjectConfiguration>((resolve, reject) => {
      fetch(
        `${backendUrl ?? constants.BACKEND_URL}/v1/projects/get`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectIds: projectIds.map(projectId => projectId.toString())
          })
        }
      ).then(resp => {
        resp.json().then(resolve).catch(reject)
      }).catch(reject)
    })
  }
  return await projectConfigurationCache[projectIdsKey]
}

export const getPrivateKeyByToken = async (
  projectId: string,
  identity: string,
  token: string,
  backendUrl?: string
): Promise<string> => {
  const resp = await fetch(
    `${backendUrl ?? constants.BACKEND_URL}/v1/keys/get-by-token`,
    {
      method: 'POST',
      body: JSON.stringify({
        projectId,
        identity,
        token
      }),
      headers: { 'Content-Type': 'application/json' }
    }
  )
  const { privateKey } = await resp.json()
  return privateKey
}

export const getPaymasterAddress = async (
  chainId: number,
  entryPointAddress: string,
  paymasterUrl?: string,
  paymasterProvider?: PaymasterProvider
): Promise<any> => {
  try {
    const resp = await fetch(`${paymasterUrl ?? constants.PAYMASTER_URL}/getPaymasterAddress`, {
      method: 'POST',
      body: JSON.stringify({
        chainId,
        entryPointAddress,
        paymasterProvider
      }),
      headers: { 'Content-Type': 'application/json' }
    })
    const paymasterResp = await resp.json()
    return paymasterResp
  } catch (e) {
    console.log(e)
    return undefined
  }
}
