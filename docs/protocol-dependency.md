# Takeover protocol dependency

Gatekeeper pins the exact npm release from [protocol #498](https://github.com/decentraland/protocol/pull/498),
merged into main. The [protocol contract](https://github.com/decentraland/protocol/blob/8d2c0848004ff8f54c36dc015aeb3497c4d0959e/docs/pulse-room-recovery.md)
defines retained pending takeovers and their completion event.

| Evidence | Value |
| --- | --- |
| Release CI | [38388253132](https://github.com/decentraland/protocol/actions/runs/38388253132) |
| Package version | `1.0.0-38388253132.commit-8d2c084` |
| Signed main commit | `8d2c0848004ff8f54c36dc015aeb3497c4d0959e` |
| Archive SHA256 | `b11eb9da57435d383f4c6657ea4f0d36c22de70804f7df1159908c0ead11d50a` |

The released schema and generated TypeScript, JavaScript and declarations match the reviewed
candidate after normalizing line endings. The lockfile enforces the registry's SHA-512 integrity.
Validate dependency updates with a frozen install and the full consumer suite.

Activation requires the [Pulse-first maintenance procedure](room-recovery-operations.md#activation-and-rollback),
restricted completion publishing and actual Cloud cutoff/clock acceptance.
There is no bootstrap message or database migration in the simplified implementation.
