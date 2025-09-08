import { InvalidRequestError } from '../../../types/errors'
import { HandlerContextWithPath } from '../../../types'
import { validate } from '../../../logic/utils'
import { IHttpServerComponent } from '@well-known-components/interfaces'
import { getPaginationParams } from '@dcl/platform-server-commons'

export async function listSceneBansAddressesHandler(
  ctx: Pick<
    HandlerContextWithPath<'fetch' | 'sceneBans' | 'config', '/scene-bans/addresses'>,
    'components' | 'request' | 'verification' | 'url' | 'params'
  >
): Promise<IHttpServerComponent.IResponse> {
  const {
    components: { sceneBans },
    verification,
    url
  } = ctx

  if (!verification?.auth) {
    throw new InvalidRequestError('Authentication required')
  }

  const {
    sceneId,
    parcel,
    realm: { serverName: realmName },
    isWorld: isWorld
  } = await validate(ctx)
  const authenticatedAddress = verification.auth

  // Get pagination parameters from URL
  const paginationParams = getPaginationParams(url.searchParams)
  const page = Math.max(1, Math.floor(paginationParams.offset / paginationParams.limit) + 1)

  // Get the data and total count from the scene bans component
  const result = await sceneBans.listSceneBannedAddresses(authenticatedAddress, {
    sceneId,
    parcel,
    realmName,
    isWorld,
    page,
    limit: paginationParams.limit
  })

  const pages = Math.ceil(result.total / paginationParams.limit)

  // Return paginated response
  return {
    status: 200,
    body: {
      data: result.addresses,
      total: result.total,
      page,
      pages,
      limit: paginationParams.limit
    }
  }
}
