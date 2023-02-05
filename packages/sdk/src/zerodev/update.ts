import { GnosisSafeAccountFactory__factory } from "@zerodevapp/contracts";
import { GnosisSafe__factory } from "@zerodevapp/contracts";
import { EIP4337Manager__factory } from "@zerodevapp/contracts";
import { ContractTransaction, Signer } from "ethers";
import { ERC4337EthersSigner } from "../ERC4337EthersSigner";
import * as constants from './constants'

export const update = async (signer: Signer, confirm: () => Promise<boolean>): Promise<ContractTransaction | undefined> => {
  if (!(signer instanceof ERC4337EthersSigner)) {
    throw new Error('execBatch only works with a ZeroDev signer')
  }

  const updateController = new UpdateController(signer)
  await updateController.initialize(constants.ACCOUNT_FACTORY_ADDRESS)
  if (updateController.updateAvailable) {
    if (await confirm()) {
      return updateController.update()
    }
  }
}

export class UpdateController {
  updateAvailable?: boolean

  managerUpdateInfo?: {
    prev: string,
    current: string,
    newManager: string
  }

  singletonUpdateInfo?: {
    newSingleton: string
  }

  constructor(readonly signer: ERC4337EthersSigner) { }

  async initialize(latestAccountFactoryAddr: string) {
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
    }
  }

  // Execute the update as a multi-call
  async update(): Promise<ContractTransaction> {
    throw "Not implemented"
  }
}