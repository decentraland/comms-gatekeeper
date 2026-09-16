# AI Agent Instructions

## Project Context

See [docs/ai-agent-context.md](docs/ai-agent-context.md) for service architecture, tech stack, key concepts, and API surface.

For broader Decentraland contributor guidelines, see <https://docs.decentraland.org/llms.txt>

## Skills

Load the relevant skill **before** making changes (`dcl-*` come from [decentraland/ai-toolkit](https://github.com/decentraland/ai-toolkit)):

| Skill | When to load |
|---|---|
| `writing-for-agents` | Writing or editing `AGENTS.md`, `CLAUDE.md`, or a skill |
| `dcl-testing` | Writing, modifying, or reviewing `*.spec.ts` / `*.test.ts` files |
| `dcl-wkc-components` | Working on files in `src/components.ts`, `src/adapters/`, `src/logic/`, `src/controllers/`, `src/types/`, or any file importing from `@well-known-components` |

## Engineering Rules

Each shipped wrong here and was corrected in review.

- **Treat an authorization verdict as stale the moment you hold it.** Re-read it at the point of use, invalidate a cached decision when moderation changes, and re-read after every `await` — a verdict computed before one is stale by the time it is used.
- **Give every fail-open path a counter.** A let-through belongs on a dashboard, not only in a log line.
- **A weakened security property is the user's call.** Raise it and let them choose; approval comes from them, never from a comment justifying the weakness.
- **Treat a connection string as a credential — log its host and port only.** `NATS_URL` and its kind carry user-info.
- **Advance time in tests with `jest.spyOn(performance, 'now')`, and replace any real delay with it.** `lru-cache` captured its `performance` reference at import, so `jest.useFakeTimers()` misses it where the spy reaches it.
- **Confirm a store, cache, or lookup is absent before adding one.** `@dcl/memory-cache-component` already wraps `lru-cache`, and the component you are calling may already do the lookup.
- **Move a comment longer than the code it explains into [docs/ai-agent-context.md](docs/ai-agent-context.md), leaving a one-line pointer.**
- **Land a review follow-up in the change that raised it**, or record the agreement to defer it.

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
