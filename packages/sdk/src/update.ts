import { GnosisSafeAccountFactory__factory, UpdateSingleton__factory, EIP4337Manager__factory } from '@zerodevapp/contracts'
import { BigNumber, ContractTransaction, Signer, utils } from 'ethers'
import { ZeroDevSigner } from './ZeroDevSigner'
import * as constants from './constants'

export class UpdateController {
  updateAvailable: boolean

  managerUpdateInfo?: {
    prev: string
    oldManager: string
    newManager: string
  }

  singletonUpdateInfo?: {
    newSingleton: string
  }

  constructor (readonly signer: ZeroDevSigner) {
    this.updateAvailable = false
  }

  async checkUpdate (latestAccountFactoryAddr: string): Promise<boolean> {
    try {
      if (await this.signer.smartAccountAPI.checkAccountPhantom()) {
        // undeployed, no need to update
        return false
      }

      const accountFactory = GnosisSafeAccountFactory__factory.connect(latestAccountFactoryAddr, this.signer)
      const latestManagerAddr = await accountFactory.eip4337Manager()
      const latestSingletonAddr = await accountFactory.safeSingleton()

      const accountAddr = await this.signer.getAddress()

      // Check if manager is outdated
      const manager = EIP4337Manager__factory.connect(latestManagerAddr, this.signer) // get manager address from factory
      const res = await manager.getCurrentEIP4337Manager(accountAddr)
      if (res[1] !== latestManagerAddr) {
        this.updateAvailable = true
        this.managerUpdateInfo = {
          prev: res[0],
          oldManager: res[1],
          newManager: latestManagerAddr
        }
      }

      // Check if singleton is outdated
      const currentSingletonAddr = storageToAddress(await this.signer.provider!.getStorageAt(accountAddr, '0x'))
      if (currentSingletonAddr !== latestSingletonAddr) {
        this.updateAvailable = true
        this.singletonUpdateInfo = {
          newSingleton: latestSingletonAddr
        }
      }

      return this.updateAvailable
    } catch (err) {
      throw new Error(`Error while checking for 4337 account updates: ${err}`)
    }
  }

  // Execute the update as a multi-call
  async update (): Promise<ContractTransaction | undefined> {
    if (!this.updateAvailable) {
      return
    }

    const batch = []

    if (this.managerUpdateInfo != null) {
      const { prev, oldManager, newManager } = this.managerUpdateInfo
      const manager = EIP4337Manager__factory.connect(newManager, this.signer)
      batch.push({
        to: manager.address,
        data: await manager.interface.encodeFunctionData('replaceEIP4337Manager', [prev, oldManager, newManager]),
        delegateCall: true
      })
    }

    if (this.singletonUpdateInfo != null) {
      const updateSingleton = UpdateSingleton__factory.connect(constants.UPDATE_SINGLETON_ADDRESS, this.signer)
      batch.push({
        to: updateSingleton.address,
        data: await updateSingleton.interface.encodeFunctionData('update', [this.singletonUpdateInfo.newSingleton]),
        delegateCall: true
      })
    }

    return await this.signer.execBatch(batch, undefined, {
      // The accounts we are attempting to upgrade at the moment are having
      // issues with batching on polygon due to gas estimation errors, so
      // we manually provide a gas limit here.
      // TODO: remove these once those accounts have been upgraded.
      gasLimit: 100000
    })
  }
}

function storageToAddress (storage: string): string {
  return utils.getAddress(BigNumber.from(storage).toHexString())
}
