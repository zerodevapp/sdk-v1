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
import { MockERC1155__factory, MockERC20__factory, MockERC721__factory } from '../typechain-types'
import { setMultiSendAddress } from '../src/multisend'
import {
  EntryPoint, EntryPoint__factory,
  Kernel, Kernel__factory,
  KernelFactory, KernelFactory__factory,
  KillSwitchValidator, KillSwitchValidator__factory,
  KillSwitchAction, KillSwitchAction__factory, ECDSAValidator__factory, ECDSAKernelFactory__factory, ECDSAKernelFactory,
} from '@zerodevapp/kernel-contracts-v2'
import { KernelAccountV2API } from '../src/KernelAccountV2API'
import {
  ECDSAValidator as ECDSAValidatorAPI,
  KillSwitchValidator as KillSwitchValidatorAPI,
  EmptyValidator as EmptyValidatorAPI,
  ValidatorMode,
  BaseValidatorAPI
} from '../src/validators'

const provider = ethers.provider
const signer = provider.getSigner()
const deployer = new DeterministicDeployer(ethers.provider)

describe.only('KernelV2 Killswitch validator', function () {
  let aaProvider: ZeroDevProvider
  let entryPoint: EntryPoint
  let kernelFactory: KernelFactory
  let accountFactory: ECDSAKernelFactory
  let validator: KillSwitchValidator
  let ecdsaValidator: ECDSAValidatorAPI
  let guardian: Signer
  let validatorAPI: KillSwitchValidatorAPI
  let owner: Signer
  let action: KillSwitchAction

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
      validator = await new KillSwitchValidator__factory(signer).deploy()
      action = await new KillSwitchAction__factory(signer).deploy(validator.address)
      entryPoint = await new EntryPoint__factory(signer).deploy()
      kernelFactory = await new KernelFactory__factory(signer).deploy(entryPoint.address)
      const defaultValidator = await new ECDSAValidator__factory(signer).deploy()
      accountFactory = await new ECDSAKernelFactory__factory(signer).deploy(kernelFactory.address, defaultValidator.address, entryPoint.address)
      owner = Wallet.createRandom()
      guardian = Wallet.createRandom()
      ecdsaValidator = new ECDSAValidatorAPI({
        entrypoint: entryPoint,
        mode: ValidatorMode.sudo,
        validatorAddress: await accountFactory.validator(),
        owner
      })
      validatorAPI = new KillSwitchValidatorAPI({
        entrypoint: entryPoint,
        mode: ValidatorMode.plugin,
        validatorAddress: validator.address,
        selector: action.interface.getSighash('activateKillSwitch'),
        executor: action.address,
        guardian: guardian,
        delaySeconds: 1000
      })
      const emptyValidator = await EmptyValidatorAPI.fromValidator(ecdsaValidator)
      aaProvider = await createTestAAProvider(owner, emptyValidator)
      const accountAddress = await aaProvider.getSigner().getAddress()
      const enableSig = await ecdsaValidator.approveExecutor(accountAddress, action.interface.getSighash('activateKillSwitch'), action.address, 0, 0, validatorAPI)
      validatorAPI.setEnableSignature(enableSig)
    })
    it('should use ERC-4337 Signer and Provider to send the UserOperation to the bundler', async function () {
      const accountAddress = await aaProvider.getSigner().getAddress()
      await signer.sendTransaction({
        to: accountAddress,
        value: parseEther('0.1')
      })

      const zdSigner = aaProvider.getSigner()

      const killswitch = KillSwitchAction__factory.connect(accountAddress, zdSigner)
      const res = await killswitch.connect(entryPoint.address).callStatic.activateKillSwitch();
      await action.activateKillSwitch()
    })
  })
})
