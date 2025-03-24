import { IHttpServerComponent } from '@well-known-components/interfaces'
import {
  InvalidRequestError,
  NotFoundError,
  PlaceNotFoundError,
  ServiceUnavailableError,
  StreamingAccessNotFoundError,
  UnauthorizedError
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
      error instanceof StreamingAccessNotFoundError
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

    if (error instanceof UnauthorizedError) {
      return {
        status: 401,
        body: {
          error: error.message
        }
      }
    }

    console.log(error)

    return {
      status: 500,
      body: {
        error: 'Internal Server Error'
      }
    }
  }
}
