export type AddSceneBanParams = {
  sceneId?: string
  realmName: string
  parcel?: string
  isWorlds: boolean
}

export interface ISceneBansComponent {
  /**
   * Adds a ban for a user from a scene with permission validation.
   * @param bannedAddress - The address of the user being banned.
   * @param bannedBy - The address of the user performing the ban.
   * @param params - The parameters for the ban.
   */
  addSceneBan(bannedAddress: string, bannedBy: string, params: AddSceneBanParams): Promise<void>
}
