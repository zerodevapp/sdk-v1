export const BACKEND_URL =
  process.env.REACT_APP_ZERODEV_BACKEND_URL ??
  'https://backend-vikp.onrender.com'

export const PAYMASTER_URL =
  process.env.REACT_APP_ZERODEV_PAYMASTER_URL ??
  'https://paymaster-server.onrender.com'

export { default as PAYMASTER_ABI } from './abi/paymaster_abi.json'

export const BUNDLER_URL: { [key: string]: any } = {
  '1': 'https://eth-bundler.onrender.com/rpc',
  '5': 'https://goerli-bundler.onrender.com/rpc',
  '137': 'https://polygon-bundler.onrender.com/rpc',
  '43113': 'https://fuji-bundler.onrender.com/rpc',
  '43114': 'https://avalanche-bundler.onrender.com/rpc',
  '80001': process.env.REACT_APP_ZERODEV_BUNDLER_URL ?? 'https://bundler.onrender.com/rpc',
}

export const ENTRYPOINT_ADDRESS = '0x0F46c65C17AA6b4102046935F33301f0510B163A'
export const PAYMASTER_ADDRESS = '0x95341fe310FcDcA0d08c7b263773963ff4Bc3439'
export const ACCOUNT_FACTORY_ADDRESS = '0x1b370cC23c623443A97df161D7De035B938A08D5'
export const INFURA_API_KEY = 'f36f7f706a58477884ce6fe89165666c'

export const CHAIN_ID_TO_INFURA_NAMES: { [key: string]: any } = {
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
