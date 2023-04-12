import { SampleRecipient, SampleRecipient__factory } from '@account-abstraction/utils/dist/src/types'
import { ethers } from 'hardhat'
import { ZeroDevProvider, AssetType } from '../src'
import { resolveProperties, parseEther, hexValue } from 'ethers/lib/utils'
import { verifyMessage } from '@ambire/signature-validator'
import {
  EntryPoint, EntryPoint__factory,
  GnosisSafeProxyFactory,
  GnosisSafeProxyFactory__factory,
  MultiSend__factory,
  ZeroDevPluginSafe,
  ZeroDevGnosisSafeAccountFactory,
  ZeroDevPluginSafe__factory,
  ZeroDevGnosisSafeAccountFactory__factory,
} from '@zerodevapp/contracts'
import { expect } from 'chai'
import { Signer, Wallet } from 'ethers'
import { anyValue } from '@nomicfoundation/hardhat-chai-matchers/withArgs'
import { ClientConfig } from '../src/ClientConfig'
import { wrapProvider } from '../src/Provider'
import { DeterministicDeployer } from '../src/DeterministicDeployer'
import { MockERC1155__factory, MockERC20__factory, MockERC721__factory } from '../typechain-types'
import { setMultiSendAddress } from '../src/multisend'
import { KernelFactory, KernelFactory__factory } from '@zerodevapp/contracts-new'
import { KernelAccountAPI } from '../src/KernelAccountAPI'

const provider = ethers.provider
const signer = provider.getSigner()
const deployer = new DeterministicDeployer(ethers.provider)

describe('ZeroDevSigner, Provider', function () {
  let recipient: SampleRecipient
  let aaProvider: ZeroDevProvider
  let entryPoint: EntryPoint
  let accountFactory: KernelFactory

  // create an AA provider for testing that bypasses the bundler
  let createTestAAProvider = async (owner: Signer, address?: string): Promise<ZeroDevProvider> => {
    const config: ClientConfig = {
      entryPointAddress: entryPoint.address,
      implementation: {
        accountAPIClass: KernelAccountAPI,
        factoryAddress: accountFactory.address,
      },
      walletAddress: address,
      bundlerUrl: '',
      projectId: '',
    }
    const aaProvider = await wrapProvider(provider, config, owner)

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
        callGasLimit: callGasLimit.toString(),
        validUntil: 0,
        validAfter: 0
      }
    }
    return aaProvider
  }

  describe('wallet created with zerodev', function () {
    before('init', async () => {
      const deployRecipient = await new SampleRecipient__factory(signer).deploy()
      entryPoint = await new EntryPoint__factory(signer).deploy()
      accountFactory = await new KernelFactory__factory(signer)
        .deploy(entryPoint.address)
      const aasigner = Wallet.createRandom()

      aaProvider = await createTestAAProvider(aasigner)
      recipient = deployRecipient.connect(aaProvider.getSigner())
    })

    it('should verify signatures with ERC-6492', async function () {
      const aaSigner = aaProvider.getSigner()
      const msg = 'hello'
      const sig = await aaSigner.signMessage(msg)
      expect(await verifyMessage({
        signer: await aaSigner.getAddress(),
        message: msg,
        signature: sig,
        provider,
      })).to.be.true
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
      setMultiSendAddress(addr)
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

      const ret = await signer.execBatch(calls)

      await expect(ret).to.emit(recipient, 'Sender')
        .withArgs(anyValue, accountAddress, 'hello')
      await expect(ret).to.emit(recipient, 'Sender')
        .withArgs(anyValue, accountAddress, 'world')
    })

    // it('should use ERC-4337 for delegate call', async function () {
    //   const signer = aaProvider.getSigner()
    //   const accountAddress = await signer.getAddress()
    //   const delegateRecipient = recipient.connect((signer.smartAccountAPI as GnosisAccountAPI).delegateCopy(signer))

    //   // in a delegate call, the we should find the event emitted by the account itself
    //   const tx = await delegateRecipient.something('hello')
    //   const receipt = await tx.wait()
    //   const events = receipt.events!.filter(
    //     (e) => e.address === accountAddress,
    //   )
    //   let decodedEvent: any
    //   for (const event of events) {
    //     try {
    //       decodedEvent = recipient.interface.decodeEventLog(
    //         'Sender',
    //         event.data,
    //         event.topics,
    //       )
    //     } catch (e) {
    //     }
    //   }

    //   expect(decodedEvent!.message).to.equal('hello')
    // })

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

    it('should send transactions without data', async function () {
      const signer = await aaProvider.getSigner()
      const firstAccountBalance = await signer.getBalance()
      const transaction = await signer.sendTransaction({
        to: await Wallet.createRandom().getAddress(),
        value: ethers.utils.parseEther('0.001')
      })
      await transaction.wait()
      expect(await signer.getBalance()).lessThan(firstAccountBalance)
    })

    // context('#transferOwnership', () => {
    //   it('should transfer ownership', async () => {
    //     const newOwner = Wallet.createRandom()
    //     const newOwnerAddr = await newOwner.getAddress()
    //     await aaProvider.getSigner().transferOwnership(newOwnerAddr)
    //     expect(
    //       await ZeroDevPluginSafe__factory.connect(
    //         await aaProvider.getSigner().getAddress(),
    //         aaProvider
    //       ).isOwner(await aaProvider.originalSigner.getAddress())
    //     ).to.equal(false);
    //     expect(
    //       await ZeroDevPluginSafe__factory.connect(
    //         await aaProvider.getSigner().getAddress(),
    //         aaProvider
    //       ).isOwner(newOwnerAddr)
    //     ).to.equal(true);
    //   })
    // })
  })

  describe('predeployed wallets', function () {
    let aasigner: Signer;
    before('init', async () => {
      const deployRecipient = await new SampleRecipient__factory(signer).deploy()
      aasigner = Wallet.createRandom()

      const wallet = await accountFactory.createAccount(await aasigner.getAddress(), 1).then(async (x) => await x.wait()).then(x => x.events?.find(x => x.event === 'AccountCreated')?.args?.account);
      aaProvider = await createTestAAProvider(aasigner, wallet);
      recipient = deployRecipient.connect(aaProvider.getSigner())
    })

    it("should return proper address", async function () {
      const api = (await aaProvider.getSigner()).smartAccountAPI;
      expect(api.accountAddress).to.equal(await accountFactory.getAccountAddress(await aasigner.getAddress(), 1));
      expect(await api.checkAccountPhantom()).to.equal(false);

      const addr = await aaProvider.getSigner().getAddress();
      expect(addr).to.equal(await accountFactory.getAccountAddress(await aasigner.getAddress(), 1));
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

      const ret = await signer.execBatch(calls)

      await expect(ret).to.emit(recipient, 'Sender')
        .withArgs(anyValue, accountAddress, 'hello')
      await expect(ret).to.emit(recipient, 'Sender')
        .withArgs(anyValue, accountAddress, 'world')
    })

    // it('should use ERC-4337 for delegate call', async function () {
    //   const signer = aaProvider.getSigner()
    //   const accountAddress = await signer.getAddress()
    //   const delegateRecipient = recipient.connect((signer.smartAccountAPI as GnosisAccountAPI).delegateCopy(signer))

    //   // in a delegate call, the we should find the event emitted by the account itself
    //   const tx = await delegateRecipient.something('hello')
    //   const receipt = await tx.wait()
    //   const events = receipt.events!.filter(
    //     (e) => e.address === accountAddress,
    //   )
    //   let decodedEvent: any
    //   for (const event of events) {
    //     try {
    //       decodedEvent = recipient.interface.decodeEventLog(
    //         'Sender',
    //         event.data,
    //         event.topics,
    //       )
    //     } catch (e) {
    //     }
    //   }

    //   expect(decodedEvent!.message).to.equal('hello')
    // })

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

    context('#transferAllAssetss', () => {
      before(async () => {
        const ctr = hexValue(new MultiSend__factory(ethers.provider.getSigner()).getDeployTransaction().data!)
        DeterministicDeployer.init(ethers.provider)
        await DeterministicDeployer.deploy(ctr)
      })
      it("should be able to transfer eth", async () => {
        //send eth to sender
        await signer.sendTransaction({
          to: await aaProvider.getSigner().getAddress(),
          value: ethers.utils.parseEther("1")
        })
        const randomRecipient = Wallet.createRandom()

        const oldBalance = await aaProvider.getBalance(await randomRecipient.getAddress())
        // transfer eth to recipient
        await aaProvider.getSigner().transferAllAssets(await randomRecipient.getAddress(), [
          {
            assetType: AssetType.ETH,
            amount: ethers.utils.parseEther("1")
          }
        ]).then(async x => await x.wait())
        const newBalance = await aaProvider.getBalance(await randomRecipient.getAddress())
        expect(newBalance).to.equal(oldBalance.add(ethers.utils.parseEther("1")))
      })

      it("should be able to transfer erc20", async () => {
        const erc20 = await new MockERC20__factory(signer).deploy("Mock", "MOCK")
        await erc20.mint(await aaProvider.getSigner().getAddress(), ethers.utils.parseEther("1"))
        const randomRecipient = Wallet.createRandom()

        const oldBalance = await erc20.balanceOf(await randomRecipient.getAddress())
        await aaProvider.getSigner().transferAllAssets(await randomRecipient.getAddress(), [
          {
            assetType: AssetType.ERC20,
            address: erc20.address,
            amount: ethers.utils.parseEther("1")
          }
        ]).then(async x => await x.wait())
        const newBalance = await erc20.balanceOf(await randomRecipient.getAddress())
        expect(newBalance).to.equal(oldBalance.add(ethers.utils.parseEther("1")))
      })

      it("should be able to transfer erc721", async () => {
        const erc721 = await new MockERC721__factory(signer).deploy("Mock", "MOCK")
        const tokenId = 100;
        await erc721.mint(await aaProvider.getSigner().getAddress(), tokenId)
        const randomRecipient = Wallet.createRandom()

        const oldBalance = await erc721.balanceOf(await randomRecipient.getAddress());
        await aaProvider.getSigner().transferAllAssets(await randomRecipient.getAddress(), [
          {
            assetType: AssetType.ERC721,
            address: erc721.address,
            tokenId: tokenId
          }
        ]).then(async x => await x.wait())
        const newBalance = await erc721.balanceOf(await randomRecipient.getAddress());
        expect(newBalance).to.equal(oldBalance.add(1))
      })

      it("should be able to transfer erc1155", async () => {
        const erc1155 = await new MockERC1155__factory(signer).deploy("")
        const tokenId = 100;
        await erc1155.mint(await aaProvider.getSigner().getAddress(), tokenId, 1)
        const randomRecipient = Wallet.createRandom()
        const oldBalance = await erc1155.balanceOf(await randomRecipient.getAddress(), tokenId);
        await aaProvider.getSigner().transferAllAssets(await randomRecipient.getAddress(), [
          {
            assetType: AssetType.ERC1155,
            address: erc1155.address,
            tokenId: tokenId,
            amount: 1
          }
        ]).then(async x => await x.wait())
        const newBalance = await erc1155.balanceOf(await randomRecipient.getAddress(), tokenId);
        expect(newBalance).to.equal(oldBalance.add(1))
      })

      it("should be able to transfer multiple assets", async () => {
        const erc20 = await new MockERC20__factory(signer).deploy("Mock", "MOCK")
        await erc20.mint(await aaProvider.getSigner().getAddress(), ethers.utils.parseEther("1"))
        const erc721 = await new MockERC721__factory(signer).deploy("Mock", "MOCK")
        const tokenId = 100;
        await erc721.mint(await aaProvider.getSigner().getAddress(), tokenId)
        const erc1155 = await new MockERC1155__factory(signer).deploy("")
        await erc1155.mint(await aaProvider.getSigner().getAddress(), tokenId, 1)

        await signer.sendTransaction({
          to: await aaProvider.getSigner().getAddress(),
          value: ethers.utils.parseEther("1")
        })
        const randomRecipient = Wallet.createRandom()

        const oldEthBalance = await aaProvider.getBalance(await randomRecipient.getAddress())
        const oldBalanceERC20 = await erc20.balanceOf(await randomRecipient.getAddress())
        const oldBalanceERC721 = await erc721.balanceOf(await randomRecipient.getAddress())
        const oldBalanceERC1155 = await erc1155.balanceOf(await randomRecipient.getAddress(), tokenId)
        await aaProvider.getSigner().transferAllAssets(await randomRecipient.getAddress(), [
          {
            assetType: AssetType.ETH,
            amount: ethers.utils.parseEther("1")
          },
          {
            assetType: AssetType.ERC20,
            address: erc20.address,
            amount: ethers.utils.parseEther("1")
          },
          {
            assetType: AssetType.ERC721,
            address: erc721.address,
            tokenId: tokenId
          },
          {
            assetType: AssetType.ERC1155,
            address: erc1155.address,
            tokenId: tokenId,
            amount: 1
          }
        ]).then(async x => await x.wait())
        const newEthBalance = await aaProvider.getBalance(await randomRecipient.getAddress())
        const newBalanceERC20 = await erc20.balanceOf(await randomRecipient.getAddress())
        const newBalanceERC721 = await erc721.balanceOf(await randomRecipient.getAddress());
        const newBalanceERC1155 = await erc1155.balanceOf(await randomRecipient.getAddress(), tokenId);
        expect(newEthBalance).to.equal(oldEthBalance.add(ethers.utils.parseEther("1")))
        expect(newBalanceERC20).to.equal(oldBalanceERC20.add(ethers.utils.parseEther("1")))
        expect(newBalanceERC721).to.equal(oldBalanceERC721.add(1))
        expect(newBalanceERC1155).to.equal(oldBalanceERC1155.add(1))
      })
    })

    // context('#transferOwnership', () => {
    //   it('should transfer ownership', async () => {
    //     const newOwner = Wallet.createRandom()
    //     const newOwnerAddr = await newOwner.getAddress()
    //     await aaProvider.getSigner().transferOwnership(newOwnerAddr)
    //     expect(
    //       await ZeroDevPluginSafe__factory.connect(
    //         await aaProvider.getSigner().getAddress(),
    //         aaProvider
    //       ).isOwner(await aaProvider.originalSigner.getAddress())
    //     ).to.equal(false);
    //     expect(
    //       await ZeroDevPluginSafe__factory.connect(
    //         await aaProvider.getSigner().getAddress(),
    //         aaProvider
    //       ).isOwner(newOwnerAddr)
    //     ).to.equal(true);
    //   })
    // })
  })
})