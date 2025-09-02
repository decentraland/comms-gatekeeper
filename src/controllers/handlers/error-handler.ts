import { IHttpServerComponent } from '@well-known-components/interfaces'
import { NotAuthorizedError } from '@dcl/platform-server-commons'
import {
  InvalidRequestError,
  NotFoundError,
  PlaceNotFoundError,
  ServiceUnavailableError,
  StreamingAccessNotFoundError,
  UnauthorizedError,
  LandPermissionsNotFoundError,
  LivekitIngressNotFoundError
} from '../../types/errors'

export async function errorHandler(
  _ctx: IHttpServerComponent.DefaultContext<object>,
  next: () => Promise<IHttpServerComponent.IResponse>
): Promise<IHttpServerComponent.IResponse> {
  try {
    return await next()
  } catch (error: any) {
    if (error instanceof InvalidRequestError) {
      return {
        status: 400,
        body: {
          error: error.message
        }
      }
    }

    if (
      error instanceof NotFoundError ||
      error instanceof PlaceNotFoundError ||
      error instanceof StreamingAccessNotFoundError ||
      error instanceof LandPermissionsNotFoundError ||
      error instanceof LivekitIngressNotFoundError
    ) {
      return {
        status: 404,
        body: {
          error: error.message
        }
      }
    }

    if (error instanceof ServiceUnavailableError) {
      return {
        status: 503,
        body: {
          error: error.message
        }
      }
    }

    if (error instanceof UnauthorizedError || error instanceof NotAuthorizedError) {
      return {
        status: 401,
        body: {
          error: error.message
        }
      }
    }

    return {
      status: 500,
      body: {
        error: 'Internal Server Error'
      }
    }
  }
}
