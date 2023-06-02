import {
  GnosisSafeProxyFactory__factory,
  UserOperationStruct
} from '@zerodevapp/contracts'
import { Wallet } from 'ethers'
import { parseEther } from 'ethers/lib/utils'
import { expect } from 'chai'
import { anyValue } from '@nomicfoundation/hardhat-chai-matchers/withArgs'
import { ethers } from 'hardhat'
import { SampleRecipient, SampleRecipient__factory } from '@account-abstraction/utils/dist/src/types'
import { rethrowError } from '@account-abstraction/utils'
import { KernelAccountAPI } from '../src/KernelAccountAPI'
import { ExecuteType } from '../src/BaseAccountAPI'
import {
  EntryPoint,
  EntryPoint__factory,
  KernelFactory__factory
} from '@zerodevapp/contracts-new'

const provider = ethers.provider
const signer = provider.getSigner()
const PREFIX = 'zerodev'

describe('KernelAccountAPI', () => {
  let owner: Wallet
  let api: KernelAccountAPI
  let entryPoint: EntryPoint
  let beneficiary: string
  let recipient: SampleRecipient
  let accountAddress: string
  let accountDeployed = false

  before('init', async () => {
    entryPoint = await new EntryPoint__factory(signer).deploy()
    beneficiary = await signer.getAddress()

    // standard safe singleton contract (implementation)
    const accountFactory = await new KernelFactory__factory(signer)
      .deploy(entryPoint.address)

    recipient = await new SampleRecipient__factory(signer).deploy()
    owner = Wallet.createRandom()
    api = new KernelAccountAPI({
      provider,
      owner,
      entryPointAddress: entryPoint.address,
      factoryAddress: accountFactory.address
    })
  })

  it('#getUserOpHash should match entryPoint.getUserOpHash', async function () {
    const userOp: UserOperationStruct = {
      sender: '0x'.padEnd(42, '1'),
      nonce: 2,
      initCode: '0x3333',
      callData: '0x4444',
      callGasLimit: 5,
      verificationGasLimit: 6,
      preVerificationGas: 7,
      maxFeePerGas: 8,
      maxPriorityFeePerGas: 9,
      paymasterAndData: '0xaaaaaa',
      signature: '0xbbbb'
    }
    const hash = await api.getUserOpHash(userOp)
    const epHash = await entryPoint.getUserOpHash(userOp)
    expect(hash).to.equal(epHash)
  })

  it('should deploy to counterfactual address', async () => {
    accountAddress = await api.getAccountAddress()
    expect(await provider.getCode(accountAddress).then(code => code.length)).to.equal(2)

    await signer.sendTransaction({
      to: accountAddress,
      value: parseEther('0.1')
    })
    const op = await api.createSignedUserOp({
      target: recipient.address,
      data: recipient.interface.encodeFunctionData('something', ['hello'])
    })

    await expect(entryPoint.handleOps([op], beneficiary)).to.emit(recipient, 'Sender')
      .withArgs(anyValue, accountAddress, 'hello')
    expect(await provider.getCode(accountAddress).then(code => code.length)).to.greaterThan(0)
    accountDeployed = true
  })

  context('#rethrowError', () => {
    let userOp: UserOperationStruct
    before(async () => {
      userOp = await api.createUnsignedUserOp({
        target: ethers.constants.AddressZero,
        data: '0x'
      })
      // expect FailedOp "invalid signature length"
      userOp.signature = '0x11'
    })
    it('should parse FailedOp error', async () => {
      const err = await entryPoint.handleOps([userOp], beneficiary)
        .catch(error => {
          const errorData = error.message.split('(return data: ')[1].split(')')[0]
          console.log(errorData)
          const str = ethers.utils.toUtf8String('0x' + errorData.substring(202, 202 + 44))
          return str
        })
      console.log(err)
      expect(err).to.be.equal('AA23 reverted (or OOG)')
    })
    it('should parse Error(message) error', async () => {
      await expect(
        entryPoint.addStake(0)
      ).to.revertedWith('must specify unstake delay')
    })
    it('should parse revert with no description', async () => {
      // use wrong signature for contract..
      const wrongContract = entryPoint.attach(recipient.address)
      await expect(
        wrongContract.addStake(0)
      ).to.revertedWithoutReason()
    })
  })

  it('should use account API after creation without a factory', async function () {
    if (!accountDeployed) {
      this.skip()
    }
    const api1 = new KernelAccountAPI({
      provider,
      entryPointAddress: entryPoint.address,
      accountAddress,
      owner
    })
    const op1 = await api1.createSignedUserOp({
      target: recipient.address,
      data: recipient.interface.encodeFunctionData('something', ['world'])
    })
    await expect(entryPoint.handleOps([op1], beneficiary)).to.emit(recipient, 'Sender')
      .withArgs(anyValue, accountAddress, 'world')
  })

  it('should delegate call', async function () {
    if (!accountDeployed) {
      this.skip()
    }
    const api1 = new KernelAccountAPI({
      provider,
      entryPointAddress: entryPoint.address,
      accountAddress,
      owner
    })

    const op1 = await api1.createSignedUserOp({
      target: recipient.address,
      data: recipient.interface.encodeFunctionData('something', ['world'])
    }, ExecuteType.EXECUTE_DELEGATE)

    // in a delegate call, the we should find the event emitted by the account itself
    const tx = await entryPoint.handleOps([op1], beneficiary)
    const receipt = await tx.wait()
    const events = receipt.events!.filter(
      (e) => e.address === accountAddress
    )
    let decodedEvent: any
    for (const event of events) {
      try {
        decodedEvent = recipient.interface.decodeEventLog(
          'Sender',
          event.data,
          event.topics
        )
      } catch (e) {
      }
    }

    expect(decodedEvent!.message).to.equal('world')
  })
})
