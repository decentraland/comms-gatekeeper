import { DeploymentToSqs } from '@dcl/schemas/dist/misc/deployments-to-sqs'
import { AppComponents } from '../../types'
import { EventHandlerComponent, EventHandlerResult } from '../../types/sqs.type'

export function createStatusEventHandler({
  logs
}: Pick<AppComponents, 'logs'>): EventHandlerComponent<DeploymentToSqs> {
  const logger = logs.getLogger('status-handler')

  function getEventProperties(event: any) {
    let entityId: string = ''

    const deploymentEvent = event as DeploymentToSqs

    entityId = deploymentEvent.entity.entityId

    return {
      entityId
    }
  }

  return {
    handle: async (event: DeploymentToSqs): Promise<EventHandlerResult> => {
      try {
        const { entityId } = getEventProperties(event)

        logger.info('Processing status', { entityId })

        return { ok: true }
      } catch (error: any) {
        logger.error('Failed to process', {
          error: error?.message || 'Unexpected processor failure',
          stack: JSON.stringify(error?.stack)
        })

        return { ok: false, errors: [error?.message || 'Unexpected processor failure'] }
      }
    },
    canHandle: (event: any): boolean => {
      DeploymentToSqs.validate(event)

      return !DeploymentToSqs.validate.errors
    }
  }
}
