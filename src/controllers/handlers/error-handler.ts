import { IHttpServerComponent } from '@well-known-components/interfaces'
import { NotAuthorizedError } from '@dcl/http-commons'
import {
  InvalidRequestError,
  NotFoundError,
  PlaceNotFoundError,
  ServiceUnavailableError,
  StreamingAccessNotFoundError,
  UnauthorizedError,
  LandPermissionsNotFoundError,
  LivekitIngressNotFoundError,
  ForbiddenError
} from '../../types/errors'
import { PlayerAlreadyBannedError, BanNotFoundError } from '../../logic/user-moderation/errors'
import {
  InvalidStreamingKeyError,
  ExpiredStreamingKeyError,
  NoActiveStreamError,
  NotSceneAdminError,
  ExpiredStreamAccessError
} from '../../logic/cast/errors'

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

    if (
      error instanceof UnauthorizedError ||
      error instanceof NotAuthorizedError ||
      error instanceof InvalidStreamingKeyError ||
      error instanceof ExpiredStreamingKeyError ||
      error instanceof NotSceneAdminError ||
      error instanceof ExpiredStreamAccessError
    ) {
      return {
        status: 401,
        body: {
          error: error.message
        }
      }
    }

    if (error instanceof NoActiveStreamError) {
      return {
        status: 404,
        body: {
          error: error.message
        }
      }
    }

    if (error instanceof ForbiddenError) {
      return {
        status: 403,
        body: {
          error: error.message
        }
      }
    }

    if (error instanceof PlayerAlreadyBannedError) {
      return {
        status: 409,
        body: {
          error: 'Conflict',
          message: error.message
        }
      }
    }

    if (error instanceof BanNotFoundError) {
      return {
        status: 404,
        body: {
          error: 'Not Found',
          message: error.message
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
