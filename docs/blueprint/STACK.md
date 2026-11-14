# Stack - lodestar

Versions checked on 2026-11-13 against the npm registry (`npm view <pkg> version`) and the locally installed tools.

| Layer | Pick | Version | Why this one | Rejected | Decision |
|-------|------|---------|--------------|----------|----------|
| Runtime | Node | 26.13.0 | already installed | - | default |
| Package manager | npm | 11.20.0 | ships with Node | pnpm (one more tool) | default |
| Language | TypeScript | 6.0.3 | newest version typescript-eslint supports (`<6.1.0`) | 7.0.2 (linter does not support it) | D5 |
| Desktop shell | Electron | 45.3.2 | owner's choice | - | D2 |
| Build tool | electron-vite | 6.0.0 | standard Electron build with hot reload | Next.js inside Electron | default (D15) |
| Bundler | vite | 8.3.8 | required by electron-vite and vitest | - | default |
| React plugin | @vitejs/plugin-react | 6.3.0 | needs vite ^8 | - | default |
| UI | react, react-dom | 19.3.1 | most widely known by the builder model | Svelte, Vue | default |
| UI types | @types/react, @types/react-dom, @types/node | 19.3.0, 19.3.0, 26.6.6 | - | - | default |
| Styling | plain CSS with design tokens | - | no dependency; tokens come from UI.md | Tailwind | default |
| Lesson text | react-markdown | 10.1.0 | explanations are Markdown | hand-written renderer | default |
| Math | remark-math, rehype-katex, katex | 6.0.0, 7.0.1, 0.19.1 | formulas in lessons | MathJax | default |
| Plan map | mermaid | 12.3.0 | draws the plan as a diagram, as LearnHarness does | plain list | default |
| Validation | zod | 4.6.7 | validates every JSON action from the CLI | hand-written checks | default |
| Storage | JSON files under Electron `userData` | - | simple, inspectable | SQLite | D16 |
| Tests | vitest | 5.1.0 | same config as Vite | Jest | default |
| Component tests | @testing-library/react, @testing-library/dom, @testing-library/user-event, @testing-library/jest-dom, jsdom | 16.3.3, 10.4.2, 14.6.10, 7.0.1, 31.0.1 | standard | Enzyme | default |
| Lint | eslint, @eslint/js, typescript-eslint, eslint-plugin-react-hooks | 10.14.0, 10.0.1, 8.72.2, 7.1.1 | standard | Biome | default |
| Format | prettier | 3.10.1 | standard | Biome | default |
| Model backend (milestone 1) | Codex CLI | 0.167.0 (minimum supported) | owner's choice | - | D4 |
| License | MIT | - | simplest permissive license; allowed because no LearnHarness code is copied | AGPL-3.0 | D18 |

Not in milestone 1: electron-builder 26.18.0 (packaging), Gemini CLI and Claude Code adapters (milestone 2).

## Verified by running
- `codex exec --json --output-schema <file> --ephemeral --sandbox read-only --skip-git-repo-check -o <file> -` with the prompt on stdin returns JSON matching the schema, exit code 0.
- stdout is JSONL events: `thread.started`, `turn.started`, `item.completed` (with `item.type == "agent_message"` and `item.text` holding the JSON string), `turn.completed` (with `usage.input_tokens`, `usage.output_tokens`).
- A schema whose root is an object with one property `action` that is an `anyOf` of object variants (each with `additionalProperties: false`, every property listed in `required`, nullable fields typed as `["integer","null"]`) is accepted and obeyed.
- Baseline overhead: 17,302 input tokens for a one-line prompt.

Unverified (updated 2026-11-14):
- Mermaid and KaTeX under a strict Content-Security-Policy: milestone 1 runs only through `npm run dev`, where the policy is intentionally off, so this stays unverified until packaging. KaTeX and Mermaid rendering in jsdom and in the dev window are checked in T27, T30 and Gate C.
- Mermaid and KaTeX rendering under Electron's sandboxed renderer with a strict Content Security Policy.
- Whether Codex's per-call token overhead can be reduced by configuration.
- Gemini CLI and Claude Code structured-output flags (milestone 2).

## Commands
- Install: `npm ci`
- Run: `npm run dev`
- Test (all): `npm test`
- Test (one): `npx vitest run <path> -t "<test name>"`
- Lint: `npm run lint`
- Type check: `npm run typecheck`

## Owner setup (before task 1)
- [x] Node 26 installed (`node --version`)
- [x] Codex CLI installed and signed in (`codex --version`, `codex login`)
- [ ] Choose the project name (working name: `lodestar`)

## Running cost
No new bills. Each lesson turn uses the owner's existing Codex plan or API billing, at least ~17k input tokens per turn.

## Milestone 2 additions (approved 2026-11-14, D43)
No new npm packages. Two more CLIs, each called without a shell, in a new empty temporary folder, prompt on stdin.

| CLI | Minimum version | Command | Status |
|-----|-----------------|---------|--------|
| Claude Code | 2.1.322 | `claude -p --output-format json --json-schema <schema JSON> --tools "" --setting-sources "" --strict-mcp-config --no-session-persistence --disable-slash-commands` | verified by a real call on 2026-11-14 |
| Gemini CLI | 0.68.0 | `gemini -p "" -o json --approval-mode plan --skip-trust` | experimental: built from the installed code and `--help`, never run signed in |

Verified facts (2026-11-14):
- Claude Code: stdout is one JSON object. Fields used: `is_error` (boolean), `result` (string, the reply as JSON text), `structured_output` (object, the reply matching the schema), `usage.input_tokens`, `usage.output_tokens`. A one-sentence reply took 4 s with about 3,600 input tokens of overhead. `--setting-sources ""` means the user's own Claude settings, CLAUDE.md, hooks and plugins are not loaded (so their configured default model is not used either).
- Gemini CLI: has no schema flag. Read from the installed bundle: a successful `-o json` run prints `{ "session_id", "response", "stats", "warnings" }` on stdout, the text in `response`. Run without sign-in: exit code 41 and `{ "session_id", "error": { "type", "message", "code" } }` on stderr. Settings key `tools.exclude` (array of tool names) removes tools; a `.gemini/settings.json` in the working folder is read as project settings.
- Gemini CLI's README says that since 2026-06-18 it has no free tier: it serves Gemini Code Assist licences and paid API or Vertex keys; consumer Google AI plans moved to Antigravity CLI (`agy`).

Unverified:
- Gemini: a real successful reply; whether `--approval-mode plan` plus `tools.exclude` blocks every tool; how often its replies are usable without a schema flag.
- Which Claude model `claude -p` uses with `--setting-sources ""`.

Other picks: each CLI uses its own default model (no model flag). Detection: `claude --version`, `gemini --version`, 5-second limit. Path overrides: `LEARN_CLAUDE_PATH`, `LEARN_GEMINI_PATH` (like `LEARN_CODEX_PATH`). Evals: `LEARN_EVAL_CLI=codex|claude|gemini npm run eval` (default `codex`).

Owner setup for milestone 2: Claude Code installed and signed in (done). Gemini: a paid account is expected in a few days; the live run is a separate owner task after the milestone.
