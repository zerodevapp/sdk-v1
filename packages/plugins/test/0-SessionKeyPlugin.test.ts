import { SampleRecipient, SampleRecipient__factory } from '@account-abstraction/utils/dist/src/types'
import { ethers } from 'hardhat'
import { ZeroDevProvider } from '@zerodevapp/sdk/src/ZeroDevProvider'
import {
  EntryPoint, EntryPoint__factory,
} from '@zerodevapp/contracts'
import { expect } from 'chai'
import { parseEther, hexValue } from 'ethers/lib/utils'
import { BigNumber, Signer, utils, VoidSigner, Wallet } from 'ethers'
import { anyValue } from '@nomicfoundation/hardhat-chai-matchers/withArgs'
import { ClientConfig } from '@zerodevapp/sdk/src/ClientConfig'
import { wrapProvider } from '@zerodevapp/sdk/src/Provider'
import { createSessionKey } from '../src'
import { SessionSigner } from '../src/SessionSigner'
import { KernelFactory, ZeroDevSessionKeyPlugin, Kernel, KernelFactory__factory, ZeroDevSessionKeyPlugin__factory } from '@zerodevapp/contracts-new'
import { kernelAccount_audited } from '@zerodevapp/sdk/src/accounts'
import { KernelAccountAPI } from '@zerodevapp/sdk/src/KernelAccountAPI'
import { AccountAPIConstructor, BaseAccountAPI } from '@zerodevapp/sdk/src/BaseAccountAPI'

const provider = ethers.provider
const signer = provider.getSigner()
describe('ERC4337EthersSigner, Provider', function () {
  let recipient: SampleRecipient
  let recipient2: SampleRecipient
  let aaProvider: ZeroDevProvider
  let entryPoint: EntryPoint
  let accountFactory: KernelFactory
  let sessionKeyPlugin: ZeroDevSessionKeyPlugin

  // create an AA provider for testing that bypasses the bundler
  let createTestAAProvider = async (): Promise<ZeroDevProvider> => {
    const config: ClientConfig = {
      projectId: '0',
      entryPointAddress: entryPoint.address,
      implementation: {
        ...kernelAccount_audited,
        factoryAddress: accountFactory.address,
      },
      bundlerUrl: ''
    }
    const aasigner = Wallet.createRandom()
    const aaProvider = await wrapProvider(provider, config, aasigner)

    const beneficiary = provider.getSigner().getAddress()
    // for testing: bypass sending through a bundler, and send directly to our entrypoint..
    aaProvider.httpRpcClient.sendUserOpToBundler = async (userOp) => {
      try {
        await entryPoint.handleOps([userOp], beneficiary, { gasLimit: 30000000 })
      } catch (e: any) {
        //console.log(userOp)
        // doesn't report error unless called with callStatic
        await entryPoint.callStatic.handleOps([userOp], beneficiary).catch((e: any) => {
          // eslint-disable-next-line
          const message = e.errorArgs != null ? `${e.errorName}(${e.errorArgs.join(',')})` : e.message
          throw new Error(message)
        })
      }
      return ''
    }

    aaProvider.httpRpcClient.estimateUserOpGas = async (userOp) => {
      const callGasLimit = await provider.estimateGas({
        from: entryPoint.address,
        to: userOp.sender,
        data: userOp.callData
      }).then(b => b.toNumber())

      return {
        preVerificationGas: "100000",
        verificationGas: "110000",
        callGasLimit: callGasLimit.toString(),
        validUntil: 0,
        validAfter: 0
      }
    }
    return aaProvider
  }

  describe('sudo mode', () => {
    before('init', async () => {
      const deployRecipient = await new SampleRecipient__factory(signer).deploy()
      const deployRecipient2 = await new SampleRecipient__factory(signer).deploy()
      entryPoint = await new EntryPoint__factory(signer).deploy()
      // standard safe singleton contract (implementation)
      accountFactory = await new KernelFactory__factory(signer)
        .deploy(entryPoint.address)

      aaProvider = await createTestAAProvider()
      const zdsigner = aaProvider.getSigner()
      sessionKeyPlugin = await new ZeroDevSessionKeyPlugin__factory(signer).deploy();

      const validUntil = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365; // 1 year
      const sessionData = await createSessionKey(zdsigner, [], validUntil, sessionKeyPlugin);
      //  owner: Signer
      // index?: number
      // factoryAddress?: string
      // templateAddress?: string


      const accountAPI = new KernelAccountAPI({
        owner: new VoidSigner(await zdsigner.originalSigner.getAddress(), zdsigner.provider),
        index: 0,
        factoryAddress: accountFactory.address,
        provider: zdsigner.provider!,
        entryPointAddress: entryPoint.address,
      });

      const sessionSigner = new SessionSigner(
        zdsigner.config,
        aaProvider,
        zdsigner.httpRpcClient,
        accountAPI,
        validUntil,
        [],
        sessionData.signature,
        sessionData.sessionKey,
        sessionKeyPlugin
      );
      recipient = deployRecipient.connect(sessionSigner)
      recipient2 = deployRecipient2.connect(sessionSigner)
    })
    it('should fail to send before funding', async () => {
      try {
        await recipient.something('hello', { gasLimit: 1e6 })
        throw new Error('should revert')
      } catch (e: any) {
        expect(e.message).to.eq('FailedOp(0,AA21 didn\'t pay prefund)')
      }
    })

    it('should use ERC-4337 Signer and Provider to send the UserOperation to the bundler', async function () {
      await signer.sendTransaction({
        to: await aaProvider.getSigner().getAddress(),
        value: parseEther('3')
      })

      const zdsigner = aaProvider.getSigner()

      //fund the account
      await signer.sendTransaction({
        to: await zdsigner.getAddress(),
        value: parseEther('100')
      })

      const zdrecipient = recipient.connect(zdsigner);
      await entryPoint.depositTo(await zdsigner.getAddress(), { value: parseEther('1') });

      await zdrecipient.something('hello', { gasLimit: 1e6 })
      const accountAddress = await aaProvider.getSigner().getAddress()
      await recipient2.something('hello')
      let ret = await recipient.something('hello')
      await expect(ret).to.emit(recipient, 'Sender')
        .withArgs(anyValue, accountAddress, 'hello')
      ret = await recipient.something('world')
      await expect(ret).to.emit(recipient, 'Sender')
        .withArgs(anyValue, accountAddress, 'world')
    })
  })
  describe('non sudo mode', () => {
    before('init', async () => {
      const deployRecipient = await new SampleRecipient__factory(signer).deploy()
      const deployRecipient2 = await new SampleRecipient__factory(signer).deploy()
      entryPoint = await new EntryPoint__factory(signer).deploy()
      // standard safe singleton contract (implementation)
      accountFactory = await new KernelFactory__factory(signer)
        .deploy(entryPoint.address)

      aaProvider = await createTestAAProvider()
      const zdsigner = aaProvider.getSigner()
      sessionKeyPlugin = await new ZeroDevSessionKeyPlugin__factory(signer).deploy();

      const validUntil = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365; // 1 year

      // server
      const sessionData = await createSessionKey(zdsigner, [{
        to: deployRecipient.address,
        selectors: [deployRecipient.interface.getSighash('something')],
      }, {
        to: deployRecipient2.address,
        selectors: []
      }], validUntil, sessionKeyPlugin);

      const accountAPI = new KernelAccountAPI({
        owner: new VoidSigner(await zdsigner.originalSigner.getAddress(), zdsigner.provider),
        index: 0,
        factoryAddress: accountFactory.address,
        provider: zdsigner.provider!,
        entryPointAddress: entryPoint.address,
      });

      // client
      const sessionSigner = new SessionSigner(
        zdsigner.config,
        aaProvider,
        zdsigner.httpRpcClient,
        accountAPI,
        validUntil,
        sessionData.whitelist,
        sessionData.signature,
        sessionData.sessionKey,
        sessionKeyPlugin
      );
      recipient = deployRecipient.connect(sessionSigner)
      recipient2 = deployRecipient2.connect(sessionSigner)
    })

    it('should fail to send before funding', async () => {
      try {
        await recipient.something('hello', { gasLimit: 1e6 })
        throw new Error('should revert')
      } catch (e: any) {
        expect(e.message).to.eq('FailedOp(0,AA21 didn\'t pay prefund)')
      }
    })

    it('should use ERC-4337 Signer and Provider to send the UserOperation to the bundler', async function () {
      await signer.sendTransaction({
        to: await aaProvider.getSigner().getAddress(),
        value: parseEther('3')
      })

      const zdsigner = aaProvider.getSigner()

      //fund the account
      await signer.sendTransaction({
        to: await zdsigner.getAddress(),
        value: parseEther('100')
      })

      const zdrecipient = recipient.connect(zdsigner);
      await entryPoint.depositTo(await zdsigner.getAddress(), { value: parseEther('1') });

      await zdrecipient.something('hello', { gasLimit: 1e6 })
      const accountAddress = await aaProvider.getSigner().getAddress()
      await recipient2.something('hello')
      let ret = await recipient.something('hello')
      await expect(ret).to.emit(recipient, 'Sender')
        .withArgs(anyValue, accountAddress, 'hello')
      ret = await recipient.something('world')
      await expect(ret).to.emit(recipient, 'Sender')
        .withArgs(anyValue, accountAddress, 'world')
    })

  })
});
function storageToAddress(storage: string): string {
  return utils.getAddress(BigNumber.from(storage).toHexString())
}
