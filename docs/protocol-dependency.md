# Takeover protocol dependency

Gatekeeper pins the CI artifact from [protocol #498](https://github.com/decentraland/protocol/pull/498).
It carries retained pending takeovers and the completion event described in the
[protocol contract](https://github.com/decentraland/protocol/blob/feat/pulse-room-recovery/docs/pulse-room-recovery.md).

| Evidence | Value |
| --- | --- |
| CI run | [38237049328](https://github.com/decentraland/protocol/actions/runs/38237049328) |
| Package version | `1.0.0-38237049328.commit-e2f9e48` |
| Source PR head | `5ce0df947bc7d48c60449f5bad9cebf4c532d557` |
| CI merge commit | `e2f9e485a0b51cff160c297e627eb6ab05f9ba65` |
| Archive SHA256 | `be2412bd4f8de47334a55825c1799be8548f56418277c80853eca6fa7479f159` |
| Wire checks | Nine passed; schema lint/build/released-main compatibility passed |

The published schema and generated TypeScript, JavaScript and declarations match the reviewed
source after normalizing line endings. `package.json` and `yarn.lock` pin the exact archive;
validation uses a frozen install and the full consumer suite.

Production activation still requires the reviewed main-release artifact, coordinated backend
activation, restricted completion publishing and actual Cloud cutoff/clock acceptance.
There is no bootstrap message or database migration in the simplified implementation.
