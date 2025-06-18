import { ISceneManager } from '../types/scene-manager.type'
import { ISceneAdmins } from '../types/scene.type'
import { PlaceAttributes } from '../types/places.type'
import { SceneAdmin } from '../types'

export type SceneServiceComponents = {
  sceneManager: ISceneManager
  sceneAdmins: ISceneAdmins
  names: {
    getNamesFromAddresses: (addresses: string[]) => Promise<Record<string, string>>
  }
}

export type AdminWithName = {
  id?: string
  place_id?: string
  admin: string
  added_by?: string
  created_at?: number
  active?: boolean
  name: string
  canBeRemoved: boolean
}

export function createSceneServiceComponent(components: SceneServiceComponents) {
  const { sceneManager, sceneAdmins, names, scenesAdapter } = components

  async function listSceneAdmins(
    place: PlaceAttributes,
    authenticatedAddress: string,
    adminFilter?: string
  ): Promise<AdminWithName[]> {
    const isOwnerOrAdmin = await sceneManager.isSceneOwnerOrAdmin(place, authenticatedAddress)

    if (!isOwnerOrAdmin) {
      throw new Error(`User ${authenticatedAddress} is not authorized to list administrators of entity ${place.id}`)
    }

    const allAddresses = await sceneAdmins.getAdminsAndExtraAddresses(place, adminFilter)
    const allNames = await names.getNamesFromAddresses(Array.from(allAddresses.addresses))

    const adminsArray = Array.from(allAddresses.admins) as SceneAdmin[]
    const extraAddressesArray = Array.from(allAddresses.extraAddresses) as string[]

    const adminsWithNames = scenesAdapter.aggregateAdminsNames({
      getNames: allNames,
      getAdmins: adminsArray,
      getExtraAddresses: extraAddressesArray
    })

    const extraAdminsWithNames = scenesAdapter.aggregateExtraAdminsNames({
      getNames: allNames,
      getExtraAddresses: extraAddressesArray
    })

    return [...adminsWithNames, ...extraAdminsWithNames]
  }

  return {
    listSceneAdmins
  }
}