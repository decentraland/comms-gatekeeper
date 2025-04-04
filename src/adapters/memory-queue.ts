import { Message } from '@aws-sdk/client-sqs'
import { randomUUID } from 'node:crypto'

import { QueueComponent, QueueMessage } from '../types/sqs.type'

export function createMemoryQueueAdapter(): QueueComponent {
  const queue: Map<string, Message> = new Map()

  async function send(message: QueueMessage): Promise<void> {
    const receiptHandle = randomUUID().toString()
    queue.set(receiptHandle, {
      MessageId: randomUUID().toString(),
      ReceiptHandle: receiptHandle,
      Body: JSON.stringify({ Message: JSON.stringify(message) })
    })

    return
  }

  async function receiveSingleMessage(): Promise<Message[]> {
    const message = queue.size > 0 ? queue.values().next().value : undefined
    return !!message ? [message] : []
  }

  async function deleteMessage(receiptHandle: string): Promise<void> {
    queue.delete(receiptHandle)
  }

  return { send, receiveSingleMessage, deleteMessage }
}
