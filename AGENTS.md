# AI Agent Instructions

## Project Context

See [docs/ai-agent-context.md](docs/ai-agent-context.md) for service architecture, tech stack, key concepts, and API surface.

For broader Decentraland contributor guidelines, see <https://docs.decentraland.org/llms.txt>

## Skills

This project uses skills from [decentraland/ai-toolkit](https://github.com/decentraland/ai-toolkit). Load the relevant skill **before** making changes:

| Skill | When to load |
|---|---|
| `dcl-testing` | Writing, modifying, or reviewing `*.spec.ts` / `*.test.ts` files |
| `dcl-wkc-components` | Working on files in `src/components.ts`, `src/adapters/`, `src/logic/`, `src/controllers/`, `src/types/`, or any file importing from `@well-known-components` |

## Engineering Rules

Each of these shipped wrong here at least once and was corrected in review.

- **Re-check authorization at the point of use.** A decision cached behind a TTL alone outlives the ban that should have stopped it. If you cache one, invalidate it on the moderation change, and re-read the guard after every `await` on the path — a verdict computed before an `await` may be stale by the time it is used.
- **Make every fail-open path increment a counter.** A let-through has to be visible on a dashboard, not only in a log line.
- **A weakened security property is the user's call.** Raise the cost and let them choose; a comment justifying the weakness is not approval.
- **Treat connection strings as credentials.** `NATS_URL` and its kind carry user-info — log the target as host and port.
- **Move a comment longer than the code it explains into [docs/ai-agent-context.md](docs/ai-agent-context.md), leaving a one-line pointer.** Rationale that outgrows its function has outgrown the file.
- **Advance time in tests with `jest.spyOn(performance, 'now')`; never `await` a real delay.** `lru-cache` captured its `performance` reference at import, so `jest.useFakeTimers()` misses it and the spy reaches it. A test that sleeps is a test that flakes — treat an existing sleep as a defect to remove.
- **Before adding a store, cache, or lookup, confirm it does not already exist.** `@dcl/memory-cache-component` already wraps `lru-cache`, and the component you are about to call may already do the lookup you are about to repeat.
- **Treat a review follow-up as work.** Implement it in the change that raised it, or agree explicitly to defer it.

## Git Hooks

Pre-commit and pre-push hooks are enforced via `simple-git-hooks` + `nano-staged`:

- **Pre-commit**: Runs `eslint` and `prettier --check` on staged `*.{js,ts}` files
- **Pre-push**: Runs `yarn typecheck && yarn test`

Fix lint issues before committing: `yarn lint:fix`

## Testing

- **Unit tests** (`test/unit/`): Required for all business logic components
- **Integration tests** (`test/integration/`): Required for all DB adapters and HTTP endpoints
- Load the `dcl-testing` skill for full testing standards

## Development Commands

| Task | Command |
|---|---|
| Install dependencies | `yarn install` |
| Build | `yarn build` |
| Run dev server | `yarn dev` |
| Run all tests | `yarn test` |
| Run unit tests | `yarn test test/unit` |
| Run integration tests | `yarn test test/integration` |
| Lint (check) | `yarn lint:check` |
| Lint (fix) | `yarn lint:fix` |
| Format (check) | `yarn format:check` |
| Format (fix) | `yarn format:fix` |
| Type check | `yarn typecheck` |
| Create migration | `yarn migrate create <name>` |
| Run migrations | `yarn migrate up` |
