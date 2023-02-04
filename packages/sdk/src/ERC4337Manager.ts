import { ERC4337EthersSigner } from "./ERC4337EthersSigner";
import { ERC4337EthersProvider } from "./ERC4337EthersProvider";
import { GnosisSafeAccountFactory, GnosisSafeAccountFactory__factory, UserOperationStruct } from "@zerodevapp/contracts";
import { GnosisSafe, GnosisSafe__factory } from "@zerodevapp/contracts";
import { EIP4337Manager, EIP4337Manager__factory } from "@zerodevapp/contracts";
import { ACCOUNT_FACTORY_ADDRESS, ENTRYPOINT_ADDRESS } from "./zerodev/constants";
import { Call } from "./batch";

interface ERC4337UpdateInfo {
    needUpdate : boolean,
    prev : string,
    current : string,
    newManager : string
}

export class ERC4337Manager {
    factoryAddress: string

    constructor(
        readonly erc4337provider: ERC4337EthersProvider,
        readonly erc4337signer: ERC4337EthersSigner,
        factoryAddress?: string
    ) {
        this.factoryAddress = factoryAddress == null ? ACCOUNT_FACTORY_ADDRESS : factoryAddress;
    }

    async checkERC4337Update() : Promise<ERC4337UpdateInfo>{
        const factory = GnosisSafeAccountFactory__factory.connect(this.factoryAddress, this.erc4337signer);
        const manager =EIP4337Manager__factory.connect(await factory.callStatic.eip4337Manager(), this.erc4337signer); // get manager address from factory
        const proxyContract = GnosisSafe__factory.connect(await this.erc4337signer.getAddress(), this.erc4337signer);
        const res = await manager.getCurrentEIP4337Manager(proxyContract.address);
        if (res[1] != manager.address) {
            // need update
            return {
                needUpdate : true,
                prev : res[0],
                current : res[1],
                newManager : manager.address
            }
        } else {
            // no need update
            return {
                needUpdate : false,
                prev : res[0],
                current : res[1],
                newManager : manager.address
            }
        }
    }

    encodeUpdateCall(prev: string, current: string, newManager: string) : Call{
        const manager =EIP4337Manager__factory.connect(current, this.erc4337provider.originalProvider); // get manager address from factory
        const data = manager.interface.encodeFunctionData("replaceEIP4337Manager", [prev, current, newManager]);
        return {
            to: manager.address,
            data: data,
            delegateCall: true,
            value: 0
        }
    }
}