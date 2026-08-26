import { InvalidRequestError } from '../../../types/errors'
import type { ILivekitComponent } from '../../../types/livekit.type'
import type { IWorldComponent } from '../../../types/worlds.type'

export async function resolveCastRoom(
  components: { livekit: ILivekitComponent; worlds: IWorldComponent },
  auth: { sceneId?: string; parcel?: string; realmName: string; isWorld: boolean }
): Promise<{ roomId: string; sceneId: string }> {
  if (!auth.sceneId) throw new InvalidRequestError('sceneId is required in authMetadata')

  let sceneId = auth.sceneId
  if (auth.isWorld) {
    if (!auth.parcel) throw new InvalidRequestError('parcel is required in authMetadata for a world scene')
    sceneId = await components.worlds.fetchWorldSceneId(auth.realmName, auth.parcel)
  }

  return {
    sceneId,
    roomId: auth.isWorld
      ? components.livekit.getWorldSceneRoomName(auth.realmName, sceneId)
      : components.livekit.getSceneRoomName(auth.realmName, sceneId)
  }
}
