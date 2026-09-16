import { IBaseComponent } from '@well-known-components/interfaces'

export type IClusterSubscriberComponent = IBaseComponent

/**
 * What the subscriber records in the assignment mirror for a wallet: the cluster and owning
 * session ('' from an older Pulse) of the assignment Pulse last published for it.
 */
export type MirrorEntry = { clusterId: string; session: string }
