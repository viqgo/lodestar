# lodestar

A desktop app (Electron) that teaches one reasoning step at a time: it probes what you know, plans a path,
then runs predict / teach / explain / check. The model is the AI CLI the user already has:
Codex CLI, Claude Code or Gemini CLI (experimental), chosen per lesson.

Built from a signed-off blueprint in `docs/blueprint/`. The blueprint is the source of truth:
code follows it, never the other way round. Blueprint files are read-only for the builder;
the one exception is ticking a finished task in the Progress list of `PLAN.md`.

- `SPEC.md` - behavior and tests
- `ARCHITECTURE.md` - files, data model, every function signature, the full prompt
- `STACK.md` - tools and versions
- `UI.md`, `ui-template.html` - the look, components and copy
- `PLAN.md` - tasks and progress
- `DECISIONS.md` - why things are the way they are

## Stack
Node 26.13.0 · npm 11.20.0 · TypeScript 6.0.3 · Electron 45.3.2 · electron-vite 6.0.0 + vite 8.3.8 ·
React 19.3.1 · zod 4.6.7 · react-markdown 10.1.0 + remark-math 6.0.0 + rehype-katex 7.0.1 + katex 0.19.1 ·
mermaid 12.3.0 · vitest 5.1.0 + @testing-library/react 16.3.3 + jsdom 31.0.1 · eslint 10.14.0 +
typescript-eslint 8.72.2 · prettier 3.10.1 · Codex CLI 0.167.0 or newer · Claude Code 2.1.322 or newer ·
Gemini CLI 0.68.0 or newer. Plain CSS, no styling framework.

## Commands
- Install: `npm ci` (T1 alone uses `npm install` to create the lockfile)
- Run: `npm run dev`
- Build: `npm run build`
- Test (all): `npm test`
- Test (one): `npx vitest run <path> -t "<test name>"`
- Lint: `npm run lint` (fix formatting first with `npm run format`)
- Type check: `npm run typecheck`
- Evals (a real CLI, costs quota; only when a task says so): `npm run eval` (Codex) or `LEARN_EVAL_CLI=claude npm run eval`

## Map
- `src/shared/` - `limits.ts` (every number), `types.ts` (all shared types), `schema.ts` (reply schema, `parseReply`), `clis.ts` (CLI ids, labels, default choice)
- `src/core/` - `plan.ts`, `engine.ts` (lesson rules), `prompt.ts` (prompt text). Pure: no Electron, no Node built-ins.
- `src/main/` - `cli/adapter.ts`, `cli/process.ts` (shared runner), `cli/codex.ts`, `cli/claude.ts`, `cli/gemini.ts`, `cli/registry.ts`, `store.ts`, `turn.ts`, `ipc.ts`, `index.ts`
- `src/preload/index.ts` - the only bridge to the window (`window.api`)
- `src/renderer/` - `index.html`, `src/App.tsx`, `src/components/`, `src/lib/`, `src/styles/`
- `tests/` - mirrors `src/` (`tests/core/engine.test.ts` tests `src/core/engine.ts`); `tests/helpers/` holds fixtures and fakes
- `evals/` - checks against a real CLI
- Milestones 3-8 add files listed in `ARCHITECTURE.md` under "Milestones 3-8" (for example `src/core/material.ts`, `src/main/files.ts`, `src/main/call.ts`, `src/main/voice/`).

## Conventions
- A lesson is stored only as its event list. Never store derived state; call `deriveState(events)`.
- `src/core` and `src/shared` import nothing from `main`, `preload`, `renderer`, Electron or Node built-ins.
  `src/renderer` imports only from `src/shared`, `src/core` and itself. Only `src/main` uses `fs`, `child_process`, Electron main APIs.
- Expected failures are returned as values (`string | null` reasons, `{ ok: false, ... }` results). `throw` only for a corrupt session.
- Anything that touches the outside world (spawn, fs, clock, ids) is passed in as a dependency so tests can fake it.
- Never spawn with a shell. Never call a real CLI (Codex, Claude Code, Gemini) or Deepgram from `tests/`.
- The app never writes into a material folder, and no CLI is ever given a write, edit or shell tool. An adapter gets its extra abilities only from `RunOptions`.
- The Deepgram key lives only in the main process: never in the window, a log, a test snapshot or an error message.
- Every CLI is started through `runProcess` in `src/main/cli/process.ts`; an adapter never calls `spawn` itself.
- User-facing messages are copied character for character from `SPEC.md` / `UI.md`.
- Named exports only. Relative imports without file extensions. Tests import `describe/it/expect` from `vitest`.
- Test names are the names given in the task (many match `SPEC.md` test names exactly).
- No `"type": "module"` in `package.json` (main and preload must build as CommonJS).

## UI
Use only the tokens and components in `docs/blueprint/ui-template.html`. No new colors,
sizes, components or wording. Copy text exactly from `UI.md`.

## Build rules
1. Do one task from `PLAN.md` at a time, in order. Stop after it.
2. Touch only the files the task lists.
3. No new dependencies, exported functions, files, IPC channels, renames, refactors or improvements outside the task.
4. Test first: write the test, run it, see it fail the expected way, then implement.
5. Never report a task done without pasting the real output of its verify commands.
6. Stop and report instead of improvising when a test fails twice, when you need something
   the task does not name, or when the task contradicts the code.
7. After the verify step passes: tick the task in `PLAN.md`, commit with the given message.
   Never push, merge, rebase, force or delete branches.
8. If the blueprint looks wrong, say so in the report. Do not work around it.

## Stages G-L (milestones 3-8)
Tasks in these stages follow the "Standard steps" block at the start of "Stages G-L" in `PLAN.md`: test counts are relative (old total plus the task's count), and a task lists only what is specific to it.

## Report format
```
STATUS: DONE | BLOCKED | DEVIATED
TASK: T<n> <title>
COMMANDS AND OUTPUT: <each command run, with its pasted output, including the failing run>
FILES CHANGED: <list>
NOT IN THE PLAN: <anything done or noticed beyond the task, or "nothing">
```
