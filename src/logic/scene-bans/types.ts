import { SceneBanAddressWithName } from '../../types'

export type AddSceneBanParams = {
  sceneId?: string
  realmName: string
  parcel: string
  isWorld: boolean
}

export type RemoveSceneBanParams = {
  sceneId?: string
  realmName: string
  parcel: string
  isWorld: boolean
}

export type ListSceneBansParams = {
  sceneId?: string
  realmName: string
  parcel: string
  isWorld: boolean
}

export interface ISceneBansComponent {
  /**
   * Adds a ban for a user from a scene with permission validation.
   * @param bannedAddress - The address of the user being banned.
   * @param bannedBy - The address of the user performing the ban.
   * @param params - The parameters for the ban.
   */
  addSceneBan(bannedAddress: string, bannedBy: string, params: AddSceneBanParams): Promise<void>

  /**
   * Removes a ban for a user from a scene with permission validation.
   * @param bannedAddress - The address of the user being unbanned.
   * @param unbannedBy - The address of the user performing the unban.
   * @param params - The parameters for the unban.
   */
  removeSceneBan(bannedAddress: string, unbannedBy: string, params: RemoveSceneBanParams): Promise<void>

  /**
   * Lists all bans for a scene with permission validation.
   * @param requestedBy - The address of the user requesting the list.
   * @param params - The parameters for the list.
   */
  listSceneBans(requestedBy: string, params: ListSceneBansParams): Promise<SceneBanAddressWithName[]>

  /**
   * Lists only the banned addresses for a scene with permission validation.
   * @param requestedBy - The address of the user requesting the list.
   * @param params - The parameters for the list.
   */
  listSceneBannedAddresses(requestedBy: string, params: ListSceneBansParams): Promise<string[]>
}
