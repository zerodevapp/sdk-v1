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
  '137': 'http://localhost:3000/rpc',
  '43114': 'https://avalanche-bundler-v2.onrender.com/rpc',
  '80001': 'https://mumbai-bundler-v2.onrender.com/rpc',
}

// export const ENTRYPOINT_ADDRESS = '0x0F46c65C17AA6b4102046935F33301f0510B163A'
// export const PAYMASTER_ADDRESS = '0x95341fe310FcDcA0d08c7b263773963ff4Bc3439'
// export const ACCOUNT_FACTORY_ADDRESS = '0x5d7a58eFbC95f5b3Da446D9496D73a6E9D57b0a4'
export const ENTRYPOINT_ADDRESS = '0x996d3E9387763467997E8c6331A651E3D2901D85'
export const PAYMASTER_ADDRESS = '0xb3BB76F26c4dD05b6B7a825b8c603e76587c0D88'
export const ACCOUNT_FACTORY_ADDRESS = '0x6341A20F2EC7CF6f5A6e9fCbd39cB09Fdc2B61E8'

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
