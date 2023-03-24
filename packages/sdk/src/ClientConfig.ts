import { AccountImplementation } from './accounts'
import { BaseAccountAPI } from './BaseAccountAPI'
import { GnosisAccountApiParams } from './GnosisAccountAPI'
import { PaymasterAPI } from './PaymasterAPI'
import { SimpleAccountApiParams } from './SimpleAccountAPI'
import { SessionProposal, TransactionInfo } from './types'

export interface Hooks {
  transactionStarted?: (tx: TransactionInfo) => void
  transactionConfirmed?: (txHash: string) => void
  transactionReverted?: (txHash: string) => void
  walletConnectSessionProposal?: (proposal: SessionProposal) => void
}

/**
 * configuration params for wrapProvider
 */
export interface ClientConfig {
  /**
   * Needed to track gas usage
   */

  projectId: string
  /**
   * the entry point to use
   */
  entryPointAddress: string

  /**
   * url to the bundler
   */
  bundlerUrl: string

  /**
   * implementation of the smart account
  */
  implementation: AccountImplementation<BaseAccountAPI, GnosisAccountApiParams> | AccountImplementation<BaseAccountAPI, SimpleAccountApiParams>

  /**
   * if set, use this pre-deployed wallet.
   * (if not set, use getSigner().getAddress() to query the "counterfactual" address of wallet.
   *  you may need to fund this address so the wallet can pay for its own creation)
   */
  walletAddress?: string
  /**
   * if set, call just before signing.
   */
  paymasterAPI?: PaymasterAPI

  /**
   * hooks are functions invoked during the lifecycle of transactions
   */
  hooks?: Hooks
}
