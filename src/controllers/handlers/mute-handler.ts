import { IHttpServerComponent } from '@dcl/core-commons'
import { NotFoundError } from '../../types/errors'

export async function muteHandler(): Promise<IHttpServerComponent.IResponse> {
  throw new NotFoundError('Deprecated endpoint')
}
