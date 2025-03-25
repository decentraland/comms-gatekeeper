import { IHttpServerComponent } from '@well-known-components/interfaces'
import { NotFoundError } from '../../types/errors'

export async function muteHandler(): Promise<IHttpServerComponent.IResponse> {
  throw new NotFoundError('Deprecated endpoint')
}
