export const BACKEND_URL =
  process.env.REACT_APP_ZERODEV_BACKEND_URL ??
  'https://backend-vikp.onrender.com'

export const PAYMASTER_URL =
  process.env.REACT_APP_ZERODEV_PAYMASTER_URL ??
  'https://staging-paymaster.onrender.com'

export { default as PAYMASTER_ABI } from './abi/paymaster_abi.json'

export const BUNDLER_URL: { [key: string]: any } = {
  '1': 'https://mainnet-bundler-v2.onrender.com/rpc',
  '5': 'https://app.stackup.sh/api/v1/bundler/21996bd94fe3c14b688220dd440b08261b4146b776dcd7485d5dc12603eeb8be',
  '137': 'https://app.stackup.sh/api/v1/bundler/d6a0848f40df9d0422d0dc876347a8487847ecbd3643cdf455afe4a3608d0f7f',
  '43114': 'https://avalanche-bundler-v2.onrender.com/rpc',
  '80001': 'https://app.stackup.sh/api/v1/bundler/b936d8c1a4aabfe25925ec78364d6c4d8cd0ee4983a0a396ec6629d32027f724',
}

export const ENTRYPOINT_ADDRESS = '0x0F46c65C17AA6b4102046935F33301f0510B163A'
export const PAYMASTER_ADDRESS = '0x95341fe310FcDcA0d08c7b263773963ff4Bc3439'
export const ACCOUNT_FACTORY_ADDRESS = '0x9b1D7E14a4314a386dB0Fe6BbD8fDee7911a6d92'
export const UPDATE_SINGLETON_ADDRESS = '0x3d4d0cab438cee791b7405cf10448daaa98087c0'

export const INFURA_API_KEY = 'f36f7f706a58477884ce6fe89165666c'
export const WALLET_CONNECT_PROJECT_ID = '9832ea3eefe6c1b75a689ed0c90ce085'
export const WALLET_CONNECT_RELAY_URL = 'wss://relay.walletconnect.com'

export const CHAIN_ID_TO_INFURA_NAME: { [key: string]: any } = {
  '1': 'mainnet',
  '5': 'goerli',
  '137': 'polygon-mainnet',
  '80001': 'polygon-mumbai',
  '10': 'optimism-mainnet',
  '420': 'optimism-goerli',
  '42161': 'arbitrum-mainnet',
  '421613': 'arbitrum-goerli',
  '43114': 'avalanche-mainnet',
  '43113': 'avalanche-fuji',
  '1313161554': 'aurora-mainnet',
  '1313161555': 'aurora-testnet',
}
