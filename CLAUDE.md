# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

> Next.js 16 + React 19 + Prisma 7. APIs differ from older versions — when unsure, read `node_modules/next/dist/docs/` rather than relying on memory.

## Commands

```bash
npm run dev      # next dev (http://localhost:3000)
npm run build    # next build
npm run lint     # eslint
npm run test     # vitest run (one-shot)

# Run a single test file / by name
npx vitest run src/lib/state-projector.test.ts
npx vitest run -t "pure function round-trip"

# Database (no migrations dir — schema is pushed, not migrated)
npx prisma db push     # sync schema.prisma → SQLite
npx prisma generate    # regenerate client into src/generated/prisma
```

After editing `prisma/schema.prisma` you must run both `db push` and `generate`. The Prisma client is generated into `src/generated/prisma` (imported as `@/generated/prisma/client`), not `node_modules` — `src/lib/db.ts` wraps it with the libSQL adapter and a global singleton.

Tests run against a **separate** `test.db` (set in `vitest.config.ts`/`vitest.setup.ts`); every test truncates all tables in a `beforeEach`. Run `prisma db push` once so `test.db` has the schema before running tests.

## Architecture

This is the **AI Engineering Room**: four LLM agents (`senior-engineer`, `security-engineer`, `performance-engineer`, `product-engineer`), each with a distinct objective function, collaborate through structured debate rounds to produce engineering artifacts. The spec lives in `.kiro/specs/ai-engineering-room/` (`requirements.md`, `design.md`, `tasks.md`) — design.md is the source of truth for component contracts and the 23 correctness properties.

### Core invariants

- **Event sourcing.** All session state is derived by replaying the append-only `Event` log. The only mutable state is `Artifact`. `state-projector.ts` (`projectSessionState`) is a **pure function** from events → `SessionState`; keep it pure (it hardcodes agent configs to avoid circular deps). `SessionSnapshot` persists projected state per round so reconstruction is snapshot + incremental events, never full replay.
- **Structured outputs only.** Every agent response is validated against a Zod schema in `src/schemas/` (`proposal`, `critique`, `revision`, `consensus`). Clarification is a first-class `needsClarification` field — never parse agent prose with heuristics. Validation retries up to 2x on schema failure (`output-validator.ts`).
- **Summaries, not full history.** Agents never receive the full event log. `context-assembler.ts` builds context from the workspace/round/artifact summary services. Respect the per-call context budget.

### Round execution

A round runs four stages in order: **proposal → critique → revision → consensus**, then generates summaries and lands in `awaiting-intervention` (auto-advances to the next round). `round-orchestrator.ts` drives this. Key mechanics:

- All stage writes happen in a single `prisma.$transaction` to avoid SQLite write contention. The exception: `stage-progress` events are persisted immediately per-agent (outside the transaction) for real-time UI updates.
- Agents run via `Promise.allSettled` so one failure doesn't block the others.
- A `SessionLock` (DB columns `lockedBy`/`lockedAt`, stale after 5 min) prevents concurrent round starts — released in a `finally`. Concurrent start returns 409.
- **Critique routing is fixed by maximum objective conflict:** Senior↔Performance, Security↔Product. Each agent critiques exactly one other (`getCritiqueTarget` in `agent-configs.ts`).

### LLM layer

`llm-provider.ts` is an OpenAI-compatible client (retry w/ backoff, Retry-After, 30s timeout, AbortController). **Model tiering** assigns models per stage via env vars (`LLM_MODEL`, `LLM_MODEL_CRITIQUE_TIER`, `LLM_MODEL_SUMMARY_TIER`) — critique/summary default to a cheaper tier. `agent-executor.ts` ties together prompt-building → tier selection → LLM call → validation → token tracking. `token-budget-manager.ts` enforces the per-session `tokenBudget` and blocks execution when exceeded.

### Layers

- `src/app/api/sessions/[sessionId]/...` — REST routes (rounds, events, artifacts, intervene, advance, replay, export, token-usage).
- `src/lib/` — domain layer (stores, orchestrator, executor, services). All types in `src/types/domain.ts`.
- `src/components/workspace/` — outcome-focused UI. Artifacts & Engineering Outcomes panels are primary; Agent panels secondary; Debate Timeline tertiary. Frontend polls via SWR hooks in `src/hooks/`.

### Testing

`*.test.ts` files use **property-based tests** with `fast-check` to verify the design's correctness properties (e.g. projection round-trip, snapshot-vs-full-projection equivalence, four-agent invariant). When changing event handling, artifacts, or projection, add/keep a property test rather than only example-based cases.
