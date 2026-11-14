# Decisions - learning harness (name not chosen yet)

| # | Date | Decision | Options considered | Decided by | Phase |
|---|------|----------|--------------------|------------|-------|
| D1 | 2026-11-13 | Problem: a new open-source Electron desktop app in TypeScript that runs a LearnHarness-style learning loop, using the AI CLIs a person already has installed as the model. v1 is done when the user names a topic and goal and the app probes what they know, plans a path, teaches one step with predict / explain / check, and saves the lesson plus a simple list of what they have shown they understand. | generic CLI wrapper (orchestration, logging, evals) | owner | 2 |
| D2 | 2026-11-13 | Interface: Electron desktop app | terminal app; local web UI; both, terminal first | owner | 2 |
| D3 | 2026-11-13 | Backends: Codex CLI, Gemini CLI and Claude Code, user picks which | Gemini only; any CLI via config | owner | 2 |
| D4 | 2026-11-13 | Backend order: milestone 1 is Codex CLI only, behind an adapter interface; Gemini and Claude adapters are milestone 2 | Gemini first (planner's first proposal); all three at once | owner | 2 |
| D5 | 2026-11-13 | Language: TypeScript on Node | Python | owner | 2 |
| D6 | 2026-11-13 | v1 scope: one full lesson loop, no practice mode | loop plus practice; probe and plan only | owner | 2 |
| D7 | 2026-11-13 | New codebase, as close to LearnHarness as possible without copying its source or prompt text | fork LearnHarness (stays AGPL-3.0); contribute upstream | owner | 2 |
| D8 | 2026-11-13 | Persistence in v1: saved sessions plus a flat knowledge list; real graph later | full knowledge graph; sessions only | owner | 2 |
| D9 | 2026-11-13 | Builder: a cheaper Claude subagent in this app | Gemini CLI by paste; owner writes part | owner | 2 |
| D10 | 2026-11-13 | Look: LearnHarness-like layout, rendered as a plain chat app where they differ | plain chat only; named reference | owner | 2 |
| D11 | 2026-11-13 | Platform: macOS first; Windows and Linux untested until a later milestone | all three from v1 | planner default (owner said "about right") | 2 |
| D12 | 2026-11-13 | Rigor: must keep working (public project): tests and pinned versions | throwaway | planner default (owner said "about right") | 2 |
| D13 | 2026-11-13 | Owner writes none of the code | owner writes marked tasks | planner default (owner said "about right") | 2 |
| D14 | 2026-11-13 | Approach A, structured turns: each model call is one `codex exec` run that returns a single JSON action; the app owns the transcript and decides the next step. Streaming of answers is deferred, may be revisited later. | B: MCP tool bridge with a held process (LearnHarness's way); C: CLI-owned sessions via `codex exec resume` | owner | 3 |
| D15 | 2026-11-13 | No embedded web server: Electron main process runs the engine and talks to the window over IPC | Next.js server inside Electron (LearnHarness) | planner default (shown in phase 3, not vetoed) | 3 |
| D16 | 2026-11-13 | Storage is JSON files on disk | SQLite | planner default (shown in phase 3, not vetoed) | 3 |
| D18 | 2026-11-13 | License: MIT | AGPL-3.0 | owner | 4 |
| D19 | 2026-11-13 | Stack as listed in STACK.md approved; rows marked `default` there are planner picks the owner accepted as a set | see STACK.md "Rejected" column | owner (approved as a set) | 4 |
| D20 | 2026-11-13 | Project name: lodestar (folder `~/Desktop/.lodestar`) | - | planner default | 4 |
| D21 | 2026-11-13 | Spec for milestone 1 approved (SPEC.md B1-B20, tests, evals, out of scope). Limits (8 probe questions, 2-12 nodes, 3 fails, 180 s, 200 items) are planner picks accepted as a set | see SPEC.md | owner (approved as a set) | 5 |
| D22 | 2026-11-13 | Added after spec approval, while designing: a `verdict` field on teach actions so the model can grade free-text checks (B8 needs it) | separate grading call per text check (one more CLI call each) | planner default, approved by owner with D23 | 6 |
| D23 | 2026-11-13 | Architecture (ARCHITECTURE.md) and look (UI.md, ui-template.html) approved, including D22 and the planner defaults listed at the phase 6 stop: event-list storage, searching common install folders for Codex, 960x600 minimum window, three confidence buttons, no "I don't know" option, Cmd+Enter to submit, plain-list fallback for the map | see ARCHITECTURE.md, UI.md | owner (approved as a set) | 6 |
| D24 | 2026-11-14 | Plan approved (PLAN.md): Stages A and B in task detail (T1-T19, Gates A and B); Stage C (the window, T20-T37) as an outline, to be planned in detail after Gate B | detail all window tasks now | owner | 7 |
| D25 | 2026-11-14 | Name: lodestar. Project folder: hidden `~/Desktop/.lodestar`. Git repository with branch `build/codex-loop`; nothing is ever pushed. Fable reviews at the gates; the cheaper Claude model builds each task. APPROVED TO BUILD (owner: "okay start building") | other names; temporary folder | owner | 8 |
| D17 | 2026-11-13 | The CLI runs read-only in an empty temporary folder, without saving its own session | CLI runs in the user's folders | planner default (shown in phase 3, not vetoed) | 3 |
| D26 | 2026-11-14 | Plan fix after T1 blocked (task was underspecified, not a design change): `CLAUDE.md` added to `.prettierignore` so `npm run lint` can pass; vitest configs renamed `.mts` to remove a Vite CommonJS warning. Affects PLAN.md T1, ARCHITECTURE.md file tree. | edit CLAUDE.md to satisfy prettier; set `"type": "module"` (breaks Electron preload) | planner fix, reported to owner | 9 |
