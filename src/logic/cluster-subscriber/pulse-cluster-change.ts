import _m0 from 'protobufjs/minimal'

/**
 * `decentraland.pulse.PeerClusterChange` with the session fields Pulse publishes since the
 * duplicate-session fix. Field numbers and wire types follow `pulse_clusters.proto` exactly:
 * 1 cluster_id, 2 realm, 3 session, 4 displaced_session, 5 displaced_cluster_id, all strings.
 *
 * A local codec rather than the generated one because the pinned `@dcl/protocol` build predates
 * fields 3–5. Delete this file and import the generated type once the pin carries them.
 */
export type PulseClusterChange = {
  clusterId: string
  realm: string
  /** Lower-cased ephemeral address of the session that owns this assignment; '' from an older Pulse. */
  session: string
  /** Session displaced by this one, and the cluster it was last published into; '' when none. */
  displacedSession: string
  displacedClusterId: string
}

export function decodePulseClusterChange(data: Uint8Array): PulseClusterChange {
  const reader = _m0.Reader.create(data)
  const end = reader.len
  const message: PulseClusterChange = {
    clusterId: '',
    realm: '',
    session: '',
    displacedSession: '',
    displacedClusterId: ''
  }

  while (reader.pos < end) {
    const tag = reader.uint32()
    switch (tag >>> 3) {
      case 1:
        if (tag !== 10) break
        message.clusterId = reader.string()
        continue
      case 2:
        if (tag !== 18) break
        message.realm = reader.string()
        continue
      case 3:
        if (tag !== 26) break
        message.session = reader.string()
        continue
      case 4:
        if (tag !== 34) break
        message.displacedSession = reader.string()
        continue
      case 5:
        if (tag !== 42) break
        message.displacedClusterId = reader.string()
        continue
    }
    if ((tag & 7) === 4 || tag === 0) break
    reader.skipType(tag & 7)
  }

  return message
}

export function encodePulseClusterChange(message: Partial<PulseClusterChange>): Uint8Array {
  const writer = _m0.Writer.create()
  if (message.clusterId) writer.uint32(10).string(message.clusterId)
  if (message.realm) writer.uint32(18).string(message.realm)
  if (message.session) writer.uint32(26).string(message.session)
  if (message.displacedSession) writer.uint32(34).string(message.displacedSession)
  if (message.displacedClusterId) writer.uint32(42).string(message.displacedClusterId)
  // `Writer.create()` hands back a Node-Buffer-backed writer whenever Buffer is available, so
  // `finish()` returns a Buffer rather than a plain Uint8Array. Copied out here so the runtime
  // type actually matches the declared one: a caller (or a `toEqual` against a literal
  // Uint8Array) should not have to know which writer implementation protobufjs picked.
  return new Uint8Array(writer.finish())
}
