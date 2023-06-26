import { SampleRecipient, SampleRecipient__factory, TestERC721__factory } from '@account-abstraction/utils/dist/src/types'
import { ethers } from 'hardhat'
import { ZeroDevProvider, AssetType } from '../src'
import { resolveProperties, parseEther, hexValue } from 'ethers/lib/utils'
import { verifyMessage } from '@ambire/signature-validator'
import {
  MultiSend__factory
} from '@zerodevapp/contracts'
import { expect } from 'chai'
import { Signer, Wallet } from 'ethers'
import { anyValue } from '@nomicfoundation/hardhat-chai-matchers/withArgs'
import { ClientConfig } from '../src/ClientConfig'
import { wrapProvider, wrapV2Provider } from '../src/Provider'
import { DeterministicDeployer } from '../src/DeterministicDeployer'
import {
  ECDSAKernelFactory,
  ECDSAValidator__factory,
  EntryPoint, EntryPoint__factory,
  Kernel, Kernel__factory,
  KernelFactory, KernelFactory__factory,
  ECDSAValidator, ECDSAKernelFactory__factory,
  ERC165SessionKeyValidator, ERC165SessionKeyValidator__factory, TokenActions, TokenActions__factory
} from '@zerodevapp/kernel-contracts-v2'
import { KernelAccountV2API } from '../src/KernelAccountV2API'
import {
  ECDSAValidator as ECDSAValidatorAPI,
  ERC165SessionKeyValidator as ERC165SessionKeyValidatorAPI,
  EmptyValidator as EmptyValidatorAPI,
  ValidatorMode,
  BaseValidatorAPI
} from '../src/validators'

const provider = ethers.provider
const signer = provider.getSigner()
const deployer = new DeterministicDeployer(ethers.provider)

describe('KernelV2 ERC165SessionKey validator', function () {
  let recipient: SampleRecipient
  let aaProvider: ZeroDevProvider
  let entryPoint: EntryPoint
  let kernelFactory: KernelFactory
  let accountFactory: ECDSAKernelFactory
  let ecdsaValidator: ECDSAValidatorAPI
  let validator: ERC165SessionKeyValidator
  let sessionKey: Signer
  let action: TokenActions
  let validatorAPI: ERC165SessionKeyValidatorAPI
  let owner: Signer

  // create an AA provider for testing that bypasses the bundler
  const createTestAAProvider = async (owner: Signer, defaultValidator: BaseValidatorAPI, address?: string): Promise<ZeroDevProvider> => {
    const config: ClientConfig = {
      entryPointAddress: entryPoint.address,
      implementation: {
        accountAPIClass: KernelAccountV2API,
        factoryAddress: kernelFactory.address
      },
      walletAddress: address,
      bundlerUrl: '',
      projectId: ''
    }
    const aaProvider = await wrapV2Provider(provider, config, owner, defaultValidator, validatorAPI)
    const beneficiary = provider.getSigner().getAddress()
    // for testing: bypass sending through a bundler, and send directly to our entrypoint..
    aaProvider.httpRpcClient.sendUserOpToBundler = async (userOp) => {
      try {
        const tx = await entryPoint.handleOps([userOp], beneficiary)
        const rcpt = await tx.wait()
        rcpt.events!.filter(e => e.event === 'UserOperationEvent').forEach(e => {
          if (!e.args![5]) {
            throw new Error('UserOperation Reverted')
          }
        })
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

    aaProvider.httpRpcClient.estimateUserOpGas = async (userOp) => {
      const op = {
        ...await resolveProperties(userOp),
        // default values for missing fields.
        paymasterAndData: '0x',
        signature: '0x'.padEnd(66 * 2, '1b'), // TODO: each wallet has to put in a signature in the correct length
        maxFeePerGas: 0,
        maxPriorityFeePerGas: 0,
        preVerificationGas: 0,
        verificationGasLimit: 10e6
      }
      const callGasLimit = await provider.estimateGas({
        from: entryPoint.address,
        to: userOp.sender,
        data: userOp.callData
      }).then(b => b.toNumber())

      return {
        preVerificationGas: '1000000',
        verificationGas: '1000000',
        callGasLimit: '1000000',
        validUntil: 0,
        validAfter: 0
      }
    }
    return aaProvider
  }

  describe('wallet created with zerodev', function () {
    before('init', async () => {
      action = await new TokenActions__factory(signer).deploy()
      entryPoint = await new EntryPoint__factory(signer).deploy()
      kernelFactory = await new KernelFactory__factory(signer).deploy(entryPoint.address)
      validator = await new ERC165SessionKeyValidator__factory(signer).deploy()
      const defaultValidator = await new ECDSAValidator__factory(signer).deploy()
      accountFactory = await new ECDSAKernelFactory__factory(signer).deploy(kernelFactory.address, defaultValidator.address, entryPoint.address)
      owner = Wallet.createRandom()
      sessionKey = Wallet.createRandom()
      ecdsaValidator = new ECDSAValidatorAPI({
        entrypoint: entryPoint,
        mode: ValidatorMode.sudo,
        validatorAddress: await accountFactory.validator(),
        owner
      })
      validatorAPI = new ERC165SessionKeyValidatorAPI({
        entrypoint: entryPoint,
        mode: ValidatorMode.plugin,
        validatorAddress: validator.address,
        sessionKey,
        erc165InterfaceId: '0x80ac58cd',
        selector: action.interface.getSighash('transferERC721Action'),
        executor: action.address,
        addressOffset: 16
      })
      const emptyValidator = await EmptyValidatorAPI.fromValidator(ecdsaValidator)
      aaProvider = await createTestAAProvider(owner, emptyValidator)
      const accountAddress = await aaProvider.getSigner().getAddress()
      const enableSig = await ecdsaValidator.approveExecutor(accountAddress, action.interface.getSighash('transferERC721Action'), action.address, 0, 0, validatorAPI)
      validatorAPI.setEnableSignature(enableSig)
    })
    it('should use ERC-4337 Signer and Provider to send the UserOperation to the bundler', async function () {
      const accountAddress = await aaProvider.getSigner().getAddress()
      await signer.sendTransaction({
        to: accountAddress,
        value: parseEther('0.1')
      })

      const zdSigner = aaProvider.getSigner()

      const randomWallet = Wallet.createRandom()

      const action = TokenActions__factory.connect(accountAddress, zdSigner)
      const testToken = await new TestERC721__factory(signer).deploy()
      await testToken.mint(accountAddress, 0)
      const res = await action.connect(entryPoint.address).callStatic.transferERC721Action(testToken.address, 0, randomWallet.address)
      const tx = await action.transferERC721Action(testToken.address, 0, randomWallet.address)
      console.log('logs', (await tx.wait()).events)
      expect(await testToken.ownerOf(0)).to.equal(randomWallet.address)
    })
  })
})
