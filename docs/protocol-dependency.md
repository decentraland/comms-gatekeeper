# Room recovery protocol dependency

This PR pins the exact artifact published by
[protocol #498 CI](https://github.com/decentraland/protocol/actions/runs/37907573378).
It is a CI prerelease, served from the protocol project's CDN rather than the npm registry.

| Evidence | Value |
| --- | --- |
| Package version | `1.0.0-37907573378.commit-c4acba0` |
| CI merge commit | `c4acba0921073fd71006e953b5cc4efce91497cd` |
| Protocol PR head | `1e8a96749eb7696cd0ad173e0da615859b8589b9` |
| Archive SHA256 | `c2d21ff388e51ab753ac1381ef8991356d852c88840e01dcd5097b1650549f11` |

The archive's room-recovery schema matches the tested source after CRLF/LF normalization;
the generated TypeScript, JavaScript and declarations match the tested generation. Its version
and archive hash differ from the earlier local candidate. `yarn.lock` pins the published bytes.
No local archive or unpublished registry version is required to build this PR.

For field semantics and consumer rules, read the
[protocol contract](https://github.com/decentraland/protocol/blob/feat/pulse-room-recovery/docs/pulse-room-recovery.md).
Promote the dependency to the reviewed main-release artifact after protocol #498 merges and
revalidate the install. Coordinated backend activation, broker permissions, bootstrap and
actual Cloud cutoff/clock acceptance remain deployment requirements.
