import { PublishBatchCommand, SNSClient } from '@aws-sdk/client-sns'
// import { ConnectoToSceneEvent } from '@dcl/schemas' // TODO: implement this event

import { AppComponents, IPublisherComponent } from '../types'

function chunk<T>(theArray: T[], size: number): T[][] {
  return theArray.reduce((acc: T[][], _, i) => {
    if (i % size === 0) {
      acc.push(theArray.slice(i, i + size))
    }
    return acc
  }, [])
}

export async function createSnsComponent({ config }: Pick<AppComponents, 'config'>): Promise<IPublisherComponent> {
  // SNS PublishBatch can handle up to 10 messages in a single request
  const MAX_BATCH_SIZE = 10
  const snsArn = await config.requireString('AWS_SNS_ARN')
  const optionalEndpoint = await config.getString('AWS_SNS_ENDPOINT')

  const client = new SNSClient({
    endpoint: optionalEndpoint ? optionalEndpoint : undefined
  })

  async function publishMessages(events: any[]): Promise<{
    // TODO: fix this type
    successfulMessageIds: string[]
    failedEvents: any[] // TODO: fix this type
  }> {
    // split events into batches of 10
    const batches = chunk(events, MAX_BATCH_SIZE)

    const publishBatchPromises = batches.map(async (batch, batchIndex) => {
      const entries = batch.map((event, index) => {
        return {
          Id: `msg_${batchIndex * MAX_BATCH_SIZE + index}`,
          Message: JSON.stringify(event),
          MessageAttributes: {
            type: {
              DataType: 'String',
              StringValue: event.type
            },
            subType: {
              DataType: 'String',
              StringValue: event.subType
            }
          }
        }
      })

      const command = new PublishBatchCommand({
        TopicArn: snsArn,
        PublishBatchRequestEntries: entries
      })

      const { Successful, Failed } = await client.send(command)

      const successfulMessageIds: string[] = (Successful?.map((result) => result.MessageId).filter(
        (messageId: string | undefined) => messageId !== undefined
      ) || []) as string[]

      const failedEvents =
        Failed?.map((failure) => {
          const failedEntry = entries.find((entry) => entry.Id === failure.Id)
          const failedIndex = entries.indexOf(failedEntry!)
          return batch[failedIndex]
        }) || []

      return { successfulMessageIds, failedEvents }
    })

    const results = await Promise.all(publishBatchPromises)

    const successfulMessageIds = results.flatMap((result) => result.successfulMessageIds)
    const failedEvents = results.flatMap((result) => result.failedEvents)

    return { successfulMessageIds, failedEvents }
  }

  return { publishMessages }
}
