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

- **Re-check authorization at the point of use.** A decision cached behind a TTL alone outlives the ban that should have stopped it. If you cache one, invalidate it on the moderation change and re-read the guard after every `await` on the path.
- **A weakened security property is the user's call.** Raise the cost and let them choose; a comment justifying the weakness is not approval.
- **Treat connection strings as credentials.** `NATS_URL` and its kind carry user-info — log the target as host and port.
- **Keep rationale in [docs/ai-agent-context.md](docs/ai-agent-context.md), and a short pointer to it in the code.** When an explanation outgrows the code it explains, it has outgrown the file.
- **Drive time in tests from a controlled clock.** `lru-cache` holds the `performance` reference it captured at import, so Jest's fake timers never reach it — spy on the real object's `now`.
- **Reach for what exists first.** A repo component (`@dcl/memory-cache-component`) or the callee itself usually already does it; a hand-rolled store or a re-implemented lookup drifts from the original.
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
