import { Networkish } from '@ethersproject/networks'
import { ethers } from 'ethers'

const WEBSOCKET_PING_INTERVAL = 10000
const WEBSOCKET_PONG_TIMEOUT = 5000
const WEBSOCKET_RECONNECT_DELAY = 100

const WebSocketProviderClass = (): new () => ethers.providers.InfuraWebSocketProvider => (class {} as never)

export class InfuraWebsocketProvider extends WebSocketProviderClass() {
  private provider?: ethers.providers.InfuraWebSocketProvider
  private events: ethers.providers.InfuraWebSocketProvider['_events'] = []
  private requests: ethers.providers.InfuraWebSocketProvider['_requests'] = {}

  readonly handler = {
    get (target: InfuraWebsocketProvider, prop: string, receiver: unknown) {
      const value = (target.provider != null) && Reflect.get(target.provider, prop, receiver)

      return value instanceof Function ? value.bind(target.provider) : value
    }
  }

  constructor (network: Networkish, apiKey: string) {
    super()
    this.create(network, apiKey)

    return new Proxy(this, this.handler)
  }

  private create (network: Networkish, apiKey: string) {
    if (this.provider != null) {
      this.events = [...this.events, ...this.provider._events]
      this.requests = { ...this.requests, ...this.provider._requests }
    }

    const provider = new ethers.providers.InfuraWebSocketProvider(network, apiKey)
    let pingInterval: NodeJS.Timer | undefined
    let pongTimeout: NodeJS.Timeout | undefined

    provider._websocket.on('open', () => {
      pingInterval = setInterval(() => {
        provider._websocket.ping()

        pongTimeout = setTimeout(() => { provider._websocket.terminate() }, WEBSOCKET_PONG_TIMEOUT)
      }, WEBSOCKET_PING_INTERVAL)

      let event
      while (((event = this.events.pop()) != null)) {
        provider._events.push(event)
        provider._startEvent(event)
      }

      for (const key in this.requests) {
        provider._requests[key] = this.requests[key]
        provider._websocket.send(this.requests[key].payload)
        delete this.requests[key]
      }
    })

    provider._websocket.on('pong', () => {
      if (pongTimeout != null) clearTimeout(pongTimeout)
    })

    provider._websocket.on('close', (code: number) => {
      provider._wsReady = false

      if (pingInterval != null) clearInterval(pingInterval)
      if (pongTimeout != null) clearTimeout(pongTimeout)

      if (code !== 1000) {
        setTimeout(() => this.create(network, apiKey), WEBSOCKET_RECONNECT_DELAY)
      }
    })

    this.provider = provider
  }
}
