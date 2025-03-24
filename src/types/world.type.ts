import { IBaseComponent } from '@well-known-components/interfaces'

export type IWorldComponent = IBaseComponent & {
  hasWorldOwnerPermission(authAddress: string, worldName: string): Promise<boolean>
  hasWorldStreamingPermission(authAddress: string, worldName: string): Promise<boolean>
}
