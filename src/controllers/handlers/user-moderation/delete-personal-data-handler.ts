import { IHttpServerComponent } from '@well-known-components/interfaces'
import { HandlerContextWithPath } from '../../../types'

/**
 * GDPR Right to Erasure (Art. 17) handler.
 *
 * Deletes connection logs for the given wallet address. Connection logs contain
 * IP addresses linked to the wallet which are PII under GDPR; their legal basis
 * is purpose limitation / consent and they must be erasable on request.
 *
 * Bans and warnings are NOT deleted: these are moderation records retained under
 * the legitimate interest basis (GDPR Art. 6(1)(f)) for platform safety.
 */
export async function deletePersonalDataHandler(
  context: Pick<
    HandlerContextWithPath<'ipModeration' | 'logs', '/users/:address/personal-data'>,
    'components' | 'params'
  >
): Promise<IHttpServerComponent.IResponse> {
  const {
    components: { ipModeration, logs },
    params: { address }
  } = context

  const logger = logs.getLogger('delete-personal-data-handler')

  try {
    const deletedConnectionLogs = await ipModeration.deleteConnectionLogsByAddress(address)

    return {
      status: 200,
      body: {
        data: {
          deletedConnectionLogs,
          address: address.toLowerCase()
        }
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    logger.error(`Error deleting personal data for address ${address}: ${message}`)

    return {
      status: 500,
      body: {
        error: 'Internal Server Error'
      }
    }
  }
}
