import { BigNumberish, ethers } from 'ethers'

export const BACKEND_URL =
  process.env.REACT_APP_ZERODEV_BACKEND_URL ??
  'https://backend-vikp.onrender.com'

export const LOGGER_URL =
  process.env.REACT_APP_ZERODEV_LOGGER_URL ??
  'https://prod-logger.onrender.com'

export const PAYMASTER_URL =
  process.env.REACT_APP_ZERODEV_PAYMASTER_URL ??
  'https://v0-6-paymaster.onrender.com'

export { default as PAYMASTER_ABI } from './abi/paymaster_abi.json'

export const BUNDLER_URL = process.env.REACT_APP_ZERODEV_BUNDLER_URL ?? 'https://v0-6-meta-bundler.onrender.com'

export const ENTRYPOINT_ADDRESS = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789'
export const UPDATE_SINGLETON_ADDRESS = '0x3d4d0cab438cee791b7405cf10448daaa98087c0'

export const INFURA_API_KEY = 'f36f7f706a58477884ce6fe89165666c'
export const WALLET_CONNECT_PROJECT_ID = '9832ea3eefe6c1b75a689ed0c90ce085'
export const WALLET_CONNECT_RELAY_URL = 'wss://relay.walletconnect.com'
export const DEFAULT_MAX_TX_RETRIES = 3

export const CHAIN_ID_TO_NODE: { [key: number]: string } = {
  1: `https://mainnet.infura.io/v3/${INFURA_API_KEY}`,
  5: `https://goerli.infura.io/v3/${INFURA_API_KEY}`,
  137: `https://polygon-mainnet.infura.io/v3/${INFURA_API_KEY}`,
  80001: `https://polygon-mumbai.infura.io/v3/${INFURA_API_KEY}`,
  10: `https://optimism-mainnet.infura.io/v3/${INFURA_API_KEY}`,
  420: `https://optimism-goerli.infura.io/v3/${INFURA_API_KEY}`,
  42161: `https://arbitrum-mainnet.infura.io/v3/${INFURA_API_KEY}`,
  // 42161: 'https://evocative-stylish-dinghy.arbitrum-mainnet.discover.quiknode.pro/80b526d14fa9fd9a8b0db1e65554acaf00c6a1ab/',
  421613: `https://arbitrum-goerli.infura.io/v3/${INFURA_API_KEY}`,
  43114: `https://avalanche-mainnet.infura.io/v3/${INFURA_API_KEY}`,
  43113: `https://avalanche-fuji.infura.io/v3/${INFURA_API_KEY}`,
  1313161554: `https://aurora-mainnet.infura.io/v3/${INFURA_API_KEY}`,
  1313161555: `https://aurora-testnet.infura.io/v3/${INFURA_API_KEY}`,
  56: 'https://wandering-quaint-reel.bsc.quiknode.pro/508c3d245c14adb8689ed4073d29aa5795dfa24e/',
  97: 'https://sly-indulgent-paper.bsc-testnet.quiknode.pro/ab7e00c229f5967334160958e40fd6a4d893fb93/',
  8453: 'https://twilight-red-tree.base-mainnet.quiknode.pro/dc6eb27bf0f917df215922488dd97f4de7d9b08e/',
  84531: 'https://icy-long-mountain.base-goerli.quiknode.pro/5b80d93e97cc9412a63c10a30841869abbef9596/',
  100: 'https://thrilling-fluent-film.xdai.quiknode.pro/305955cffb9868cdd95b5e3dc9775f20678ad9ac/',
  10200: 'https://nd-810-853-201.p2pify.com/e828b09f0d43591de96c297b3f36fffd'
}

export const ERC721_ABI = [
  'function transferFrom(address from, address to, uint256 tokenId) external',
  'function safeTransferFrom(address from, address to, uint256 tokenId) external',
  'function safeTransferFrom(address from, address to, uint256 tokenId, bytes calldata _data) external',
  'function balanceOf(address owner) external view returns (uint256 balance)'
]

export const ERC20_ABI = [
  'function transfer(address to, uint256 value) external returns (bool)',
  'function transferFrom(address from, address to, uint256 value) external returns (bool)',
  'function approve(address spender, uint256 value) external returns (bool)',
  'function allowance(address owner, address spender) external view returns (uint256)',
  'function balanceOf(address owner) external view returns (uint256)'
]

export const ERC1155_ABI = [
  'function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes calldata data) external',
  'function safeBatchTransferFrom(address from, address to, uint256[] calldata ids, uint256[] calldata amounts, bytes calldata data) external',
  'function balanceOf(address account, uint256 id) external view returns (uint256)',
  'function balanceOfBatch(address[] calldata accounts, uint256[] calldata ids) external view returns (uint256[] memory)'
]

export const USDC_ADDRESS: { [key: number]: string } = {
  1: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  // 5: '0x2f3A40A3db8a7e3D09B0adfEfbCe4f6F81927557',
  137: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
  // 80001: '',
  // 420: '0x7F5c764cBc14f9669B88837ca1490cCa17c31607',
  42161: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8',
  // 421613: '',
  43114: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E'
  // 43113: '',
  // 56: '',
  // 97: ''
}

export const PEPE_ADDRESS: { [key: number]: string } = {
  1: '0x6982508145454Ce325dDbE47a25d4ec3d2311933'
}

export const ERC20_APPROVAL_AMOUNT: { [key: string]: BigNumberish } = {
  // ETH
  [USDC_ADDRESS[1]]: ethers.utils.parseUnits('100', 6),

  // Goerli
  [USDC_ADDRESS[5]]: ethers.utils.parseUnits('100', 6),

  // Polygon
  [USDC_ADDRESS[137]]: ethers.utils.parseUnits('10', 6),

  // Arbitrum
  [USDC_ADDRESS[42161]]: ethers.utils.parseUnits('10', 6),

  // Avalanche
  [USDC_ADDRESS[43114]]: ethers.utils.parseUnits('10', 6),

  // ETH
  [PEPE_ADDRESS[1]]: ethers.utils.parseUnits('50000000'),

  '0x3870419Ba2BBf0127060bCB37f69A1b1C090992B': ethers.utils.parseUnits('100', 18)
}
