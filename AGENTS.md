# AGENTS.md

## Guideline

- follow TDD, follow t-wada method
- read the latest code when starting a new task, because it might be updated independently of your work

### Naming Rules

- Variable names, function names, and database column names should be written in English.
- Romanized Japanese (romaji) should be avoided and only used when absolutely necessary.

Example:
- Good: `last_name_kana`
- Bad: `sei_kana`

- Use plural names only for arrays.
- Use singular names for non-array values.

---

## Workflow

### 1. Plan Mode Default

- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately – don't keep pushing
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

### 2. Subagent Strategy

- Use subagents liberally to keep main context window clean
fload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One task per subagent for focused execution

### 3. Self-Improvement Loop

- After ANY correction from the user: update `tasks/lessons.md` with the pattern
- Write rules for yourself that prevent the same mistake
- Ruthlessly iterate on these lessons until mistake rate drops
- Review lessons at session start forelevant project

### 4. Verification Before Done

- Never mark a task complete without proving it works
- Diff behavior between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness

### 5. Demand Elegance

- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes – don't over-engineer
- Challenge your o work before presenting it

### 6. Autonomo Bug Fixing

- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests – then resolve them
- Zero context switching required from the user
- Go fix failing CI tests without being told how

---

## Task Management

1. Plan First: Write plan to `tasks/todo.md` with checkable items
2. Verify Plan: Check in before starting implementation
3. Track Progress: Mark items complete as you go
4. ExplChanges: High-level summary at each step
5. Document Results: Add review section to `tasks/todo.md`
6. Capture Lessons: Update `tasks/lessons.md` after corrections

---

## Core Principles

- Simplicity First: Make every change as simple as possible. Impact minimal code.
- No Laziness: Find root causes. No temporary fixes. Senior developer standards.
- Minimal Impact: Changes should only touch what's necessary. Avoid introducing bugs.

---

## Development Environment

- use `pnpm` as a package manager
- use `vitest` for testing
- use `playwright` for E2E (`pnpm test:e2e`); run `pnpm check` before calling a task done

### Running the app

The app needs a database. Details are in the "セットアップ" section of `README.md`.

- Without Docker (agent sandboxes): `DATABASE_DRIVER=pglite PGLITE_DATA_DIR= pnpm dev`.
  The database is in memory, migrated and seeded automatically on the first API request, and gone when the server stops.
- With Docker: `cp .env.example .env.local` once, then `pnpm db:reset` and `pnpm dev`.
  If port 5432 is taken, change `POSTGRES_PORT` and the port inside `DATABASE_URL` in `.env.local`.
  `pnpm dev` and every `pnpm db:*` script read `.env.local` first, then `.env`; shell variables win over both.
  Env files hold credentials: never print or commit them.
- Seed games have fixed URLs such as `/games/seed-live-slugfest` and `/games/seed-finished-walk-off`
  (full list in `README.md`). Use them instead of clicking through game setup when verifying a screen.
- Only one `next dev` can run per directory. If a dev server is already running (often the user's), do not kill it;
  run E2E with `CI=1 pnpm test:e2e`, and start any extra server with `pnpm build && pnpm start --port <free port>`.
- Unit and integration tests need no database setup: they create an in-memory PGlite themselves.

### Database rules

- Change `lib/db/schema.ts`, then run `pnpm db:generate`; never edit files in `drizzle/` by hand.
- Keep the API JSON (`SharedGame`) independent of the tables; map between them only in `lib/server/game-rows.ts`.
- Store only what scorers recorded. Scores and statistics are derived by `lib/domain/replay.ts`, never persisted.
- Every save must go through the version check in `lib/server/game-store.ts` (optimistic locking).
- NEVER run `db:migrate`, `db:seed`, or any script against a remote database (`DATABASE_DRIVER=neon`)
  without the user's explicit confirmation. `db:seed` refuses `neon` by design; do not work around it.
- When verifying against Docker yourself, use a throwaway project and port
  (`docker compose -p scorebookun-verify ...`) so the user's local data is never touched.
