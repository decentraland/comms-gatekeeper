import { IHttpServerComponent } from '@well-known-components/interfaces'
import { InvalidRequestError } from '../../types'

export async function muteHandler(): Promise<IHttpServerComponent.IResponse> {
  throw new InvalidRequestError('Deprecated endpoint')
}
