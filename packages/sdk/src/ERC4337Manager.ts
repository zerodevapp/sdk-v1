import { ERC4337EthersSigner } from "./ERC4337EthersSigner";
import { ERC4337EthersProvider } from "./ERC4337EthersProvider";
import { GnosisSafeAccountFactory, GnosisSafeAccountFactory__factory, UserOperationStruct } from "@zerodevapp/contracts";
import { GnosisSafe, GnosisSafe__factory } from "@zerodevapp/contracts";
import { EIP4337Manager, EIP4337Manager__factory } from "@zerodevapp/contracts";
import { ACCOUNT_FACTORY_ADDRESS, ENTRYPOINT_ADDRESS } from "./zerodev/constants";
import { Call } from "./batch";

interface ERC4337UpdateInfo {
    updateAvailable : boolean,
    prev : string,
    current : string,
    newManager : string
}

export async function checkERC4337Update(erc4337provider : ERC4337EthersProvider, sender : string, latestManagerAddress : string) : Promise<ERC4337UpdateInfo>{
    const manager = EIP4337Manager__factory.connect(latestManagerAddress, erc4337provider); // get manager address from factory
    const proxyContract = GnosisSafe__factory.connect(sender, erc4337provider);
    const res = await manager.getCurrentEIP4337Manager(proxyContract.address);
    if (res[1] != latestManagerAddress) {
        // need update
        return {
            updateAvailable : true,
            prev : res[0],
            current : res[1],
            newManager : latestManagerAddress
        }
    } else {
        // no need update
        return {
            updateAvailable : false,
            prev : res[0],
            current : res[1],
            newManager : latestManagerAddress
        }
    }
}

export function encodeERC4337ManagerUpdateCall(erc4337provider : ERC4337EthersProvider, prev: string, current: string, newManager: string) : Call{
    const manager =EIP4337Manager__factory.connect(current, erc4337provider); // get manager address from factory
    const data = manager.interface.encodeFunctionData("replaceEIP4337Manager", [prev, current, newManager]);
    return {
        to: manager.address,
        data: data,
        delegateCall: true,
        value: 0
    }
}
