import { ethers } from 'hardhat'
import { ZeroDevProvider } from '../src/ZeroDevProvider'
import {
  EntryPoint, EntryPoint__factory,
} from '@zerodevapp/contracts-new'
import { expect } from 'chai'
import { VoidSigner, Wallet } from 'ethers'
import { ClientConfig } from '../src/ClientConfig'
import { wrapProvider } from '../src/Provider'
import { createSessionKey, deserializeSessionKeyData } from '../src/session'
import { SessionSigner } from '../src/session/SessionSigner'
import { KernelFactory, ZeroDevSessionKeyPlugin, KernelFactory__factory, ZeroDevSessionKeyPlugin__factory } from '@zerodevapp/contracts-new'
import { kernelAccount_v1_audited } from '../src/accounts'
import { KernelAccountAPI } from '../src/KernelAccountAPI'

const provider = ethers.provider
const signer = provider.getSigner()
describe('Session Signer', function () {
  let sessionSigner: SessionSigner;
  let aaProvider: ZeroDevProvider
  let entryPoint: EntryPoint
  let accountFactory: KernelFactory
  let sessionKeyPlugin: ZeroDevSessionKeyPlugin

  let createTestAAProvider = async (): Promise<ZeroDevProvider> => {
    const config: ClientConfig = {
      projectId: '0',
      entryPointAddress: entryPoint.address,
      implementation: {
        ...kernelAccount_v1_audited,
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

  before('init', async () => {
    entryPoint = await new EntryPoint__factory(signer).deploy()
    // standard safe singleton contract (implementation)
    accountFactory = await new KernelFactory__factory(signer)
      .deploy(entryPoint.address)

    aaProvider = await createTestAAProvider()
    const zdsigner = aaProvider.getSigner()
    sessionKeyPlugin = await new ZeroDevSessionKeyPlugin__factory(signer).deploy();

    const validUntil = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365; // 1 year
    const sessionDataStr = await createSessionKey(zdsigner, [], validUntil, undefined, sessionKeyPlugin);
    const sessionData = deserializeSessionKeyData(sessionDataStr);


    const accountAPI = new KernelAccountAPI({
      owner: new VoidSigner(await zdsigner.originalSigner.getAddress(), zdsigner.provider),
      index: 0,
      factoryAddress: accountFactory.address,
      provider: zdsigner.provider!,
      entryPointAddress: entryPoint.address,
    });

    sessionSigner = new SessionSigner(
      zdsigner.config,
      aaProvider,
      zdsigner.httpRpcClient,
      accountAPI,
      sessionData.validUntil,
      sessionData.whitelist,
      sessionData.signature,
      new Wallet(sessionData.sessionPrivateKey!),
      sessionKeyPlugin
    );
  })

  it('should send transactions without data', async function () {
    await signer.sendTransaction({
      to: await sessionSigner.getAddress(),
      value: ethers.utils.parseEther('1')
    })
    const firstAccountBalance = await sessionSigner.getBalance()
    const transaction = await sessionSigner.sendTransaction({
      to: await Wallet.createRandom().getAddress(),
      value: ethers.utils.parseEther('0.001')
    })
    await transaction.wait()
    expect(await sessionSigner.getBalance()).lessThan(firstAccountBalance)
  })
});
