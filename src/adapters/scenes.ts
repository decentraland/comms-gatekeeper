import { AdminWithName } from "../logic/scenes-service";
import { SceneAdmin } from "../types";

export function createScenesAdapterComponent() {
    function aggregateAdminsNames(context: { getNames: Record<string, string>, getAdmins: SceneAdmin[], getExtraAddresses: string[] }): AdminWithName[] {
        const { getNames, getAdmins, getExtraAddresses } = context

        const adminsArray = Array.from(getAdmins) as SceneAdmin[]

        return adminsArray.map((admin) => ({
            ...admin,
            name: getNames[admin.admin] || '',
            canBeRemoved: !getExtraAddresses.includes(admin.admin)
        }))
    }

    function aggregateExtraAdminsNames(context: { getNames: Record<string, string>, getExtraAddresses: string[] }): AdminWithName[] {
        const { getNames, getExtraAddresses } = context

        return getExtraAddresses.map((address) => ({
            admin: address,
            name: getNames[address] || '',
            canBeRemoved: false
        }))
    }

    return {
        aggregateAdminsNames,
        aggregateExtraAdminsNames
    }
}