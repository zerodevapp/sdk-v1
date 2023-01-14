export const ErrSDKNotInitialized = Error('SDK not initialized')
export const ErrUnsupportedNetwork = Error('Unsupported network')
export const ErrUnsupportedIdentity = Error('Unsupported identity')
export const ErrTransactionRejectedByUser = Error('Transaction rejected by user')
export const ErrTransactionFailedGasChecks = Error('Transaction failed gas checks')
export const ErrNoIdentifierProvided = Error(
  'No identity token, private key, or Web3 provider was provided'
)