import { ERC4337EthersSigner } from "./ERC4337EthersSigner";
import { ERC4337EthersProvider } from "./ERC4337EthersProvider";
import { GnosisSafeAccountFactory, GnosisSafeAccountFactory__factory, UserOperationStruct } from "@zerodevapp/contracts";
import { GnosisSafe, GnosisSafe__factory } from "@zerodevapp/contracts";
import { EIP4337Manager, EIP4337Manager__factory } from "@zerodevapp/contracts";
import { ACCOUNT_FACTORY_ADDRESS, ENTRYPOINT_ADDRESS } from "./zerodev/constants";
import { Call } from "./batch";
import { Provider, TransactionRequest } from "@ethersproject/abstract-provider";
import { Deferrable } from "@ethersproject/properties";

export class UpdateController {
    initialized: boolean
    updateAvailable?: boolean

    managerUpdateInfo?: {
        prev: string,
        current: string,
        newManager: string
    }

    singletonUpdateInfo?: {
        newSingleton: string
    }

    constructor(readonly signer: ERC4337EthersSigner) {
        this.initialized = false
    }

    async initialize(latestAccountFactoryAddr: string) {
        if (this.initialized) {
            return
        }

        try {
            if (await this.signer.smartAccountAPI.checkAccountPhantom()) {
                // undeployed, no need to update
                return
            }

            const accountFactory = GnosisSafeAccountFactory__factory.connect(latestAccountFactoryAddr, this.signer)
            const latestManagerAddr = await accountFactory.eip4337Manager()
            const latestSingletonAddr = await accountFactory.safeSingleton()

            const accountAddr = await this.signer.getAddress()

            // Check if manager is outdated
            const manager = EIP4337Manager__factory.connect(latestManagerAddr, this.signer) // get manager address from factory
            const proxyContract = GnosisSafe__factory.connect(accountAddr, this.signer)

            const res = await manager.getCurrentEIP4337Manager(proxyContract.address)
            if (res[1] !== latestManagerAddr) {
                this.updateAvailable = true
                this.managerUpdateInfo = {
                    prev: res[0],
                    current: res[1],
                    newManager: latestManagerAddr,
                }
            }

            // Check if singleton is outdated
            const currentSingletonAddr = await this.signer.provider!.getStorageAt(accountAddr, '0x')
            if (currentSingletonAddr !== latestSingletonAddr) {
                this.updateAvailable = true
                this.singletonUpdateInfo = {
                    newSingleton: latestSingletonAddr,
                }
            }
        } catch (err) {
            throw new Error(`Error while checking for 4337 account updates: ${err}`)
        } finally {
            this.initialized = true
        }
    }

    // Transform a transaction into a multicall with the updates,
    // if updates are available.
    async transform(transaction: Deferrable<TransactionRequest>): Promise<TransactionRequest> {
        throw "Not implemented"
    }
}