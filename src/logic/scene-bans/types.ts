import { SceneBanAddressWithName } from '../../types'

type BasePayload = {
  bannedAddress?: string
  bannedName?: string
}

export type AddSceneBanPayload = BasePayload

export type RemoveSceneBanPayload = BasePayload

type BaseParams = {
  sceneId?: string
  realmName: string
  parcel: string
  isWorld: boolean
}

export type AddSceneBanParams = BaseParams

export type RemoveSceneBanParams = BaseParams

export type ListSceneBansParams = BaseParams & {
  page?: number
  limit?: number
}

export type IsUserBannedParams = BaseParams

export interface ISceneBansComponent {
  /**
   * Adds a ban for a user from a scene with permission validation.
   * @param payload - The payload containing the address or name of the user being banned.
   * @param bannedBy - The address of the user performing the ban.
   * @param params - The parameters for the ban.
   */
  addSceneBan(payload: AddSceneBanPayload, bannedBy: string, params: AddSceneBanParams): Promise<void>

  /**
   * Removes a ban for a user from a scene with permission validation.
   * @param payload - The payload containing the address or name of the user being unbanned.
   * @param unbannedBy - The address of the user performing the unban.
   * @param params - The parameters for the unban.
   */
  removeSceneBan(payload: RemoveSceneBanPayload, unbannedBy: string, params: RemoveSceneBanParams): Promise<void>

  /**
   * Lists all bans for a scene with permission validation.
   * @param requestedBy - The address of the user requesting the list.
   * @param params - The parameters for the list.
   */
  listSceneBans(
    requestedBy: string,
    params: ListSceneBansParams
  ): Promise<{ bans: SceneBanAddressWithName[]; total: number }>

  /**
   * Lists only the banned addresses for a scene with permission validation.
   * @param requestedBy - The address of the user requesting the list.
   * @param params - The parameters for the list.
   */
  listSceneBannedAddresses(
    requestedBy: string,
    params: ListSceneBansParams
  ): Promise<{ addresses: string[]; total: number }>

  /**
   * Checks if a user is banned from a scene.
   * @param address - The address of the user to check.
   * @param params - The parameters for the check.
   * @returns True if the user is banned, false otherwise.
   */
  isUserBanned(address: string, params: IsUserBannedParams): Promise<boolean>

  /**
   * Removes all bans for disabled places.
   * This function is designed to be called by a cron job to clean up bans for places that have been disabled.
   */
  removeBansFromDisabledPlaces(): Promise<void>
}
