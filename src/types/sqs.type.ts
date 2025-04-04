import { Message } from '@aws-sdk/client-sqs'
import { IBaseComponent } from '@well-known-components/interfaces'

export type QueueMessage = any

export type QueueComponent = {
  send(message: QueueMessage): Promise<void>
  receiveSingleMessage(): Promise<Message[]>
  deleteMessage(receiptHandle: string): Promise<void>
}

export type MessageConsumerComponent = IBaseComponent

export type MessageProcessorResult = {
  ok: boolean
}

export type MessageProcessorComponent = {
  process(message: any): Promise<MessageProcessorResult>
}

export type EventHandlerResult = {
  ok: boolean
  errors?: string[]
}

export type EventHandlerComponent<T> = {
  handle(event: T): Promise<EventHandlerResult>
  canHandle(event: T): boolean
}

export type RetryMessageData = {
  attempt: number
}
