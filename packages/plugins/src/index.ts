


class PolicySessionKeyPlugin {
}

async function getSessionNonce (
    plugin: ZeroDevSessionKeyPlugin,
    sender: string,
    sessionKey: Signer
  ): Promise<number> {
    return await ZeroDevPluginSafe__factory.connect(sender, plugin.provider).callStatic
        .queryPlugin(plugin.address, plugin.interface.encodeFunctionData('sessionNonce', [await sessionKey.getAddress()]))
        .catch(e => {
            if (e.errorName !== 'QueryResult') {
                throw e
            }
            return e.errorArgs.result
        })
}
  
async function approvePlugin (
    owner: Signer,
    userOp: Partial<UserOperation>,
    validUntil: number,
    validAfter: number,
    pluginAddress: string,
    data: string,
    entryPoint?: EntryPoint
): Promise<UserOperation> {
    const op = await fillAndSign(userOp, owner, entryPoint)
    const provider = entryPoint?.provider
    const domain = {
        name: 'ZeroDevPluginSafe',
        version: '1.0.0',
        verifyingContract: userOp.sender,
        chainId: (await provider!.getNetwork()).chainId
    }
    const value = {
        sender: userOp.sender,
        validUntil: validUntil,
        validAfter: validAfter,
        plugin: pluginAddress,
        data: data
    }
    const userSig = await owner._signTypedData(
        domain,
        {
        ValidateUserOpPlugin: [
            { name: 'sender', type: 'address' },
            { name: 'validUntil', type: 'uint48' },
            { name: 'validAfter', type: 'uint48' },
            { name: 'plugin', type: 'address' },
            { name: 'data', type: 'bytes' }
        ]
        },
        value
    )

    const signature = hexConcat([
        hexZeroPad(pluginAddress, 20),
        hexZeroPad(validUntil, 6),
        hexZeroPad(validAfter, 6),
        userSig
    ])
    return {
        ...op,
        nonce: 0,
        signature: signature
    }
}
  
async function signUserOpWithSessionKey (
    userOp: UserOperation,
    sessionKey: Signer,
    plugin: ZeroDevSessionKeyPlugin,
    policy: FunctionSignaturePolicy,
    entryPoint?: EntryPoint
): Promise<UserOperation> {
    const op = await fillUserOp(userOp, entryPoint)
    const provider = entryPoint?.provider
    const chainId = await provider!.getNetwork().then(net => net.chainId)
    const opHash = await getUserOpHash(op, entryPoint!.address, chainId)
    const sessionDomain = {
        name: 'ZeroDevSessionKeyPlugin',
        version: '1.0.0',
        verifyingContract: userOp.sender,
        chainId: chainId
    }
  
    const nonce = await getSessionNonce(plugin, userOp.sender!, sessionKey)
    const sessionKeySig = await sessionKey._signTypedData(
      sessionDomain,
      {
        Session: [
          { name: 'userOpHash', type: 'bytes32' },
          { name: 'nonce', type: 'uint256' }
        ]
      },
      {
        userOpHash: opHash,
        nonce: nonce // await plugin.sessionNonce(await sessionKey.getAddress())
      }
    )

    return {
        ...op,
        signature: hexConcat([
            op.signature,
            ethers.utils.defaultAbiCoder.encode(['bytes', 'bytes'], [
                hexConcat([hexZeroPad(await sessionKey.getAddress(), 20), hexZeroPad(policy.address, 20)]),
                sessionKeySig
            ])
        ])
    }
}
  