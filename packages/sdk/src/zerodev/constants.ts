export const BACKEND_URL =
  process.env.REACT_APP_ZERODEV_BACKEND_URL ??
  'https://backend-vikp.onrender.com'

export const PAYMASTER_URL =
  process.env.REACT_APP_ZERODEV_PAYMASTER_URL ??
  'https://staging-paymaster.onrender.com'

export { default as PAYMASTER_ABI } from './abi/paymaster_abi.json'

export const BUNDLER_URL: { [key: string]: any } = {
  '1': 'https://mainnet-bundler-v2.onrender.com/rpc',
  '5': 'https://goerli-bundler-v2.onrender.com/rpc',
  '137': 'https://polygon-bundler-v2.onrender.com/rpc',
  '43114': 'https://avalanche-bundler-v2.onrender.com/rpc',
  '80001': 'https://mumbai-bundler-v2.onrender.com/rpc',
}

export const ENTRYPOINT_ADDRESS = '0x0F46c65C17AA6b4102046935F33301f0510B163A'
export const PAYMASTER_ADDRESS = '0x95341fe310FcDcA0d08c7b263773963ff4Bc3439'
export const ACCOUNT_FACTORY_ADDRESS = '0x96fc755cB191B0eF516942B3Bd8aAF50E22574D6'
export const UPDATE_SINGLETON_ADDRESS = 'TODO'

export const INFURA_API_KEY = 'f36f7f706a58477884ce6fe89165666c'
export const TRANSAK_STAGING_API_KEY = '135ef8d4-982d-4ec2-a3b2-2a2263ffbca2'
export const TRANSAK_PRODUCTION_API_KEY = 'fb1517e3-e91c-4694-8de0-7d2a8078f3cf'
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

export const CHAIN_ID_TO_TRANSAK_NAME: { [key: string]: any } = {
  '1': 'ethereum',
  '5': 'goerli',
  '137': 'polygon',
  '80001': 'mumbai',
  '43114': 'avaxcchain',
  '10': 'optimism',
  '42161': 'arbitrum',
}
