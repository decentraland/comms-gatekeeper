import { IBaseComponent } from '@well-known-components/interfaces'
import { PlaceSummary } from './places.type'
import { SceneAdmin } from '../types'

export type ISceneAdmins = IBaseComponent & {
  getAdminsAndExtraAddresses: (
    place: PlaceSummary,
    admin?: string
  ) => Promise<{
    admins: Set<SceneAdmin>
    extraAddresses: Set<string>
    addresses: Set<string>
  }>
}
