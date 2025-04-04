import { AppComponents } from '../types'
import {
  EventHandlerComponent,
  MessageProcessorComponent,
  MessageProcessorResult,
  EventHandlerResult,
  RetryMessageData
} from '../types/sqs.type'
import { DeploymentToSqs } from '@dcl/schemas/dist/misc/deployments-to-sqs'
import { createStatusEventHandler } from './handlers/status-handler'

export async function createMessageProcessorComponent({
  logs,
  config
}: Pick<AppComponents, 'logs' | 'config'>): Promise<MessageProcessorComponent> {
  const MAX_RETRIES: number = (await config.getNumber('MAX_RETRIES')) || 3
  const log = logs.getLogger('message-processor')

  const processor: EventHandlerComponent<DeploymentToSqs> = createStatusEventHandler({ logs })

  async function process(message: any): Promise<MessageProcessorResult> {
    const retryData: RetryMessageData = message.retry || {
      attempt: 0
    }

    if (retryData.attempt >= MAX_RETRIES) {
      log.warn('Max retries reached for the message, will not retry', { message })
      return {
        ok: true
      }
    }

    log.debug('Processing', { message })

    if (!processor.canHandle(message)) {
      log.warn('No handler found for the message, will not retry', { message })
      return {
        ok: true
      }
    }

    const result: EventHandlerResult = await processor.handle(message)

    return {
      ok: result.ok
    }
  }

  return { process }
}
