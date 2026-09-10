import { PeerClusterChange } from '@dcl/protocol/out-js/decentraland/pulse/pulse_clusters.gen'
import {
  decodePulseClusterChange,
  encodePulseClusterChange
} from '../../../src/logic/cluster-subscriber/pulse-cluster-change'

// Hand-assembled from the proto: field 1 "C1", 2 "main", 3 "0xaa", 4 "0xbb", 5 "C9", each a
// length-delimited string (wire type 2), so tag = (field << 3) | 2.
const GOLDEN = Uint8Array.from([
  0x0a, 0x02, 0x43, 0x31, 0x12, 0x04, 0x6d, 0x61, 0x69, 0x6e, 0x1a, 0x04, 0x30, 0x78, 0x61, 0x61, 0x22, 0x04, 0x30,
  0x78, 0x62, 0x62, 0x2a, 0x02, 0x43, 0x39
])

describe('PeerClusterChange codec', () => {
  describe('when decoding the golden bytes', () => {
    it('should read all five fields', () => {
      expect(decodePulseClusterChange(GOLDEN)).toEqual({
        clusterId: 'C1',
        realm: 'main',
        session: '0xaa',
        displacedSession: '0xbb',
        displacedClusterId: 'C9'
      })
    })
  })

  describe('when encoding', () => {
    it('should produce the golden bytes', () => {
      expect(
        encodePulseClusterChange({
          clusterId: 'C1',
          realm: 'main',
          session: '0xaa',
          displacedSession: '0xbb',
          displacedClusterId: 'C9'
        })
      ).toEqual(GOLDEN)
    })

    it('should omit empty fields, matching proto3 defaults', () => {
      const bytes = encodePulseClusterChange({ clusterId: 'C1', realm: 'main' })

      // Normalized to Uint8Array on both sides: the generated encoder's `finish()` returns a
      // Node Buffer, and jest's toEqual treats a Buffer and a plain Uint8Array of the same
      // bytes as unequal because their constructors differ.
      expect(bytes).toEqual(new Uint8Array(PeerClusterChange.encode({ clusterId: 'C1', realm: 'main' }).finish()))
    })
  })

  describe('when interoperating with the generated two-field type', () => {
    it('should let the generated decoder read fields 1 and 2 and skip the rest', () => {
      expect(PeerClusterChange.decode(GOLDEN)).toEqual({ clusterId: 'C1', realm: 'main' })
    })

    it('should decode a generated two-field message with empty session fields', () => {
      const bytes = PeerClusterChange.encode({ clusterId: 'C4', realm: 'main' }).finish()

      expect(decodePulseClusterChange(bytes)).toEqual({
        clusterId: 'C4',
        realm: 'main',
        session: '',
        displacedSession: '',
        displacedClusterId: ''
      })
    })
  })
})
