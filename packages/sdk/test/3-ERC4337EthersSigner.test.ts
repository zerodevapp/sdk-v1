import { SampleRecipient, SampleRecipient__factory } from '@account-abstraction/utils/dist/src/types'
import { ethers } from 'hardhat'
import { ClientConfig, DeterministicDeployer, ERC4337EthersProvider, ERC4337EthersSigner, wrapProvider } from '../src'
import {
  EntryPoint, EntryPoint__factory,
  GnosisSafe,
  GnosisSafe__factory,
  GnosisSafeProxyFactory__factory,
  EIP4337Manager,
  EIP4337Manager__factory,
  GnosisSafeAccountFactory__factory,
  MultiSend__factory,
  ERC721SubscriptionModule,
  ERC721SubscriptionModule__factory,
  SampleNFT,
  SampleNFT__factory,
  GnosisSafeAccountFactory,
} from '@zerodevapp/contracts'
import { expect } from 'chai'
import { parseEther, hexValue } from 'ethers/lib/utils'
import { Wallet } from 'ethers'
import { anyValue } from '@nomicfoundation/hardhat-chai-matchers/withArgs'
import { execBatch } from '../src/batch'
import { enableModule } from '../src/module'

const provider = ethers.provider
const signer = provider.getSigner()

describe('ERC4337EthersSigner, Provider', function () {
  let recipient: SampleRecipient
  let aaProvider: ERC4337EthersProvider
  let entryPoint: EntryPoint
  let manager: EIP4337Manager
  let safeSingleton: GnosisSafe
  let accountFactory: GnosisSafeAccountFactory

  // create an AA provider for testing that bypasses the bundler
  let createTestAAProvider = async (): Promise<ERC4337EthersProvider> => {
    const config: ClientConfig = {
      entryPointAddress: entryPoint.address,
      accountFactoryAddress: accountFactory.address,
      bundlerUrl: ''
    }
    const aasigner = Wallet.createRandom()
    const aaProvider = await wrapProvider(provider, config, aasigner)

    const beneficiary = provider.getSigner().getAddress()
    // for testing: bypass sending through a bundler, and send directly to our entrypoint..
    aaProvider.httpRpcClient.sendUserOpToBundler = async (userOp) => {
      try {
        await entryPoint.handleOps([userOp], beneficiary)
      } catch (e: any) {
        // doesn't report error unless called with callStatic
        await entryPoint.callStatic.handleOps([userOp], beneficiary).catch((e: any) => {
          // eslint-disable-next-line
          const message = e.errorArgs != null ? `${e.errorName}(${e.errorArgs.join(',')})` : e.message
          throw new Error(message)
        })
      }
      return ''
    }
    return aaProvider
  }

  before('init', async () => {
    const deployRecipient = await new SampleRecipient__factory(signer).deploy()
    entryPoint = await new EntryPoint__factory(signer).deploy()
    // standard safe singleton contract (implementation)
    safeSingleton = await new GnosisSafe__factory(signer).deploy()
    // standard safe proxy factory
    const proxyFactory = await new GnosisSafeProxyFactory__factory(signer).deploy()
    manager = await new EIP4337Manager__factory(signer).deploy(entryPoint.address)

    accountFactory = await new GnosisSafeAccountFactory__factory(signer)
      .deploy(proxyFactory.address, safeSingleton.address, manager.address)

    aaProvider = await createTestAAProvider()
    recipient = deployRecipient.connect(aaProvider.getSigner())
  })

  it('should fail to send before funding', async () => {
    try {
      await recipient.something('hello', { gasLimit: 1e6 })
      throw new Error('should revert')
    } catch (e: any) {
      expect(e.message).to.eq('FailedOp(0,0x0000000000000000000000000000000000000000,AA21 didn\'t pay prefund)')
    }
  })

  it('should use ERC-4337 Signer and Provider to send the UserOperation to the bundler', async function () {
    const accountAddress = await aaProvider.getSigner().getAddress()
    await signer.sendTransaction({
      to: accountAddress,
      value: parseEther('0.1')
    })

    const ret = await recipient.something('hello')
    await expect(ret).to.emit(recipient, 'Sender')
      .withArgs(anyValue, accountAddress, 'hello')
  })

  it('should batch call', async function () {
    // Deterministically deploy MultiSend
    const deployer = new DeterministicDeployer(ethers.provider)
    const ctr = hexValue(new MultiSend__factory(ethers.provider.getSigner()).getDeployTransaction().data!)
    DeterministicDeployer.init(ethers.provider)
    const addr = await DeterministicDeployer.getAddress(ctr)
    await DeterministicDeployer.deploy(ctr)
    expect(await deployer.isContractDeployed(addr)).to.equal(true)

    const signer = aaProvider.getSigner()
    const accountAddress = await signer.getAddress()

    const calls = [
      {
        to: recipient.address,
        data: recipient.interface.encodeFunctionData('something', ['hello']),
      },
      {
        to: recipient.address,
        data: recipient.interface.encodeFunctionData('something', ['world']),
      },
    ]

    const ret = await execBatch(signer, calls)

    await expect(ret).to.emit(recipient, 'Sender')
      .withArgs(anyValue, accountAddress, 'hello')
    await expect(ret).to.emit(recipient, 'Sender')
      .withArgs(anyValue, accountAddress, 'world')
  })

  it('should use ERC-4337 for delegate call', async function () {
    const signer = aaProvider.getSigner()
    const accountAddress = await signer.getAddress()
    const delegateRecipient = recipient.connect(signer.delegateCopy())

    // in a delegate call, the we should find the event emitted by the account itself
    const tx = await delegateRecipient.something('hello')
    const receipt = await tx.wait()
    const events = receipt.events!.filter(
      (e) => e.address === accountAddress,
    )
    let decodedEvent: any
    for (const event of events) {
      try {
        decodedEvent = recipient.interface.decodeEventLog(
          'Sender',
          event.data,
          event.topics,
        )
      } catch (e) {
      }
    }

    expect(decodedEvent!.message).to.equal('hello')
  })

  it('should revert if on-chain userOp execution reverts', async function () {
    // specifying gas, so that estimateGas won't revert..
    const ret = await recipient.reverting({ gasLimit: 20000 })

    try {
      await ret.wait()
      throw new Error('expected to revert')
    } catch (e: any) {
      expect(e.message).to.match(/test revert/)
    }
  })

  context('#modules', () => {

    let module: ERC721SubscriptionModule
    let erc721Collection: SampleNFT
    let userAASigner: ERC4337EthersSigner
    let senderAASigner: ERC4337EthersSigner

    before(async () => {

      // create two accounts, one for the user and one for the sender (the account that
      // sends NFTs to the owner for subscription payments)

      // generate a random ethers wallet
      const userAAProvider = await createTestAAProvider()
      const senderAAProvider = await createTestAAProvider()

      userAASigner = userAAProvider.getSigner()
      senderAASigner = senderAAProvider.getSigner()

      erc721Collection = await new SampleNFT__factory(signer).deploy()

      module = await new ERC721SubscriptionModule__factory(signer).deploy(
        userAASigner.getAddress(),
        erc721Collection.address,
        senderAASigner.getAddress(),
        1,
        10,
      )

    })

    it('should enable module', async () => {
      const selfAddress = await userAASigner.getAddress()
      expect(enableModule(userAASigner, module.address)).to.emit(selfAddress, 'ModuleEnabled')
    })

  })
})
