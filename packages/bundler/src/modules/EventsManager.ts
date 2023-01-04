import { UserOperationEventEvent } from '@zerodevapp/contracts/dist/types/EntryPoint'
import { ReputationManager } from './ReputationManager'
import { EntryPoint } from '@zerodevapp/contracts'
import { TypedEvent } from '@zerodevapp/contracts/dist/types/common'

/**
 * listen to events. trigger ReputationManager's Included
 */
export class EventsManager {
  lastBlock = 0

  constructor (
    readonly entryPoint: EntryPoint,
    readonly reputationManager: ReputationManager) {
  }

  /**
   * automatically listen to all UserOperationEvent events
   */
  initEventListener (): void {
    this.entryPoint.on(this.entryPoint.filters.UserOperationEvent(), (...args) => {
      const ev = args.slice(-1)[0]
      void this.handleEvent(ev as any)
    })
  }

  /**
   * manually handle all new events since last run
   */
  async handlePastEvents (): Promise<void> {
    const events = await this.entryPoint.queryFilter({ address: this.entryPoint.address }, this.lastBlock)
    for (const ev of events) {
      await this.handleEvent(ev)
    }
  }

  async handleEvent (ev: UserOperationEventEvent): Promise<void> {
    switch (ev.event) {
      case 'UserOperationEventEvent':
        this.handleUserOperationEvent(ev as any)
        break
    }
  }

  eventAggregator: string | null = null
  eventAggregatorTxHash: string | null = null

  // aggregator event is sent once per events bundle for all UserOperationEvents in this bundle.
  // it is not sent at all if the transaction is handleOps
  getEventAggregator (ev: TypedEvent): string | null {
    if (ev.transactionHash !== this.eventAggregatorTxHash) {
      this.eventAggregator = null
      this.eventAggregatorTxHash = ev.transactionHash
    }
    return this.eventAggregator
  }

  handleUserOperationEvent (ev: UserOperationEventEvent): void {
    this._includedAddress(ev.args.sender)
    this._includedAddress(ev.args.paymaster)
    this._includedAddress(this.getEventAggregator(ev))
  }

  _includedAddress (data: string | null): void {
    if (data != null && data.length > 42) {
      const addr = data.slice(0, 42)
      this.reputationManager.updateIncludedStatus(addr)
    }
  }
}
