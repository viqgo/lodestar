# Build plan - lodestar

Blueprint (same folder): SPEC.md, STACK.md, ARCHITECTURE.md, UI.md, ui-template.html, DECISIONS.md
Builder rules: CLAUDE.md in the project root. Read it first, every session.
Branch: `build/codex-loop`
Approved to build: 2026-11-14 (D25)

Milestone 1 (D4: the Codex loop) is built in three stages, each ending in a gate:
- Stage A - the lesson rules (pure code, no Electron, no Codex). Planned in detail below.
- Stage B - Codex, storage and the turn loop; ends with the evals against real Codex. Planned in detail below.
- Stage C - the window. Outline only; planned in detail after Gate B, against the code that then exists.

Milestone 2 (Gemini CLI and Claude Code adapters) is outlined at the end.

## Progress
Tick a box only after the task's verify step passed. Append the commit hash.

- [x] T1 Project skeleton and test runner
- [x] T2 Electron shell that builds
- [x] T3 Limits and shared types
- [x] T4 Reply schema and parseReply
- [x] T5 Plan validation
- [x] T6 Lesson state: start, probe, plan
- [x] T7 Lesson state: teaching
- [x] T8 What the model may do next
- [x] T9 Answer checks, learned items, move notes
- [x] T10 The prompt
- [x] T10b Hardening fixes after the Gate A review
- [x] GATE A The lesson rules work from the test suite
- [x] T11 Finding the CLI on disk
- [x] T12 Reading Codex output
- [x] T13 Codex adapter: detect
- [x] T14 Codex adapter: run
- [x] T15 Store: sessions
- [x] T16 Store: knowledge
- [x] T17 One model step with retry
- [x] T18 The advance loop
- [x] T19 Evals against real Codex
- [x] T19b Gate B fixes (CR-1)
- [x] GATE B A lesson runs headless against real Codex
- [x] T20 IPC handlers
- [x] T21 Preload bridge and main wiring
- [x] T22 Component styles
- [x] T23 Turning a lesson into things to draw
- [x] T24 Stable option shuffling
- [x] T25 The plan as Mermaid text
- [x] T26 Banner, ThinkingBar, ConfirmDialog
- [x] T27 MarkdownView with math
- [x] T28 QuestionCard
- [x] T29 ChatItemView
- [x] T30 PlanPanel
- [x] T31 useLesson
- [x] T32 Sidebar, CliGate, time helpers
- [x] T33 NewLessonForm
- [x] T34 LessonScreen
- [x] T35 KnowledgeScreen
- [x] T36 App wiring
- [x] T36b Keyboard access, double-click guard, map fallback symbol
- [x] T37 README
- [x] T37b Gate C fixes (CR-2)
- [x] GATE C A full lesson in the window
- [x] T38 Tell text from questions (CR-3)
- [x] T39 The teach step: rules, schema, prompt
- [x] T40 Reading and Continue in the window
- [x] T41 Evals for the reading
- [x] GATE D A lesson with readings
- [x] T42 Profile rules and prompt section (CR-4)
- [x] T43 Save, load and use the profile
- [x] T44 The Profile screen
- [ ] GATE E Tutor profile in the window
- [x] T45 CLI names and defaults (milestone 2)
- [x] T46 Shared process runner
- [x] T47 Codex adapter on the shared runner
- [x] T48 Claude Code adapter
- [x] T49 Gemini adapter (experimental)
- [x] T50 A registry, and one adapter per lesson
- [x] T51 Channels for the CLI list, the choice and the switch
- [x] T52 The tutor picker
- [x] T53 Pick a tutor for a new lesson
- [x] T54 The tutor in a lesson, and switching
- [x] T55 Clean up, document, and check Claude Code for real
- [ ] GATE F Three CLIs
- [ ] OWNER TASK Gemini live run

Conventions used in every task:
- "Run tests" means `npm test`. The expected line is the vitest summary line, e.g. `Tests  9 passed (9)`.
- Test tables read: build the input in **Given**, call the function, assert **Expect**. One row is one `it(...)` named exactly as in **Test**.
- Fixture names (`A.probe()`, `toTeach`, `pick(1)`, ...) come from `tests/helpers/fixtures.ts` (created in T4).

---

## Stage A - the lesson rules
What the owner can see working at the end: `npm test` shows 76 passing tests that walk a whole lesson (probe, plan, teach, repair, finish) with no Codex and no window.

### T1 - Project skeleton and test runner

**Implements**: STACK.md · decisions D5, D18, D19
**Depends on**: nothing. The repository already exists on branch `build/codex-loop` with `docs/blueprint/` committed.

**Files**
- Create: `package.json`, `tsconfig.json`, `vitest.config.mts`, `vitest.eval.config.mts`, `eslint.config.mjs`, `.prettierrc.json`, `.prettierignore`, `.gitignore`, `LICENSE`, `tests/smoke.test.ts`
- Created by the tool: `package-lock.json`
- Do NOT create anything under `src/`. Do NOT change any version below.

**Steps**
1. Create `package.json`:
   ```json
   {
     "name": "lodestar",
     "version": "0.1.0",
     "description": "A desktop app that teaches step by step using the AI CLI you already have",
     "license": "MIT",
     "private": true,
     "main": "./out/main/index.js",
     "scripts": {
       "dev": "electron-vite dev",
       "build": "electron-vite build",
       "test": "vitest run",
       "eval": "vitest run --config vitest.eval.config.mts",
       "lint": "eslint . && prettier --check .",
       "format": "prettier --write .",
       "typecheck": "tsc --noEmit"
     },
     "dependencies": {
       "katex": "0.19.1",
       "mermaid": "12.3.0",
       "react": "19.3.1",
       "react-dom": "19.3.1",
       "react-markdown": "10.1.0",
       "rehype-katex": "7.0.1",
       "remark-math": "6.0.0",
       "zod": "4.6.7"
     },
     "devDependencies": {
       "@eslint/js": "10.0.1",
       "@testing-library/dom": "10.4.2",
       "@testing-library/jest-dom": "7.0.1",
       "@testing-library/react": "16.3.3",
       "@testing-library/user-event": "14.6.10",
       "@types/node": "26.6.6",
       "@types/react": "19.3.0",
       "@types/react-dom": "19.3.0",
       "@vitejs/plugin-react": "6.3.0",
       "electron": "45.3.2",
       "electron-vite": "6.0.0",
       "eslint": "10.14.0",
       "eslint-plugin-react-hooks": "7.1.1",
       "jsdom": "31.0.1",
       "prettier": "3.10.1",
       "typescript": "6.0.3",
       "typescript-eslint": "8.72.2",
       "vite": "8.3.8",
       "vitest": "5.1.0"
     }
   }
   ```
2. Create `tsconfig.json`:
   ```json
   {
     "compilerOptions": {
       "target": "ES2022",
       "lib": ["ES2022", "DOM", "DOM.Iterable"],
       "module": "ESNext",
       "moduleResolution": "Bundler",
       "jsx": "react-jsx",
       "strict": true,
       "skipLibCheck": true,
       "esModuleInterop": true,
       "resolveJsonModule": true,
       "isolatedModules": true,
       "noEmit": true,
       "types": ["node"]
     },
     "include": ["src", "tests", "evals", "*.ts", "*.mts"]
   }
   ```
3. Create `vitest.config.mts` (the `.mts` extension avoids a Vite warning, because `package.json` has no `"type": "module"`):
   ```ts
   import { defineConfig } from "vitest/config";
   export default defineConfig({ test: { include: ["tests/**/*.test.{ts,tsx}"] } });
   ```
   Create `vitest.eval.config.mts`:
   ```ts
   import { defineConfig } from "vitest/config";
   export default defineConfig({
     test: { include: ["evals/**/*.eval.ts"], testTimeout: 900_000, fileParallelism: false },
   });
   ```
4. Create `eslint.config.mjs`:
   ```js
   import js from "@eslint/js";
   import tseslint from "typescript-eslint";
   import reactHooks from "eslint-plugin-react-hooks";

   export default tseslint.config(
     { ignores: ["out", "node_modules", "docs"] },
     js.configs.recommended,
     ...tseslint.configs.recommended,
     {
       plugins: { "react-hooks": reactHooks },
       rules: { "react-hooks/rules-of-hooks": "error", "react-hooks/exhaustive-deps": "warn" },
     },
     { files: ["tests/**", "evals/**"], rules: { "@typescript-eslint/no-explicit-any": "off" } },
   );
   ```
5. Create `.prettierrc.json` with `{ "printWidth": 100 }`. Create `.prettierignore` with the lines `out`, `node_modules`, `docs`, `package-lock.json`, `CLAUDE.md`. Create `.gitignore` with the lines `node_modules`, `out`, `dist`, `.DS_Store`.
6. Create `LICENSE` with the standard MIT License text, copyright line `Copyright (c) 2026 lodestar contributors`.
7. Create `tests/smoke.test.ts`:
   ```ts
   import { expect, it } from "vitest";
   it("test runner works", () => {
     expect(1 + 1).toBe(2);
   });
   ```
8. Run `npm install`. Expected: exits 0 and creates `package-lock.json`. Paste the last 5 lines.
9. Run `npm test`. Expected: `Tests  1 passed (1)`. Paste the output.
10. Run `npm run format`, then `npm run lint` and `npm run typecheck`. Expected: both exit 0 with no errors. Paste the output.
11. Tick T1, then `git add -A && git commit -m "chore: project skeleton with pinned dependencies"`.

**Stop and report instead of continuing if**
- `npm install` prints `ERESOLVE` or any peer-dependency error (do not use `--force` or `--legacy-peer-deps`),
- lint fails because of the shape of `eslint.config.mjs` itself (paste the error; do not rewrite the config),
- any step fails after two attempts, or you need a file or package not named here.

### T2 - Electron shell that builds

**Implements**: ARCHITECTURE "src/main/index.ts" (`createWindow`), UI.md tokens · decisions D2, D15
**Depends on**: T1

**Context**
- electron-vite's default entries are `src/main/index.ts`, `src/preload/index.ts`, `src/renderer/index.html`. Build output goes to `out/`. The preload output is `out/preload/index.js`; from the main bundle it is `join(__dirname, "../preload/index.js")`. In dev the renderer URL is in `process.env.ELECTRON_RENDERER_URL`.
- There is no `"type": "module"` in `package.json`; keep it that way so main and preload build as CommonJS (a sandboxed preload cannot be an ES module).

**Files**
- Create: `electron.vite.config.ts`, `src/main/index.ts`, `src/preload/index.ts`, `src/renderer/index.html`, `src/renderer/src/main.tsx`, `src/renderer/src/App.tsx`, `src/renderer/src/styles/tokens.css`, `src/renderer/src/styles/app.css`, `src/renderer/src/vite-env.d.ts`
- Do NOT add IPC, storage or CLI code. Do NOT add dependencies.

**Steps**
1. Create `electron.vite.config.ts`:
   ```ts
   import { defineConfig } from "electron-vite";
   import react from "@vitejs/plugin-react";
   export default defineConfig({ main: {}, preload: {}, renderer: { plugins: [react()] } });
   ```
2. Create `src/renderer/src/styles/tokens.css`: copy the whole `:root { ... }` block (and only that block) from `docs/blueprint/ui-template.html`. Create `src/renderer/src/styles/app.css` containing only:
   ```css
   * { box-sizing: border-box; }
   html, body, #root { height: 100%; }
   body { margin: 0; background: var(--color-bg); color: var(--color-text); font: var(--text-base)/1.55 var(--font-body); }
   ```
3. Create `src/renderer/index.html`: a standard HTML5 page, `<title>lodestar</title>`, body containing `<div id="root"></div>` and `<script type="module" src="/src/main.tsx"></script>`.
4. Create `src/renderer/src/main.tsx`: import `./styles/tokens.css` then `./styles/app.css`, and render `<App />` into `#root` with `createRoot` inside `<StrictMode>`.
5. Create `src/renderer/src/vite-env.d.ts` containing exactly the one line `/// <reference types="vite/client" />` (without it, TypeScript 6 rejects the CSS imports in `main.tsx`). Create `src/renderer/src/App.tsx`: `export function App()` returning `<main><h1>lodestar</h1></main>`.
6. Create `src/preload/index.ts` containing only `export {};`.
7. Create `src/main/index.ts`:
   ```ts
   import { app, BrowserWindow } from "electron";
   import { join } from "node:path";

   export function createWindow(): BrowserWindow {
     const win = new BrowserWindow({
       width: 1200,
       height: 800,
       minWidth: 960,
       minHeight: 600,
       backgroundColor: "#0e0e0f",
       webPreferences: {
         preload: join(__dirname, "../preload/index.js"),
         contextIsolation: true,
         sandbox: true,
         nodeIntegration: false,
       },
     });
     win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
     const devUrl = process.env.ELECTRON_RENDERER_URL;
     // block all navigation, except reloads of the dev server page while developing
     win.webContents.on("will-navigate", (e, url) => {
       if (!devUrl || !url.startsWith(devUrl)) e.preventDefault();
     });
     if (devUrl) void win.loadURL(devUrl);
     else void win.loadFile(join(__dirname, "../renderer/index.html"));
     return win;
   }

   async function main(): Promise<void> {
     await app.whenReady();
     createWindow();
     app.on("window-all-closed", () => app.quit());
   }

   void main();
   ```
8. Run `npm run build`. Expected: exits 0 and the files `out/main/index.js`, `out/preload/index.js`, `out/renderer/index.html` exist (`ls out/main out/preload out/renderer`). Paste the output.
9. Run `npm run format && npm run lint && npm run typecheck && npm test`. Expected: all exit 0; `Tests  1 passed (1)`.
10. Tick T2, then `git add -A && git commit -m "feat: electron shell with design tokens"`.

**Stop and report instead of continuing if**
- the build fails, or the three output files are not at those exact paths (paste `find out -maxdepth 2`),
- you would need to change `package.json`.

### T3 - Limits and shared types

**Implements**: ARCHITECTURE "src/shared/limits.ts" and "Data model"
**Depends on**: T1

**Files**
- Create: `src/shared/limits.ts`, `src/shared/types.ts`, `tests/shared/limits.test.ts`
- Do NOT add functions to either source file. Do NOT import anything into `types.ts` or `limits.ts`.

**Steps**
1. Create `tests/shared/limits.test.ts` with one test `limits match the spec` asserting: `MAX_PROBE` 8, `PLAN_MIN` 2, `PLAN_MAX` 12, `MAX_FAILS` 3, `CALL_TIMEOUT_MS` 180000, `DETECT_TIMEOUT_MS` 5000, `KNOWLEDGE_PROMPT_MAX` 200, `FIELD_MAX` 500, `ANSWER_TEXT_MAX` 4000, `OPTIONS_MIN` 2, `OPTIONS_MAX` 6, `STDERR_MAX` 200 (imported from `../../src/shared/limits`).
2. Run tests. Expected: 1 failed (cannot find module `limits`). Paste.
3. Create `src/shared/limits.ts` exporting those twelve constants with `export const`.
4. Create `src/shared/types.ts`: copy, character for character, the `ts` code block under the heading "Data model (`src/shared/types.ts`)" in `docs/blueprint/ARCHITECTURE.md` (it starts with `export type Question` and ends with the `Api` type).
5. Run tests. Expected: `Tests  2 passed (2)`. Run `npm run typecheck`: exits 0. Paste both.
6. Tick T3, then `git add -A && git commit -m "feat: limits and shared types"`.

**Stop and report if** typecheck fails on the copied types (do not edit the types to make it pass).

### T4 - Reply schema and parseReply

**Implements**: B11 (schema part) · `ReplySchema`, `REPLY_JSON_SCHEMA`, `parseReply` · decisions D14, D22
**Depends on**: T3

**Context**
- Types `Action`, `Question` are in `src/shared/types.ts`. Limits are in `src/shared/limits.ts`.
- Codex needs a strict JSON Schema: every object has `additionalProperties: false` and lists every one of its properties in `required`; a nullable field is typed `["string","null"]` or `["integer","null"]`. This exact shape was tested against Codex 0.167.0.

**Files**
- Create: `src/shared/schema.ts`, `tests/shared/schema.test.ts`, `tests/helpers/fixtures.ts`
- Do NOT generate the JSON Schema from zod. Do NOT add dependencies.

**Steps**
1. Create `tests/helpers/fixtures.ts` exactly:
   ```ts
   import type { Action, Answer, PlanNode, Question, Session, SessionEvent, Verdict } from "../../src/shared/types";

   export const AT = "2026-01-01T00:00:00.000Z";
   export const choiceQ: Question = { kind: "choice", prompt: "Pick", options: ["a", "b", "c"], correctIndex: 1 };
   export const textQ: Question = { kind: "text", prompt: "Say", options: [], correctIndex: null };
   export const PLAN: PlanNode[] = [
     { id: "n1", title: "One", deps: [] },
     { id: "n2", title: "Two", deps: ["n1"] },
   ];
   export const A = {
     probe: (question: Question = choiceQ): Action => ({ type: "probe", question }),
     probeDone: (): Action => ({ type: "probe_done", known: ["k1"], goal: "g" }),
     plan: (nodes: PlanNode[] = PLAN): Action => ({ type: "plan", nodes }),
     predict: (nodeId = "n1", verdict: Verdict | null = null): Action => ({
       type: "predict", nodeId, verdict, feedback: null, question: textQ,
     }),
     explain: (nodeId = "n1", check: Question = choiceQ, verdict: Verdict | null = null): Action => ({
       type: "explain", nodeId, verdict, feedback: null, markdown: "m", check,
     }),
     done: (verdict: Verdict | null = null): Action => ({
       type: "lesson_done", verdict, feedback: null, summary: "s",
       learned: [{ nodeId: "n1", text: "t1" }, { nodeId: "n2", text: "t2" }],
     }),
   };
   export const act = (action: Action): SessionEvent => ({ kind: "action", at: AT, action, usage: null });
   export const ans = (p: Partial<Answer> = {}): SessionEvent => ({
     kind: "answer", at: AT,
     answer: { choiceIndex: null, text: null, reasoning: null, confidence: null, ...p },
   });
   export const pick = (i: number): SessionEvent => ans({ choiceIndex: i });
   export const say = (text = "words"): SessionEvent => ans({ text });
   export const session = (events: SessionEvent[] = []): Session => ({
     version: 1, id: "s_00000000-0000-0000-0000-000000000000", topic: "T", goal: "G", cli: "codex",
     createdAt: AT, updatedAt: AT, events,
   });
   /** probe answered once, probing declared done: now the model must plan */
   export const toPlan: SessionEvent[] = [act(A.probe()), pick(1), act(A.probeDone())];
   /** plan accepted: now the model must send a predict */
   export const toTeach: SessionEvent[] = [...toPlan, act(A.plan())];
   /** predict asked and answered, explanation with a choice check shown: now the learner must answer the check */
   export const toCheck = (nodeId = "n1", check: Question = choiceQ): SessionEvent[] => [
     act(A.predict(nodeId)), say(), act(A.explain(nodeId, check)),
   ];
   ```
2. Create `tests/shared/schema.test.ts` with these 7 tests (`reply(a)` means `JSON.stringify({ action: a })`):

   | Test | Given | Expect |
   |------|-------|--------|
   | parseReply accepts every action type | each of `A.probe()`, `A.probeDone()`, `A.plan()`, `A.predict()`, `A.explain()`, `A.done()` through `parseReply(reply(a))` | each result is `{ ok: true, action: a }` (`toEqual`) |
   | parseReply rejects text that is not JSON | `parseReply("hello")` | `{ ok: false, reason: "not valid JSON" }` |
   | parseReply rejects an unknown action type | `parseReply('{"action":{"type":"dance"}}')` | `ok` false and `reason` starts with `"does not match the schema"` |
   | parseReply rejects a choice question with one option | `A.probe({ ...choiceQ, options: ["a"], correctIndex: 0 })` | `ok` false |
   | parseReply rejects a correctIndex outside the options | `A.probe({ ...choiceQ, correctIndex: 3 })` | `ok` false |
   | parseReply rejects a text question with options | `A.probe({ ...textQ, options: ["a", "b"] })` | `ok` false |
   | REPLY_JSON_SCHEMA is strict everywhere | walk `REPLY_JSON_SCHEMA` recursively (through `properties`, `items`, `anyOf`) | every node with `type === "object"` has `additionalProperties === false` and `required` equal to `Object.keys(properties)`; the walk visits at least 9 object nodes |
3. Run tests. Expected: the schema file fails to import (7 tests not run or failed). Paste.
4. Create `src/shared/schema.ts`:
   - `ReplySchema`: a zod object `{ action: z.discriminatedUnion("type", [...six variants]) }` matching the `Action` type exactly (`z.strictObject` for every object). The question schema adds one `.superRefine` enforcing: `kind "choice"` -> `options.length` between `OPTIONS_MIN` and `OPTIONS_MAX`, and `correctIndex` is null or an integer `>= 0` and `< options.length`; `kind "text"` -> `options.length === 0` and `correctIndex === null`. `prompt`, plan node `id` and `title` are `z.string().min(1)`.
   - `REPLY_JSON_SCHEMA`, built with these helpers (use them as written):
     ```ts
     const obj = (properties: Record<string, object>) => ({
       type: "object", additionalProperties: false, required: Object.keys(properties), properties,
     });
     const str = { type: "string" };
     const nullableStr = { type: ["string", "null"] };
     const strList = { type: "array", items: str };
     const lit = (value: string) => ({ type: "string", enum: [value] });
     const verdict = { type: ["string", "null"], enum: ["pass", "fail", null] };
     const question = obj({
       kind: { type: "string", enum: ["choice", "text"] },
       prompt: str,
       options: strList,
       correctIndex: { type: ["integer", "null"] },
     });
     const node = obj({ id: str, title: str, deps: strList });
     const learned = obj({ nodeId: str, text: str });
     export const REPLY_JSON_SCHEMA: object = obj({
       action: {
         anyOf: [
           obj({ type: lit("probe"), question }),
           obj({ type: lit("probe_done"), known: strList, goal: str }),
           obj({ type: lit("plan"), nodes: { type: "array", items: node } }),
           obj({ type: lit("predict"), nodeId: str, verdict, feedback: nullableStr, question }),
           obj({ type: lit("explain"), nodeId: str, verdict, feedback: nullableStr, markdown: str, check: question }),
           obj({ type: lit("lesson_done"), verdict, feedback: nullableStr, summary: str,
                 learned: { type: "array", items: learned } }),
         ],
       },
     });
     ```
   - `parseReply(text: string): { ok: true; action: Action } | { ok: false; reason: string }`: `JSON.parse` in a try/catch (catch -> reason `"not valid JSON"`); then `ReplySchema.safeParse`; on failure reason is `"does not match the schema: " + issue.path.join(".") + " " + issue.message` for the first issue; on success return `data.action`.
5. Run tests. Expected: `Tests  9 passed (9)`. Run `npm run typecheck`. Paste both.
6. Tick T4, then `git add -A && git commit -m "feat: reply schema and parser"`.

**Stop and report if** zod 4 has no `z.strictObject` or `z.discriminatedUnion` with these call shapes (paste the type error), or a test in step 2 passes before step 4.

### T5 - Plan validation

**Implements**: B5 · `validatePlan`, `eligibleNodes`, `allNodesSettled`
**Depends on**: T4

**Context**: `PlanNode = { id: string; title: string; deps: string[] }`, `NodeState = { status: "todo" | "passed" | "shaky"; fails: number }` (in `src/shared/types.ts`). `PLAN_MIN`, `PLAN_MAX` in `src/shared/limits.ts`.

**Files**
- Create: `src/core/plan.ts`, `tests/core/plan.test.ts`
- Do NOT import from `main`, `renderer`, Electron or Node built-ins.

**Steps**
1. Create `tests/core/plan.test.ts` with 9 tests. `n(id, deps = [])` is a local helper returning `{ id, title: id.toUpperCase(), deps }`. `todo`, `passed`, `shaky` are local constants `{ status: ..., fails: 0 }`.

   | Test | Given | Expect |
   |------|-------|--------|
   | accepts a valid plan | `validatePlan(PLAN)` | `null` |
   | plan_rejects_size_out_of_range | `[n("a")]`; and 13 nodes `n("x0")`..`n("x12")` | both `"plan must have 2 to 12 nodes"` |
   | rejects a duplicate id | `[n("a"), n("a")]` | `"duplicate node id: a"` |
   | rejects an empty id or title | `[n("a"), { id: "b", title: "", deps: [] }]` | `"empty id or title"` |
   | plan_rejects_unknown_dep | `[n("a"), n("b", ["zz"])]` | `"unknown dep: zz"` |
   | rejects a node that depends on itself | `[n("a"), n("b", ["b"])]` | `"node depends on itself: b"` |
   | plan_rejects_cycle | `[n("a", ["c"]), n("b", ["a"]), n("c", ["b"])]` | `"plan has a cycle"` |
   | eligibleNodes lists todo nodes whose deps are settled | `eligibleNodes(PLAN, { n1: todo, n2: todo })`; then with `n1: passed`; then with `n1: shaky` | `["n1"]`; `["n2"]`; `["n2"]` |
   | allNodesSettled is true only when no node is todo | `{ n1: passed, n2: todo }`; `{ n1: passed, n2: shaky }` | `false`; `true` |
2. Run tests. Expected: `plan.test.ts` fails to import. Paste.
3. Create `src/core/plan.ts`:
   - `validatePlan(nodes: PlanNode[]): string | null` checking in this order and returning the first failure: size, empty id or title, duplicate id, self-dependency, unknown dep, cycle. Cycle check: repeatedly remove every node whose deps are all already removed; if a pass removes nothing while nodes remain, return `"plan has a cycle"`.
   - `eligibleNodes(plan: PlanNode[], nodes: Record<string, NodeState>): string[]`: ids, in plan order, where `nodes[id].status === "todo"` and every dep has status `passed` or `shaky`.
   - `allNodesSettled(nodes: Record<string, NodeState>): boolean`.
4. Run tests. Expected: `Tests  18 passed (18)`. Paste.
5. Tick T5, then `git add -A && git commit -m "feat: plan validation"`.

**Stop and report if** a test passes before step 3, or tests fail after two attempts.

### T6 - Lesson state: start, probe, plan

**Implements**: B2, B3 (state part), B4 · `validateNewLesson`, `deriveState` (probe and plan phases)
**Depends on**: T5

**Context**
- Types `SessionEvent`, `LessonState`, `Awaiting`, `NodeState` are in `src/shared/types.ts`. `FIELD_MAX` is in limits.
- A lesson is stored only as its event list. `deriveState` recomputes everything from it.

**Files**
- Create: `src/core/engine.ts`, `tests/core/engine.test.ts`
- Do NOT handle `predict`, `explain` or `lesson_done` yet (T7): for those action types throw `new Error("corrupt session at event " + i)`.

**Steps**
1. Create `tests/core/engine.test.ts` with 7 tests:

   | Test | Given | Expect |
   |------|-------|--------|
   | new_lesson_rejects_empty_fields | `validateNewLesson("", "g")`, `validateNewLesson("t", "   ")` | both `"Enter a topic and a goal."`; `validateNewLesson("t", "g")` is `null` |
   | new_lesson_rejects_over_500_chars | `validateNewLesson("x".repeat(501), "g")`; `validateNewLesson("x".repeat(500), "g")` | the message; `null` |
   | a new lesson waits for the model in the probe phase | `deriveState([])` | `phase "probe"`, `awaiting` `{ who: "model" }`, `probeAnswered 0`, `plan null`, `nodes {}`, `currentNodeId null`, `teachStep null`, `known []`, `sharpGoal null`, `summary null` |
   | a probe question waits for the learner | `deriveState([act(A.probe())])` | `awaiting` equals `{ who: "learner", purpose: "probe", question: choiceQ, nodeId: null, eventIndex: 0 }` |
   | a probe answer is counted and hands back to the model | `deriveState([act(A.probe()), pick(1)])` | `probeAnswered 1`, `awaiting.who "model"`, `phase "probe"` |
   | probe_ends_on_probe_done | `deriveState(toPlan)` | `phase "plan"`, `known ["k1"]`, `sharpGoal "g"`, `awaiting.who "model"` |
   | a plan starts the teach phase | `deriveState(toTeach)` | `phase "teach"`, `plan` equals `PLAN`, `nodes` equals `{ n1: { status: "todo", fails: 0 }, n2: { status: "todo", fails: 0 } }`, `teachStep "need_predict"`, `awaiting.who "model"` |
   Also add, inside the last test: `expect(() => deriveState([pick(1)])).toThrow("corrupt session at event 0")`.
2. Run tests. Expected: `engine.test.ts` fails to import. Paste.
3. Create `src/core/engine.ts`:
   - `validateNewLesson(topic: string, goal: string): string | null`: both `trim()` lengths must be 1 to `FIELD_MAX`; otherwise `"Enter a topic and a goal."`.
   - `deriveState(events: SessionEvent[]): LessonState`: start from the state in test 3 and loop over the events with their index `i`:
     - an `answer` event when `awaiting.who !== "learner"`, or an `action` event when `awaiting.who !== "model"`, throws `new Error("corrupt session at event " + i)`;
     - `probe` action -> `awaiting = { who: "learner", purpose: "probe", question, nodeId: null, eventIndex: i }`;
     - answer while `awaiting.purpose === "probe"` -> `probeAnswered + 1`, `awaiting = { who: "model" }`;
     - `probe_done` -> set `known`, `sharpGoal = goal`, `phase = "plan"` (still awaiting model);
     - `plan` -> set `plan = nodes`, `nodes` = one `{ status: "todo", fails: 0 }` per node id, `phase = "teach"`, `teachStep = "need_predict"` (still awaiting model).
     Build new objects; never mutate the events.
4. Run tests. Expected: `Tests  25 passed (25)`. Paste.
5. Tick T6, then `git add -A && git commit -m "feat: lesson state for probe and plan"`.

**Stop and report if** a test passes before step 3, or tests fail after two attempts.

### T7 - Lesson state: teaching

**Implements**: B7, B8, B9, B10 (state part) · `deriveState` (teach phase)
**Depends on**: T6

**Context**: `src/core/engine.ts` has `deriveState` handling `probe`, `probe_done`, `plan` and probe answers, and throwing for other actions. `MAX_FAILS` (3) is in limits. `Verdict = "pass" | "fail"`.

**Files**
- Modify: `src/core/engine.ts`, `tests/core/engine.test.ts`
- Do NOT change the behavior tested in T6.

**Steps**
1. Add 9 tests to `tests/core/engine.test.ts` (`s(...events)` = `deriveState([...toTeach, ...events])`):

   | Test | Given | Expect |
   |------|-------|--------|
   | a predict question waits for the learner | `s(act(A.predict("n1")))` | `currentNodeId "n1"`, `awaiting` equals `{ who: "learner", purpose: "predict", question: textQ, nodeId: "n1", eventIndex: 4 }` |
   | a predict answer asks the model to explain | `s(act(A.predict("n1")), say())` | `teachStep "need_explain"`, `awaiting.who "model"` |
   | choice_check_graded_by_app | `s(...toCheck("n1"), pick(1))` | `nodes.n1` equals `{ status: "passed", fails: 0 }`, `teachStep "need_predict"` |
   | a wrong choice check asks for a repair | `s(...toCheck("n1"), pick(0))` | `nodes.n1` equals `{ status: "todo", fails: 1 }`, `teachStep "need_repair"`, `currentNodeId "n1"` |
   | third_fail_marks_shaky | `s(...toCheck("n1"), pick(0), act(A.explain("n1")), pick(0), act(A.explain("n1")), pick(0))` | `nodes.n1` equals `{ status: "shaky", fails: 3 }`, `teachStep "need_predict"` |
   | a text check waits for the model's verdict | `s(...toCheck("n1", textQ), say())` | `teachStep "need_verdict"`, `nodes.n1.status "todo"` |
   | a pass verdict settles the node | `s(...toCheck("n1", textQ), say(), act(A.predict("n2", "pass")))` | `nodes.n1.status "passed"`, `currentNodeId "n2"` |
   | a fail verdict counts a failure | `s(...toCheck("n1", textQ), say(), act(A.explain("n1", choiceQ, "fail")))` | `nodes.n1` equals `{ status: "todo", fails: 1 }`, `awaiting.who "learner"` |
   | lesson_done ends the lesson | `s(...toCheck("n1"), pick(1), ...toCheck("n2"), pick(1), act(A.done()))` | `phase "done"`, `summary "s"`, `awaiting` equals `{ who: "nobody" }` |
2. Run tests. Expected: 9 failed (`corrupt session at event ...`), 25 passed. Paste.
3. In `src/core/engine.ts`:
   - Add a private helper `applyVerdict(state: LessonState, verdict: Verdict): LessonState` that returns a new state for `state.currentNodeId`: `pass` -> node status `passed`, `teachStep = "need_predict"`; `fail` -> `fails + 1`; if the new `fails >= MAX_FAILS` -> status `shaky`, `teachStep = "need_predict"`; else `teachStep = "need_repair"`.
   - In `deriveState`, before handling any action while `teachStep === "need_verdict"`: if the action has no `verdict` property or it is `null`, throw the corrupt-session error; otherwise `state = applyVerdict(state, action.verdict)`.
   - `predict` -> `currentNodeId = nodeId`, `awaiting = { who: "learner", purpose: "predict", question, nodeId, eventIndex: i }`.
   - answer while `purpose === "predict"` -> `teachStep = "need_explain"`, awaiting model.
   - `explain` -> `awaiting = { who: "learner", purpose: "check", question: check, nodeId, eventIndex: i }`.
   - answer while `purpose === "check"`: if `question.kind === "choice"` -> `applyVerdict(state, answer.choiceIndex === question.correctIndex ? "pass" : "fail")`; if `"text"` -> `teachStep = "need_verdict"`. Then awaiting model.
   - `lesson_done` -> `phase = "done"`, `summary`, `awaiting = { who: "nobody" }`.
4. Run tests. Expected: `Tests  34 passed (34)`. Paste.
5. Tick T7, then `git add -A && git commit -m "feat: lesson state for teaching"`.

**Stop and report if** step 2 shows a different failure count, or tests fail after two attempts.

### T8 - What the model may do next

**Implements**: B4, B5, B7, B9, B10, B11 (rules part) · `allowedActions`, `checkAction`
**Depends on**: T7

**Context**: `src/core/engine.ts` has `deriveState` and the private `applyVerdict(state, verdict)`. `src/core/plan.ts` exports `validatePlan`, `eligibleNodes`, `allNodesSettled`. `MAX_PROBE` is in limits.

**Files**
- Modify: `src/core/engine.ts`, `tests/core/engine.test.ts`
- Do NOT change `deriveState`.

**Steps**
1. Add 11 tests (`st(...events)` = `deriveState([...toTeach, ...events])`; `eight` = 8 repetitions of `act(A.probe()), pick(1)`):

   | Test | Given | Expect |
   |------|-------|--------|
   | probing allows probe and probe_done | `allowedActions(deriveState([]))` | `["probe", "probe_done"]` |
   | probe_forces_conclusion_after_8 | `state = deriveState(eight)` | `allowedActions(state)` is `["probe_done"]`; `checkAction(state, A.probe())` is `"probe is not allowed now"`; `checkAction(state, A.probeDone())` is `null` |
   | the plan phase allows only a valid plan | `state = deriveState(toPlan)` | `checkAction(state, A.predict())` is `"predict is not allowed now"`; `checkAction(state, A.plan([PLAN[0]!]))` is `"plan must have 2 to 12 nodes"`; `checkAction(state, A.plan())` is `null` |
   | teach_rejects_step_with_unmet_deps | `checkAction(st(), A.predict("n2"))` | `"node n2 cannot start now"`; and `A.predict("n1")` gives `null` |
   | teach_orders_predict_explain_check | `checkAction(st(), A.explain("n1"))` | `"explain is not allowed now"` |
   | explain must be for the current node | `checkAction(st(act(A.predict("n1")), say()), A.explain("n2"))` | `"explain must be for node n1"` |
   | a choice check needs a correctIndex | `checkAction(st(act(A.predict("n1")), say()), A.explain("n1", { ...choiceQ, correctIndex: null }))` | `"check needs a correctIndex"` |
   | failed_check_requires_same_node | `state = st(...toCheck("n1"), pick(0))` | `checkAction(state, A.predict("n1"))` is `"predict is not allowed now"`; `checkAction(state, A.explain("n1"))` is `null` |
   | lesson_done_rejected_while_steps_remain | `checkAction(st(...toCheck("n1"), pick(1)), A.done())` | `"lesson_done is not allowed now"` |
   | lesson_done is allowed when every node is settled | `state = st(...toCheck("n1"), pick(1), ...toCheck("n2"), pick(1))` | `allowedActions(state)` is `["lesson_done"]`; `checkAction(state, A.done())` is `null` |
   | a text check needs a verdict and the verdict decides what follows | `state = st(...toCheck("n1", textQ), say())` | `checkAction(state, A.predict("n2"))` is `"verdict is required"`; `checkAction(state, A.predict("n2", "pass"))` is `null`; `checkAction(state, A.predict("n2", "fail"))` is `"predict is not allowed now"`; `checkAction(state, A.explain("n1", choiceQ, "fail"))` is `null` |
2. Run tests. Expected: 11 failed, 34 passed. Paste.
3. Add to `src/core/engine.ts`:
   - `allowedActions(state: LessonState): ActionType[]`:
     - `awaiting.who !== "model"` -> `[]`
     - phase `probe`: `probeAnswered < MAX_PROBE` -> `["probe", "probe_done"]`, else `["probe_done"]`
     - phase `plan` -> `["plan"]`
     - phase `teach`: `need_predict` -> `allNodesSettled(state.nodes) ? ["lesson_done"] : ["predict"]`; `need_explain` or `need_repair` -> `["explain"]`; `need_verdict` -> `["explain", "predict", "lesson_done"]`
     - otherwise `[]`
   - `checkAction(state: LessonState, action: Action): string | null`, in this order:
     ```ts
     if (!allowedActions(state).includes(action.type)) return `${action.type} is not allowed now`;
     if (state.teachStep === "need_verdict") {
       if (!("verdict" in action) || action.verdict === null) return "verdict is required";
       return checkAction(applyVerdict(state, action.verdict), action);
     }
     ```
     then by type: `probe_done` with empty trimmed `goal` -> `"goal is empty"`; `plan` -> return `validatePlan(action.nodes)`; `predict` -> if `nodeId` is not in `eligibleNodes(state.plan!, state.nodes)` return `` `node ${action.nodeId} cannot start now` ``; `explain` -> if `nodeId !== state.currentNodeId` return `` `explain must be for node ${state.currentNodeId}` ``, and if `check.kind === "choice"` with `correctIndex === null` return `"check needs a correctIndex"`; otherwise `null`.
4. Run tests. Expected: `Tests  45 passed (45)`. Paste.
5. Tick T8, then `git add -A && git commit -m "feat: rules for what the model may do next"`.

**Stop and report if** tests fail after two attempts, or making them pass would need a change to `deriveState`.

### T9 - Answer checks, learned items, move notes

**Implements**: B3, B4, B9, B10 · `checkAnswer`, `learnedToSave`, `moveNotes`
**Depends on**: T8

**Context**: `src/core/engine.ts` exports `deriveState`, `allowedActions`, `checkAction`. `ANSWER_TEXT_MAX` (4000) is in limits.

**Files**
- Modify: `src/core/engine.ts`, `tests/core/engine.test.ts`

**Steps**
1. Add 8 tests (`st` as in T8):

   | Test | Given | Expect |
   |------|-------|--------|
   | checkAnswer refuses when no question is waiting | `checkAnswer(deriveState([]), pickAnswer(0))` | `"No question is waiting for an answer."` |
   | checkAnswer needs a valid option for a choice question | state `deriveState([act(A.probe())])`; answers with `choiceIndex` null, 3, and 1 | `"Pick an option."`, `"Pick an option."`, `null` |
   | checkAnswer needs text for a text question | state `st(act(A.predict("n1")))`; answers with `text` `"  "`, `"x".repeat(4001)`, `"ok"` | `"Write an answer."`, `"Write an answer."`, `null` |
   | lesson_done_saves_only_passed | `events = [...toTeach, ...toCheck("n1"), pick(1), ...toCheck("n2"), pick(0), act(A.explain("n2")), pick(0), act(A.explain("n2")), pick(0), act(A.done())]`; `learnedToSave(deriveState(events), A.done() as any)` | `[{ nodeId: "n1", text: "t1" }]` |
   | moveNotes tells the model to conclude after 8 probe answers | `moveNotes(deriveState(eight))` | `["You have asked 8 questions. You must return probe_done now."]` |
   | moveNotes lists the nodes that can start | `moveNotes(st())` | `["Start the next node with a predict question. Nodes that can start now: n1."]` |
   | moveNotes asks for a repair after a failed check | `moveNotes(st(...toCheck("n1"), pick(0)))` | `["The learner failed the check on node n1 (failure 1 of 3). Explain node n1 again from a different angle that targets their mistake, with a new check question."]` |
   | moveNotes flags the last attempt on a text check | `moveNotes(st(...toCheck("n1"), pick(0), act(A.explain("n1")), pick(0), act(A.explain("n1", textQ)), say()))` | `["The learner's last answer is a free-text check on node n1, and it was their last attempt. Set verdict, then move on: predict for another node, or lesson_done if none remain."]` |
   `pickAnswer(i)` is a local helper returning the `answer` object of `pick(i)`; build text answers the same way from `say(t)`.
2. Run tests. Expected: 8 failed, 45 passed. Paste.
3. Add to `src/core/engine.ts`:
   - `checkAnswer(state, answer): string | null`: not awaiting learner -> `"No question is waiting for an answer."`; choice question -> `choiceIndex` must be an integer from 0 to `options.length - 1` and `text` must be null, else `"Pick an option."`; text question -> `text` trimmed length 1 to `ANSWER_TEXT_MAX` and `choiceIndex` null, else `"Write an answer."`.
   - `learnedToSave(state, action)`: `action.learned` filtered to items whose `state.nodes[nodeId]?.status === "passed"` and whose trimmed `text` is not empty.
   - `moveNotes(state): string[]`, returning exactly one line (or `[]`) from this table; `<id>` is `state.currentNodeId`, `<fails>` is that node's `fails`:

     | State (awaiting model) | Line |
     |------------------------|------|
     | probe, `probeAnswered >= MAX_PROBE` | `You have asked 8 questions. You must return probe_done now.` |
     | plan | `Return the plan: 2 to 12 nodes, each one idea, deps listing the nodes it builds on.` |
     | `need_predict`, nodes remain | `Start the next node with a predict question. Nodes that can start now: <eligible ids joined by ", ">.` |
     | `need_predict`, all settled | `Every node is passed or shaky. Return lesson_done.` |
     | `need_explain` | `Explain node <id> and include a check question.` |
     | `need_repair` | `The learner failed the check on node <id> (failure <fails> of 3). Explain node <id> again from a different angle that targets their mistake, with a new check question.` |
     | `need_verdict`, `fails < 2` | `The learner's last answer is a free-text check on node <id>. Set verdict. If pass, continue with the next step. If fail, explain node <id> again from a different angle with a new check question.` |
     | `need_verdict`, `fails === 2` | `The learner's last answer is a free-text check on node <id>, and it was their last attempt. Set verdict, then move on: predict for another node, or lesson_done if none remain.` |
     | anything else | (no line) |
4. Run tests. Expected: `Tests  53 passed (53)`. Paste.
5. Tick T9, then `git add -A && git commit -m "feat: answer checks, learned items and move notes"`.

**Stop and report if** tests fail after two attempts.

### T10 - The prompt

**Implements**: B8 (text answers reach the model), B19 · `buildPrompt`, `renderTranscript`, `renderAnswer`
**Depends on**: T9

**Context**: `src/core/engine.ts` exports `deriveState`, `allowedActions`, `moveNotes`. `KNOWLEDGE_PROMPT_MAX` (200) is in limits. `KnowledgeItem = { id, text, sessionId, nodeId, createdAt }`.

**Files**
- Create: `src/core/prompt.ts`, `tests/core/prompt.test.ts`
- Do NOT reword any prompt text. Copy it from `docs/blueprint/ARCHITECTURE.md`.

**Steps**
1. Create `tests/core/prompt.test.ts` with 8 tests. `k(i)` returns `{ id: "k_" + i, text: "fact " + i, sessionId: "s", nodeId: "n", createdAt: AT }`. `p(events, knowledge = [], retryNote = null)` = `buildPrompt({ session: session(events), state: deriveState(events), knowledge, retryNote })`.

   | Test | Given | Expect |
   |------|-------|--------|
   | renderAnswer shows the chosen option's text | `renderAnswer({ choiceIndex: 1, text: null, reasoning: "r", confidence: "sure" }, choiceQ, "pass")` | equals `JSON.stringify({ answer: "b", reasoning: "r", confidence: "sure", graded: "pass" })` |
   | renderTranscript is "(empty)" with no events | `renderTranscript([])` | `"(empty)"` |
   | the transcript has one line per event | `renderTranscript([act(A.probe()), pick(1)])` | two lines; line 1 is `"MODEL: " + JSON.stringify(A.probe())`; line 2 starts with `"LEARNER: "` and contains `"answer":"b"` |
   | text_check_sent_to_model | `renderTranscript([...toTeach, ...toCheck("n1", textQ), say("my words")])` | last line contains `"answer":"my words"` and `"graded":null` |
   | the prompt names the lesson and the allowed moves | `p([])` | contains `"Topic: T"`, `"Goal: G"`, `"Allowed action types now: probe, probe_done."` |
   | prober_prompt_includes_newest_200 | `p([], Array.from({ length: 250 }, (_, i) => k(i)))` | contains `"- fact 0"` and `"- fact 199"`, does not contain `"- fact 200"` |
   | knowledge is left out after probing, node status is added | `p(toTeach, [k(1)])` | does not contain `"fact 1"` nor `"earlier lessons"`; contains `"n1: todo (failed checks: 0)"` |
   | the retry note is the last line | `p([], [], "Your last reply was not usable: x. Allowed now: probe.")` | `trimEnd()` ends with that note |
   Also assert in test 5 that `p([])` contains `"- (nothing yet)"`.
2. Run tests. Expected: `prompt.test.ts` fails to import. Paste.
3. Create `src/core/prompt.ts`:
   - `renderAnswer(answer, question, grade)`: `JSON.stringify({ answer: <option text for a choice, else answer.text>, reasoning, confidence, graded: grade })` with keys in that order.
   - `renderTranscript(events)`: `"(empty)"` for none; else lines joined by `"\n"`: `"MODEL: " + JSON.stringify(action)` and `"LEARNER: " + renderAnswer(answer, question, grade)`, where `question` is the question of the nearest earlier action event (`question` for `probe`/`predict`, `check` for `explain`) and `grade` is `"pass"`/`"fail"` only for a choice question that came from an `explain` action (by `correctIndex`), else `null`.
   - `buildPrompt({ session, state, knowledge, retryNote })`: the text under "Full prompt text built by `buildPrompt`" in ARCHITECTURE.md, with these rules: sections are joined by one blank line; the knowledge section (heading `# What the learner showed they understand in earlier lessons`, then `- <text>` lines for the first `KNOWLEDGE_PROMPT_MAX` items of `knowledge` as given, or `- (nothing yet)`) appears only when `state.phase === "probe"`; the `# Node status` section (one line `<id>: <status> (failed checks: <fails>)` per plan node in plan order) appears only when `state.phase === "teach"`; the bracketed markers `[probe only]`, `[teach only]` and the parenthesised explanations are not part of the output; `# Your move` holds `Allowed action types now: <types joined by ", ">.`, then each `moveNotes(state)` line, then `retryNote` when not null.
4. Run tests. Expected: `Tests  61 passed (61)`. Paste. Run `npm run format && npm run lint && npm run typecheck`: exit 0.
5. Tick T10, then `git add -A && git commit -m "feat: prompt builder"`.

**Stop and report if** any prompt sentence in ARCHITECTURE.md is unclear about where it goes (quote it), or tests fail after two attempts.

### T10b - Hardening fixes after the Gate A review

**Implements**: Gate A review findings (decision D28) · B5, B7, B3, B8, B10, B11 · functions `validatePlan`, `checkAction`, `moveNotes`, `learnedToSave`, `renderTranscript`, `ReplySchema` (tests only except `validatePlan`)
**Depends on**: T10

**Context**
- `validatePlan(nodes: PlanNode[]): string | null` in `src/core/plan.ts` checks in this order: size, empty id or title, duplicate id, self-dependency, unknown dep, cycle. It tests `id === ""` and `title === ""` only. A node id of `"__proto__"` is accepted today and breaks the lesson (a plain object ignores it as a key). The prompt tells the model: "Use short lowercase ids with hyphens."
- Fixtures in `tests/helpers/fixtures.ts`: `A`, `act`, `pick`, `say`, `ans`, `session`, `toPlan`, `toTeach`, `toCheck`, `PLAN`, `choiceQ`, `textQ`, `AT`. `st(...events)` is a local helper in `tests/core/engine.test.ts` = `deriveState([...toTeach, ...events])`; `eight` is the 8 repeated probe rounds already used there.

**Files**
- Modify: `src/core/plan.ts`, `tests/core/plan.test.ts`, `tests/core/engine.test.ts`, `tests/core/prompt.test.ts`, `tests/shared/schema.test.ts`
- Do NOT touch any other file. Do NOT change `engine.ts`, `prompt.ts` or `schema.ts` (every other fix here is a test). Do NOT add dependencies.

**Steps**

1. Add these 15 tests (names exactly as shown). `n(id, deps = [])` is the local helper already in `plan.test.ts`.

   In `tests/core/plan.test.ts` (2 tests):

   | Test | Given | Expect |
   |------|-------|--------|
   | rejects a whitespace-only id or title | `validatePlan([n("a"), { id: " ", title: "X", deps: [] }])`; `validatePlan([n("a"), { id: "b", title: "  ", deps: [] }])` | both `"empty id or title"` |
   | rejects ids that are not lowercase hyphenated | `validatePlan([n("a"), n("__proto__")])`; `validatePlan([n("a"), n("Big")])`; `validatePlan([n("a"), n("-x")])`; `validatePlan([n("a"), n("x".repeat(41))])` | `"invalid node id: __proto__"`, `"invalid node id: Big"`, `"invalid node id: -x"`, `"invalid node id: " + "x".repeat(41)`; and `validatePlan([n("a1"), n("b-2", ["a1"])])` is `null` |

   In `tests/core/engine.test.ts` (10 tests):

   | Test | Given | Expect |
   |------|-------|--------|
   | moveNotes asks for the plan | `moveNotes(deriveState(toPlan))` | `["Return the plan: 2 to 12 nodes, each one idea, deps listing the nodes it builds on."]` |
   | moveNotes says to finish when every node is settled | `moveNotes(st(...toCheck("n1"), pick(1), ...toCheck("n2"), pick(1)))` | `["Every node is passed or shaky. Return lesson_done."]` |
   | moveNotes asks for an explanation after a predict | `moveNotes(st(act(A.predict("n1")), say()))` | `["Explain node n1 and include a check question."]` |
   | moveNotes asks for a verdict on the first text check | `moveNotes(st(...toCheck("n1", textQ), say()))` | `["The learner's last answer is a free-text check on node n1. Set verdict. If pass, continue with the next step. If fail, explain node n1 again from a different angle with a new check question."]` |
   | checkAction rejects an empty goal | `checkAction(deriveState([act(A.probe()), pick(1)]), { ...A.probeDone(), goal: "  " } as any)` | `"goal is empty"` |
   | checkAction rejects a predict for a node that is already passed | `checkAction(st(...toCheck("n1"), pick(1)), A.predict("n1"))` | `"node n1 cannot start now"` |
   | a text check on the last node allows lesson_done with a verdict | `state = st(...toCheck("n1"), pick(1), ...toCheck("n2", textQ), say())`; | `checkAction(state, A.done("pass"))` is `null`; `checkAction(state, A.done(null))` is `"verdict is required"` |
   | deriveState throws on an action while the learner is meant to answer | `deriveState([act(A.probe()), act(A.probe())])` | throws `"corrupt session at event 1"` |
   | deriveState throws on a null verdict after a text check | `deriveState([...toTeach, ...toCheck("n1", textQ), say(), act(A.predict("n2"))])` | throws `"corrupt session at event 8"` |
   | learnedToSave drops items with empty text | state `st(...toCheck("n1"), pick(1))`; action `{ ...A.done(), learned: [{ nodeId: "n1", text: "  " }, { nodeId: "n1", text: "ok" }] }` | `[{ nodeId: "n1", text: "ok" }]` |

   In `tests/core/prompt.test.ts` (1 test):

   | Test | Given | Expect |
   |------|-------|--------|
   | renderTranscript grades choice checks | `renderTranscript([...toTeach, ...toCheck("n1"), pick(1), act(A.explain("n1")), pick(0)])` split on `"\n"` | the line for `pick(1)` (index 7) contains `"graded":"pass"`; the line for `pick(0)` (index 9) contains `"graded":"fail"`; the line for the predict answer (index 5) contains `"graded":null` |

   In `tests/shared/schema.test.ts` (2 tests):

   | Test | Given | Expect |
   |------|-------|--------|
   | parseReply rejects an extra property | `parseReply('{"action":{"type":"probe_done","known":[],"goal":"g","extra":1}}')` | `ok` false |
   | parseReply rejects an empty question prompt | `parseReply(JSON.stringify({ action: A.probe({ ...choiceQ, prompt: "" }) }))` | `ok` false |

2. Run tests. Expected: exactly 2 failed (the two `plan.test.ts` tests), 74 passed: `Tests  2 failed | 74 passed (76)`. The other 13 tests pass at once because they only cover behavior that already exists. Paste the output. If any of those 13 fails, stop and report: it means the blueprint and the code disagree.
3. In `src/core/plan.ts` change `validatePlan` so that:
   - the empty check is `x.id.trim() === "" || x.title.trim() === ""` (still `"empty id or title"`);
   - immediately after the empty check and before the duplicate check, any node whose `id` does not match `/^[a-z0-9][a-z0-9-]{0,39}$/` returns `` `invalid node id: ${id}` `` (first offending node in plan order).
4. Run tests. Expected: `Tests  76 passed (76)`. Run `npm run format && npm run lint && npm run typecheck`: exit 0. Paste.
5. Tick T10b in the Progress list, then `git add src/core/plan.ts tests docs/blueprint/PLAN.md && git commit -m "fix: harden plan ids and cover untested rules"`.

**Stop and report instead of continuing if**
- any of the 13 tests that should pass at once fails in step 2,
- tests fail after two attempts, or you need a file not named here.

### GATE A - The lesson rules work from the test suite

The builder stops here. Nothing continues until the owner says so.

**Run**: `npm test` -> expect `Tests  76 passed (76)`; `npm run lint && npm run typecheck` -> exit 0
**Look at**: `git diff <blueprint-commit>..HEAD --stat` -> only the config files from T1, `src/shared/`, `src/core/`, `src/main/index.ts`, `src/preload/index.ts`, `src/renderer/`, `tests/`, `package-lock.json`, `PLAN.md`
**Fresh review**: run the reviewer prompt from the skill's `references/execution.md` over T1-T10 against SPEC.md and ARCHITECTURE.md. Attach its verdict.
**Try it yourself**: run `npm run dev` (a dark window titled lodestar opens). Then open `tests/core/engine.test.ts`, find `third_fail_marks_shaky`, change one `pick(0)` to `pick(1)`, run `npm test`, and watch that test fail. Undo the change.
**Explain it back**: "A lesson is saved as a list of events, not as 'current phase: teach, step 3'. What does the app do when you reopen a lesson, and why does a failed Codex call never leave the lesson half-changed?"
**Then decide**: continue to Stage B / raise a change request

---

## Stage B - Codex, storage and the turn loop
What the owner can see working at the end: `npm run eval` drives seven real Codex calls through the rules and prints a score of at least 6 of 7 on the first try.

### T11 - Finding the CLI on disk

**Implements**: B1 (part) · `CliAdapter`, `extraPathDirs`, `resolveCommand` · decision D23 (search common install folders)
**Depends on**: T3

**Context**: types `DetectResult`, `RunRequest`, `RunResult` are in `src/shared/types.ts`. A Mac app opened from Finder does not get the terminal's PATH, so the app also searches common install folders.

**Files**
- Create: `src/main/cli/adapter.ts`, `tests/main/adapter.test.ts`
- Do NOT touch the file system in this file: `exists` is passed in.

**Steps**
1. Create `tests/main/adapter.test.ts` with 4 tests:

   | Test | Given | Expect |
   |------|-------|--------|
   | extraPathDirs lists the common install folders | `extraPathDirs("/Users/x")` | `["/opt/homebrew/bin", "/usr/local/bin", "/Users/x/.local/bin", "/Users/x/.npm-global/bin"]` |
   | resolveCommand finds the command on PATH first | `resolveCommand("codex", "/a:/b", ["/c"], (p) => p === "/b/codex" \|\| p === "/c/codex")` | `"/b/codex"` |
   | resolveCommand falls back to the extra folders | same with `exists = (p) => p === "/c/codex"` | `"/c/codex"` |
   | resolveCommand returns null when nothing exists | `exists = () => false` | `null` |
2. Run tests. Expected: `adapter.test.ts` fails to import. Paste.
3. Create `src/main/cli/adapter.ts`:
   - `export interface CliAdapter { id: "codex"; detect(): Promise<DetectResult>; run(req: RunRequest): Promise<RunResult> }`
   - `extraPathDirs(home: string): string[]` as in test 1.
   - `resolveCommand(name: string, pathEnv: string, extraDirs: string[], exists: (p: string) => boolean): string | null`: split `pathEnv` on `":"`, drop empty parts, append `extraDirs`, return the first `dir + "/" + name` for which `exists` is true.
4. Run tests. Expected: `Tests  80 passed (80)`. Paste.
5. Tick T11, then `git add -A && git commit -m "feat: cli adapter interface and command lookup"`.

**Stop and report if** tests fail after two attempts.

### T12 - Reading Codex output

**Implements**: B12 (message part) · `parseCodexEvents`, `lastStderrLine`
**Depends on**: T11

**Context**: `codex exec --json` prints one JSON object per line. Real sample (Codex 0.167.0):
```
{"type":"thread.started","thread_id":"01a1"}
{"type":"turn.started"}
{"type":"item.completed","item":{"id":"item_0","type":"agent_message","text":"{\"action\":{...}}"}}
{"type":"turn.completed","usage":{"input_tokens":17302,"cached_input_tokens":0,"output_tokens":20}}
```
`Usage = { inputTokens: number; outputTokens: number }`. `STDERR_MAX` (200) is in limits.

**Files**
- Create: `src/main/cli/codex.ts`, `tests/main/codex.test.ts`
- Do NOT spawn anything yet.

**Steps**
1. Create `tests/main/codex.test.ts` with 6 tests. `SAMPLE` is the four lines above joined by `"\n"` with `item.text` set to `"REPLY"`.

   | Test | Given | Expect |
   |------|-------|--------|
   | parseCodexEvents returns the agent message and usage | `parseCodexEvents(SAMPLE)` | `{ text: "REPLY", usage: { inputTokens: 17302, outputTokens: 20 } }` |
   | parseCodexEvents keeps the last agent message and skips junk lines | `SAMPLE` with the line `not json` inserted first and a second `item.completed` agent message with text `"LAST"` before `turn.completed` | `text` is `"LAST"` |
   | parseCodexEvents returns nulls when there is no message | `parseCodexEvents('{"type":"turn.started"}')` | `{ text: null, usage: null }` |
   | lastStderrLine returns the last non-empty line | `lastStderrLine("a\nboom  \n\n")` | `"boom"` |
   | cli_error_shows_last_stderr_line | `lastStderrLine("x".repeat(300))` | a string of length 200 |
   | lastStderrLine has a default for empty stderr | `lastStderrLine("")` | `"exited with an error"` |
2. Run tests. Expected: `codex.test.ts` fails to import. Paste.
3. Create `src/main/cli/codex.ts` exporting:
   - `parseCodexEvents(stdout: string): { text: string | null; usage: Usage | null }`: split on `"\n"`; `JSON.parse` each non-empty line inside try/catch (skip failures); `text` = `item.text` of the last object with `type === "item.completed"` and `item.type === "agent_message"`; `usage` from the last object with `type === "turn.completed"`: `{ inputTokens: usage.input_tokens, outputTokens: usage.output_tokens }`.
   - `lastStderrLine(stderr: string): string`: last line whose `trim()` is non-empty, trimmed, cut with `.slice(0, STDERR_MAX)`; `"exited with an error"` when there is none.
4. Run tests. Expected: `Tests  86 passed (86)`. Paste.
5. Tick T12, then `git add -A && git commit -m "feat: parse codex output"`.

**Stop and report if** tests fail after two attempts.

### T13 - Codex adapter: detect

**Implements**: B1 · `createCodexAdapter`, `detect`
**Depends on**: T12

**Context**: `src/main/cli/adapter.ts` exports `CliAdapter`, `extraPathDirs`, `resolveCommand`. `DETECT_TIMEOUT_MS` is in limits. `DetectResult = { ok: true; version: string } | { ok: false }`.

**Files**
- Create: `tests/helpers/fakes.ts`
- Modify: `src/main/cli/codex.ts`, `tests/main/codex.test.ts`
- Do NOT implement `run` yet: make it return `{ ok: false, kind: "failed", message: "not implemented" }`.

**Steps**
1. Create `tests/helpers/fakes.ts` exactly:
   ```ts
   import { EventEmitter } from "node:events";
   import { PassThrough } from "node:stream";

   export type FakePlan = { stdout?: string; stderr?: string; code?: number; hang?: boolean; missing?: boolean };
   export type FakeCall = { cmd: string; args: string[]; opts: any; stdin: string; killed: boolean };

   /** A stand-in for child_process.spawn. Each spawn uses the next plan (the last one repeats). */
   export function fakeSpawn(...plans: FakePlan[]) {
     const calls: FakeCall[] = [];
     const spawn = (cmd: string, args: string[], opts: any) => {
       const plan = plans[Math.min(calls.length, plans.length - 1)] ?? {};
       const call: FakeCall = { cmd, args, opts, stdin: "", killed: false };
       calls.push(call);
       const child: any = new EventEmitter();
       child.stdout = new PassThrough();
       child.stderr = new PassThrough();
       child.stdin = new PassThrough();
       child.stdin.on("data", (d: Buffer) => (call.stdin += d.toString()));
       child.kill = () => {
         call.killed = true;
         setImmediate(() => child.emit("close", null));
         return true;
       };
       setImmediate(() => {
         if (plan.missing) return child.emit("error", Object.assign(new Error("spawn ENOENT"), { code: "ENOENT" }));
         if (plan.hang) return;
         child.stdout.end(plan.stdout ?? "");
         child.stderr.end(plan.stderr ?? "");
         setImmediate(() => child.emit("close", plan.code ?? 0));
       });
       return child;
     };
     return { spawn: spawn as any, calls };
   }
   ```
2. Add 5 tests to `tests/main/codex.test.ts`. Helper: `make(plan, env = { LEARN_CODEX_PATH: "/fake/codex", PATH: "" }, fsDep = fs)` creates `tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "lh-test-"))`, `f = fakeSpawn(plan)`, and `adapter = createCodexAdapter({ spawn: f.spawn, env, home: "/home/x", tmpRoot, fs: fsDep, detectTimeoutMs: 30 })` (`fs` is `node:fs`); returns `{ adapter, f, tmpRoot }`.

   | Test | Given | Expect |
   |------|-------|--------|
   | detect returns the version | `make({ stdout: "codex-cli 0.167.0\n" })` then `detect()` | `{ ok: true, version: "0.167.0" }`; `f.calls[0].cmd` is `"/fake/codex"`, `args` equals `["--version"]`, `opts.shell` is `false` |
   | detect_reports_missing_cli | `make({ missing: true })` | `{ ok: false }` |
   | detect fails on a non-zero exit | `make({ code: 1 })` | `{ ok: false }` |
   | detect_times_out_after_5s | `make({ hang: true })` (limit is 30 ms in tests) | `{ ok: false }` and `f.calls[0].killed` is `true` |
   | detect fails when no command can be found | `make({}, { PATH: "/nowhere" }, { ...fs, existsSync: () => false } as typeof fs)` (the stub matters: a real Codex may be installed on this machine) | `{ ok: false }` and `f.calls.length` is `0` |
3. Run tests. Expected: 5 failed, 86 passed. Paste.
4. In `src/main/cli/codex.ts` add `createCodexAdapter(deps: { spawn: typeof import("node:child_process").spawn; env: NodeJS.ProcessEnv; home: string; tmpRoot: string; fs: typeof import("node:fs"); detectTimeoutMs?: number }): CliAdapter`:
   - command = `deps.env.LEARN_CODEX_PATH` if set and non-empty, else `resolveCommand("codex", deps.env.PATH ?? "", extraPathDirs(deps.home), deps.fs.existsSync)`. Resolve it on every `detect()` and `run()` call.
   - `detect()`: no command -> `{ ok: false }`. Otherwise spawn `command` with args `["--version"]` and options `{ shell: false }`, collect stdout, and resolve exactly once: on `"error"` -> `{ ok: false }`; on `"close"` with code 0 and a match of `/\d+\.\d+\.\d+/` in stdout -> `{ ok: true, version: match[0] }`; on any other close -> `{ ok: false }`; when `deps.detectTimeoutMs ?? DETECT_TIMEOUT_MS` passes first -> `child.kill("SIGKILL")` and `{ ok: false }`. Clear the timer when resolved.
5. Run tests. Expected: `Tests  91 passed (91)`. Paste.
6. Tick T13, then `git add -A && git commit -m "feat: detect the codex cli"`.

**Stop and report if** the fake in step 1 does not type-check against your call (do not change the fake; paste the error), or tests fail after two attempts.

### T14 - Codex adapter: run

**Implements**: B12, B13, B20 · adapter `run`
**Depends on**: T13

**Context**
- `src/main/cli/codex.ts` has `createCodexAdapter` (with `detect`), `parseCodexEvents`, `lastStderrLine`. `tests/helpers/fakes.ts` has `fakeSpawn`. The test helper `make(plan, env)` exists in `tests/main/codex.test.ts`.
- `RunRequest = { prompt: string; schema: object; signal: AbortSignal; timeoutMs: number }`; `RunResult = { ok: true; text; usage } | { ok: false; kind: "failed" | "timeout" | "aborted"; message }`.
- Verified command line: `codex exec --json --output-schema <file> --ephemeral --sandbox read-only --skip-git-repo-check -` with the prompt on stdin.

**Files**
- Modify: `src/main/cli/codex.ts`, `tests/main/codex.test.ts`

**Steps**
1. Add 8 tests. `req(over = {})` returns `{ prompt: "PROMPT", schema: { a: 1 }, signal: new AbortController().signal, timeoutMs: 1000, ...over }`. `OK` is the T12 `SAMPLE` string. `empty(dir)` is `fs.readdirSync(dir).length === 0`.

   | Test | Given | Expect |
   |------|-------|--------|
   | codex_spawn_uses_safe_flags | `make({ stdout: OK })`, `run(req())` | call `cmd` `"/fake/codex"`; `args[0..2]` are `"exec"`, `"--json"`, `"--output-schema"`; `args[3]` ends with `"schema.json"`; `args.slice(4)` equals `["--ephemeral", "--sandbox", "read-only", "--skip-git-repo-check", "-"]`; `opts.shell` is `false`; `opts.cwd` ends with `"/work"`; `opts.env.PATH` contains `"/opt/homebrew/bin"` |
   | run returns the message and usage | same | result equals `{ ok: true, text: "REPLY", usage: { inputTokens: 17302, outputTokens: 20 } }` |
   | run writes the prompt to stdin | same | `f.calls[0].stdin` is `"PROMPT"` |
   | run reports a non-zero exit with the last stderr line | `make({ code: 1, stderr: "warn\nstream disconnected\n" })` | `{ ok: false, kind: "failed", message: "stream disconnected" }` |
   | run reports an exit with no message | `make({ stdout: '{"type":"turn.started"}' })` | `{ ok: false, kind: "failed", message: "Codex returned no message" }` |
   | cli_timeout_after_180s | `make({ hang: true })`, `run(req({ timeoutMs: 30 }))` | `kind` is `"timeout"`, `message` is `"no reply after 0.03 seconds"`, `f.calls[0].killed` is `true` |
   | stop_kills_process_and_restores | `make({ hang: true })`; `c = new AbortController()`; start `run(req({ signal: c.signal }))`; `setTimeout(() => c.abort(), 10)` | `{ ok: false, kind: "aborted", message: "stopped" }`, `killed` is `true` |
   | temp_dir_removed_after_call | after each of: a success, the non-zero exit, and the abort case | `f.calls.length` is `1` and `empty(tmpRoot)` is `true` each time |
2. Run tests. Expected: 8 failed, 91 passed. Paste.
3. Implement `run(req)`:
   - no command -> `{ ok: false, kind: "failed", message: "Codex CLI not found" }`.
   - `root = fs.mkdtempSync(path.join(tmpRoot, "lh-"))`; write `JSON.stringify(req.schema)` to `root/schema.json`; `fs.mkdirSync(root/work)`.
   - spawn `command` with the args from test 1 and options `{ cwd: root/work, shell: false, stdio: ["pipe", "pipe", "pipe"], env: { ...deps.env, PATH: [deps.env.PATH ?? "", ...extraPathDirs(deps.home)].filter(Boolean).join(":") } }`.
   - `child.stdin.end(req.prompt)`. Collect stdout and stderr as strings.
   - Resolve exactly once (guard with a `settled` flag), always after `fs.rmSync(root, { recursive: true, force: true })` and clearing the timer and abort listener:
     - timer of `req.timeoutMs` fires -> `child.kill("SIGKILL")`, `{ ok: false, kind: "timeout", message: "no reply after " + req.timeoutMs / 1000 + " seconds" }`;
     - `req.signal` aborts (also check `req.signal.aborted` before spawning) -> `child.kill("SIGKILL")`, `{ ok: false, kind: "aborted", message: "stopped" }`;
     - `"error"` event -> `{ ok: false, kind: "failed", message: "Codex CLI not found" }`;
     - `"close"` with code 0 -> `parseCodexEvents(stdout)`; `text === null` -> `{ ok: false, kind: "failed", message: "Codex returned no message" }`, else `{ ok: true, text, usage }`;
     - `"close"` with any other code -> `{ ok: false, kind: "failed", message: lastStderrLine(stderr) }`.
4. Run tests. Expected: `Tests  99 passed (99)`. Paste.
5. Tick T14, then `git add -A && git commit -m "feat: run codex safely and parse its reply"`.

**Stop and report if** tests fail after two attempts, or a test hangs (paste which).

### T15 - Store: sessions

**Implements**: B15, B16 (order), B17 (file part) · `createStore`, `writeJsonAtomic`, `listSessions`, `readSession`, `writeSession`, `deleteSession` · decision D16
**Depends on**: T3

**Context**: `Session` is in `src/shared/types.ts`. Fixture `session(events)` is in `tests/helpers/fixtures.ts` (its id is `s_00000000-0000-0000-0000-000000000000`).

**Files**
- Create: `src/main/store.ts`, `tests/main/store.test.ts`
- Do NOT add knowledge functions yet (T16).

**Steps**
1. Create `tests/main/store.test.ts` with 6 tests. `fsp` is `node:fs/promises`. `mk()` makes `dir = await fsp.mkdtemp(path.join(os.tmpdir(), "lh-store-"))` and returns `{ dir, store: await createStore(dir, fsp) }`. `withId(n, updatedAt)` returns `{ ...session(), id: "s_0000000" + n + "-0000-0000-0000-000000000000", updatedAt }`.

   | Test | Given | Expect |
   |------|-------|--------|
   | a session round-trips | `writeSession(session())`, then `readSession(session().id)` | equals `session()`; file `dir/sessions/<id>.json` exists |
   | save_is_atomic | write `session()`; then build a second store with `{ ...fsp, rename: async () => { throw new Error("disk") } }` and call `writeSession({ ...session(), topic: "NEW" })` | the call rejects; `readSession` (first store) still returns topic `"T"` |
   | sessions_listed_newest_first | write `withId(1, "2026-01-01T00:00:00.000Z")`, `withId(2, "2026-01-03T00:00:00.000Z")`, `withId(3, "2026-01-02T00:00:00.000Z")` | `listSessions()` ids end with 2, 3, 1 in that order |
   | unparsable files are skipped | also write the text `nope` to `dir/sessions/s_broken.json` | `listSessions()` has length 3 from the previous arrangement (re-create it) |
   | readSession returns null for a bad or missing id | `readSession("../etc/passwd")`, `readSession("s_00000009-0000-0000-0000-000000000000")` | both `null` |
   | deleteSession removes the file and tolerates a missing one | write, delete, read; then delete again | read gives `null`; second delete resolves |
2. Run tests. Expected: `store.test.ts` fails to import. Paste.
3. Create `src/main/store.ts` exporting `type Store` (the methods below plus, in T16, the knowledge methods) and `createStore(dir: string, fs: typeof import("node:fs/promises")): Promise<Store>`, which first runs `fs.mkdir(path.join(dir, "sessions"), { recursive: true })`:
   - `writeJsonAtomic(file, data)`: `await fs.writeFile(file + ".tmp", JSON.stringify(data, null, 2), "utf8")` then `await fs.rename(file + ".tmp", file)`.
   - id rule: `const ID = /^[sk]_[0-9a-f-]{36}$/`. `readSession(id)`: bad id -> `null`; read and `JSON.parse` in try/catch -> `null` on any error. `writeSession(s)`: `writeJsonAtomic(sessions/<id>.json, s)`. `deleteSession(id)`: bad id -> resolve; else `fs.rm(file, { force: true })`.
   - `listSessions()`: read every `*.json` in `sessions/`, skip those that fail to parse, sort by `updatedAt` descending (string compare).
4. Run tests. Expected: `Tests  105 passed (105)`. Paste.
5. Tick T15, then `git add -A && git commit -m "feat: session storage with atomic writes"`.

**Stop and report if** tests fail after two attempts.

### T16 - Store: knowledge

**Implements**: B18 (file part) · `readKnowledge`, `addKnowledge`, `deleteKnowledge`
**Depends on**: T15

**Context**: `src/main/store.ts` has `createStore` with `writeJsonAtomic`. `KnowledgeItem = { id: string; text: string; sessionId: string; nodeId: string; createdAt: string }`. The file is `<dir>/knowledge.json`, a JSON array.

**Files**
- Modify: `src/main/store.ts`, `tests/main/store.test.ts`

**Steps**
1. Add 4 tests. `ki(n, createdAt)` returns `{ id: "k_0000000" + n + "-0000-0000-0000-000000000000", text: "t" + n, sessionId: "s", nodeId: "n1", createdAt }`.

   | Test | Given | Expect |
   |------|-------|--------|
   | knowledge is empty when the file is missing | `readKnowledge()` on a new store | `[]` |
   | knowledge_listed_newest_first | `addKnowledge([ki(1, "2026-01-01T00:00:00.000Z")])` then `addKnowledge([ki(2, "2026-01-02T00:00:00.000Z")])` | `readKnowledge()` texts are `["t2", "t1"]` |
   | knowledge_item_deleted | then `deleteKnowledge(ki(1, "").id)` | texts are `["t2"]`, and `JSON.parse` of `knowledge.json` has length 1 |
   | deleting an unknown id changes nothing | `deleteKnowledge("k_99999999-0000-0000-0000-000000000000")` | resolves; list unchanged |
2. Run tests. Expected: 4 failed, 105 passed. Paste.
3. Add to the store: `readKnowledge()` (missing or unparsable file -> `[]`; sorted by `createdAt` descending), `addKnowledge(items)` (read, append, `writeJsonAtomic`; no write when `items` is empty), `deleteKnowledge(id)` (read, filter, `writeJsonAtomic`).
4. Run tests. Expected: `Tests  109 passed (109)`. Paste.
5. Tick T16, then `git add -A && git commit -m "feat: knowledge list storage"`.

**Stop and report if** tests fail after two attempts.

### T17 - One model step with retry

**Implements**: B11, B12 (message) · `modelStep`
**Depends on**: T10, T11, T4

**Context**
- `buildPrompt({ session, state, knowledge, retryNote })` in `src/core/prompt.ts`; `parseReply(text)` and `REPLY_JSON_SCHEMA` in `src/shared/schema.ts`; `checkAction(state, action)` and `allowedActions(state)` in `src/core/engine.ts`; `CliAdapter` in `src/main/cli/adapter.ts`; `CALL_TIMEOUT_MS` in limits.
- `TurnError = { kind: "cli" | "bad_reply" | "busy" | "stopped" | "not_found" | "invalid_answer"; message: string }`.

**Files**
- Create: `src/main/turn.ts`, `tests/main/turn.test.ts`
- Modify: `tests/helpers/fakes.ts` (add `fakeAdapter` only)

**Steps**
1. Add to `tests/helpers/fakes.ts`:
   ```ts
   import type { Action, RunRequest, RunResult } from "../../src/shared/types";
   import type { CliAdapter } from "../../src/main/cli/adapter";

   /** Replies in order. An Action is wrapped as a good reply; a string is returned as raw text; a RunResult is returned as is. */
   export function fakeAdapter(...replies: (Action | string | RunResult)[]) {
     const prompts: string[] = [];
     const adapter: CliAdapter = {
       id: "codex",
       detect: async () => ({ ok: true, version: "0.0.0" }),
       run: async (req: RunRequest): Promise<RunResult> => {
         prompts.push(req.prompt);
         const r = replies[prompts.length - 1];
         if (r === undefined) return { ok: false, kind: "failed", message: "no more fake replies" };
         if (typeof r === "string") return { ok: true, text: r, usage: null };
         if ("ok" in r) return r;
         return { ok: true, text: JSON.stringify({ action: r }), usage: { inputTokens: 1, outputTokens: 1 } };
       },
     };
     return { adapter, prompts };
   }
   ```
2. Create `tests/main/turn.test.ts` with 5 tests. `step(events, ...replies)` builds `f = fakeAdapter(...replies)`, `s = session(events)` and returns `{ f, result: await modelStep({ adapter: f.adapter, knowledge: [] }, s, deriveState(events), new AbortController().signal) }`.

   | Test | Given | Expect |
   |------|-------|--------|
   | modelStep returns a valid action | `step([], A.probe())` | result equals `{ ok: true, action: A.probe(), usage: { inputTokens: 1, outputTokens: 1 }, calls: 1 }` |
   | a bad reply is retried once with a note | `step([], "garbage", A.probe())` | `ok` true, `calls` 2; `f.prompts[1]` ends (after `trimEnd()`) with `"Your last reply was not usable: not valid JSON. Allowed now: probe, probe_done."` |
   | bad_reply_retries_once_then_errors | `step([], "garbage", "garbage", A.probe())` | result equals `{ ok: false, error: { kind: "bad_reply", message: "The model gave an unusable reply. Press Retry." } }`; `f.prompts.length` is 2 |
   | an action that is not allowed counts as a bad reply | `step([], A.plan(), A.probe())` | `ok` true; `f.prompts[1]` contains `"Your last reply was not usable: plan is not allowed now."` |
   | a CLI failure is returned at once | `step([], { ok: false, kind: "failed", message: "boom" })` | `{ ok: false, error: { kind: "cli", message: "Codex failed: boom" } }`; `f.prompts.length` is 1 |
3. Run tests. Expected: `turn.test.ts` fails to import. Paste.
4. Create `src/main/turn.ts` exporting `modelStep(deps: { adapter: CliAdapter; knowledge: KnowledgeItem[] }, session: Session, state: LessonState, signal: AbortSignal): Promise<{ ok: true; action: Action; usage: Usage | null; calls: number } | { ok: false; error: TurnError }>`:
   ```ts
   let retryNote: string | null = null;
   for (let attempt = 1; attempt <= 2; attempt++) {
     const prompt = buildPrompt({ session, state, knowledge: deps.knowledge, retryNote });
     const run = await deps.adapter.run({ prompt, schema: REPLY_JSON_SCHEMA, signal, timeoutMs: CALL_TIMEOUT_MS });
     if (!run.ok) {
       if (run.kind === "aborted") return { ok: false, error: { kind: "stopped", message: "Stopped." } };
       return { ok: false, error: { kind: "cli", message: "Codex failed: " + run.message } };
     }
     const parsed = parseReply(run.text);
     const reason = parsed.ok ? checkAction(state, parsed.action) : parsed.reason;
     if (parsed.ok && reason === null) return { ok: true, action: parsed.action, usage: run.usage, calls: attempt };
     retryNote = `Your last reply was not usable: ${reason}. Allowed now: ${allowedActions(state).join(", ")}.`;
   }
   return { ok: false, error: { kind: "bad_reply", message: "The model gave an unusable reply. Press Retry." } };
   ```
5. Run tests. Expected: `Tests  114 passed (114)`. Paste.
6. Tick T17, then `git add -A && git commit -m "feat: one model step with a single retry"`.

**Stop and report if** tests fail after two attempts.

### T18 - The advance loop

**Implements**: B10, B12, B13, B14 · `createTurnRunner`, `advance`, `stop`, `isRunning`
**Depends on**: T17, T16

**Context**
- `src/main/turn.ts` exports `modelStep`. `Store` (from `src/main/store.ts`) has `readSession`, `writeSession`, `readKnowledge`, `addKnowledge`. `deriveState`, `learnedToSave` are in `src/core/engine.ts`.
- `TurnResult = { ok: true; session: Session } | { ok: false; error: TurnError; session: Session | null }`.

**Files**
- Modify: `src/main/turn.ts`, `tests/main/turn.test.ts`

**Steps**
1. Add 6 tests. `setup(events, ...replies)`: a real store in a temp dir (as in `store.test.ts`), `await store.writeSession(session(events))`, `f = fakeAdapter(...replies)`, `notified: Session[] = []`, a counter for ids, and `runner = createTurnRunner({ adapter: f.adapter, store, now: () => "2026-02-02T00:00:00.000Z", newId: (p) => p + "_0000000" + ++n + "-0000-0000-0000-000000000000", notify: (s) => notified.push(s) })`. `ID` is `session().id`.

   | Test | Given | Expect |
   |------|-------|--------|
   | advance keeps going until the learner must answer | `setup([act(A.probe()), pick(1)], A.probeDone(), A.plan(), A.predict("n1"))`, `advance(ID)` | `ok` true; `result.session.events.length` is 5; `notified.length` is 3; stored session has 5 events and `updatedAt` `"2026-02-02T00:00:00.000Z"`; `f.prompts.length` is 3 |
   | failed_call_leaves_session_unchanged | `setup([], { ok: false, kind: "failed", message: "boom" })`; read the file text before and after `advance(ID)` | result `error.kind` is `"cli"`; `result.session` equals `session([])`; file text identical |
   | second_call_refused_while_running | adapter whose `run` awaits a promise you resolve later; call `advance(ID)` twice without awaiting the first | the second resolves to `ok: false` with `error` `{ kind: "busy", message: "A reply is already on the way." }`; the adapter was called once; then resolve and await the first |
   | stop ends the running call | adapter whose `run` resolves `{ ok: false, kind: "aborted", message: "stopped" }` when `req.signal` aborts; start `advance(ID)`, check `isRunning(ID)` is `true`, call `stop(ID)` | result `error` equals `{ kind: "stopped", message: "Stopped." }`; `isRunning(ID)` is `false` afterwards |
   | advance reports a missing lesson | `advance("s_99999999-0000-0000-0000-000000000000")` | `{ ok: false, error: { kind: "not_found", message: "This lesson no longer exists." }, session: null }` |
   | lesson_done adds knowledge for passed nodes only | events `[...toTeach, ...toCheck("n1"), pick(1), ...toCheck("n2"), pick(0), act(A.explain("n2")), pick(0), act(A.explain("n2")), pick(0)]`, reply `A.done()` | `store.readKnowledge()` equals `[{ id: "k_00000001-0000-0000-0000-000000000000", text: "t1", sessionId: ID, nodeId: "n1", createdAt: "2026-02-02T00:00:00.000Z" }]` |
2. Run tests. Expected: 6 failed, 114 passed. Paste.
3. Add to `src/main/turn.ts`:
   - `export type TurnRunner = { advance(id: string): Promise<TurnResult>; stop(id: string): void; isRunning(id: string): boolean }`
   - `createTurnRunner(deps: { adapter: CliAdapter; store: Store; now: () => string; newId: (prefix: "s" | "k") => string; notify: (session: Session) => void }): TurnRunner`, holding `const running = new Map<string, AbortController>()`:
     ```ts
     async function advance(id: string): Promise<TurnResult> {
       if (running.has(id)) return { ok: false, error: { kind: "busy", message: "A reply is already on the way." }, session: null };
       const controller = new AbortController();
       running.set(id, controller);
       try {
         let session = await deps.store.readSession(id);
         if (!session) return { ok: false, error: { kind: "not_found", message: "This lesson no longer exists." }, session: null };
         for (;;) {
           const state = deriveState(session.events);
           if (state.awaiting.who !== "model") return { ok: true, session };
           const knowledge = await deps.store.readKnowledge();
           const step = await modelStep({ adapter: deps.adapter, knowledge }, session, state, controller.signal);
           if (!step.ok) return { ok: false, error: step.error, session };
           const event: SessionEvent = { kind: "action", at: deps.now(), action: step.action, usage: step.usage };
           session = { ...session, updatedAt: deps.now(), events: [...session.events, event] };
           await deps.store.writeSession(session);
           if (step.action.type === "lesson_done") {
             const items = learnedToSave(deriveState(session.events), step.action);
             await deps.store.addKnowledge(items.map((it) => ({
               id: deps.newId("k"), text: it.text, sessionId: session!.id, nodeId: it.nodeId, createdAt: deps.now(),
             })));
           }
           deps.notify(session);
         }
       } finally {
         running.delete(id);
       }
     }
     ```
   - `stop(id)`: `running.get(id)?.abort()`. `isRunning(id)`: `running.has(id)`.
4. Run tests. Expected: `Tests  120 passed (120)`. Paste. Run `npm run format && npm run lint && npm run typecheck`: exit 0.
5. Tick T18, then `git add -A && git commit -m "feat: advance loop with stop and busy guard"`.

**Stop and report if** tests fail after two attempts, or a test hangs (paste which).

### T19 - Evals against real Codex

**Implements**: SPEC "LLM evals" E1-E7
**Depends on**: T18, T14

**Context**
- This task calls the real Codex CLI (about 7 to 14 calls, each 14k+ input tokens, up to 60 seconds each). It needs Codex installed and signed in.
- `createCodexAdapter` is in `src/main/cli/codex.ts`; `modelStep` in `src/main/turn.ts` returns `calls` (1 = first try, 2 = needed the retry) and `usage`.

**Files**
- Create: `evals/loop.eval.ts`
- Do NOT change anything under `src/`. Do NOT weaken a check to make an eval pass.

**Steps**
1. Create `evals/loop.eval.ts` with one test, `the loop holds together against real Codex`:
   - adapter: `createCodexAdapter({ spawn, env: process.env, home: os.homedir(), tmpRoot: os.tmpdir(), fs })` (real `spawn` from `node:child_process`, real `node:fs`).
   - lesson data (use exactly this, so transcripts make sense to the model):
     ```ts
     const base = { ...session(), topic: "Derivatives", goal: "Understand why the derivative is the slope of the tangent line" };
     const q1: Question = { kind: "choice", prompt: "What does the slope of a straight line measure?",
       options: ["How steep it is", "How long it is", "The area under it"], correctIndex: 0 };
     const probeRound = [act({ type: "probe", question: q1 }), ans({ choiceIndex: 0, confidence: "sure" })];
     const done = act({ type: "probe_done", known: ["Slope is rise over run"], goal: base.goal });
     const plan = act({ type: "plan", nodes: [
       { id: "avg-rate", title: "Average rate of change between two points", deps: [] },
       { id: "limit", title: "Letting the two points move together", deps: ["avg-rate"] } ] });
     const predict = (id: string) => act({ type: "predict", nodeId: id, verdict: null, feedback: null,
       question: { kind: "text", prompt: "What do you expect happens to the slope as the points get closer?", options: [], correctIndex: null } });
     const check: Question = { kind: "choice", prompt: "From x=1 to x=3, f goes from 2 to 8. Average rate of change?",
       options: ["6", "3", "4"], correctIndex: 1 };
     const explain = (id: string) => act({ type: "explain", nodeId: id, verdict: null, feedback: null,
       markdown: "The slope between two points is the change in f divided by the change in x.", check });
     const node = (id: string, choice: number) => [predict(id), say("It settles on one value"), explain(id), pick(choice)];
     ```
   - cases (events -> expected action type, plus an extra check on the returned action):

     | # | events | expect |
     |---|--------|--------|
     | E1 | `[]` | `probe` |
     | E2 | `probeRound` repeated 8 times | `probe_done` with `known.length >= 1` |
     | E3 | `[...probeRound, done]` | `plan` |
     | E4 | `[...probeRound, done, plan]` | `predict` with `nodeId === "avg-rate"` |
     | E5 | `[...probeRound, done, plan, predict("avg-rate"), say("It settles on one value")]` | `explain` with `nodeId === "avg-rate"` |
     | E6 | `[...probeRound, done, plan, ...node("avg-rate", 0)]` | `explain` with `nodeId === "avg-rate"` |
     | E7 | `[...probeRound, done, plan, ...node("avg-rate", 1), ...node("limit", 1)]` | `lesson_done` with `learned.length >= 1` |
   - for each case, in order: `s = { ...base, events }`, time the call to `modelStep({ adapter, knowledge: [] }, s, deriveState(events), new AbortController().signal)`; the case passes when `ok` is true, the type matches and the extra check holds; count `firstTry` (passed with `calls === 1`) and `withRetry` (passed at all); print one line per case: `E<n> <pass|FAIL> calls=<n> seconds=<s> inputTokens=<n or ?> type=<type or error message>`.
   - at the end print `EVAL SCORE first-try <firstTry>/7, with-retry <withRetry>/7`, then assert `firstTry >= 6`, `withRetry === 7`, every passed case took under 60 seconds, and E1's `inputTokens < 30000` when usage is present.
2. Run `npm run eval`. Expected: the seven `E` lines, `EVAL SCORE first-try N/7, with-retry 7/7` with N at least 6, and `Tests  1 passed (1)`. Paste the whole output.
3. Run `npm test`. Expected: `Tests  120 passed (120)` (evals are not part of `npm test`). Run `npm run format && npm run lint && npm run typecheck`: exit 0.
4. Tick T19, then `git add -A && git commit -m "test: evals against real codex"`.

**Stop and report instead of continuing if**
- the score is below the bar after one full re-run (paste both outputs; do not edit `src/` or the prompt: a prompt change is a change request for the owner),
- Codex reports a login, quota or network error,
- any call exceeds 60 seconds or E1 exceeds 30,000 input tokens.

### T19b - Gate B fixes (CR-1)

**Implements**: change request CR-1 (decision D29) · B12, B15, B18, B10 · `run` (stdin error, UTF-8 decoding), `createStore` (serialized writes, unique temp files, de-duplicated knowledge), `advance` (order of saving)
**Depends on**: T19

**Context**
- Fable's Gate B review found three Important defects in code that T14, T16 and T18 prescribed:
  1. `run` in `src/main/cli/codex.ts` writes the prompt with `child.stdin?.end(req.prompt)` and has no `error` listener on `child.stdin`. If Codex exits before reading, Node raises `EPIPE` on that stream, which is an uncaught exception in the main process.
  2. `run` collects output with `(d: Buffer) => (stdout += d.toString())`. A multi-byte character split across two chunks decodes to garbage.
  3. `createStore` in `src/main/store.ts` has one fixed temp name per file (`file + ".tmp"`) and `addKnowledge` / `deleteKnowledge` read, change and write without any lock, so concurrent calls lose items or fail on rename. And `advance` in `src/main/turn.ts` saves the session (with `lesson_done`) before it calls `addKnowledge`; if `addKnowledge` fails, a Retry sees a finished lesson and never adds the items.
- `tests/helpers/fakes.ts` has `FakePlan = { stdout?, stderr?, code?, hang?, missing? }` and `fakeSpawn(...plans)`. In `tests/main/codex.test.ts` the helper `make(plan, env, fsDep)` and `req()` / `OK` exist (see T14). In `tests/main/store.test.ts` the helpers `mk()` and `ki(n, createdAt)` exist (see T15, T16). In `tests/main/turn.test.ts` the helper `setup(events, ...replies)` and the constant `ID` exist (see T18).

**Files**
- Modify: `src/main/cli/codex.ts`, `src/main/store.ts`, `src/main/turn.ts`, `tests/helpers/fakes.ts`, `tests/main/codex.test.ts`, `tests/main/store.test.ts`, `tests/main/turn.test.ts`
- Do NOT touch any other file. Do NOT add dependencies. Do NOT change any exported signature or any user-facing message.

**Steps**

1. In `tests/helpers/fakes.ts` extend the fake (no other change):
   - add to `FakePlan`: `stdoutChunks?: Buffer[]; stdinError?: boolean;`
   - in `fakeSpawn`, inside the `setImmediate` block, directly after the `plan.hang` line: if `plan.stdinError`, call `child.stdin.emit("error", Object.assign(new Error("write EPIPE"), { code: "EPIPE" }))` (before ending stdout). Replace `child.stdout.end(plan.stdout ?? "")` with: if `plan.stdoutChunks` is set, `for (const c of plan.stdoutChunks) child.stdout.write(c); child.stdout.end();` else the existing `end`.
2. Add 5 tests (names exactly as shown):

   In `tests/main/codex.test.ts` (2 tests):

   | Test | Given | Expect |
   |------|-------|--------|
   | run survives a write error on stdin | `make({ stdinError: true, code: 1, stderr: "not signed in\n" })`, `await run(req())` | result equals `{ ok: false, kind: "failed", message: "not signed in" }` and the test process does not report an unhandled error |
   | run decodes characters split across output chunks | build `full = Buffer.from(JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "café ✓" } }) + "\n")`; `cut = full.indexOf(0xc3) + 1` (the "é" is the two bytes 0xC3 0xA9, so this cuts it in half); `make({ stdoutChunks: [full.subarray(0, cut), full.subarray(cut)] })` | `run(req())` is `{ ok: true, text: "café ✓", usage: null }` |

   In `tests/main/store.test.ts` (2 tests):

   | Test | Given | Expect |
   |------|-------|--------|
   | concurrent knowledge writes keep every item | `Promise.all([addKnowledge([ki(1, d1)]), addKnowledge([ki(2, d2)]), addKnowledge([ki(3, d3)])])` with three different ISO dates | all three promises resolve; `readKnowledge()` has length 3 |
   | adding the same knowledge item twice stores it once | `a = ki(1, d1)`; `b = { ...ki(1, d2), id: "k_00000009-0000-0000-0000-000000000000" }`; `addKnowledge([a])`; `addKnowledge([b])` | `readKnowledge()` has length 1 and its id is `a.id` |

   In `tests/main/turn.test.ts` (1 test):

   | Test | Given | Expect |
   |------|-------|--------|
   | a failed knowledge save does not finish the lesson | the lesson_done events from the existing `lesson_done adds knowledge for passed nodes only` test, replies `A.done(), A.done()`, and a store that is the real store except `addKnowledge` rejects with `new Error("disk")` on its first call and delegates to the real one afterwards | first `advance(ID)` rejects with `"disk"`; the stored session still has no `lesson_done` event (`deriveState(events).phase` is `"teach"`); second `advance(ID)` is `ok: true` with `deriveState(events).phase` `"done"`; `readKnowledge()` equals one item with text `"t1"` |

3. Replace the two fixed waits in `tests/main/turn.test.ts`: in `second_call_refused_while_running` and `stop ends the running call`, create `let reached!: () => void; const reachedP = new Promise<void>((r) => (reached = r));`, call `reached()` as the first line inside the adapter's `run` function of that test, and replace `await new Promise((r) => setTimeout(r, 20));` with `await reachedP;`. Behavior and assertions stay the same.
4. Run tests. Expected: `Tests  5 failed | 120 passed (125)`: the five new tests fail and nothing else (the stdin test may also print an unhandled-error line). Paste the output. If anything else fails, stop and report.
5. Fix the code:
   - `src/main/cli/codex.ts` (`run` only): immediately after the `deps.spawn(...)` call add `child.stdin?.on("error", () => {});` (the `close` handler already reports the failure). Add `child.stdout?.setEncoding("utf8"); child.stderr?.setEncoding("utf8");` and change the two data handlers to `(d: string) => (stdout += d)` and `(d: string) => (stderr += d)`.
   - `src/main/store.ts`:
     - add inside `createStore`:
       ```ts
       const tails = new Map<string, Promise<unknown>>();
       const serial = <T>(key: string, fn: () => Promise<T>): Promise<T> => {
         const result = (tails.get(key) ?? Promise.resolve()).then(fn, fn);
         tails.set(key, result.catch(() => undefined));
         return result;
       };
       let tmpCounter = 0;
       ```
     - in `writeJsonAtomic` use `const tmp = file + "." + process.pid + "." + tmpCounter++ + ".tmp";` for both the write and the rename (and remove the temp file with `fs.rm(tmp, { force: true })` in a `catch` before rethrowing, so a failed rename leaves nothing behind);
     - wrap the whole body of `addKnowledge` and of `deleteKnowledge` in `serial(knowledgeFile, async () => { ... })`;
     - in `addKnowledge`, before writing, drop every incoming item for which an existing item (or an earlier item in the same call) has the same `sessionId`, `nodeId` and `text`; if nothing is left to add, return without writing.
   - `src/main/turn.ts` (`advance` only): build the new session value first (`const next = { ...session, updatedAt: deps.now(), events: [...session.events, event] }`); if `step.action.type === "lesson_done"`, call `deps.store.addKnowledge(...)` (same item mapping as today, computed from `learnedToSave(deriveState(next.events), step.action)`) BEFORE `deps.store.writeSession(next)`; then `session = next`, then `deps.notify(session)`.
6. Run tests. Expected: `Tests  125 passed (125)`. Run `npm run format && npm run lint && npm run typecheck`: exit 0. Paste.
7. Tick T19b in the Progress list, then `git add src tests docs/blueprint/PLAN.md && git commit -m "fix: crash on early Codex exit, split characters, lost knowledge items"`.

**Stop and report instead of continuing if**
- step 4 shows any failure other than the five new tests,
- a test hangs (paste which),
- tests fail after two attempts, or you need a file not named here.

### GATE B - A lesson runs headless against real Codex

The builder stops here. Nothing continues until the owner says so.

**Run**: `npm test` -> expect `Tests  125 passed (125)`; `npm run eval` -> expect `EVAL SCORE first-try N/7, with-retry 7/7`, N >= 6
**Look at**: `git diff <gate-A-commit>..HEAD --stat` -> only `src/main/cli/`, `src/main/store.ts`, `src/main/turn.ts`, `tests/`, `evals/`, `PLAN.md`
**Fresh review**: run the reviewer prompt from the skill's `references/execution.md` over T11-T19 against SPEC.md and ARCHITECTURE.md. Attach its verdict.
**Try it yourself**: read the seven `E` lines from the eval output: how many seconds and input tokens does one call cost on your account? Decide whether that is acceptable for a 40-call lesson before the window is built.
**Explain it back**: "Every reply from Codex is checked twice: against the schema, and against the rules. Give one reply that passes the schema but must still be refused, and say what the app does next."
**Then decide**: plan Stage C in detail / raise a change request (for example about cost per call or the prompt)

---

## Stage C - the window
What the owner can see working at the end: start a lesson in the app, answer questions, see the map fill in, finish, and find the learned items on the Knowledge screen; quit mid-lesson and resume.

Planned on 2026-11-14 against the code as it exists after Gate B (decision D31). Test counts below assume 125 passing at the start of T20.

Conventions for every Stage C task (in addition to the ones at the top):
- Renderer tests live in `tests/renderer/<Name>.test.tsx`. Their first two lines are `// @vitest-environment jsdom` and `import "../helpers/dom";` (created in T26). Tests use `@testing-library/react` (`render`, `screen`), `@testing-library/user-event` (`userEvent.setup()`), and `window.api` fakes from `installApi` (created in T26).
- Components are named exports in `src/renderer/src/components/<Name>.tsx`. They import types from `../../../shared/types` and never import `electron`. Markup uses only the CSS classes that exist in `docs/blueprint/ui-template.html`.
- Text shown to the user is copied from `docs/blueprint/UI.md` "Copy" (plus the three additions listed in D31). Never reword.
- A task that adds a component also adds its tests in the same task; the failing run before the code is shown as in earlier tasks. "Run tests" expected counts are the whole suite.

### T20 - IPC handlers

**Implements**: B2, B14, B16, B17, B18 (main side) · `registerIpc` and all 11 channels · decisions D15, D31
**Depends on**: T18, T16

**Context**
- `registerIpc` is created here for the first time. Deps shape (from ARCHITECTURE): `{ ipcMain: Pick<Electron.IpcMain, "handle">; adapter: CliAdapter; store: Store; turns: TurnRunner; now: () => string; newId: (prefix: "s" | "k") => string; send: (channel: string, ...args: unknown[]) => void }`. Import `type { IpcMain } from "electron"` (type-only: fine in tests).
- Existing: `deriveState`, `validateNewLesson`, `checkAnswer` in `src/core/engine.ts`; `Store` in `src/main/store.ts` (`listSessions`, `readSession`, `writeSession`, `deleteSession`, `readKnowledge`, `deleteKnowledge`); `TurnRunner` in `src/main/turn.ts` (`advance`, `stop`, `isRunning`); types `Answer`, `Session`, `SessionSummary`, `KnowledgeView`, `TurnResult` in `src/shared/types.ts`.
- Handlers receive `(event, ...args)` in Electron; write each as `ipcMain.handle(channel, (_event, ...) => ...)`.
- In tests the fake is `const handlers = new Map<string, (...a: any[]) => any>(); const ipcMain = { handle: (c: string, f: (...a: any[]) => any) => { handlers.set(c, f); } };` and a handler is called as `await handlers.get("sessions:get")!(null, id)`. Real store in a temp dir (as in `store.test.ts`), `turns` is a fake object `{ advance: vi.fn(async (id) => ({ ok: true, session })), stop: vi.fn(), isRunning: vi.fn(() => false) }`, `send` is `vi.fn()`, `now: () => "2026-03-03T00:00:00.000Z"`, `newId: (p) => p + "_0000000" + ++n + "-0000-0000-0000-000000000000"`.

**Files**
- Create: `src/main/ipc.ts`, `tests/main/ipc.test.ts`
- Do NOT touch any other file. Do NOT add channels beyond the 11 below.

**Steps**

1. Create `tests/main/ipc.test.ts` with 15 tests:

   | Test | Given | Expect |
   |------|-------|--------|
   | cli:detect passes the adapter result through | adapter whose `detect` resolves `{ ok: true, version: "1.2.3" }` | handler result equals that |
   | sessions:list returns summaries newest first | store holds `session()` variants with ids ending 1, 2 and `updatedAt` 2026-01-01 and 2026-01-02, event lists `[]` and `[act(A.probe())]` | `[{ id: ...2, topic: "T", phase: "probe", updatedAt: ... }, { id: ...1, ... }]` (exactly these four keys) |
   | sessions:list leaves out a lesson that cannot be read | one good session and one with events `[pick(1)]` (derive throws) | only the good one is listed |
   | sessions:create rejects bad input | `{ topic: "", goal: "g" }` | `{ ok: false, message: "Enter a topic and a goal." }` and `listSessions()` is empty |
   | sessions:create stores a trimmed lesson | `{ topic: "  Maths ", goal: " Limits " }` | `{ ok: true, session }` where `session` equals `{ version: 1, id: "s_00000001-0000-0000-0000-000000000000", topic: "Maths", goal: "Limits", cli: "codex", createdAt: NOW, updatedAt: NOW, events: [] }` and the same object is in the store |
   | sessions:get returns a lesson or null | existing id; unknown id `"s_99999999-0000-0000-0000-000000000000"` | the session; `null` |
   | sessions:delete stops the turn and removes the lesson | write a session, call with its id | `turns.stop` called with the id; `readSession` is `null` afterwards |
   | lesson:advance runs the turn and announces the result | `turns.advance` resolves `R = { ok: true, session }` | handler returns `R`; `send` called with `("turn:ended", id, R)` |
   | lesson:answer refuses while a turn runs | `turns.isRunning` returns true | `{ ok: false, error: { kind: "busy", message: "A reply is already on the way." }, session: null }`; `turns.advance` not called |
   | lesson:answer reports a missing lesson | unknown id | `{ ok: false, error: { kind: "not_found", message: "This lesson no longer exists." }, session: null }` |
   | lesson:answer rejects an invalid answer | session `[act(A.probe())]`, answer `{ choiceIndex: null, text: null, reasoning: null, confidence: null }` | `error` equals `{ kind: "invalid_answer", message: "Pick an option." }`; stored events unchanged; `turns.advance` not called |
   | lesson:answer saves the answer, announces it, then advances | session `[act(A.probe())]`, answer `{ choiceIndex: 1, text: null, reasoning: "r", confidence: "sure" }` | stored session has 2 events and the second equals `{ kind: "answer", at: NOW, answer }`; `send` first call is `("session:updated", <that session>)`; `turns.advance` called once with the id; handler returns `turns.advance`'s result; `send` second call is `("turn:ended", id, result)` |
   | lesson:stop and lesson:running pass through | `turns.isRunning` returns true | `lesson:running` handler returns `true`; `lesson:stop` handler calls `turns.stop(id)` |
   | knowledge:list names the source lesson | knowledge items for an existing lesson (topic "T") and for a deleted one; both added with `addKnowledge` | the view items carry `lessonTopic: "T"` and `lessonTopic: null`, newest first |
   | knowledge:delete removes the item | `addKnowledge([ki])`, call with its id | `readKnowledge()` is empty |
2. Run tests. Expected: `ipc.test.ts` fails to import. Paste.
3. Create `src/main/ipc.ts` exporting `registerIpc(deps)` registering exactly these channels (name, arguments, behavior):
   - `cli:detect` () -> `adapter.detect()`
   - `sessions:list` () -> sessions from `store.listSessions()` mapped to `{ id, topic, phase, updatedAt }` where `phase = deriveState(events).phase`; a session for which `deriveState` throws is left out
   - `sessions:create` (`input: { topic: string; goal: string }`) -> `validateNewLesson`; on a message return `{ ok: false, message }`; else write and return `{ ok: true, session }` (fields trimmed; `id = newId("s")`; `version: 1`, `cli: "codex"`, `createdAt = updatedAt = now()`, `events: []`)
   - `sessions:get` (`id`) -> `store.readSession(id)`
   - `sessions:delete` (`id`) -> `turns.stop(id)`, then `store.deleteSession(id)`
   - `lesson:advance` (`id`) -> `const result = await turns.advance(id); send("turn:ended", id, result); return result;`
   - `lesson:answer` (`id`, `answer: Answer`) -> in this order: `turns.isRunning(id)` -> busy result; `readSession` null -> not_found result; `checkAnswer(deriveState(session.events), answer)` message -> `{ ok: false, error: { kind: "invalid_answer", message }, session }`; then write `{ ...session, updatedAt: now(), events: [...session.events, { kind: "answer", at: now(), answer }] }`, `send("session:updated", thatSession)`, then the same two lines as `lesson:advance`
   - `lesson:stop` (`id`) -> `turns.stop(id)`; `lesson:running` (`id`) -> `turns.isRunning(id)`
   - `knowledge:list` () -> `store.readKnowledge()` mapped to `{ ...item, lessonTopic }` where `lessonTopic` is the topic of the session whose id equals `item.sessionId`, or `null`
   - `knowledge:delete` (`id`) -> `store.deleteKnowledge(id)`
   Messages for busy and not_found are exactly those in SPEC / the table above. No `any` in `src/`.
4. Run tests. Expected: `Tests  140 passed (140)`. Run `npm run format && npm run lint && npm run typecheck`: exit 0. Paste.
5. Tick T20, then `git add -A && git commit -m "feat: ipc handlers"`.

**Stop and report instead of continuing if** tests fail after two attempts, or you need a file or channel not named here.

### T21 - Preload bridge and main wiring

**Implements**: B20 (main side) · `window.api` (preload) and `main()` · decisions D15, D17, D23
**Depends on**: T20

**Context**
- `src/preload/index.ts` is currently `export {};`. `src/main/index.ts` has `createWindow()` and a `main()` that only awaits `app.whenReady()`, calls `createWindow()` and registers `window-all-closed`.
- Channels and argument shapes are exactly those of T20. `Api` is in `src/shared/types.ts`.
- Production Content-Security-Policy via a response header only reaches pages served over http(s). Milestone 1 runs only through `npm run dev`, where the policy is intentionally off. The code below is added because the blueprint asks for it; it takes effect when the renderer is later served over a custom protocol (packaging milestone).

**Files**
- Modify: `src/preload/index.ts`, `src/main/index.ts`
- Create: `tests/preload/index.test.ts`
- Do NOT touch any other file.

**Steps**

1. Create `tests/preload/index.test.ts` with 3 tests. Before each: `vi.resetModules()` and `vi.doMock("electron", ...)` returning `{ contextBridge: { exposeInMainWorld: expose }, ipcRenderer: { invoke, on, removeListener } }` (all `vi.fn()`; `invoke` resolves `"R"`), then `await import("../../src/preload/index")`. `api` is `expose.mock.calls[0][1]`.

   | Test | Given | Expect |
   |------|-------|--------|
   | preload exposes the api under window.api | import | `expose` called once with first argument `"api"`; `api` has exactly the 13 keys of `Api` (`detectCli, listSessions, createSession, getSession, deleteSession, advance, answer, stop, isRunning, listKnowledge, deleteKnowledge, onSessionUpdated, onTurnEnded`) |
   | each method calls its channel with its arguments | call each of the 11 request methods with sample arguments (`createSession({ topic: "t", goal: "g" })`, `getSession("a")`, `deleteSession("a")`, `advance("a")`, `answer("a", ANSWER)`, `stop("a")`, `isRunning("a")`, `deleteKnowledge("k")`, `detectCli()`, `listSessions()`, `listKnowledge()`) | `invoke` was called, in this order, with channels `cli:detect`, `sessions:list`, `sessions:create`, `sessions:get`, `sessions:delete`, `lesson:advance`, `lesson:answer`, `lesson:stop`, `lesson:running`, `knowledge:list`, `knowledge:delete` with the same arguments after the channel; each call resolves `"R"` |
   | event subscriptions return an unsubscribe | `const off = api.onSessionUpdated(cb)`; take the handler from `on.mock.calls[0]` and call it as `handler({}, SESSION)`; then `off()`. Same for `onTurnEnded` with `handler({}, "id", RESULT)` | `on` was called with `"session:updated"`; `cb` received `SESSION`; `removeListener` called with `"session:updated"` and that same handler; the turn-ended callback received `("id", RESULT)` and channel is `"turn:ended"` |
2. Run tests. Expected: 3 failed (preload exposes nothing). Paste.
3. Write `src/preload/index.ts`: `import { contextBridge, ipcRenderer } from "electron";`, build `const api: Api = { ... }` mapping each method to `ipcRenderer.invoke(<channel>, ...args)` (typed returns via `as Promise<...>`), `onSessionUpdated(cb)` and `onTurnEnded(cb)` registering `ipcRenderer.on(channel, handler)` and returning `() => { ipcRenderer.removeListener(channel, handler); }`, then `contextBridge.exposeInMainWorld("api", api);`.
4. Replace `main()` in `src/main/index.ts` with:
   ```ts
   async function main(): Promise<void> {
     await app.whenReady();
     const dataDir = process.env.LEARN_DATA_DIR ?? app.getPath("userData");
     const store = await createStore(dataDir, fsp);
     const adapter = createCodexAdapter({ spawn, env: process.env, home: os.homedir(), tmpRoot: os.tmpdir(), fs });
     let win: BrowserWindow | null = null;
     const send = (channel: string, ...args: unknown[]): void => {
       win?.webContents.send(channel, ...args);
     };
     const now = (): string => new Date().toISOString();
     const newId = (prefix: "s" | "k"): string => prefix + "_" + randomUUID();
     const turns = createTurnRunner({ adapter, store, now, newId, notify: (s) => send("session:updated", s) });
     registerIpc({ ipcMain, adapter, store, turns, now, newId, send });
     if (!process.env.ELECTRON_RENDERER_URL) {
       session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
         callback({
           responseHeaders: {
             ...details.responseHeaders,
             "Content-Security-Policy": ["default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:"],
           },
         });
       });
     }
     win = createWindow();
     app.on("window-all-closed", () => app.quit());
   }
   ```
   Add the imports (`ipcMain`, `session` from `electron`; `spawn` from `node:child_process`; `* as fs from "node:fs"`; `* as fsp from "node:fs/promises"`; `os` from `node:os`; `randomUUID` from `node:crypto`; `createStore`, `createCodexAdapter`, `createTurnRunner`, `registerIpc`). Keep `createWindow` as it is.
5. Run `npm test`: `Tests  143 passed (143)`. Run `npm run format && npm run lint && npm run typecheck && npm run build`: all exit 0. Paste.
6. Smoke run: `D=$(mktemp -d) && (LEARN_DATA_DIR=$D npm run dev > "$D/out.log" 2>&1 & echo $! > "$D/pid"); sleep 10; pkill -f "electron-vite" ; pkill -f "\.lodestar/node_modules/electron"; ls "$D"; grep -ci "error" "$D/out.log"` (a window may flash on screen for ten seconds). Expected: `ls` lists `sessions` (it proves `main()` ran `createStore`) and the `grep -ci` count is `0`. Paste the commands and output.
7. Tick T21, then `git add -A && git commit -m "feat: preload bridge and main wiring"`.

**Stop and report instead of continuing if**
- step 6 shows no `sessions` folder or any "error" line (paste `out.log`),
- `ipcMain` or `contextBridge` types do not typecheck as written (paste the error; do not use `any`),
- tests fail after two attempts.

### T22 - Component styles

**Implements**: UI.md tokens and components · decision D10
**Depends on**: T2

**Context**
- `docs/blueprint/ui-template.html` has one `<style>` block with these sections: TOKENS (already copied to `tokens.css` in T2), BASE, TOKEN SWATCHES, COMPONENTS (`.label` through `.map-edge`, `.dialog`, `.summary`) and SCREENS (`.screen`, `.sidebar`, `.content`, `.plan`, `.k-row`). The app uses the COMPONENTS and SCREENS rules; the page-documentation rules (`main.doc`, `h1.doc`, `h2.doc`, `.note` stays, `.row`, `.state`, `.swatch`) are not copied.
- `src/renderer/src/styles/app.css` currently holds the three base rules from T2.

**Files**
- Modify: `src/renderer/src/styles/app.css`
- Create: `tests/renderer/styles.test.ts`
- Do NOT touch `tokens.css`. Do NOT add any color, font size or spacing that is not a `var(--...)` token.

**Steps**

1. Create `tests/renderer/styles.test.ts` (no jsdom needed) with 1 test:

   | Test | Given | Expect |
   |------|-------|--------|
   | app.css uses no raw colors | read `src/renderer/src/styles/app.css` with `fs.readFileSync` | `/#[0-9a-fA-F]{3,8}\b/.test(css)` is `false` and `/rgba?\(/.test(css)` is `false` |
2. Run tests. Expected: 1 passes (the file has no colors yet): this test guards the copy, it is not expected to fail first. Say so in the report.
3. Append to `app.css`, copied character for character from `ui-template.html`: the `.note` rule, then every rule from `/* COMPONENTS */` down to and including `.summary ul`, then the SCREENS rules (not `.screen`, which is written below) `.sidebar`, `.sidebar .list`, `.content`, `.content > *`, `.content h3`, `.content p`, `.plan`, `.plan .label`, `.k-row`. Skip `.swatch`, `.row`, `.state`, `main.doc`, `h1.doc`, `h2.doc` and the `.screen` rule. Then add these new rules (they are the only new ones):
   ```css
   .screen { display: grid; grid-template-columns: var(--sidebar-width) minmax(0, 1fr) auto; height: 100%; min-height: 0; }
   .plan { width: var(--plan-width); }
   .sidebar, .content, .plan { min-height: 0; overflow-y: auto; }
   .option { position: relative; }
   .option input { position: absolute; opacity: 0; }
   .option input:focus-visible + i { outline: 2px solid var(--color-accent); outline-offset: 2px; }
   .btn:focus-visible, .segment:focus-visible, .icon-btn:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
   .overlay { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; background: color-mix(in srgb, var(--color-bg) 85%, transparent); }
   ```
   (the layout is a three-column grid; the third column is `auto`, so it takes no space when no plan panel is rendered.)
4. Run `npm test` (`Tests  144 passed (144)`), `npm run format && npm run lint && npm run typecheck && npm run build`: exit 0. Paste.
5. Tick T22, then `git add -A && git commit -m "feat: component styles from the template"`.

**Stop and report if** the build fails on the CSS, or a rule in the template you were told to copy is missing.

### T23 - Turning a lesson into things to draw

**Implements**: B3, B4, B8 (display) · `buildItems`, `ChatItem` · decision D14
**Depends on**: T10

**Context**
- `ChatItem` is exactly:
  ```ts
  export type ChatItem =
    | { kind: "text"; key: string; markdown: string }
    | { kind: "probe_summary"; key: string; known: string[]; goal: string }
    | { kind: "plan_notice"; key: string; count: number }
    | { kind: "question"; key: string; eventIndex: number; purpose: "probe" | "predict" | "check";
        question: Question; answer: Answer | null; grade: Verdict | null };
  ```
- Fixtures: `A`, `act`, `pick`, `say`, `session`, `toTeach`, `toCheck`, `choiceQ`, `textQ` (`tests/helpers/fixtures.ts`). `Answer`, `Question`, `Verdict`, `Session` from `src/shared/types.ts`.

**Files**
- Create: `src/renderer/src/lib/view.ts`, `tests/renderer/view.test.ts` (no jsdom needed)
- Do NOT touch any other file.

**Steps**

1. Create `tests/renderer/view.test.ts` with 8 tests. `keys(items)` = `items.map((i) => i.kind)`.

   | Test | Given | Expect |
   |------|-------|--------|
   | an empty lesson has nothing to draw | `buildItems(session([]))` | `[]` |
   | a pending probe question has no answer | `buildItems(session([act(A.probe())]))` | one item equal to `{ kind: "question", key: "e0-q", eventIndex: 0, purpose: "probe", question: choiceQ, answer: null, grade: null }` |
   | an answered probe carries its answer and no grade | `[act(A.probe()), pick(1)]` | the question item has `answer` equal to `pick(1).answer` and `grade` `null` |
   | probe_done becomes a probe summary | `buildItems(session(toPlan))` | last item equals `{ kind: "probe_summary", key: "e2-ps", known: ["k1"], goal: "g" }` |
   | a plan becomes a plan notice | `buildItems(session(toTeach))` | last item equals `{ kind: "plan_notice", key: "e3-pn", count: 2 }` |
   | explain gives feedback, explanation, then the check, graded by the app | events `[...toTeach, act({ ...A.predict("n1"), feedback: "Nice" }), say(), act({ ...A.explain("n1"), feedback: "Good" }), pick(1)]` | the items after the plan notice are exactly the five listed under the table |
   | a text check is graded by the next verdict | `[...toTeach, ...toCheck("n1", textQ), say(), act(A.predict("n2", "pass"))]` | the check question item has `grade` `"pass"`; with `"fail"` in place of `"pass"` (`A.explain("n1", choiceQ, "fail")` as the next action) it is `"fail"` |
   | lesson_done gives feedback and the summary | `[...toTeach, ...toCheck("n1"), pick(1), ...toCheck("n2"), pick(1), act({ ...A.done(), feedback: "Well done" })]` | the last two items are `{ kind: "text", key: "e<i>-fb", markdown: "Well done" }` then `{ kind: "text", key: "e<i>-sum", markdown: "s" }` |
   For the sixth test (explain), the items after the plan notice are, in order: a `text` item with markdown `"Nice"` (key `"e4-fb"`), a `question` item (key `"e4-q"`, purpose `"predict"`, answered by `say()`, grade `null`), a `text` item `"Good"` (key `"e6-fb"`), a `text` item `"m"` (key `"e6-md"`), a `question` item (key `"e6-q"`, purpose `"check"`, answer `pick(1).answer`, grade `"pass"`). Index numbers are positions in the events array (`toTeach` is events 0 to 3).
2. Run tests. Expected: `view.test.ts` fails to import. Paste.
3. Create `src/renderer/src/lib/view.ts`: `export type ChatItem` (as above) and `export function buildItems(session: Session): ChatItem[]`. Rules:
   - go through `session.events` by index `i`;
   - an `action` event produces, in order: a `text` item (key `` `e${i}-fb` ``) for a non-empty `feedback` when the action type has that field; then by type: `probe` -> question item (key `e${i}-q`, purpose `"probe"`); `probe_done` -> `probe_summary` (key `e${i}-ps`); `plan` -> `plan_notice` (key `e${i}-pn`, `count = nodes.length`); `predict` -> question item (purpose `"predict"`); `explain` -> `text` item (key `e${i}-md`, `markdown`) then question item (purpose `"check"`, question = `check`); `lesson_done` -> `text` item (key `e${i}-sum`, `markdown = summary`);
   - question items start with `eventIndex: i`, `answer: null`, `grade: null`;
   - an `answer` event fills the most recent question item that is still unanswered: `answer = event.answer`; and `grade` = for `purpose === "check"` with `question.kind === "choice"`, `"pass"` when `answer.choiceIndex === question.correctIndex` else `"fail"`; otherwise `null`;
   - when an `action` event carries `verdict` non-null and the most recent answered check question is a `text` question with `grade === null`, set that question's `grade` to the verdict.
4. Run tests. Expected: `Tests  152 passed (152)`. Run `npm run format && npm run lint && npm run typecheck`: exit 0. Paste.
5. Tick T23, then `git add -A && git commit -m "feat: turn a lesson into chat items"`.

**Stop and report if** tests fail after two attempts.

### T24 - Stable option shuffling

**Implements**: B8 (shuffle) · `shuffledOrder`
**Depends on**: T3

**Context**: the order must be the same every time a card is drawn (the card is redrawn on every update), but different between questions. Code is given exactly because the generator choice is a judgment call.

**Files**
- Create: `src/renderer/src/lib/shuffle.ts`, `tests/renderer/shuffle.test.ts`

**Steps**

1. Create `tests/renderer/shuffle.test.ts` with 5 tests:

   | Test | Given | Expect |
   |------|-------|--------|
   | shuffledOrder is a permutation | `shuffledOrder("a:1", 6)` | sorted copy equals `[0,1,2,3,4,5]` |
   | shuffledOrder is stable for a seed | two calls with `"a:1"`, 5 | equal |
   | shuffledOrder differs between seeds | the orders for seeds `"s:0"` to `"s:9"` with n = 5 | at least 2 distinct orders |
   | shuffledOrder handles 0 and 1 | `shuffledOrder("x", 0)`, `shuffledOrder("x", 1)` | `[]`, `[0]` |
   | shuffledOrder does not always keep the order | seeds `"s:0"` to `"s:9"`, n = 4 | at least one result differs from `[0,1,2,3]` |
2. Run tests (fails to import). Paste.
3. Create `src/renderer/src/lib/shuffle.ts`:
   ```ts
   function hash(seed: string): number {
     let h = 2166136261;
     for (let i = 0; i < seed.length; i++) {
       h ^= seed.charCodeAt(i);
       h = Math.imul(h, 16777619);
     }
     return h >>> 0;
   }
   function mulberry32(a: number): () => number {
     return () => {
       a = (a + 0x6d2b79f5) | 0;
       let t = Math.imul(a ^ (a >>> 15), 1 | a);
       t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
       return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
     };
   }
   export function shuffledOrder(seed: string, n: number): number[] {
     const order = Array.from({ length: n }, (_, i) => i);
     const rand = mulberry32(hash(seed));
     for (let i = n - 1; i > 0; i--) {
       const j = Math.floor(rand() * (i + 1));
       [order[i], order[j]] = [order[j]!, order[i]!];
     }
     return order;
   }
   ```
4. Run tests: `Tests  157 passed (157)`; format, lint, typecheck exit 0. Paste.
5. Tick T24, then `git add -A && git commit -m "feat: stable option shuffling"`.

**Stop and report if** the third or fifth test fails with this generator (paste the orders; do not change the tests).

### T25 - The plan as Mermaid text

**Implements**: B6 · `planToMermaid`
**Depends on**: T3, T2

**Context**
- `PlanNode = { id; title; deps }`, `NodeState = { status: "todo" | "passed" | "shaky"; fails }` (`src/shared/types.ts`).
- The class colors must equal the tokens (`src/renderer/src/styles/tokens.css`): surface `#17181a`, border `#2c2d31`, text `#ececec`, accent `#e8b84a`, success `#6fcf8e`. Mermaid needs literal colors in its text; this file is the one place in `src/renderer` allowed to contain hex values, and a test keeps them equal to the tokens.
- Node ids inside Mermaid are `n0`, `n1`, ... (the index in the plan), never the model's ids.

**Files**
- Create: `src/renderer/src/lib/planGraph.ts`, `tests/renderer/planGraph.test.ts`

**Steps**

1. Create `tests/renderer/planGraph.test.ts` with 6 tests (`PLAN` has `n1`, `n2 <- n1`; `todo`, `passed`, `shaky` are `{ status, fails: 0 }`):

   | Test | Given | Expect |
   |------|-------|--------|
   | planToMermaid draws nodes and edges | `planToMermaid(PLAN, { n1: todo, n2: todo }, null)` split into lines | line 0 is `"graph TD"`; contains `'  n0["One"]:::todo'`, `'  n1["Two"]:::todo'` and `"  n0 --> n1"` |
   | the current node gets the current class | same with `currentNodeId` `"n1"` | contains `'  n0["One"]:::current'` and `'  n1["Two"]:::todo'` |
   | passed and shaky nodes carry a symbol and their class | `{ n1: passed, n2: shaky }`, current null | contains `'  n0["✓ One"]:::passed'` and `'  n1["~ Two"]:::shaky'` |
   | titles are escaped | a node titled `Say "hi" <b>` | its line is `'  n0["Say #quot;hi#quot; #lt;b#gt;"]:::todo'` |
   | class colors equal the design tokens | every `#rrggbb` found in the output | each one appears in `tokens.css` (read with `fs`), case-insensitive |
   | node ids do not leak into the graph | plan ids `"a-b"`, `"c-d"` | output contains no `"a-b"` and no `"c-d"` |
2. Run tests (fails to import). Paste.
3. Create `src/renderer/src/lib/planGraph.ts` exporting `planToMermaid(plan: PlanNode[], nodes: Record<string, NodeState>, currentNodeId: string | null): string`. The output is these lines joined with `"\n"`, in this order:
   - `graph TD`
   - one line per node, in plan order: `` `  n${i}["${label}"]:::${cls}` `` where `label` is the title escaped (`"` -> `#quot;`, `<` -> `#lt;`, `>` -> `#gt;`) with a prefix `"✓ "` for `passed` or `"~ "` for `shaky`; `cls` is `"current"` when the node id equals `currentNodeId` and its status is `todo`, otherwise its status (`"todo"`, `"passed"`, `"shaky"`);
   - one line per dependency: `` `  n${indexOf(dep)} --> n${i}` ``, nodes in plan order, deps in listed order (a dep id not found is skipped);
   - these four fixed lines at the end:
     ```
       classDef todo fill:#17181a,stroke:#2c2d31,color:#ececec
       classDef current fill:#17181a,stroke:#e8b84a,stroke-width:2px,color:#e8b84a
       classDef passed fill:#17181a,stroke:#6fcf8e,color:#ececec
       classDef shaky fill:#17181a,stroke:#e8b84a,stroke-dasharray:4 3,color:#ececec
     ```
4. Run tests: `Tests  163 passed (163)`; format, lint, typecheck exit 0. Paste.
5. Tick T25, then `git add -A && git commit -m "feat: plan to mermaid text"`.

**Stop and report if** tests fail after two attempts.

### T26 - Banner, ThinkingBar, ConfirmDialog (and the test helper)

**Implements**: B12, B13, B14, B17 (display) · UI.md components Banner, Thinking bar, Confirm dialog
**Depends on**: T22

**Context**: template markup to match (`docs/blueprint/ui-template.html`): `<div class="banner is-error"><span>…</span><button class="btn">Retry</button></div>`; `<div class="thinking"><span>Thinking…</span><button class="btn">Stop</button></div>`; `<div class="dialog"><p style="margin:0">…</p><div class="actions"><button class="btn">Cancel</button><button class="btn is-danger">Delete</button></div></div>` (the dialog sits centered over a dimmed window: wrap it in `<div className="overlay" role="presentation">`).

**Files**
- Create: `tests/helpers/dom.ts`, `src/renderer/src/components/Banner.tsx`, `ThinkingBar.tsx`, `ConfirmDialog.tsx`, `tests/renderer/Banner.test.tsx`, `ThinkingBar.test.tsx`, `ConfirmDialog.test.tsx`

**Steps**

1. Create `tests/helpers/dom.ts` exactly:
   ```ts
   import "@testing-library/jest-dom/vitest";
   import { cleanup } from "@testing-library/react";
   import { afterEach, vi } from "vitest";
   import type { Api, Session, TurnResult } from "../../src/shared/types";

   afterEach(cleanup);

   /** Installs a fake window.api. Returns it with helpers to fire the two events. */
   export function installApi(over: Partial<Record<keyof Api, unknown>> = {}) {
     const updated = new Set<(s: Session) => void>();
     const ended = new Set<(id: string, r: TurnResult) => void>();
     const busy: TurnResult = { ok: false, error: { kind: "busy", message: "A reply is already on the way." }, session: null };
     const api = {
       detectCli: vi.fn(async () => ({ ok: true, version: "0.0.0" })),
       listSessions: vi.fn(async () => []),
       createSession: vi.fn(async () => ({ ok: false, message: "unused" })),
       getSession: vi.fn(async () => null),
       deleteSession: vi.fn(async () => undefined),
       advance: vi.fn(async () => busy),
       answer: vi.fn(async () => busy),
       stop: vi.fn(async () => undefined),
       isRunning: vi.fn(async () => false),
       listKnowledge: vi.fn(async () => []),
       deleteKnowledge: vi.fn(async () => undefined),
       onSessionUpdated: vi.fn((cb: (s: Session) => void) => {
         updated.add(cb);
         return () => updated.delete(cb);
       }),
       onTurnEnded: vi.fn((cb: (id: string, r: TurnResult) => void) => {
         ended.add(cb);
         return () => ended.delete(cb);
       }),
       ...over,
     };
     (window as unknown as { api: unknown }).api = api;
     return {
       api: api as unknown as Api & typeof api,
       emitUpdated: (s: Session) => updated.forEach((cb) => cb(s)),
       emitEnded: (id: string, r: TurnResult) => ended.forEach((cb) => cb(id, r)),
       listenerCounts: () => ({ updated: updated.size, ended: ended.size }),
     };
   }
   ```
2. Create the three test files (9 tests; each file starts with `// @vitest-environment jsdom` and `import "../helpers/dom";`):

   | Test | Given | Expect |
   |------|-------|--------|
   | Banner shows its message | `<Banner kind="error" message="Codex failed: x" />` | text present; the root has class `banner` and `is-error` |
   | Banner action button calls back | `kind="info" message="Stopped." actionLabel="Retry" onAction={fn}`; click the "Retry" button | `fn` called once; root has `is-info` |
   | Banner has no button without an action | `<Banner kind="error" message="m" />` | `queryByRole("button")` is null |
   | ThinkingBar shows the text | `<ThinkingBar onStop={fn} />` | text `Thinking…` visible |
   | ThinkingBar Stop calls back | click "Stop" | `fn` called once |
   | ConfirmDialog shows message and labels | `message="Delete this lesson? This cannot be undone." confirmLabel="Delete"` | the message, a "Cancel" button and a "Delete" button |
   | ConfirmDialog confirm calls back | click "Delete" | `onConfirm` called once, `onCancel` not called |
   | ConfirmDialog cancel calls back | click "Cancel" | `onCancel` called once |
   | ConfirmDialog Escape cancels | `userEvent.keyboard("{Escape}")` | `onCancel` called once |
3. Run tests. Expected: the three new files fail to import. Paste.
4. Create the components (named exports, markup per the template, classes `banner is-error|is-info`, `btn`, `thinking`, `overlay`, `dialog`, `actions`, `btn is-danger`):
   - `Banner(props: { kind: "error" | "info"; message: string; actionLabel?: string; onAction?(): void })`: root `<div className={"banner is-" + kind} role={kind === "error" ? "alert" : "status"}>` with `<span>` and, only when both `actionLabel` and `onAction` are given, `<button className="btn" onClick={onAction}>`.
   - `ThinkingBar(props: { onStop(): void })`.
   - `ConfirmDialog(props: { message: string; confirmLabel: string; onConfirm(): void; onCancel(): void })`: `role="dialog"` `aria-modal="true"` on the `.dialog` element; a `useEffect` registers a `keydown` listener on `document` for `Escape` that calls `onCancel` and removes it on cleanup; the confirm button gets autofocus on mount (`ref` + `focus()` in an effect).
5. Run tests: `Tests  172 passed (172)`; format, lint, typecheck exit 0. Paste.
6. Tick T26, then `git add -A && git commit -m "feat: banner, thinking bar, confirm dialog"`.

**Stop and report if** the jsdom environment or `@testing-library/jest-dom/vitest` import fails (this was checked once on 2026-11-14 and worked), or tests fail after two attempts.

### T27 - MarkdownView with math

**Implements**: lesson prose and math · `MarkdownView` · decision D5 (stack)
**Depends on**: T26

**Context**: `react-markdown` 10.1.0, `remark-math` 6.0.0, `rehype-katex` 7.0.1, `katex` 0.19.1 are installed. `react-markdown` does not render raw HTML by default; keep it that way (no `rehype-raw`, no `skipHtml` changes). The KaTeX stylesheet is `katex/dist/katex.min.css`.

**Files**
- Create: `src/renderer/src/components/MarkdownView.tsx`, `tests/renderer/MarkdownView.test.tsx`
- Modify: `src/renderer/src/main.tsx` (one import line added)

**Steps**

1. Create `tests/renderer/MarkdownView.test.tsx` with 4 tests:

   | Test | Given | Expect |
   |------|-------|--------|
   | MarkdownView renders paragraphs | `markdown="Hello **world**"` | `strong` element with text `world` |
   | MarkdownView renders inline math | `markdown="Slope $\\frac{a}{b}$ here"` | `container.querySelector(".katex")` is not null |
   | MarkdownView renders display math | `markdown="$$\nx^2\n$$"` (the `$$` lines are on their own lines: remark-math 6 renders a one-line `$$x^2$$` as inline math, D32) | `container.querySelector(".katex-display")` is not null |
   | MarkdownView does not render raw HTML | `markdown="a <script>alert(1)</script> <b>b</b>"` | `container.querySelector("script")` is null and `container.querySelector("b")` is null |
2. Run tests (fails to import). Paste.
3. Create `MarkdownView.tsx`:
   ```tsx
   import ReactMarkdown from "react-markdown";
   import rehypeKatex from "rehype-katex";
   import remarkMath from "remark-math";

   export function MarkdownView({ markdown }: { markdown: string }) {
     return (
       <div className="markdown">
         <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
           {markdown}
         </ReactMarkdown>
       </div>
     );
   }
   ```
   In `src/renderer/src/main.tsx` add `import "katex/dist/katex.min.css";` as the first import line.
4. Run tests: `Tests  176 passed (176)`; format, lint, typecheck, `npm run build` exit 0. Paste.
5. Tick T27, then `git add -A && git commit -m "feat: markdown view with math"`.

**Stop and report if** the build fails on the CSS import or the fonts it references, or tests fail after two attempts.

### T28 - QuestionCard

**Implements**: B3, B8 (display) · `QuestionCard` · UI.md "Question card"; template section "question card"
**Depends on**: T24, T26, T27

**Context**
- Props (exactly): `{ seed: string; purpose: "probe" | "predict" | "check"; question: Question; answer: Answer | null; grade: Verdict | null; disabled: boolean; onSubmit(a: Answer): void }`. `answer !== null` means the card is answered and read-only.
- `shuffledOrder(seed, n)` in `src/renderer/src/lib/shuffle.ts`. `MarkdownView` in `./MarkdownView`. Types in `src/shared/types.ts`.
- Copy (UI.md): labels `Probe` / `Predict` / `Check`; choice has no extra label; text field label `Your answer`, placeholder `Take a guess. This is not graded.` for predict and `Type your answer` for probe and check; reasoning label `Your thinking (optional)`, placeholder `Why do you think so?`; confidence buttons `Sure`, `Unsure`, `Guessing`; button `Submit`; grades `Correct`, `Not yet`.
- Template markup: `<div class="card"><span class="label">Check</span><p class="prompt">…</p><div class="option is-selected"><i></i>text</div>…<div class="field"><label class="label">…</label><textarea …></textarea></div><div class="card-foot"><div class="segments"><button class="segment is-selected">Sure</button>…</div><button class="btn is-primary">Submit</button></div></div>`; answered: `<div class="option is-correct is-selected">`, `<div class="card-foot"><span class="grade is-pass">Correct</span><span></span></div>`.

**Files**
- Create: `src/renderer/src/components/QuestionCard.tsx`, `tests/renderer/QuestionCard.test.tsx`

**Steps**

1. Create `tests/renderer/QuestionCard.test.tsx` with 12 tests. `choiceQ` (options `["a","b","c"]`, correct index 1) and `textQ` come from fixtures. `renderCard(over)` renders `<QuestionCard seed="s:1" purpose="check" question={choiceQ} answer={null} grade={null} disabled={false} onSubmit={fn} {...over} />`. Option labels are found with `getByLabelText("a")` etc. (radio inputs).

   | Test | Given | Expect |
   |------|-------|--------|
   | shows the purpose label and the prompt | purpose `"probe"` | text `Probe` and `Pick` (the fixture prompt) visible |
   | shows options in the shuffled order for its seed | `choiceQ`, seed `"s:1"` | the radio inputs' labels in DOM order equal `shuffledOrder("s:1", 3).map((i) => ["a","b","c"][i])` |
   | submit needs a picked option and sends the original index | initially `Submit` is disabled; click option `"b"`; click `Submit` | `Submit` enabled after the pick; `onSubmit` called once with `{ choiceIndex: 1, text: null, reasoning: null, confidence: null }` |
   | a text answer is required and trimmed | `question={textQ}`; `Submit` disabled; type `"  hello  "` in the `Your answer` field; click Submit | `onSubmit` called with `{ choiceIndex: null, text: "hello", reasoning: null, confidence: null }` |
   | reasoning is sent when typed, null when blank | pick `"a"`, type `" because "` in `Your thinking (optional)`; Submit | `reasoning` is `"because"`; (second render without typing) `reasoning` is `null` |
   | confidence buttons appear on probe only and toggle | `purpose="probe"` shows `Sure`, `Unsure`, `Guessing`; `purpose="check"` shows none; click `Sure` twice | after the first click `Sure` has class `is-selected`; after the second it does not |
   | a probe confidence goes into the answer | probe, pick `"a"`, click `Unsure`, Submit | `confidence` is `"unsure"` |
   | a predict card says it is not graded | `purpose="predict"`, `question={textQ}` | the answer field has placeholder `Take a guess. This is not graded.` |
   | Cmd+Enter submits when enabled and not otherwise | pick `"a"`, then `userEvent.keyboard("{Meta>}{Enter}{/Meta}")` (focus on the card's textarea: first focus the reasoning field) ; and on a fresh render with nothing picked | first: `onSubmit` called once; second: not called |
   | an answered passed check shows Correct | `answer` = pick(1).answer, `grade="pass"` | text `Correct`; option `b` has class `is-correct` and `is-selected`; no `Submit` button |
   | an answered failed check shows Not yet | `answer` = pick(0).answer, `grade="fail"` | text `Not yet`; option `a` has class `is-wrong`; no `Submit` button |
   | disabled disables everything | `disabled={true}` | all radio inputs, text areas and the `Submit` button are disabled |
2. Run tests (fails to import). Paste.
3. Create `QuestionCard.tsx` (named export `QuestionCard`). Behavior, in the markup order of the template:
   - State: `picked: number | null` (original option index), `text`, `reasoning`, `confidence: Confidence | null`.
   - Header `<span className="label">{LABEL[purpose]}</span>`, then `<div className="prompt"><MarkdownView markdown={question.prompt} /></div>`.
   - Choice question: `<div role="radiogroup" className="options">`, and for each `i` of `shuffledOrder(seed, question.options.length)`: `<label className={...}><input type="radio" name={seed} checked={...} onChange={() => setPicked(i)} disabled={...} /><i /><MarkdownView markdown={question.options[i]!} /></label>`; class is `"option"` plus ` is-selected` for the picked (pending) or answered index (`answer.choiceIndex`), plus, when answered and `grade` is not null, ` is-correct` (pass) or ` is-wrong` (fail) on the selected option only. The accessible name of each radio must be the option text (the label wraps the input).
   - Text question, pending: `<div className="field"><label className="label" htmlFor={id}>Your answer</label><textarea id={id} placeholder={...} /></div>`; answered: `<p>{answer.text}</p>`.
   - Pending only: reasoning field (`label` `Your thinking (optional)`, placeholder `Why do you think so?`).
   - Foot `<div className="card-foot">`: pending: on the left the confidence `<div className="segments">` for `purpose === "probe"` (else an empty `<span />`), on the right `<button className="btn is-primary" disabled={!canSubmit || disabled}>Submit</button>`; answered: a `<span className="grade is-pass">Correct</span>` / `<span className="grade is-fail">Not yet</span>` when `grade` is not null, else (probe answered with a confidence) `<span className="label">{Sure|Unsure|Guessing}</span>`, else `<span />`.
   - `canSubmit`: choice -> `picked !== null`; text -> `text.trim() !== ""`.
   - Submit builds `{ choiceIndex: picked or null, text: trimmed text or null, reasoning: trimmed or null (blank -> null), confidence }`. Cmd+Enter (`event.metaKey || event.ctrlKey`, key `Enter`) on the card's `onKeyDown` submits when `canSubmit && !disabled && answer === null`.
   - When `disabled` or answered: every input, textarea and button is `disabled`.
4. Run tests: `Tests  188 passed (188)`; format, lint, typecheck exit 0. Paste.
5. Tick T28, then `git add -A && git commit -m "feat: question card"`.

**Stop and report if** the template and these rules disagree on markup (quote both), or tests fail after two attempts.

### T29 - ChatItemView

**Implements**: B4, B10 (display) · `ChatItemView`
**Depends on**: T23, T28

**Context**: `ChatItem` is in `src/renderer/src/lib/view.ts`. Probe summary markup (template): `<div class="summary"><span class="label">What you already know</span><ul><li>…</li></ul><span class="label">Your goal</span><p>…</p></div>`. Plan notice: `<p class="note">Your path: <n> steps</p>` (`1` step is never possible: plans have 2 or more).

**Files**
- Create: `src/renderer/src/components/ChatItemView.tsx`, `tests/renderer/ChatItemView.test.tsx`

**Steps**

1. Create the test file with 5 tests (items built by hand; `sessionId` is `"s_1"`):

   | Test | Given | Expect |
   |------|-------|--------|
   | a text item renders its markdown | `{ kind: "text", key: "k", markdown: "Hello **there**" }` | `strong` with `there` |
   | a probe summary lists what is known and the goal | `{ kind: "probe_summary", key: "k", known: ["Slope is rise over run"], goal: "Explain limits" }` | `What you already know`, the list item, `Your goal`, `Explain limits` |
   | a plan notice says how many steps | `{ kind: "plan_notice", key: "k", count: 4 }` | text `Your path: 4 steps` |
   | a pending question can be answered | a question item (`choiceQ`, answer null, eventIndex 7), `disabled=false` | picking an option and Submit calls `onSubmit` once |
   | an answered question is read-only | same item with an answer and `grade: "pass"` | no `Submit` button; text `Correct` |
2. Run tests (fails to import). Paste.
3. Create `ChatItemView.tsx`: `ChatItemView(props: { item: ChatItem; sessionId: string; disabled: boolean; onSubmit(a: Answer): void })`. A `switch` on `item.kind`: `text` -> `<MarkdownView>`; `probe_summary` / `plan_notice` as above; `question` -> `<QuestionCard seed={`${sessionId}:${item.eventIndex}`} purpose question answer grade disabled onSubmit />`.
4. Run tests: `Tests  193 passed (193)`; format, lint, typecheck exit 0. Paste.
5. Tick T29, then `git add -A && git commit -m "feat: chat item view"`.

**Stop and report if** tests fail after two attempts.

### T30 - PlanPanel

**Implements**: B6 · `PlanPanel` · UI.md "Plan map"
**Depends on**: T25, T26

**Context**
- Props: `{ plan: PlanNode[]; nodes: Record<string, NodeState>; currentNodeId: string | null }`. Heading `<span className="label">Lesson map</span>`.
- Mermaid 12.3.0: `import("mermaid")` (load it lazily inside an effect), `mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: "base", themeVariables: { ... } })` once, `const { svg } = await mermaid.render(id, text)`. Use these themeVariables (token values): `background: "#0e0e0f"`, `primaryColor: "#17181a"`, `primaryTextColor: "#ececec"`, `primaryBorderColor: "#2c2d31"`, `lineColor: "#8b8d93"`, `fontFamily: "system-ui, sans-serif"`.
- Fallback: until the svg exists, and whenever rendering fails, show the plan as a plain list: `<ul>` with one `<li>` per node: the title, prefixed `✓ ` (passed), `~ ` (shaky) or `→ ` (current).
- Tests mock mermaid: `vi.mock("mermaid", () => ({ default: { initialize: vi.fn(), render: vi.fn() } }))` and import the mocked default in the test to set `render` behavior.

**Files**
- Create: `src/renderer/src/components/PlanPanel.tsx`, `tests/renderer/PlanPanel.test.tsx`

**Steps**

1. Create the test file with 5 tests (`PLAN` and the `todo`/`passed` states from earlier fixtures; `mermaid.render` resolves `{ svg: '<svg data-testid="map"></svg>' }` unless said otherwise):

   | Test | Given | Expect |
   |------|-------|--------|
   | PlanPanel shows its heading | render | text `Lesson map` |
   | PlanPanel shows the plain list until the map is ready | render, check synchronously before awaiting | the titles `One` and `Two` are visible in a list |
   | PlanPanel shows the drawn map when ready | `await findByTestId("map")` | the svg is in the document and the plain list is gone |
   | PlanPanel draws what planToMermaid says | read `mermaid.render` mock | its second argument equals `planToMermaid(PLAN, nodes, "n1")` |
   | PlanPanel falls back to the list when drawing fails | `mermaid.render` rejects | after `await waitFor(...)` the list is still shown with `✓ One` when `n1` is passed, and no svg exists |
2. Run tests (fails to import). Paste.
3. Create `PlanPanel.tsx`: state `svg: string | null`; an effect keyed on `planToMermaid(...)`'s text: `let cancelled = false`; `import("mermaid").then(async ({ default: mermaid }) => { initialize once (module-level flag); try { const { svg } = await mermaid.render("lh-plan-" + (++counter), text); if (!cancelled) setSvg(svg); } catch { if (!cancelled) setSvg(null); } })`; cleanup sets `cancelled = true`. Render the svg with `<div className="plan-map" dangerouslySetInnerHTML={{ __html: svg }} />` (safe because `securityLevel: "strict"`), else the list.
4. Run tests: `Tests  198 passed (198)`; format, lint, typecheck, `npm run build` exit 0. Paste.
5. Tick T30, then `git add -A && git commit -m "feat: plan panel with mermaid and fallback"`.

**Stop and report if** `vi.mock("mermaid")` does not intercept the dynamic import (paste the error), or tests fail after two attempts.

### T31 - useLesson

**Implements**: B14, B16 · `useLesson`
**Depends on**: T26 (helpers), T20 (channel semantics)

**Context**
- Signature: `useLesson(id: string, start: boolean): { session: Session | null; state: LessonState | null; busy: boolean; error: TurnError | null; submit(a: Answer): void; retry(): void; stop(): void }`.
- `window.api` is the `Api` from `src/shared/types.ts`. `deriveState` is in `src/core/engine.ts`. Test helper `installApi` is in `tests/helpers/dom.ts`; hooks are tested with `renderHook` from `@testing-library/react` and `act`.
- Rules: the lesson is loaded with `api.getSession(id)`; `busy` starts from `api.isRunning(id)`; `onSessionUpdated` events for other ids are ignored; `onTurnEnded` for other ids are ignored; a failed result with `error.kind === "busy"` is ignored; a rejected API call sets `error` to `{ kind: "cli", message: "Could not save. Check free disk space." }` and `busy` false.
- `start === true` and no events -> call `api.advance(id)` once. Guard with a `useRef` flag so React StrictMode's double effect run starts only one call.

**Files**
- Create: `src/renderer/src/lib/useLesson.ts`, `tests/renderer/useLesson.test.tsx`
- Modify: `src/renderer/src/vite-env.d.ts` (add the `window.api` type, below)

**Steps**

1. Replace `src/renderer/src/vite-env.d.ts` with:
   ```ts
   /// <reference types="vite/client" />
   import type { Api } from "../../shared/types";

   declare global {
     interface Window {
       api: Api;
     }
   }
   ```
2. Create the test file with 8 tests (a hook test component is not needed; use `renderHook(() => useLesson("s_1", false))` and `await waitFor`):

   | Test | Given | Expect |
   |------|-------|--------|
   | useLesson loads the lesson and derives its state | `getSession` resolves `session([act(A.probe())])` | `result.current.session` is it and `state.awaiting.who` is `"learner"` |
   | useLesson starts an empty lesson once | `session([])`, `start=true` | `api.advance` called exactly once with `"s_1"` |
   | resume_does_not_send_anything_automatically | `session([act(A.probe()), pick(1)])` (reply missing), `start=false` | after loading, `api.advance` and `api.answer` were not called |
   | useLesson shows a running turn as busy | `isRunning` resolves `true` | `busy` is `true` after loading |
   | useLesson follows updates for its own lesson only | `emitUpdated(session with 1 more event)` for `s_1`; then for id `s_2` | the first replaces `session`; the second changes nothing |
   | useLesson reports a failed turn and ignores busy | `emitEnded("s_1", { ok: false, error: { kind: "cli", message: "Codex failed: x" }, session })` then an ended result with `kind: "busy"` | after the first `error.message` is `"Codex failed: x"` and `busy` false; after the second `error` is unchanged |
   | useLesson submit sends the answer and waits for the turn | `submit(ANSWER)` | `api.answer` called with `("s_1", ANSWER)`; `busy` true; after `emitEnded("s_1", { ok: true, session: S2 })` `busy` is false, `session` is `S2` and `error` is null |
   | useLesson unsubscribes on unmount | `unmount()` | `listenerCounts()` is `{ updated: 0, ended: 0 }` |
3. Run tests. Expected: the file fails to import. Paste.
4. Create `useLesson.ts`: `useState` for session, busy, error; an effect on `[id]` that subscribes to both events and loads; `useMemo(() => (session ? deriveState(session.events) : null), [session])`; `submit` -> clear error, `setBusy(true)`, `api.answer(id, a).catch(onReject)`; `retry` -> clear error, `setBusy(true)`, `api.advance(id).catch(onReject)`; `stop` -> `api.stop(id)`. A turn result arrives through `onTurnEnded`; the promise returned by `answer`/`advance` is not used for state, only for the rejection case.
5. Run tests: `Tests  206 passed (206)`; format, lint, typecheck exit 0. Paste.
6. Tick T31, then `git add -A && git commit -m "feat: useLesson hook"`.

**Stop and report if** tests fail after two attempts, or typecheck rejects the `Window.api` declaration (paste the error).

### T32 - Sidebar, CliGate, small time helpers

**Implements**: B1, B16, B17 (display) · `Sidebar`, `CliGate`, `relativeTime`, `phaseLabel` · decision D31 (new file `src/renderer/src/lib/time.ts`)
**Depends on**: T26

**Context**
- Props (exactly): `Sidebar: { sessions: SessionSummary[]; activeId: string | null; onNew(): void; onOpen(id: string): void; onDelete(id: string): void; onKnowledge(): void; newDisabled: boolean }`; `CliGate: { cli: DetectResult | null; onRetry(): void }`.
- Template markup (sidebar): `<div class="sidebar"><button class="btn is-primary">New lesson</button><span class="label">Lessons</span><div class="list">…rows…</div><button class="btn">Knowledge</button></div>`; row: `<div class="lesson-row is-active"><div><b>Topic</b><small>teaching · 2h ago</small></div><button class="icon-btn" aria-label="Delete lesson">×</button></div>`; empty text `<span class="note">No lessons yet.</span>`.
- `SessionSummary = { id; topic; phase: Phase; updatedAt }`. Copy: Codex missing text is `Codex CLI not found. Install it and sign in, then press Retry.`; button `Retry`; delete dialog message `Delete this lesson? This cannot be undone.`, buttons `Cancel` / `Delete`.

**Files**
- Create: `src/renderer/src/lib/time.ts`, `src/renderer/src/components/Sidebar.tsx`, `src/renderer/src/components/CliGate.tsx`, `tests/renderer/time.test.ts`, `tests/renderer/Sidebar.test.tsx`, `tests/renderer/CliGate.test.tsx`

**Steps**

1. Create the tests (15 tests):

   `time.test.ts` (5; `now = "2026-03-03T12:00:00.000Z"`):

   | Test | Given | Expect |
   |------|-------|--------|
   | relativeTime says just now under a minute | `relativeTime("2026-03-03T11:59:30.000Z", now)` | `"just now"` |
   | relativeTime counts minutes | 5 minutes earlier | `"5m ago"` |
   | relativeTime counts hours | 2 hours earlier | `"2h ago"` |
   | relativeTime counts days | 3 days earlier | `"3d ago"` |
   | phaseLabel maps phases to words | `probe`, `plan`, `teach`, `done` | `"probing"`, `"planning"`, `"teaching"`, `"done"` |

   `Sidebar.test.tsx` (7; `sessions` has `{ id: "s_1", topic: "Derivatives", phase: "teach", updatedAt: two hours before NOW }`; `NOW` is faked with `vi.setSystemTime` or by passing nothing and using `vi.useFakeTimers({ now })`):

   | Test | Given | Expect |
   |------|-------|--------|
   | Sidebar shows the empty text | `sessions=[]` | `No lessons yet.` |
   | Sidebar lists lessons with phase and age | the session above | `Derivatives` and `teaching · 2h ago` |
   | Sidebar marks the active lesson | `activeId="s_1"` | the row has class `is-active` |
   | Sidebar opens a lesson on click | click `Derivatives` | `onOpen` called with `"s_1"` |
   | Sidebar deletes only after confirming | click the `Delete lesson` button; dialog shown with the message; click `Delete` | `onDelete` called with `"s_1"` once |
   | Sidebar keeps the lesson when cancelled | click `Delete lesson`, then `Cancel` | `onDelete` not called and the dialog is gone |
   | Sidebar buttons call back and respect newDisabled | click `New lesson`, `Knowledge`; then render with `newDisabled` | `onNew` and `onKnowledge` called once each; second render: `New lesson` disabled |

   `CliGate.test.tsx` (3):

   | Test | Given | Expect |
   |------|-------|--------|
   | detect_reports_missing_cli | `cli={ ok: false }` | the exact message and a `Retry` button; clicking it calls `onRetry` |
   | CliGate is silent while checking | `cli={null}` | nothing rendered (`container` is empty) |
   | CliGate is silent when Codex is found | `cli={ ok: true, version: "1.0.0" }` | nothing rendered |
2. Run tests (three files fail to import). Paste.
3. Implement:
   - `time.ts`: `relativeTime(iso: string, nowIso: string): string` (seconds difference: `< 60` -> `"just now"`; `< 3600` -> `` `${m}m ago` ``; `< 86400` -> `` `${h}h ago` ``; else `` `${d}d ago` ``, all with floor); `phaseLabel(phase: Phase): string`.
   - `Sidebar.tsx`: state `confirmId: string | null`; clicking a row (not the ×) calls `onOpen`; the × button has `aria-label="Delete lesson"`, calls `setConfirmId(id)` and does not open the lesson (`stopPropagation`); when `confirmId` is set render `<ConfirmDialog message="Delete this lesson? This cannot be undone." confirmLabel="Delete" onConfirm={() => { onDelete(confirmId); setConfirmId(null); }} onCancel={() => setConfirmId(null)} />`. The status line is `` `${phaseLabel(phase)} · ${relativeTime(updatedAt, new Date().toISOString())}` ``.
   - `CliGate.tsx`: `if (cli === null || cli.ok) return null;` else `<Banner kind="error" message="Codex CLI not found. Install it and sign in, then press Retry." actionLabel="Retry" onAction={onRetry} />`.
4. Run tests: `Tests  221 passed (221)`; format, lint, typecheck exit 0. Paste.
5. Tick T32, then `git add -A && git commit -m "feat: sidebar, cli gate and time helpers"`.

**Stop and report if** fake timers and `userEvent` do not work together (use `userEvent.setup({ advanceTimers: vi.advanceTimersByTime })`), or tests fail after two attempts.

### T33 - NewLessonForm

**Implements**: B2 (display) · `NewLessonForm`
**Depends on**: T26 (helpers), T20

**Context**
- Props: `{ disabled: boolean; onCreated(session: Session): void }`. It calls `window.api.createSession({ topic, goal })`, which resolves `{ ok: true, session }` or `{ ok: false, message }`.
- Copy: title `What do you want to learn?`; labels `Topic`, `Goal`; placeholders `e.g. Derivatives` and `e.g. Understand why the derivative is the slope of the tangent line`; button `Start`. Error text goes in `<small>` under the goal field (template: `.field small`, color danger).
- Template markup (the part inside `.content`): `<h3>…</h3><div class="field"><label class="label">Topic</label><input …></div><div class="field"><label class="label">Goal</label><textarea …></textarea><small>…</small></div><div><button class="btn is-primary">Start</button></div>`. The component returns exactly these elements in a fragment; `App` supplies the `<div className="content">` around it (so the Codex banner can sit above the title).

**Files**
- Create: `src/renderer/src/components/NewLessonForm.tsx`, `tests/renderer/NewLessonForm.test.tsx`

**Steps**

1. Create the test file with 6 tests (`installApi` from `../helpers/dom`):

   | Test | Given | Expect |
   |------|-------|--------|
   | NewLessonForm shows its title, labels and button | render | `What do you want to learn?`, fields labelled `Topic` and `Goal`, button `Start` |
   | new_lesson_rejects_empty_fields | `createSession` resolves `{ ok: false, message: "Enter a topic and a goal." }`; click `Start` with empty fields | that text is shown and `onCreated` not called |
   | NewLessonForm sends the typed values | type `Derivatives` and `Limits`, click `Start` | `createSession` called with `{ topic: "Derivatives", goal: "Limits" }` |
   | NewLessonForm hands the created lesson on | `createSession` resolves `{ ok: true, session: S }` | `onCreated` called once with `S` |
   | NewLessonForm moves to the goal on Enter | type in `Topic` then `{Enter}` | the `Goal` field has focus |
   | NewLessonForm can be disabled | `disabled={true}` | both fields and `Start` are disabled |
2. Run tests (fails to import). Paste.
3. Create `NewLessonForm.tsx`: controlled fields, `error` state cleared on typing, `Start` click or Cmd+Enter in the goal field submits; return a fragment, with no `.content` wrapper.
4. Run tests: `Tests  227 passed (227)`; format, lint, typecheck exit 0. Paste.
5. Tick T33, then `git add -A && git commit -m "feat: new lesson form"`.

**Stop and report if** tests fail after two attempts.

### T34 - LessonScreen

**Implements**: B6, B12, B13, B14, B16 · `LessonScreen` · UI.md "Lesson"; template "Lesson" screens
**Depends on**: T23, T29, T30, T31, T26

**Context**
- Props: `{ id: string; start: boolean }`. Uses `useLesson`, `buildItems`, `ChatItemView`, `ThinkingBar`, `Banner`, `PlanPanel` and `learnedToSave` from `src/core/engine.ts`.
- Layout (template): the component returns a fragment of two grid children of `.screen`: `<div className="content">` holding `<h3>{topic}</h3><p className="note">Goal: {goal}</p>`, the item list, then (when busy) `ThinkingBar`, then (when `error`) a `Banner`, then the finished block; and, only when `state.plan` exists, `<PlanPanel … />` rendered directly (T30's component already renders the `.plan` element, so do not wrap it in another `.plan` div). The sidebar belongs to `App` (T36), which renders the `.screen` grid.
- Banner rules: `error.kind === "stopped"` -> `kind="info"`, message `Stopped.`, action `Retry`; `error.kind === "not_found"` -> error banner, no action; any other error -> error banner with its message and `Retry`. A lesson that was interrupted (no error, not busy, `state.awaiting.who === "model"`, `session.events.length > 0`) shows an info banner `The last reply did not arrive.` with `Retry` (D31). A lesson with no events and `start === false` shows nothing.
- Finished block (phase `done`): `<div className="summary"><span className="label">Lesson complete</span><p className="note">{n} items added to your knowledge list.{shaky}</p></div>`, where `n` = `learnedToSave(state, lastLessonDoneAction).length`, and `shaky` is empty when no node is shaky, else `" 1 step is still shaky."` / `` ` ${m} steps are still shaky.` `` The finished block replaces the card and the thinking bar.
- Cards are `disabled` while `busy`. `scrollIntoView` does not exist in jsdom: guard calls with `el?.scrollIntoView?.(...)`.

**Files**
- Create: `src/renderer/src/components/LessonScreen.tsx`, `tests/renderer/LessonScreen.test.tsx`

**Steps**

1. Create the test file with 10 tests. `installApi` provides `getSession` resolving the lesson under test; `S(events)` is `session(events)` from fixtures with topic `"T"` and goal `"G"`:

   | Test | Given | Expect |
   |------|-------|--------|
   | resume_shows_pending_question | `S([act(A.probe())])`, `start=false` | topic `T`, `Goal: G`, the question prompt, an enabled `Submit` after picking an option |
   | LessonScreen starts a new lesson | `S([])`, `start=true` | `api.advance` called once |
   | LessonScreen shows thinking and disables the card | `isRunning` resolves true, a pending probe | `Thinking…` visible and the options are disabled |
   | LessonScreen Stop stops the turn | busy; click `Stop` | `api.stop` called with the id |
   | LessonScreen shows a failed call and retries | `emitEnded` failed with `Codex failed: boom`; click `Retry` | the message is shown; `api.advance` called once more |
   | LessonScreen shows Stopped with Retry | `emitEnded` failed with kind `"stopped"`, message `"Stopped."` | the text `Stopped.` and a `Retry` button |
   | LessonScreen shows a missing lesson without Retry | `getSession` resolves `null`, then `emitEnded` with kind `"not_found"` | `This lesson no longer exists.` shown, no `Retry` button |
   | resume_offers_retry_for_interrupted_call | `S([act(A.probe()), pick(1)])`, `start=false`, not busy | `The last reply did not arrive.` and `Retry`; `api.advance` not called |
   | LessonScreen shows the map only once there is a plan | `S(toPlan)`; then `S(toTeach)` (mock `PlanPanel`'s mermaid as in T30 or `vi.mock("../../src/renderer/src/components/PlanPanel", ...)` to a stub with test id `plan`) | no plan panel for the first; `plan` test id present for the second |
   | a finished lesson shows what was saved | events through `lesson_done` where `n1` passed and `n2` shaky (`[...toTeach, ...toCheck("n1"), pick(1), ...toCheck("n2"), pick(0), act(A.explain("n2")), pick(0), act(A.explain("n2")), pick(0), act(A.done())]`) | `Lesson complete`, `1 items added to your knowledge list.`, `1 step is still shaky.`, and no `Submit` button |
   This task adds 10 tests. For the finished lesson, with one passed node the count text is `1 items added to your knowledge list.` (the copy is not pluralised; UI.md says `<n> items added to your knowledge list.`).
2. Run tests (fails to import). Paste.
3. Create `LessonScreen.tsx` per the context above. `useEffect` keyed on `items.length` scrolls an end-of-list `<div ref={endRef} />` into view.
4. Run tests: `Tests  237 passed (237)`; format, lint, typecheck exit 0. Paste.
5. Tick T34, then `git add -A && git commit -m "feat: lesson screen"`.

**Stop and report if** tests fail after two attempts, or a SPEC message is needed that is not in `UI.md` or the Banner rules above (quote it).

### T35 - KnowledgeScreen

**Implements**: B18 · `KnowledgeScreen`
**Depends on**: T32 (time helper), T26 (helpers)

**Context**
- No props. Loads `window.api.listKnowledge()` on mount (`KnowledgeView[]`, newest first). Copy: title `Knowledge`; intro `What you have shown you understand. Later lessons start from here.`; empty `Nothing here yet. Finish a lesson and what you learned will appear here.`; source `Deleted lesson` when `lessonTopic` is null. Template markup: `<div class="content"><h3>Knowledge</h3><p class="note">…</p><div><div class="k-row"><div>text<br><span class="label">Derivatives · 2h ago</span></div><button class="icon-btn" aria-label="Delete item">×</button></div>…</div></div>`.

**Files**
- Create: `src/renderer/src/components/KnowledgeScreen.tsx`, `tests/renderer/KnowledgeScreen.test.tsx`

**Steps**

1. Create the test file with 5 tests (items built as `{ id, text, sessionId: "s", nodeId: "n1", createdAt: <2h before now>, lessonTopic: "Derivatives" }`):

   | Test | Given | Expect |
   |------|-------|--------|
   | KnowledgeScreen shows its title and intro | empty list | `Knowledge` and the intro sentence |
   | KnowledgeScreen shows the empty text | `listKnowledge` resolves `[]` | the empty text, no list rows |
   | knowledge_listed_newest_first_with_source | two items in the order returned by the API | rows in that order, each with `Derivatives · 2h ago` |
   | KnowledgeScreen names a deleted lesson | `lessonTopic: null` | `Deleted lesson · 2h ago` |
   | knowledge_item_deleted | click `Delete item` on the first row | `deleteKnowledge` called with its id, then `listKnowledge` called again and the row is gone |
2. Run tests (fails to import). Paste.
3. Create `KnowledgeScreen.tsx` with `useEffect` loading, a `reload()` function used after deleting (no confirmation, per SPEC B18).
4. Run tests: `Tests  242 passed (242)`; format, lint, typecheck exit 0. Paste.
5. Tick T35, then `git add -A && git commit -m "feat: knowledge screen"`.

**Stop and report if** tests fail after two attempts.

### T36 - App wiring

**Implements**: all screens reachable · B1, B16, B17 · `App`
**Depends on**: T32, T33, T34, T35

**Context**
- `src/renderer/src/App.tsx` currently returns `<main><h1>lodestar</h1></main>`.
- State: `screen: { name: "new" } | { name: "lesson"; id: string; start: boolean } | { name: "knowledge" }` (starts `new`), `sessions: SessionSummary[]`, `cli: DetectResult | null`.
- On mount: `api.detectCli()` -> `cli`; `api.listSessions()` -> `sessions`; subscribe `api.onSessionUpdated` to reload the list (and unsubscribe on unmount). `Retry` in `CliGate` sets `cli` to `null` and re-runs detect.
- Layout: `<div className="screen"><Sidebar … />{content}</div>`, where `content` is: for `new`, `<div className="content"><CliGate … /><NewLessonForm … /></div>`; for `knowledge`, `<KnowledgeScreen />`; for `lesson`, `<LessonScreen key={id} id={id} start={start} />` (it returns its own `.content` and, when there is a plan, `.plan` as grid children). The Codex banner is therefore shown on the new lesson screen only, as in the template.
- Deleting the lesson that is open returns to the `new` screen. Creating a lesson (`onCreated`) opens it with `start: true` and reloads the list. Opening one from the list uses `start: false`. `newDisabled` and `NewLessonForm`'s `disabled` are both `cli?.ok !== true`.

**Files**
- Modify: `src/renderer/src/App.tsx`
- Create: `tests/renderer/App.test.tsx`
- Do NOT touch any other file.

**Steps**

1. Create the test file with 7 tests (`installApi`; the lesson screen is real, with `getSession` resolving a lesson when needed):

   | Test | Given | Expect |
   |------|-------|--------|
   | App starts on the new lesson screen | defaults | `What do you want to learn?` and `New lesson` enabled |
   | App shows the Codex banner and disables New lesson | `detectCli` resolves `{ ok: false }` | the banner text and a disabled `New lesson` |
   | App Retry checks for Codex again | the case above, then click `Retry` with `detectCli` now resolving `{ ok: true, version: "1" }` | banner gone, `New lesson` enabled |
   | sessions_listed_newest_first (display) | `listSessions` resolves two summaries | rows appear in the order given |
   | App opens a lesson from the list | click a row | its topic heading appears and `getSession` was called with its id; `advance` not called |
   | App creating a lesson opens it and starts it | `createSession` resolves `{ ok: true, session: S }` (events `[]`), `getSession` resolves `S`; fill and click `Start` | the lesson heading appears and `advance` called once |
   | delete_session_needs_confirm | open a lesson, click `Delete lesson`, click `Delete`; separately click `Delete lesson` then `Cancel` | after `Delete`: `deleteSession` called with the id and `What do you want to learn?` is shown again; after `Cancel`: `deleteSession` not called and the lesson stays open |
2. Run tests (fails: App is a placeholder). Paste.
3. Implement `App.tsx` as described.
4. Run tests: `Tests  249 passed (249)`; format, lint, typecheck, `npm run build` exit 0. Paste.
5. Tick T36, then `git add -A && git commit -m "feat: app wiring"`.

**Stop and report if** tests fail after two attempts, or the three-column grid does not behave as the CSS in T22 says (describe the DOM you see).

### T36b - Keyboard access, double-click guard, map fallback symbol

**Implements**: UI.md accessibility ("Tab order follows the visual order"), B2, B6 · fixes found while building T30, T32 and T33 (decision D33)
**Depends on**: T36

**Context**
- `Sidebar` (`src/renderer/src/components/Sidebar.tsx`) renders each lesson as `<div className="lesson-row …" onClick={() => props.onOpen(s.id)}>` holding a `<div><b>{topic}</b><small>…</small></div>` and the delete button. A keyboard user cannot reach or open a lesson.
- `NewLessonForm` (`NewLessonForm.tsx`) has `async function submit()` that awaits `window.api.createSession(...)`. Clicking Start twice before it resolves creates two lessons.
- `PlanPanel` (`PlanPanel.tsx`) has a helper `prefix(id, nodes, currentNodeId)` that returns `"→ "` whenever the node is current, even when it is passed or shaky. The Mermaid text in `planToMermaid` shows `✓ ` / `~ ` for those states and `current` only for a `todo` node, so the plain-list fallback disagrees with the map.

**Files**
- Modify: `src/renderer/src/components/Sidebar.tsx`, `src/renderer/src/components/NewLessonForm.tsx`, `src/renderer/src/components/PlanPanel.tsx`, `src/renderer/src/styles/app.css`, `tests/renderer/Sidebar.test.tsx`, `tests/renderer/NewLessonForm.test.tsx`, `tests/renderer/PlanPanel.test.tsx`
- Do NOT touch any other file. Do NOT change any text shown to the user.

**Steps**

1. Add 3 tests (names exactly as shown; existing tests must keep passing unchanged):

   | Test | Given | Expect |
   |------|-------|--------|
   | Sidebar lets a lesson be opened with the keyboard | the one-lesson `sessions` of the existing Sidebar tests; `await userEvent.tab()` until the element with accessible name containing `Derivatives` has focus (it must be reachable: at most 3 Tab presses starting from the document body, the order is `New lesson`, the lesson, `Delete lesson`); then `await userEvent.keyboard("{Enter}")` | `onOpen` called once with `"s_1"` |
   | NewLessonForm creates a lesson only once when Start is clicked twice | `createSession` returns a promise you resolve later; click `Start` twice quickly (`await userEvent.dblClick(startButton)` or two clicks without awaiting the resolution) | `createSession` called once; after resolving `{ ok: true, session: S }`, `onCreated` called once |
   | PlanPanel fallback shows a passed current node as passed | plan `PLAN`, `nodes` `{ n1: { status: "passed", fails: 0 }, n2: { status: "todo", fails: 0 } }`, `currentNodeId` `"n1"`, mermaid mock rejecting so the list shows | text `✓ One` present and `→ One` absent |
2. Run tests. Expected: `Tests  3 failed | 249 passed (252)`: exactly the three new ones fail. Paste.
3. Fix:
   - `Sidebar.tsx`: replace the clickable row `div` behavior with a real button: keep `<div className={"lesson-row" + …}>` but without `onClick`; inside it the text block becomes `<button type="button" className="row-main" onClick={() => props.onOpen(s.id)}><b>{s.topic}</b><small>{status}</small></button>` (the `<b>` and `<small>` stay exactly as they are, inside the button, so existing click tests on the topic text keep working); the delete button stays after it. Remove the `stopPropagation` call on the delete button only if the tests still pass without it (it is harmless; keep it if unsure).
   - `app.css`: add one rule `.row-main { background: none; border: 0; padding: 0; color: inherit; font: inherit; text-align: left; cursor: pointer; flex: 1; min-width: 0; } .row-main b, .row-main small { display: block; }` and `.row-main:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }`. (`.lesson-row` already sets `display: flex; justify-content: space-between`.)
   - `NewLessonForm.tsx`: add `const busy = useRef(false);` and at the top of `submit()`: `if (busy.current) return; busy.current = true;` and `try { … } finally { busy.current = false; }` around the `createSession` call and its handling. Do not change anything else.
   - `PlanPanel.tsx`: in `prefix`, check status first: return `"✓ "` for passed, `"~ "` for shaky, then `"→ "` only when `id === currentNodeId` (status todo), else `""`.
4. Run tests: `Tests  252 passed (252)`. Run `npm run format && npm run lint && npm run typecheck && npm run build`: exit 0. Paste.
5. Tick T36b, then `git add -A && git commit -m "fix: keyboard access to lessons, double-click guard, map fallback symbols"` (stage only the files listed plus the PLAN.md tick; check `git status --short` first).

**Stop and report instead of continuing if**
- a test other than the three new ones fails in step 2,
- `userEvent.tab()` cannot reach the new button (paste the DOM around it),
- tests fail after two attempts.

### T37 - README

**Implements**: documentation · decisions D18, D31
**Depends on**: T36

**Files**
- Create: `README.md`
- Do NOT touch any other file.

**Steps**

1. Create `README.md` with exactly these sections and facts (plain prose, no marketing):
   - `# lodestar` and one sentence: a desktop app that teaches one reasoning step at a time using the AI command line tool you already have; inspired by LearnHarness, which it does not copy.
   - `## How a lesson works`: probe, plan, teach (predict, explain, check), finish; learned items are saved to a knowledge list that later lessons read.
   - `## Requirements`: macOS (other systems untested); Node 26 and npm 11; the Codex CLI installed and signed in (`codex --version` works).
   - `## Run it`: `npm ci`, then `npm run dev`. Add: if the window does not open and the log says `Electron uninstall`, run `node node_modules/electron/install.js` once (npm may skip Electron's own download).
   - `## Your data`: lessons are JSON files under the app's data folder (`~/Library/Application Support/lodestar` on macOS, or `LEARN_DATA_DIR`); `LEARN_CODEX_PATH` points at a Codex binary in a non-standard place.
   - `## What goes to the model`: each turn runs `codex exec` read-only in an empty temporary folder with the lesson so far; nothing else is sent.
   - `## Development`: `npm test`, `npm run lint`, `npm run typecheck`, `npm run eval` (spends real Codex quota); the blueprint lives in `docs/blueprint/`.
   - `## Status`: milestone 1 supports Codex only; Gemini CLI and Claude Code are planned.
   - `## License`: MIT.
2. Run `npm run format && npm run lint`: exit 0. Run `npm test`: `Tests  252 passed (252)`. Paste.
3. Tick T37, then `git add -A && git commit -m "docs: readme"`.

### T37b - Gate C fixes (CR-2)

**Implements**: change request CR-2 (decision D34) · B2, B12, B13, B14, B16, B18, B1 · fixes from Fable's Gate C review (findings I1-I5 and five Minor ones)
**Depends on**: T37

**Context**
- I1. `window.api.answer(id, a)` / `advance(id)` resolve a `TurnResult`. For early refusals (`busy`, `not_found`, `invalid_answer`) `src/main/ipc.ts` returns the result but sends no `turn:ended` event. `useLesson` ignores the resolved value (`.catch(onReject)` only), so `busy` stays `true` forever.
- I2. `LessonScreen` shows the "The last reply did not arrive." banner only when `session.events.length > 0`; a lesson with no events reopened with `start: false` shows nothing and cannot be retried.
- I3. `CliGate` is rendered only inside the new-lesson screen block of `App`. After navigating away there is no way back to its Retry.
- I4/I5. CSS: `.overlay` has no `z-index`; `.content p { margin: 0 }` removes paragraph spacing inside `.markdown`; the radiogroup in `QuestionCard` has no gap rule; the template's `.is-hover` / `.is-focus` demo classes exist but no real `:hover` / `:focus` rules do; the × (`.icon-btn` in a `.lesson-row`) is always visible although UI.md says it shows on hover.
- Test helpers: `installApi` returns `{ api, emitUpdated, emitEnded, listenerCounts }` (`tests/helpers/dom.ts`). Fixtures `A`, `act`, `pick`, `say`, `session`, `toPlan`, `toTeach`, `textQ`, `choiceQ`. Existing tests in each file show how components are rendered. Mermaid is mocked in component tests (`vi.mock("mermaid", ...)`).

**Files**
- Modify: `src/renderer/src/lib/useLesson.ts`, `src/renderer/src/components/LessonScreen.tsx`, `src/renderer/src/components/QuestionCard.tsx`, `src/renderer/src/components/NewLessonForm.tsx`, `src/renderer/src/components/KnowledgeScreen.tsx`, `src/renderer/src/components/PlanPanel.tsx`, `src/renderer/src/App.tsx`, `src/renderer/src/styles/app.css`, `tests/renderer/useLesson.test.tsx`, `LessonScreen.test.tsx`, `QuestionCard.test.tsx`, `NewLessonForm.test.tsx`, `KnowledgeScreen.test.tsx`, `PlanPanel.test.tsx`, `App.test.tsx`, `styles.test.ts` (all under `tests/renderer/`)
- Do NOT touch any other file. Do NOT change any text shown to the user except where stated. Do NOT add dependencies.

**Steps**

1. Add 8 tests (names exactly as shown; existing tests must keep passing unchanged):

   | Test | File | Given | Expect |
   |------|------|-------|--------|
   | useLesson clears busy when an answer is refused | useLesson.test.tsx | `answer` resolves `{ ok: false, error: { kind: "invalid_answer", message: "Write an answer." }, session: S }`; call `submit(ANSWER)` | after it settles: `busy` is `false` and `error.message` is `"Write an answer."` |
   | QuestionCard limits a text answer to 4000 characters | QuestionCard.test.tsx | `question={textQ}` pending | the `Your answer` textarea has attribute `maxlength` `"4000"` |
   | reopening a lesson with no events offers Retry | LessonScreen.test.tsx | `S([])`, `start=false`, not busy | `The last reply did not arrive.` and a `Retry` button; `api.advance` not called |
   | App shows the Codex banner on every screen | App.test.tsx | `detectCli` resolves `{ ok: false }`; click `Knowledge` | the text `Codex CLI not found. Install it and sign in, then press Retry.` and a `Retry` button are present on the Knowledge screen |
   | styles give real hover, focus and layering rules | styles.test.ts | read `app.css` | it contains `.overlay` with `z-index`; `.btn:hover`; `.field input:focus`; `.options`; and `.lesson-row:hover .icon-btn` (each tested with a regex on the file text) |
   | KnowledgeScreen refreshes when a turn ends | KnowledgeScreen.test.tsx | render; then `emitEnded("s_1", { ok: true, session: S })` | `listKnowledge` was called a second time |
   | NewLessonForm reports a failed save | NewLessonForm.test.tsx | `createSession` rejects; click `Start` | the text `Could not save. Check free disk space.` is shown, `onCreated` not called, and clicking `Start` again calls `createSession` a second time |
   | PlanPanel keeps Mermaid quiet on errors | PlanPanel.test.tsx | render once; look at the `mermaid.initialize` mock calls (do not clear mocks before this assertion; if an existing `beforeEach` clears them, make this test render first and assert inside itself) | `initialize` was called with an object containing `suppressErrorRendering: true` |
2. Run tests. Expected: `Tests  8 failed | 252 passed (260)`: exactly the eight new tests fail. Paste. If any other test fails, stop and report.
3. Fix the code:
   - `useLesson.ts` (I1): create one function `handleResult(result: TurnResult)` with exactly the logic now inside the `onTurnEnded` callback (ok -> set session, `busy` false, `error` null; failed with `error.kind === "busy"` -> ignore; failed otherwise -> set session if present, set `error`, `busy` false). Use it in the `onTurnEnded` callback (after the id check) and change `window.api.answer(id, a).catch(onReject)`, `window.api.advance(id).catch(onReject)` (both places) to `.then(handleResult, onReject)`.
   - `QuestionCard.tsx` (I1): add `maxLength={ANSWER_TEXT_MAX}` (import from `../../../shared/limits`) to the `Your answer` textarea only. Also give the choice radiogroup `<div role="radiogroup">` the class `options`.
   - `LessonScreen.tsx` (I2): remove the `session.events.length > 0` condition from the interrupted-lesson banner. Change the scroll effect's dependency list to `[items.length, busy, error]`.
   - `PlanPanel.tsx`: add `suppressErrorRendering: true` to the object passed to `mermaid.initialize`.
   - `KnowledgeScreen.tsx`: in a `useEffect` (empty dependency list) subscribe with `window.api.onTurnEnded(() => reload())` and return the unsubscribe function.
   - `NewLessonForm.tsx`: in `submit()`, add a `catch { setError("Could not save. Check free disk space."); }` between the `try` body and the existing `finally`.
   - `App.tsx` (I3): render `<CliGate cli={cli} onRetry={retry} />` once, above the screen content, inside a wrapper `<div className="main">…</div>` that is the second child of `.screen` (after `Sidebar`); the wrapper contains `<CliGate … />` and then `content`. Remove `CliGate` from the new-lesson block, which becomes `<div className="content"><NewLessonForm … /></div>`.
   - `app.css`:
     - change the `.screen` rule's `grid-template-columns` to `var(--sidebar-width) minmax(0, 1fr)` and delete the `.screen.has-plan` rule if present;
     - add:
       ```css
       .main { display: grid; grid-template-columns: minmax(0, 1fr) auto; grid-template-rows: auto minmax(0, 1fr); min-height: 0; }
       .main > .banner { grid-column: 1 / -1; width: auto; margin: var(--space-4) var(--space-5) 0; }
       .main > .content, .main > .plan { grid-row: 2; }
       .overlay { z-index: 1000; }
       .options { display: flex; flex-direction: column; gap: var(--space-2); }
       .content .markdown > * + * { margin-top: var(--space-3); }
       .markdown ul, .markdown ol { padding-left: var(--space-5); }
       .btn:hover:not([disabled]) { background: var(--color-surface-2); }
       .btn.is-primary:hover:not([disabled]) { background: var(--color-accent); filter: brightness(0.92); }
       .option:hover { background: var(--color-surface-2); }
       .lesson-row:hover { background: var(--color-surface); }
       .icon-btn:hover { color: var(--color-text); }
       .field input:focus, .field textarea:focus { outline: 2px solid var(--color-accent); outline-offset: 1px; }
       .lesson-row .icon-btn { visibility: hidden; }
       .lesson-row:hover .icon-btn, .lesson-row:focus-within .icon-btn { visibility: visible; }
       ```
       (the existing `.overlay` rule keeps its other declarations; merge the `z-index` into it instead of duplicating the selector if you prefer: the test only needs a `.overlay` block containing `z-index`).
4. Run tests: `Tests  260 passed (260)`. Run `npm run format && npm run lint && npm run typecheck && npm run build`: exit 0. Paste.
5. Tick T37b, then stage by name (the files listed above plus the PLAN.md tick; check `git status --short` first, do not commit `out/`) and commit `fix: stuck thinking bar, dead lessons, codex banner everywhere, spacing and hover`.

**Stop and report instead of continuing if**
- step 2 shows any failure other than the eight new tests,
- an existing test breaks in step 4 because of the `App` layout change and the fix would need a file not listed,
- tests fail after two attempts.

### GATE C - A full lesson in the window

The builder stops here. Nothing continues until the owner says so.

**Run**: `npm test` -> expect `Tests  260 passed (260)`; `npm run lint && npm run typecheck && npm run build` -> exit 0
**Look at**: `git diff <gate-B-commit>..HEAD --stat` -> only `src/main/ipc.ts`, `src/main/index.ts`, `src/preload/`, `src/renderer/`, `tests/`, `README.md`, `PLAN.md`
**Fresh review**: Fable reviews T20-T37 against SPEC, ARCHITECTURE, UI and `ui-template.html` (the reviewer prompt from `references/execution.md`, plus: compare each built screen's markup and classes to the template).
**Try it yourself** (this is the first time the app does anything):
1. `npm run dev`. The window shows the sidebar, "What do you want to learn?", and no Codex banner.
2. Start a lesson on a topic you know a little about. Expect: Thinking… for about 10 seconds, then a probe question.
3. Answer with and without the reasoning box and confidence. Expect: another question, up to 8, then "What you already know" and your goal, then "Your path: N steps" and the map on the right.
4. Answer a predict and a check wrongly on purpose. Expect: "Not yet" and the same step explained again differently; after three misses the step is marked `~` and the lesson moves on.
5. Finish. Expect: "Lesson complete" with the counts; open Knowledge and see the items.
6. Quit the app mid-lesson (Cmd+Q), start it again, open the lesson. Expect: the pending question is shown again, or "The last reply did not arrive." with Retry.
7. Try a formula in a topic (for example "the quadratic formula"). Expect: rendered math, not raw `$...$`.
8. Compare any screen with `docs/blueprint/ui-template.html` side by side.
**Explain it back**: "When you pressed Submit on a check, which functions ran, in order, from the card to the next question on screen?" (the answer is flow 2 in ARCHITECTURE.md)
**Then decide**: milestone 2 (Gemini and Claude adapters) / raise a change request / ship as it is


## Stage D - readings and a clearer look (CR-3, D36)
What the owner can see at the end: tutor text and question cards look clearly different, and every plan step starts with a full reading and a Continue button before the check.

### T38 - Tell text from questions

**Implements**: change request CR-3 part 1 (decision D36) · UI.md "Telling text from questions"
**Depends on**: T37b

**Files**
- Modify: `src/renderer/src/styles/app.css`, `src/renderer/src/components/ChatItemView.tsx`, `tests/renderer/styles.test.ts`, `tests/renderer/ChatItemView.test.tsx`
- Do NOT touch any other file, text, or add dependencies. Use only existing tokens.

**Steps**
1. Add 2 tests (existing tests must keep passing):

   | Test | File | Given | Expect |
   |------|------|-------|--------|
   | styles mark questions apart from reading text | styles.test.ts | read `app.css` | a `.card` block contains `border-left: 3px solid var(--color-accent)`; a `.card .field input` / `.card .field textarea` rule contains `background: var(--color-bg)`; a `.reading` rule exists |
   | ChatItemView wraps tutor text as reading | ChatItemView.test.tsx | render a `text` item with markdown `hello` | `hello` is inside an element with class `reading`; a `question` item is NOT inside one |
2. Run tests. Expected: `Tests  2 failed | 260 passed (262)`. Paste. Any other failure: stop and report.
3. Fix: in `ChatItemView.tsx` render the `text` case as `<div className="reading"><MarkdownView markdown={item.markdown} /></div>`. In `app.css` add `.reading { color: var(--color-text); width: 100%; }`, add `border-left: 3px solid var(--color-accent);` to the existing `.card` rule, and add `.card .field input, .card .field textarea { background: var(--color-bg); border-color: var(--color-muted); }` (also cover the confidence/option rows only if they already use `.field`; do not restyle options).
4. Run `npm test` -> `Tests  262 passed (262)`; `npm run format && npm run lint && npm run typecheck && npm run build` -> exit 0. Paste.
5. Tick T38, stage by name, commit `style: tell tutor text from question cards`.

**Stop and report if** step 2 shows other failures, or tests fail after two attempts.

### T39 - The teach step: rules, schema, prompt

**Implements**: CR-3 part 2 (D36) · SPEC B7, B21 · ARCHITECTURE: Data model (`Action`, `TeachStep`, `Awaiting`), `deriveState` bullets, the `allowedActions` table, `moveNotes`, `checkAnswer`, schema, "LLM calls" prompt
**Depends on**: T38

**Files**
- Modify: `src/shared/types.ts`, `src/shared/schema.ts`, `src/core/engine.ts`, `src/core/prompt.ts`, `tests/helpers/fixtures.ts`, `tests/core/engine.test.ts`, `tests/core/prompt.test.ts`, `tests/shared/schema.test.ts`, plus any existing test file under `tests/` that builds a predict-then-explain event list by hand (find them with `grep -rn "A.explain\|A.predict" tests evals`; they only need the new `A.teach(...)`, `cont()` events inserted, nothing else changed)
- Do NOT touch renderer components, `view.ts` or `evals/` (T40 and T41). Do NOT add dependencies.

**Context**: read ARCHITECTURE.md sections named above first; they are the spec. Changes in short:
- `types.ts`: add the `teach` action `{ type: "teach"; nodeId; verdict; feedback; markdown }`; add `"need_teach"` to `TeachStep`; add the `read` variant to `Awaiting` (question `null`, `nodeId: string`, `eventIndex`).
- `schema.ts`: `teach` in `ActionSchema` (`markdown: z.string()`) and in `REPLY_JSON_SCHEMA` (seven variants; all fields in `required`).
- `engine.ts`: `predict` answered -> `need_teach`; `teach` action -> awaiting learner `read`; its answer -> `need_explain`; allowed/check rules, `moveNotes` lines and `checkAnswer` read rule exactly as in ARCHITECTURE; the verdict handling (`need_verdict`) is unchanged and `teach` is NOT allowed in `need_verdict` or `need_repair`.
- `prompt.ts`: the two prompt strings changed in ARCHITECTURE "LLM calls" (Teach paragraph, Markdown/LaTeX line) copied character for character.
- `fixtures.ts`: add `A.teach(nodeId = "n1", verdict = null)` (markdown `"reading"`, feedback null) and `export const cont = () => ans()`; change `toCheck` to `[act(A.predict(nodeId)), say(), act(A.teach(nodeId)), cont(), act(A.explain(nodeId, check))]`. Add `toRead = (nodeId = "n1"): SessionEvent[] => [act(A.predict(nodeId)), say(), act(A.teach(nodeId))]`.

**Steps**
1. Add 11 tests (names exactly):

   | Test | File | Expect |
   |------|------|--------|
   | predict answer leads to need_teach | engine.test.ts | `deriveState([...toTeach, act(A.predict()), say()])`: `teachStep` `"need_teach"`, awaiting model |
   | teach asks the learner to read | engine.test.ts | `deriveState([...toTeach, ...toRead()])`: awaiting `{ who: "learner", purpose: "read", question: null, nodeId: "n1" }` |
   | continue after teach leads to need_explain | engine.test.ts | `[...toTeach, ...toRead(), cont()]`: `teachStep` `"need_explain"`, awaiting model |
   | teach is allowed only after a predict | engine.test.ts | `allowedActions` in `need_teach` is `["teach"]`; `checkAction` of an `explain` there returns `"explain is not allowed now"`; of a `teach` in `need_predict` returns `"teach is not allowed now"` |
   | teach must be for the current node | engine.test.ts | `checkAction(state, A.teach("n2"))` in `need_teach` for n1 returns `"teach must be for node n1"` |
   | teach needs a non-empty reading | engine.test.ts | `markdown: "  "` returns `"reading is empty"` |
   | checkAnswer accepts continue for a reading | engine.test.ts | all-null answer -> `null`; an answer with `text: "x"` or `choiceIndex: 0` -> `"Press Continue."` |
   | moveNotes asks for a reading in need_teach | engine.test.ts | the exact line from ARCHITECTURE with `n1` |
   | parseReply accepts a teach action | schema.test.ts | a valid teach reply parses `ok: true`; one with an extra field fails |
   | reply JSON schema lists seven variants | schema.test.ts | `anyOf` length is 7 and one variant has `type` enum `["teach"]` |
   | prompt asks for a reading before the check | prompt.test.ts | the built prompt contains `Then teach: a full reading` and, for a `need_teach` state, `Write the reading for node n1` |
2. Run tests. Expected: the 11 new tests fail; existing tests that build predict -> explain by hand also fail (corrupt session / not allowed). Paste the failing run. Fix those existing tests only by inserting `act(A.teach(id)), cont()` between the predict answer and the `explain` (use `toCheck` where it fits). If an existing test needs any other change, stop and report.
3. Implement the source changes listed in Context.
4. Run `npm test` -> `Tests  273 passed (273)`; `npm run format && npm run lint && npm run typecheck && npm run build` -> exit 0. Paste. (`typecheck` will fail in the renderer until you handle the new `Action`/`Awaiting` variants in `src/renderer/src/lib/view.ts` and `QuestionCard`/`ChatItemView` call sites. Make the smallest possible type-only fix: in `view.ts` add `case "teach": break;` to the action switch (leave the verdict/feedback logic as it is) and, wherever `awaiting.question` is read, guard for `awaiting.purpose === "read"`. Report exactly what you touched under NOT IN THE PLAN; T40 replaces it.)
5. Tick T39, stage by name, commit `feat: teach step rules, schema and prompt`.

**Stop and report if** more than the listed existing tests break, the typecheck fix needs more than the lines described, or tests fail after two attempts.

### T40 - Reading and Continue in the window

**Implements**: CR-3 part 2 (D36) · SPEC B21 · UI.md (Reading component, copy "Continue")
**Depends on**: T39

**Files**
- Modify: `src/renderer/src/lib/view.ts`, `src/renderer/src/components/ChatItemView.tsx`, `src/renderer/src/lib/useLesson.ts` (only if needed), `tests/renderer/view.test.ts`, `tests/renderer/ChatItemView.test.tsx`
- Do NOT touch other files, add dependencies, or change other copy.

**Steps**
1. Add 7 tests:

   | Test | File | Expect |
   |------|------|--------|
   | view shows a teach reading as an item | view.test.ts | session `[...toTeach, ...toRead()]` -> last item `{ kind: "reading", markdown: "reading", answered: false }` (plus its `key`, `eventIndex`) |
   | view marks a reading answered after continue | view.test.ts | add `cont()` -> same item has `answered: true`; no `question` item is produced for it |
   | view keeps teach feedback | view.test.ts | a teach with `feedback: "Nice."` puts a `text` item with `Nice.` before the reading |
   | a pending reading shows Continue | ChatItemView.test.tsx | `reading` item, `answered: false` -> button `Continue` |
   | Continue sends an empty answer | ChatItemView.test.tsx | click -> `onSubmit` called once with `{ choiceIndex: null, text: null, reasoning: null, confidence: null }` |
   | an answered reading has no Continue | ChatItemView.test.tsx | `answered: true` -> no `Continue` button |
   | Continue is disabled while busy | ChatItemView.test.tsx | `disabled` true -> the button is disabled |
2. Run tests: the seven new tests fail only. Paste.
3. Implement: `ChatItem` gains `{ kind: "reading"; key; eventIndex: number; markdown: string; answered: boolean }`. In `buildItems`, `teach` pushes its feedback (existing logic) then a reading item (`key: e${i}-rd`) and remembers it as pending-read; the next answer event sets `answered = true` on it (a pending-read answer is not a question answer). `ChatItemView` renders a reading as `<div className="reading"><MarkdownView/>…</div>` with, when not answered, `<button className="btn is-primary" disabled={disabled} onClick={...}>Continue</button>`. Remove the T39 stop-gap in `view.ts`.
4. Run `npm test` -> `Tests  280 passed (280)`; format, lint, typecheck, build exit 0. Paste.
5. Tick T40, stage by name, commit `feat: reading with Continue in the lesson`.

**Stop and report if** an existing test breaks and needs an unlisted file, or tests fail after two attempts.

### T41 - Evals for the reading (real Codex, costs quota)

**Implements**: SPEC evals E5, E5b · CR-3
**Depends on**: T40

**Files**: Modify: `evals/loop.eval.ts` only.

**Steps**
1. Update the existing eval walkthrough so the teach node flow is predict -> teach -> explain: after the predict answer expect `teach` for the same node with `markdown.length >= 1500` (E5); then answer with a null-field Answer and expect `explain` for the same node with a check (E5b); E6 and E7 keep their meaning with `teach` + Continue inserted before the wrong/correct check answers.
2. Run `npm run lint && npm run typecheck`: exit 0. Then run `npm run eval` once. Paste the full output (it uses the owner's Codex quota: one run only; if it fails, paste, do not rerun).
3. Tick T41, stage `evals/loop.eval.ts` and `PLAN.md`, commit `test: evals for the teach step`.

**Stop and report if** E5 fails because the reading is shorter than 1500 characters (report the length and the text, do not change the prompt), or any eval fails twice.

### GATE D - A lesson with readings

**Run**: `npm test` -> `Tests  280 passed (280)`; lint, typecheck, build exit 0; eval report pasted.
**Try it yourself**: `npm run dev`; start a lesson; after the probe and plan expect per step: a predict card, then a long reading with Continue, then a short bridge with a check card. Tutor text should read as plain prose; only questions are boxed. Judge whether the readings are the right length and depth.
**Then decide**: tune the prompt (reading length, tone) / milestone 2 (Gemini and Claude adapters) / ship.

## Stage E - tutor profile (CR-4, D38)
What the owner can see at the end: a Profile screen where their instructions are saved and shape every next reply.

### T42 - Profile rules and prompt section

**Implements**: CR-4 (D38) · SPEC B22 · ARCHITECTURE: limits, `validateProfile`, `buildPrompt`, "LLM calls"
**Depends on**: T41

**Files**
- Modify: `src/shared/limits.ts`, `src/shared/types.ts`, `src/core/engine.ts`, `src/core/prompt.ts`, `tests/shared/limits.test.ts`, `tests/core/engine.test.ts`, `tests/core/prompt.test.ts`
- Do NOT touch any other file. No dependencies.

**Steps**
1. Add 3 tests and one line to an existing test:
   - `limits.test.ts`: add `expect(limits.PROFILE_MAX).toBe(2000);` to the existing test (not a new test).

   | Test | File | Expect |
   |------|------|--------|
   | validateProfile accepts blank and 2000 characters, rejects 2001 | engine.test.ts | `""` and `"a".repeat(2000)` -> `null`; `"a".repeat(2001)` -> `"Keep it under 2000 characters."` |
   | prompt includes the tutor instructions | prompt.test.ts | `buildPrompt({..., profile: "  Keep readings short.  "})` contains, in this order, the heading `# The learner's instructions for you`, the line `Keep readings short.` (trimmed), then `# Lesson`; the full intro paragraph is exactly the one in ARCHITECTURE "LLM calls" |
   | prompt omits the instructions when the profile is blank | prompt.test.ts | `profile` `""`, `"   "` and omitted -> the prompt does not contain `The learner's instructions for you` |
2. Run tests. Expected: `Tests  4 failed | 279 passed (283)`: the three new tests and the edited limits test fail. Paste. Anything else failing: stop and report.
3. Implement: `PROFILE_MAX = 2000` in `limits.ts`; `Api` gets `getProfile` and `saveProfile` exactly as in ARCHITECTURE (this will break `tests/helpers/dom.ts` typing only if typed strictly; it is built from a `Partial<Record<keyof Api, unknown>>`, so add `getProfile: vi.fn(async () => "")` and `saveProfile: vi.fn(async () => ({ ok: true }))` there too - `tests/helpers/dom.ts` is allowed for this one change); `validateProfile` in `engine.ts`; `buildPrompt` gets optional `profile` and the new section placed immediately before `# Lesson`, text from ARCHITECTURE copied character for character.
4. Run `npm test` -> `Tests  283 passed (283)`; `npm run format && npm run lint && npm run typecheck && npm run build` -> exit 0. (`typecheck` fails in `src/preload/index.ts` because `api: Api` lacks the two new methods: add them there as `ipcRenderer.invoke("profile:get")` / `invoke("profile:save", text)` casts like their neighbours, and update the key list in `tests/preload/index.test.ts` and its channel table accordingly; report this under NOT IN THE PLAN.) Paste.
5. Tick T42, stage by name, commit `feat: profile rules and prompt section`.

**Stop and report if** an existing test breaks beyond the ones named, or tests fail after two attempts.

### T43 - Save, load and use the profile (main process)

**Implements**: CR-4 (D38) · SPEC B22 · ARCHITECTURE: Store, ipc, turn
**Depends on**: T42

**Files**
- Modify: `src/main/store.ts`, `src/main/turn.ts`, `src/main/ipc.ts`, `evals/loop.eval.ts` (one line: pass `profile: ""` to `modelStep`), `tests/main/store.test.ts`, `tests/main/turn.test.ts`, `tests/main/ipc.test.ts`
- Do NOT touch other files.

**Steps**
1. Add 5 tests:

   | Test | File | Expect |
   |------|------|--------|
   | profile reads empty when no file exists | store.test.ts | `readProfile()` -> `""`; a `profile.json` containing `{"instructions": 5}` or garbage -> `""` |
   | profile is saved and read back | store.test.ts | `writeProfile("Be brief.")` then `readProfile()` -> `"Be brief."`; no `.tmp` file is left |
   | turn passes the saved profile to the prompt | turn.test.ts | with `writeProfile("Be brief.")` before `advance`, the prompt given to the fake adapter contains `Be brief.`; after a second `writeProfile("Be long.")` the next call's prompt contains `Be long.` and not `Be brief.` |
   | profile channels read and save | ipc.test.ts | `profile:get` returns the saved text; `profile:save` with `"Be brief."` returns `{ ok: true }` and `profile:get` then returns it |
   | profile save refuses text over 2000 characters | ipc.test.ts | `profile:save` with 2001 characters returns `{ ok: false, message: "Keep it under 2000 characters." }` and the stored profile is unchanged |
2. Run tests. Expected: `Tests  5 failed | 283 passed (288)`. Paste.
3. Implement: `Store.readProfile` / `writeProfile` (file `profile.json` in the data dir, through `writeJsonAtomic`, serialized with the same `serial` helper under its own key); `modelStep` deps gain `profile: string` and pass it to `buildPrompt`; `createTurnRunner` reads `store.readProfile()` next to `readKnowledge()` on every loop iteration; `registerIpc` adds `profile:get` and `profile:save` as in ARCHITECTURE (catch a thrown write and return the disk-space message).
4. Run `npm test` -> `Tests  288 passed (288)`; format, lint, typecheck, build exit 0. Paste.
5. Tick T43, stage by name, commit `feat: save and use the tutor profile`.

**Stop and report if** an existing test breaks beyond what the new `profile` argument needs, or tests fail after two attempts.

### T44 - The Profile screen

**Implements**: CR-4 (D38) · SPEC B22 · UI.md (Profile screen, copy)
**Depends on**: T43

**Files**
- Create: `src/renderer/src/components/ProfileScreen.tsx`, `tests/renderer/ProfileScreen.test.tsx`
- Modify: `src/renderer/src/components/Sidebar.tsx`, `src/renderer/src/App.tsx`, `tests/renderer/Sidebar.test.tsx`, `tests/renderer/App.test.tsx`
- Do NOT touch other files. Use existing classes (`.content`, `.field`, `.btn is-primary`, `.note`, `.label`); no new CSS unless a rule is truly missing, and then only tokens from `tokens.css`.

**Steps**
1. Add 6 tests (renderer test conventions as in the neighbours: `// @vitest-environment jsdom`, `import "../helpers/dom";`, `installApi`):

   | Test | File | Expect |
   |------|------|--------|
   | ProfileScreen shows the saved instructions | ProfileScreen.test.tsx | `getProfile` resolves `"Be brief."` -> the `Tutor instructions` textarea has that value; title `Profile` and the note text from UI.md are present |
   | ProfileScreen enables Save only after an edit | ProfileScreen.test.tsx | `Save` disabled at first; after typing, enabled; after typing the original text back, disabled again |
   | ProfileScreen saves and confirms | ProfileScreen.test.tsx | type, click `Save` -> `saveProfile` called with the text, `Saved.` shown, `Save` disabled again |
   | ProfileScreen reports a failed save | ProfileScreen.test.tsx | `saveProfile` resolves `{ ok: false, message: "Keep it under 2000 characters." }` -> that message is shown, no `Saved.`; a rejection shows `Could not save. Check free disk space.` (two assertions, one test) |
   | Sidebar opens the profile | Sidebar.test.tsx | click `Profile` -> `onProfile` called once (update the existing renders to pass `onProfile`) |
   | App opens the profile screen | App.test.tsx | click `Profile` -> the title `Profile` appears and `getProfile` was called |
2. Run tests: only the new tests (and the existing Sidebar tests, if `onProfile` is required and TypeScript is not enforced at test time) may fail. Expected `Tests  6 failed | 288 passed (294)`. Paste.
3. Implement: `ProfileScreen` (textarea `maxLength` from `PROFILE_MAX`, `label` text `Tutor instructions`, the copy in UI.md exactly, ignore a double click while saving); `Sidebar` gets a required `onProfile()` and a `Profile` button next to `Knowledge` (same `btn` style); `App` gets a `{ name: "profile" }` screen showing `<ProfileScreen />`.
4. Run `npm test` -> `Tests  294 passed (294)`; format, lint, typecheck, build exit 0. Paste.
5. Tick T44, stage by name, commit `feat: profile screen`.

**Stop and report if** an existing test breaks and needs an unlisted file, or tests fail after two attempts.

### GATE E - Tutor profile in the window

**Run**: `npm test` -> `Tests  294 passed (294)`; lint, typecheck, build exit 0.
**Try it yourself**: `npm run dev`; open Profile, write "Keep readings under 300 words and use a cooking analogy", Save; start a lesson (or continue one); the next reading should be shorter and use that style. Clear the text, save, and the next call should be back to normal.
**Then decide**: streaming spike / milestone 2 (Gemini and Claude adapters) / tune.

## Stage F - milestone 2: more CLIs (D41-D45)
What the owner can see at the end: a Tutor picker with Codex, Claude Code and Gemini (experimental) on the New lesson form, the tutor named in every lesson with a "Change tutor" button, and a full lesson run through Claude Code.

Conventions for this stage (in addition to the ones at the top of this file):
- Test count before T45: 294. Each task states the count after it. Before implementing, run the new tests and paste the failing run: the new tests must fail (a test file whose import does not exist yet shows as one failed file, not as failed tests). If an existing test fails at that point, stop and report.
- Renderer tests start with `// @vitest-environment jsdom` and `import "../helpers/dom";` and use `installApi` from `tests/helpers/dom.ts`.
- Process tests use `fakeSpawn` from `tests/helpers/fakes.ts` (see `tests/main/codex.test.ts` for the pattern: a real temp dir from `fs.mkdtempSync`, real `node:fs`, `env` with `PATH: ""`).
- Commit trailer on every commit: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Stage files by name. Never push.

### T45 - CLI names and defaults

**Implements**: B25, B26 · ARCHITECTURE "Milestone 2" (`clis.ts`, `CliId`, `CliStatus`) · D44
**Depends on**: T44

**Files**
- Create: `src/shared/clis.ts`, `tests/shared/clis.test.ts`
- Modify: `src/shared/types.ts`
- Do NOT touch any other file.

**Steps**
1. In `types.ts` add `export type CliId = "codex" | "claude" | "gemini";` and `export type CliStatus = { id: CliId; installed: boolean; version: string | null };`, and change `Session.cli` from `"codex"` to `CliId`. Nothing else.
2. Write `tests/shared/clis.test.ts` with 5 tests:

   | Test | Expect |
   |------|--------|
   | cliName adds experimental to Gemini only | `CLI_ORDER` equals `["codex","claude","gemini"]`; `cliName("codex")` `"Codex"`, `cliName("claude")` `"Claude Code"`, `cliName("gemini")` `"Gemini (experimental)"`; `CLI_INFO.gemini.label` `"Gemini"` |
   | isCliId accepts the three ids only | true for the three; false for `"gpt"`, `""`, `null`, `5` |
   | defaultCli prefers the last used CLI when installed | statuses all installed, `lastUsed: "claude"` -> `"claude"` |
   | defaultCli falls back to the first installed | codex missing, claude installed, `lastUsed: "codex"` -> `"claude"`; `lastUsed: null` with gemini only -> `"gemini"` |
   | defaultCli is null when nothing is installed | all `installed: false` -> `null` |
3. Run tests, paste the failing run. Implement `clis.ts` with the five exports from ARCHITECTURE (`CLI_ORDER`, `CLI_INFO`, `isCliId`, `cliName`, `defaultCli`). `clis.ts` imports only types from `./types`.
4. `npm test` -> `Tests  299 passed (299)`; `npm run format && npm run lint && npm run typecheck && npm run build` -> exit 0. Paste.
5. Tick T45, commit `feat: cli names and defaults`.

**Stop and report if** widening `Session.cli` breaks typecheck anywhere.

### T46 - Shared process runner

**Implements**: B32 · ARCHITECTURE "Milestone 2" (`process.ts`) · D45
**Depends on**: T45

**Files**
- Create: `src/main/cli/process.ts`, `tests/main/process.test.ts`
- Do NOT touch `codex.ts` or any other file (T47 moves Codex onto this).

**Context**: this is the generic form of what `src/main/cli/codex.ts` does today. Read that file first; `detect` and `run` there are the reference for every edge (settled flag, kill on abort, timer, `rmSync`, stdin error ignored, `setEncoding("utf8")`, PATH extension with `extraPathDirs`). Skeleton (complete the marked parts from `codex.ts`):

```ts
import path from "node:path";
import { DETECT_TIMEOUT_MS, STDERR_MAX } from "../../shared/limits";
import type { DetectResult, RunResult } from "../../shared/types";
import { extraPathDirs, resolveCommand } from "./adapter";

export type ProcessDeps = {
  spawn: typeof import("node:child_process").spawn;
  env: NodeJS.ProcessEnv;
  home: string;
  tmpRoot: string;
  fs: typeof import("node:fs");
  detectTimeoutMs?: number;
};
export type Dirs = { root: string; work: string };
export type ProcessResult =
  | { kind: "exit"; code: number | null; stdout: string; stderr: string }
  | { kind: "missing" }
  | { kind: "aborted" }
  | { kind: "timeout" };
export type ProcessSpec = {
  command: string | null;
  args(dirs: Dirs): string[];
  stdin: string;
  signal: AbortSignal;
  timeoutMs: number;
  prepare?(dirs: Dirs): void;
  dropEnv?: string[];
};

export function findCommand(deps: ProcessDeps, name: string, envVar: string): string | null {
  const fromEnv = deps.env[envVar];
  if (fromEnv) return fromEnv;
  return resolveCommand(name, deps.env.PATH ?? "", extraPathDirs(deps.home), deps.fs.existsSync);
}

export function lastStderrLine(stderr: string): string { /* same body as in codex.ts */ }

export function detectVersion(deps: ProcessDeps, command: string | null): Promise<DetectResult> {
  /* body of codex.ts detect(), with `command` passed in */
}

export function runProcess(deps: ProcessDeps, spec: ProcessSpec): Promise<ProcessResult> {
  if (!spec.command) return Promise.resolve({ kind: "missing" });
  if (spec.signal.aborted) return Promise.resolve({ kind: "aborted" });
  const root = deps.fs.mkdtempSync(path.join(deps.tmpRoot, "lh-"));
  const work = path.join(root, "work");
  deps.fs.mkdirSync(work);
  const dirs = { root, work };
  spec.prepare?.(dirs);
  const env: NodeJS.ProcessEnv = {
    ...deps.env,
    PATH: [deps.env.PATH ?? "", ...extraPathDirs(deps.home)].filter(Boolean).join(":"),
  };
  for (const name of spec.dropEnv ?? []) delete env[name];
  /* then exactly the Promise from codex.ts run(): spawn(spec.command, spec.args(dirs), { cwd: work, shell: false, stdio: ["pipe","pipe","pipe"], env }),
     finish() removes `root`, clears the timer, removes the abort listener;
     abort -> kill + { kind: "aborted" }; timer -> kill + { kind: "timeout" };
     child "error" -> { kind: "missing" }; child "close" -> { kind: "exit", code, stdout, stderr };
     child.stdin.end(spec.stdin) last. */
}

export function failureResult(
  r: Exclude<ProcessResult, { kind: "exit" }>,
  label: string,
  timeoutMs: number,
): RunResult {
  if (r.kind === "missing") return { ok: false, kind: "failed", message: label + " CLI not found" };
  if (r.kind === "aborted") return { ok: false, kind: "aborted", message: "stopped" };
  return { ok: false, kind: "timeout", message: "no reply after " + timeoutMs / 1000 + " seconds" };
}
```

**Steps**
1. Write `tests/main/process.test.ts` with 10 tests:

   | Test | Expect |
   |------|--------|
   | path_overrides_are_used | env `{ X_PATH: "/fake/x", PATH: "" }` -> `"/fake/x"`; without it and with an `existsSync` that is true only for `/opt/homebrew/bin/x` -> that path; nothing found -> `null` |
   | detectVersion returns the version | stdout `tool 1.2.3\n`, code 0 -> `{ ok: true, version: "1.2.3" }` |
   | detectVersion fails on a missing command, a non-zero exit and a timeout | `null` command; `{ missing: true }`; `{ code: 1 }`; `{ hang: true }` with `detectTimeoutMs: 20` -> each `{ ok: false }` |
   | runProcess runs without a shell in a new empty folder | `opts.shell` is `false`; `opts.cwd` ends with `/work`, is inside `tmpRoot`, and was an empty directory at spawn time (check inside a custom `args` or with `fs.readdirSync` captured in `prepare`) |
   | runProcess calls prepare before spawning and passes dirs to args | `prepare` writes `root/x.txt`; `args: (d) => ["--file", path.join(d.root, "x.txt")]`; the spawn call's args equal that and `prepare` ran before `args` |
   | runProcess writes stdin and returns stdout, stderr and the exit code | plan `{ stdout: "out", stderr: "err", code: 3 }`, stdin `"PROMPT"` -> `{ kind: "exit", code: 3, stdout: "out", stderr: "err" }` and the call's `stdin` is `"PROMPT"` |
   | temp_dir_removed_for_every_cli | after a normal exit, after an abort (`AbortController.abort()` on a `{ hang: true }` plan) and after a timeout (`timeoutMs: 20`), `tmpRoot` contains no entry |
   | timeout_and_stop_work_for_every_cli | `command: null` -> `missing` and no spawn; `{ missing: true }` -> `missing`; already-aborted signal -> `aborted`, no spawn, no folder; hang + abort -> `aborted` and the call was killed; hang + `timeoutMs: 20` -> `timeout` and killed |
   | runProcess drops the named env variables and extends PATH | env `{ A: "1", B: "2", PATH: "/bin" }`, `dropEnv: ["A"]` -> spawn env has no `A`, has `B`, and `PATH` starts with `/bin:` and contains `/opt/homebrew/bin` |
   | failureResult maps the three kinds | `missing` -> failed `"Claude Code CLI not found"` (label `"Claude Code"`); `aborted` -> aborted `"stopped"`; `timeout` with 180000 -> timeout `"no reply after 180 seconds"` |
2. Run tests, paste the failing run. Implement `process.ts`.
3. `npm test` -> `Tests  309 passed (309)`; format, lint, typecheck, build exit 0. Paste.
4. Tick T46, commit `feat: shared cli process runner`.

**Stop and report if** `fakeSpawn` cannot express a case above without changing `tests/helpers/fakes.ts`.

### T47 - Codex adapter on the shared runner

**Implements**: B32 · ARCHITECTURE "Milestone 2" (`CliAdapter`, `createCodexAdapter`) · D45
**Depends on**: T46

**Files**
- Modify: `src/main/cli/adapter.ts`, `src/main/cli/codex.ts`, `tests/helpers/fakes.ts`, `tests/main/codex.test.ts`, `tests/main/turn.test.ts` (only the `slowAdapter` object), `evals/loop.eval.ts` (only if typecheck needs it)
- Do NOT change any behavior of the Codex adapter. Do NOT edit the existing tests in `codex.test.ts`: they are the proof that nothing changed.

**Steps**
1. Add 1 test to `codex.test.ts`: `codex adapter has a label and one retry` -> `adapter.id` `"codex"`, `adapter.label` `"Codex"`, `adapter.retries` `1`. Run, paste the failure.
2. `adapter.ts`: `CliAdapter` becomes `{ id: CliId; label: string; retries: number; detect(); run(req) }` (import `CliId` from `../../shared/types`).
3. `codex.ts`: `createCodexAdapter(deps: ProcessDeps)`; `detect` = `detectVersion(deps, findCommand(deps, "codex", "LEARN_CODEX_PATH"))`; `run` = `runProcess` with `prepare: (d) => deps.fs.writeFileSync(path.join(d.root, "schema.json"), JSON.stringify(req.schema))`, `args: (d) => ["exec", "--json", "--output-schema", path.join(d.root, "schema.json"), "--ephemeral", "--sandbox", "read-only", "--skip-git-repo-check", "-"]`, `stdin: req.prompt`; a non-`exit` result -> `failureResult(r, "Codex", req.timeoutMs)`; exit code 0 -> `parseCodexEvents` (text null -> failed `"Codex returned no message"`); other code -> failed `lastStderrLine(stderr)`. Replace the local `lastStderrLine` with `export { lastStderrLine } from "./process";`. Keep `parseCodexEvents` as is.
4. `fakes.ts` `fakeAdapter`: add `label: "Codex", retries: 1`. `turn.test.ts` `slowAdapter`: add the same two fields.
5. `npm test` -> `Tests  310 passed (310)`; format, lint, typecheck, build exit 0. Paste.
6. Tick T47, commit `refactor: codex adapter on the shared runner`.

**Stop and report if** any existing test in `codex.test.ts` fails after the rewrite and the cause is not a mistake in your new code (for example the order of `writeFileSync` and `mkdirSync` matters to a test): report the test and the difference, do not edit the test.

### T48 - Claude Code adapter

**Implements**: B29, B32, B33 · ARCHITECTURE "Milestone 2" (`claude.ts`) · STACK "Milestone 2 additions"
**Depends on**: T47

**Files**
- Create: `src/main/cli/claude.ts`, `tests/main/claude.test.ts`
- Do NOT touch any other file.

**Context**: real stdout of `claude -p --output-format json` is one JSON object, for example
`{"type":"result","is_error":false,"result":"{\"action\":{\"type\":\"probe\"}}","structured_output":{"action":{"type":"probe"}},"usage":{"input_tokens":2,"cache_creation_input_tokens":7317,"cache_read_input_tokens":0,"output_tokens":207}}`.
Arguments, in this order: `["-p", "--output-format", "json", "--json-schema", JSON.stringify(req.schema), "--tools", "", "--setting-sources", "", "--strict-mcp-config", "--no-session-persistence", "--disable-slash-commands"]`. `dropEnv: ["CLAUDECODE", "CLAUDE_CODE_ENTRYPOINT"]`. Command: `findCommand(deps, "claude", "LEARN_CLAUDE_PATH")`. `id: "claude"`, `label: "Claude Code"`, `retries: 1`. Exports: `parseClaudeResult` and `createClaudeAdapter(deps: ProcessDeps): CliAdapter` (`detect` = `detectVersion(deps, <command>)`).

`parseClaudeResult(stdout)`: `JSON.parse` in try/catch; not an object -> `{ text: null, usage: null, error: "unreadable output" }`. `is_error === true` -> `error` = `String(result ?? "error").slice(0, STDERR_MAX)`. `text` = `JSON.stringify(structured_output)` when `structured_output` is a non-null object, else `result` when it is a string, else `null`. `usage` = `{ inputTokens: input_tokens + cache_creation_input_tokens + cache_read_input_tokens (missing fields count as 0), outputTokens: output_tokens }` when `usage` is an object, else `null`.

`run`: non-`exit` -> `failureResult(r, "Claude Code", req.timeoutMs)`. Otherwise `const p = parseClaudeResult(stdout)` and, in this order: (1) `p.error` is not null and not `"unreadable output"` -> failed with `p.error`; (2) exit code not 0 -> failed `lastStderrLine(stderr)`; (3) `p.error` not null -> failed `"unreadable output"`; (4) `p.text` null -> failed `"Claude Code returned no message"`; (5) else `{ ok: true, text: p.text, usage: p.usage }`.

**Steps**
1. Write 8 tests in `claude.test.ts`:

   | Test | Expect |
   |------|--------|
   | claude_reads_structured_output | the sample above -> `text` equals `JSON.stringify({ action: { type: "probe" } })`, `usage` `{ inputTokens: 7319, outputTokens: 207 }`, `error` null |
   | parseClaudeResult falls back to result | no `structured_output` -> `text` is the `result` string |
   | parseClaudeResult reports unreadable output and is_error | `"not json"` -> error `"unreadable output"`; `{"is_error":true,"result":"Credit balance is too low"}` -> error `"Credit balance is too low"` |
   | claude_spawn_uses_safe_flags | the exact argument list above with `JSON.stringify(schema)` in place; `opts.shell` false; stdin equals the prompt; `opts.cwd` ends with `/work` |
   | claude adapter drops the Claude Code env markers | env with `CLAUDECODE: "1"` -> spawn env has no `CLAUDECODE` |
   | claude_error_names_the_cli | `adapter.label` `"Claude Code"`; plan `{ code: 1, stderr: "boom\n" }` -> failed `"boom"`; plan `{ code: 1, stdout: '{"is_error":true,"result":"Not logged in"}' }` -> failed `"Not logged in"`; `{ missing: true }` -> failed `"Claude Code CLI not found"` |
   | claude adapter reports no message | code 0, stdout `{"is_error":false}` -> failed `"Claude Code returned no message"` |
   | claude adapter uses LEARN_CLAUDE_PATH | env `{ LEARN_CLAUDE_PATH: "/fake/claude", PATH: "" }` -> the spawned command is `/fake/claude`, for `detect` and for `run`; `retries` is 1 |
2. Run tests, paste the failing run. Implement.
3. `npm test` -> `Tests  318 passed (318)`; format, lint, typecheck, build exit 0. Paste.
4. Tick T48, commit `feat: claude code adapter`.

**Stop and report if** tests fail after two attempts.

### T49 - Gemini adapter (experimental)

**Implements**: B30, B31, B32, B33 · ARCHITECTURE "Milestone 2" (`gemini.ts`, "LLM calls (milestone 2)") · STACK "Milestone 2 additions"
**Depends on**: T48

**Files**
- Create: `src/main/cli/gemini.ts`, `tests/main/gemini.test.ts`
- Do NOT touch any other file.

**Context**: Gemini has no schema flag. Success stdout: `{"session_id":"s","response":"<text>","stats":{}}`. Failure: non-zero exit and on stderr `{"session_id":"s","error":{"type":"Error","message":"Please set an Auth method","code":41}}` (possibly with other lines around it).
- Arguments: `["-p", "", "-o", "json", "--approval-mode", "plan", "--skip-trust"]`. Command: `findCommand(deps, "gemini", "LEARN_GEMINI_PATH")`. `id: "gemini"`, `label: "Gemini"`, `retries: 2`. Exports: `GEMINI_EXCLUDED_TOOLS`, `extractJsonObject`, `geminiErrorMessage`, `geminiPrompt` and `createGeminiAdapter(deps: ProcessDeps): CliAdapter` (`detect` = `detectVersion(deps, <command>)`).
- `prepare`: `deps.fs.mkdirSync(path.join(d.work, ".gemini"))` then write `path.join(d.work, ".gemini", "settings.json")` with `JSON.stringify({ tools: { exclude: GEMINI_EXCLUDED_TOOLS } })`.
- `GEMINI_EXCLUDED_TOOLS` = `["run_shell_command", "replace", "write_file", "read_file", "read_many_files", "glob", "grep_search", "list_directory", "web_fetch", "google_web_search", "invoke_agent", "activate_skill", "ask_user", "write_todos", "list_mcp_resources", "read_mcp_resource"]`.
- `geminiPrompt(prompt, schema)` = `prompt + "\n# Reply format\nReply with exactly one JSON object and nothing else: no code fence, no text before or after it. It must match this JSON Schema:\n" + JSON.stringify(schema) + "\n"`. This is the stdin.
- `extractJsonObject` (use exactly this):
  ```ts
  export function extractJsonObject(text: string): string | null {
    const start = text.indexOf("{");
    if (start === -1) return null;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < text.length; i++) {
      const c = text[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (c === "\\") escaped = true;
        else if (c === '"') inString = false;
        continue;
      }
      if (c === '"') inString = true;
      else if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) return text.slice(start, i + 1);
      }
    }
    return null;
  }
  ```
- `geminiErrorMessage(stderr)`: `const obj = extractJsonObject(stderr)`; if it parses and `error.message` is a string -> that, cut to `STDERR_MAX`; else `lastStderrLine(stderr)`.
- `run`: non-`exit` -> `failureResult(r, "Gemini", req.timeoutMs)`; code not 0 -> failed `geminiErrorMessage(stderr)`; code 0: parse stdout (try/catch); no string `response` -> failed `"Gemini returned no message"`; else `{ ok: true, text: extractJsonObject(response) ?? response, usage: null }` (unusable text is passed on so the normal bad-reply retry handles it).

**Steps**
1. Write 10 tests in `gemini.test.ts`:

   | Test | Expect |
   |------|--------|
   | gemini_reads_fenced_or_plain_json | `extractJsonObject` on `{"a":1}`, on a ```` ```json ```` fenced `{"a":1}`, and on `Here you go: {"a":{"b":2}} thanks` -> `{"a":1}`, `{"a":1}`, `{"a":{"b":2}}` |
   | extractJsonObject ignores braces inside strings | `{"a":"} {"}` -> the whole text; `{"a":"x\"}"}` -> the whole text; `no json` and `{"a":1` -> `null` |
   | gemini_error_uses_json_message | stderr `warn\n{"session_id":"s","error":{"type":"Error","message":"Please set an Auth method","code":41}}\n` -> `"Please set an Auth method"`; a 300-character message is cut to 200 |
   | geminiErrorMessage falls back to the last stderr line | `"a\nboom\n"` -> `"boom"` |
   | gemini_prompt_carries_the_schema | `geminiPrompt("P", { type: "object" })` starts with `P\n# Reply format\n` and ends with `{"type":"object"}\n`; the adapter's stdin equals `geminiPrompt(req.prompt, req.schema)` |
   | gemini_spawn_uses_safe_flags | exact argument list; `opts.shell` false; `opts.cwd` ends with `/work` |
   | gemini_writes_tool_exclusion_settings | wrap `fakeSpawn`'s `spawn` so that at spawn time the test reads `<cwd>/.gemini/settings.json`: it parses to `{ tools: { exclude: GEMINI_EXCLUDED_TOOLS } }`, and the list contains `run_shell_command`, `write_file` and `google_web_search` |
   | gemini adapter returns the JSON object from response | stdout `{"response":"```json\n{\"action\":1}\n```"}` -> `{ ok: true, text: "{\"action\":1}", usage: null }` |
   | gemini adapter passes unusable text on and reports no message | response `"I cannot"` -> ok with text `"I cannot"`; stdout `{}` or `junk` -> failed `"Gemini returned no message"`; `{ code: 41, stderr: <the JSON error> }` -> failed `"Please set an Auth method"` |
   | gemini adapter has two retries and uses LEARN_GEMINI_PATH | `retries` 2, `label` `"Gemini"`, `id` `"gemini"`; env `{ LEARN_GEMINI_PATH: "/fake/gemini", PATH: "" }` -> spawned command `/fake/gemini` for `detect` and `run` |
2. Run tests, paste the failing run. Implement.
3. `npm test` -> `Tests  328 passed (328)`; format, lint, typecheck, build exit 0. Paste.
4. Tick T49, commit `feat: gemini adapter (experimental)`.

**Stop and report if** tests fail after two attempts.

### T50 - A registry, and one adapter per lesson

**Implements**: B23, B27, B31, B32 · ARCHITECTURE "Milestone 2" (`registry.ts`, `turn.ts`, `IpcDeps.adapters`)
**Depends on**: T49

**Files**
- Create: `src/main/cli/registry.ts`, `tests/main/registry.test.ts`
- Modify: `src/main/turn.ts`, `src/main/ipc.ts`, `src/main/index.ts`, `tests/helpers/fakes.ts`, `tests/main/turn.test.ts`, `tests/main/ipc.test.ts`
- Do NOT change any IPC channel or the `Api` type (T51).

**Steps**
1. `fakes.ts`: add `export function fakeAdapters(codex: CliAdapter, others: Partial<Record<CliId, CliAdapter>> = {}): Record<CliId, CliAdapter>` returning `{ codex, claude: others.claude ?? codex, gemini: others.gemini ?? codex }`.
2. Tests. `registry.test.ts` (2):

   | Test | Expect |
   |------|--------|
   | createAdapters builds one adapter per CLI | keys `codex`, `claude`, `gemini`; each `adapters[id].id === id`; labels `Codex`, `Claude Code`, `Gemini` |
   | detect_checks_all_three_clis | three hand-made adapters whose `detect` resolve `{ ok: true, version: "1.0.0" }`, `{ ok: false }`, and reject -> `detectAll` returns `[{ id: "codex", installed: true, version: "1.0.0" }, { id: "claude", installed: false, version: null }, { id: "gemini", installed: false, version: null }]`, and each `detect` was called once |
   `turn.test.ts` (4 new; first change the existing `createTurnRunner({ adapter: X, ... })` calls to `adapters: fakeAdapters(X)`):

   | Test | Expect |
   |------|--------|
   | lesson_keeps_its_cli | a session with `cli: "claude"`, `adapters = fakeAdapters(codexFake, { claude: claudeFake })` -> after `advance`, `claudeFake.prompts` has 1 entry and `codexFake.prompts` has 0 |
   | old_lessons_stay_on_codex | a session whose `cli` is `"codex"`, and one whose `cli` is an unknown string (cast) -> both use the codex fake |
   | gemini_gets_two_retries_others_one | `modelStep` with an adapter `{ ...fake, retries: 2 }` and three unusable replies -> 3 prompts, result `bad_reply`; two unusable then a good one -> ok with `calls: 3`; with `retries: 1` and two unusable -> 2 prompts, `bad_reply` |
   | a failed call names the CLI | adapter with `label: "Claude Code"` returning `{ ok: false, kind: "failed", message: "boom" }` -> error message `"Claude Code failed: boom"` |
3. Run tests, paste the failing run.
4. Implement: `registry.ts` as in ARCHITECTURE (`detectAll` uses `Promise.all` over `CLI_ORDER`, each wrapped so a rejection gives not installed). `turn.ts`: `modelStep` loops `for (let attempt = 1; attempt <= deps.adapter.retries + 1; attempt++)` and builds the failure message with `deps.adapter.label + " failed: "`; `createTurnRunner` takes `adapters` and picks `deps.adapters[session.cli] ?? deps.adapters.codex` after reading the session. `ipc.ts`: `IpcDeps.adapter` becomes `adapters`; `cli:detect` stays and returns `adapters.codex.detect()`. `index.ts`: `const adapters = createAdapters({ spawn, env: process.env, home: os.homedir(), tmpRoot: os.tmpdir(), fs })`, passed to `createTurnRunner` and `registerIpc`. `ipc.test.ts` setup: pass `adapters: fakeAdapters(adapter as any)`.
5. `npm test` -> `Tests  334 passed (334)`; format, lint, typecheck, build exit 0. Paste.
6. Tick T50, commit `feat: adapter registry and per-lesson cli`.

**Stop and report if** `evals/loop.eval.ts` stops type-checking (report the error; the fix belongs in T55).

### T51 - Channels for the CLI list, the choice and the switch

**Implements**: B23, B25, B27, B34 · ARCHITECTURE "Milestone 2" (`clis:detect`, `sessions:create`, `sessions:list`, `sessions:setCli`, `Api`)
**Depends on**: T50

**Files**
- Modify: `src/shared/types.ts`, `src/main/ipc.ts`, `src/preload/index.ts`, `tests/main/ipc.test.ts`, `tests/preload/index.test.ts`, `tests/helpers/dom.ts`, and any test file that builds a `SessionSummary` literal (find with `grep -rn "phase:" tests`), only to add `cli: "codex"` to it
- Do NOT touch the renderer source. `detectCli` and `cli:detect` stay for now (T55 removes them), so the window keeps working.

**Steps**
1. `types.ts`: `SessionSummary` gains `cli: CliId`. `Api` gains `detectClis(): Promise<CliStatus[]>` and `setSessionCli(id: string, cli: CliId): Promise<{ ok: true; session: Session } | { ok: false; message: string }>`; `createSession`'s input becomes `{ topic: string; goal: string; cli?: CliId }` (optional until T55).
2. Add 6 tests to `ipc.test.ts`:

   | Test | Expect |
   |------|--------|
   | clis:detect returns a status per CLI | returns three statuses in order `codex`, `claude`, `gemini` |
   | sessions:create stores the chosen CLI | input with `cli: "claude"` -> the returned and the stored session have `cli: "claude"`; without `cli` -> `"codex"` |
   | sessions:create refuses an unknown CLI | `cli: "gpt"` -> `{ ok: false, message: "Choose a tutor." }`, nothing stored |
   | sessions:list carries the CLI | a stored session with `cli: "gemini"` -> its summary has `cli: "gemini"` |
   | switch_tutor_asks_then_stores (ipc part) | `sessions:setCli(id, "claude")` -> `{ ok: true, session }` with `cli: "claude"` and `updatedAt` = NOW; stored; `send` called with `"session:updated"` and that session; `turns.advance` not called; unknown CLI -> `"Choose a tutor."`; unknown id -> `"This lesson no longer exists."` |
   | switch_tutor_refused_while_running | `isRunning` true -> `{ ok: false, message: "A reply is already on the way." }`, session unchanged |
3. Run tests, paste the failing run.
4. Implement in `ipc.ts` (order of checks in `sessions:setCli`: `isCliId` -> running -> session exists). In `preload/index.ts` add `detectClis` (`"clis:detect"`) and `setSessionCli` (`"sessions:setCli"`, id, cli). Update `tests/preload/index.test.ts` (key list, call list, channel table, the `Array(n)` length). In `tests/helpers/dom.ts` add defaults `detectClis: vi.fn(async () => [{ id: "codex", installed: true, version: "0.0.0" }, { id: "claude", installed: true, version: "0.0.0" }, { id: "gemini", installed: false, version: null }])` and `setSessionCli: vi.fn(async () => ({ ok: false, message: "unused" }))`.
5. `npm test` -> `Tests  340 passed (340)`; format, lint, typecheck, build exit 0. Paste.
6. Tick T51, commit `feat: cli list, choice and switch channels`.

**Stop and report if** a file under `src/renderer` stops type-checking.

### T52 - The tutor picker

**Implements**: B25 · UI.md "Tutor picker" · ARCHITECTURE "Milestone 2" (`TutorPicker`)
**Depends on**: T51

**Files**
- Create: `src/renderer/src/components/TutorPicker.tsx`, `tests/renderer/TutorPicker.test.tsx`
- Modify: `src/renderer/src/styles/app.css`, `tests/renderer/styles.test.ts`
- Do NOT touch other files.

**Context**: copy the radio markup of `QuestionCard.tsx` (a `div role="radiogroup" className="options"`, each row a `label` with class `option` plus `is-selected`, containing a visually hidden `input type="radio"` and an `<i>` marker). The group is labelled by a `<span className="label">Tutor</span>` via `aria-labelledby`. Rows come from `CLI_ORDER`; the text is `cliName(id)`, and for a CLI whose status has `installed: false` (or has no status) the row gets class `is-disabled`, its input is `disabled`, and the text is `cliName(id) + " · not installed"`. All inputs are disabled when `props.disabled`. Choosing a row calls `onChange(id)`.

**Steps**
1. Tests (5):

   | Test | File | Expect |
   |------|------|--------|
   | picker_lists_three_and_greys_missing | TutorPicker.test.tsx | statuses codex+claude installed, gemini not -> radios named `Codex`, `Claude Code`, `Gemini (experimental) · not installed`; the third is disabled and its row has class `is-disabled` |
   | TutorPicker marks the current value | TutorPicker.test.tsx | `value: "claude"` -> only that radio is checked; `value: null` -> none |
   | TutorPicker reports a choice | TutorPicker.test.tsx | click `Claude Code` -> `onChange("claude")` once; clicking the disabled row calls nothing |
   | TutorPicker can be disabled | TutorPicker.test.tsx | `disabled` -> all three radios disabled |
   | styles have the disabled option and row rules | styles.test.ts | `app.css` contains `.option.is-disabled` with `color: var(--color-muted)` and a `.row` rule with `display: flex` |
2. Run tests, paste the failing run. Implement; add to `app.css` exactly: `.option.is-disabled { color: var(--color-muted); cursor: default; }`, `.option.is-disabled:hover { background: transparent; }`, `.row { display: flex; align-items: center; gap: var(--space-3); }`.
3. `npm test` -> `Tests  345 passed (345)`; format, lint, typecheck, build exit 0. Paste.
4. Tick T52, commit `feat: tutor picker`.

### T53 - Pick a tutor for a new lesson

**Implements**: B24, B25, B26 · UI.md copy "No CLI", "Tutor"
**Depends on**: T52

**Files**
- Modify: `src/renderer/src/components/CliGate.tsx`, `NewLessonForm.tsx`, `src/renderer/src/App.tsx`, `tests/renderer/CliGate.test.tsx`, `NewLessonForm.test.tsx`, `App.test.tsx`
- Do NOT touch `LessonScreen` (T54).

**Steps**
1. Tests. Update the existing tests to the new props and API (keep their names; `installApi({ detectClis: ... })` replaces `detectCli` overrides; "not found" now means every status has `installed: false`; the banner text is the B24 text). New tests (4):

   | Test | File | Expect |
   |------|------|--------|
   | no_cli_shows_install_banner | CliGate.test.tsx | `clis` all not installed -> `No AI CLI found. Install Codex, Claude Code or Gemini CLI and sign in, then press Retry.` and a `Retry` button; `clis: null` -> nothing; one installed -> nothing |
   | picker_defaults_to_last_used_then_first_installed | NewLessonForm.test.tsx | statuses codex+claude installed: `lastUsed: "claude"` -> `Claude Code` checked; `lastUsed: null` -> `Codex` checked; codex missing and `lastUsed: "codex"` -> `Claude Code` checked |
   | NewLessonForm sends the chosen tutor | NewLessonForm.test.tsx | type topic and goal, click `Claude Code`, `Start` -> `createSession` called with `{ topic, goal, cli: "claude" }` |
   | App passes the last used tutor to the form | App.test.tsx | `listSessions` resolves a newest summary with `cli: "claude"` -> on the New lesson screen `Claude Code` is checked |
2. Run tests, paste the failing run.
3. Implement. `CliGate`: props `{ clis: CliStatus[] | null; onRetry }`, shows the banner when `clis !== null && !clis.some((c) => c.installed)`. `NewLessonForm`: props `{ disabled, statuses, lastUsed, onCreated }`; state `picked: CliId | null` (null until the user chooses); the value shown and sent is `picked ?? defaultCli(statuses, lastUsed)`; `<TutorPicker>` between the Goal field and the Start row; Start is also disabled when that value is null; `createSession({ topic, goal, cli })`. `App`: state `clis: CliStatus[] | null` loaded with `window.api.detectClis()` (same effect shape as today, Retry sets it back to null); `disabled = clis === null || !clis.some((c) => c.installed)`; passes `statuses={clis ?? []}` and `lastUsed={sessions[0]?.cli ?? null}` to the form and `clis` to `CliGate`.
4. `npm test` -> `Tests  349 passed (349)`; format, lint, typecheck, build exit 0. Paste.
5. Tick T53, commit `feat: choose a tutor for a new lesson`.

**Stop and report if** an existing test cannot be migrated without changing what it checks.

### T54 - The tutor in a lesson, and switching

**Implements**: B27, B28, B34 · UI.md "Tutor picker", copy "Tutor"
**Depends on**: T53

**Files**
- Modify: `src/renderer/src/components/LessonScreen.tsx`, `src/renderer/src/App.tsx`, `tests/renderer/LessonScreen.test.tsx`, `tests/renderer/App.test.tsx` (only to pass the new props)
- Do NOT touch `useLesson.ts`: the switched session arrives through the existing `session:updated` subscription.

**Steps**
1. New tests in `LessonScreen.test.tsx` (6); existing renders get `statuses` with all three installed and `onRetryDetect={() => {}}`:

   | Test | Expect |
   |------|--------|
   | lesson_header_names_the_tutor | session with `cli: "claude"` -> text `Tutor: Claude Code` and a button `Change tutor` |
   | missing_cli_blocks_lesson_with_banner | session `cli: "gemini"`, gemini not installed, a pending question -> `Gemini not found. Install it and sign in, then press Retry.`; its `Retry` calls `onRetryDetect` (not `api.advance`); the card's `Submit` is disabled; no "The last reply did not arrive." banner |
   | switch_tutor_asks_then_stores | click `Change tutor`, choose `Claude Code` (lesson is on codex) -> dialog `Switch this lesson to Claude Code? It will read the whole lesson so far and continue from there.` with `Cancel` and `Switch`; `Switch` -> `api.setSessionCli(id, "claude")` once, `api.advance` not called, the picker closes |
   | switch cancel keeps the tutor | same, `Cancel` -> `setSessionCli` not called, dialog gone |
   | Change tutor is disabled while a reply is on the way | `isRunning` true -> the button is disabled |
   | Change tutor is hidden when the lesson is done | a finished lesson -> no `Change tutor` button; `Tutor: Codex` still shown |
2. Run tests, paste the failing run.
3. Implement in `LessonScreen` (props `{ id, start, statuses: CliStatus[] | null, onRetryDetect(): void }`):
   - under the goal line: `<div className="row"><span className="note">Tutor: {CLI_INFO[session.cli].label}</span>{!isDone && <button className="btn" disabled={busy} onClick={toggle}>Change tutor</button>}</div>`;
   - when open: `<TutorPicker statuses={statuses ?? []} value={session.cli} disabled={busy} onChange={(cli) => cli === session.cli ? close() : setAsk(cli)} />`;
   - `ask !== null`: `<ConfirmDialog message={"Switch this lesson to " + CLI_INFO[ask].label + "? It will read the whole lesson so far and continue from there."} confirmLabel="Switch" onConfirm={...} onCancel={...} />`; confirm calls `window.api.setSessionCli(id, ask)`, then closes the dialog and the picker; a `{ ok: false }` result shows its `message` in a `<small>` under the row;
   - `missing = statuses !== null && !statuses.some((s) => s.id === session.cli && s.installed)`; when `missing`, the banner is `<Banner kind="error" message={CLI_INFO[session.cli].label + " not found. Install it and sign in, then press Retry."} actionLabel="Retry" onAction={onRetryDetect} />` in place of every other banner, and `ChatItemView` gets `disabled={busy || missing}`.
   `App` passes `statuses={clis}` and `onRetryDetect={retry}`.
4. `npm test` -> `Tests  355 passed (355)`; format, lint, typecheck, build exit 0. Paste.
5. Tick T54, commit `feat: tutor in the lesson header, with switching`.

**Stop and report if** `ConfirmDialog` cannot take the label `Switch` without a change to its file.

### T55 - Clean up, document, and check Claude Code for real

**Implements**: B23, B33 · SPEC evals (milestone 2) · D43
**Depends on**: T54

**Files**
- Modify: `src/shared/types.ts`, `src/main/ipc.ts`, `src/preload/index.ts`, `tests/main/ipc.test.ts`, `tests/preload/index.test.ts`, `tests/helpers/dom.ts`, `evals/loop.eval.ts`, `README.md`
- Do NOT touch other files.

**Steps**
1. Remove the old path: delete `Api.detectCli`, the `cli:detect` handler, the preload method, its `dom.ts` default, and the ipc test `cli:detect passes the adapter result through`; update the preload test lists. Make `cli` required in `createSession`'s input type and in `sessions:create` (a missing `cli` is refused with `"Choose a tutor."`); change the ipc test `sessions:create stores the chosen CLI` so its second half expects that refusal, and give every other `sessions:create` call in the tests a `cli`. Check with `grep -rn "detectCli\|cli:detect" src tests evals` -> no output.
2. `evals/loop.eval.ts`: choose the adapter with `const cli = process.env.LEARN_EVAL_CLI ?? "codex"`; if `!isCliId(cli)` throw `new Error("LEARN_EVAL_CLI must be codex, claude or gemini")`; `const adapter = createAdapters({ ... the same deps as today ... })[cli]`; print the CLI name in the score line (`EVAL SCORE <cli> first-try ...`).
3. `README.md`: Requirements lists the three CLIs ("at least one of: Codex CLI, Claude Code, Gemini CLI (experimental: not yet run against a real Gemini account), installed and signed in"); "What goes to the model" names all three commands from STACK and says the lesson so far and the tutor instructions from the Profile screen are sent; document `LEARN_CLAUDE_PATH`, `LEARN_GEMINI_PATH`, `LEARN_EVAL_CLI`; Status: "Milestone 2: choose Codex, Claude Code or Gemini per lesson and switch mid-lesson."
4. `npm test` -> `Tests  354 passed (354)` (one test was deleted in step 1); format, lint, typecheck, build exit 0. Paste.
5. Run `LEARN_EVAL_CLI=claude npm run eval` exactly once (real Claude Code, uses the owner's Claude quota; the owner approved one run). Paste the full output. Do not rerun on failure.
6. Tick T55, commit `feat: three clis end to end, evals per cli`.

**Stop and report if** step 4 fails twice. If the eval in step 5 fails, still do step 6 and put the full eval output in the report with STATUS: DEVIATED.

### GATE F - Three CLIs

The builder stops here.

**Run**: `npm test` -> `Tests  354 passed (354)`; lint, typecheck, build exit 0; the Claude Code eval output from T55.
**Look at**: `git diff <T44 commit>..HEAD --stat` -> only `src/shared`, `src/main`, `src/preload`, `src/renderer`, `tests`, `evals`, `README.md`, `PLAN.md`.
**Fresh review**: Fable reviews T45-T55 against SPEC (B23-B34), ARCHITECTURE "Milestone 2", UI.md and the template.
**Try it yourself**:
1. `npm run dev`. New lesson shows the Tutor picker; Gemini reads "not installed" or, once installed, "Gemini (experimental)".
2. Start a lesson with Claude Code. Expect replies in a few seconds and "Tutor: Claude Code" under the goal.
3. Mid-lesson press Change tutor, choose Codex, read the dialog, Switch. Answer the next card: the reply now comes from Codex.
4. Open an old lesson: it says "Tutor: Codex" and still works.
**Explain it back**: "Why does switching the tutor mid-lesson need no conversion of the saved lesson?"
**Then decide**: milestone 3 (more input) / tune.

### OWNER TASK - Gemini live run (after the owner has a paid account)
1. Owner: `gemini` in a terminal, sign in.
2. `LEARN_EVAL_CLI=gemini npm run eval` once; paste the output to the planner.
3. Pass (7 of 8 first try, 8 of 8 with retries): the planner raises a change request to remove "(experimental)". Fail: the planner diagnoses against `gemini.ts` and STACK's unverified list.

## Backlog (owner requests after Gate D, not yet planned)
- Spike result (2026-11-14): `codex exec --json` sends NO partial text: only `thread.started`, `turn.started`, then one `item.completed` with the whole reply, then `turn.completed`. A 400-word reading took 43.8 s at the default reasoning effort (1444 of 1949 output tokens were reasoning) and 19.6 s with `-c model_reasoning_effort=low` (one sample each). Claude Code has `--output-format stream-json --include-partial-messages`; Gemini CLI is unchecked. So real streaming is possible only with the Claude/Gemini adapters.
- Faster feel: streaming of the reply. First a spike: does `codex exec --json` emit partial text of the final message, or only the whole message at the end? Other ideas: write the bridge and check while the learner reads (the Continue answer carries no information).

- Owner-approved scope after milestone 2 (2026-11-14, "I like all 4"; planning to be done by Fable, not yet started): (1) packaging and an open-source release, deferred review findings; (2) practice mode, flashcards, knowledge graph, side questions; (3) more input: PDFs and images, dictation, web search, and a read-only project folder the model may read but never change; (4) model choice, themes, editing the base prompt. Streaming is dropped for now (spike result above).

## Where each SPEC test lives
| SPEC test | Task |
|-----------|------|
| detect_reports_missing_cli, detect_times_out_after_5s | T13 (adapter), T32 (banner) |
| new_lesson_rejects_empty_fields, new_lesson_rejects_over_500_chars | T6, T33 (form) |
| probe_card_collects_reasoning_and_confidence | T28 |
| probe_ends_on_probe_done | T6 |
| probe_forces_conclusion_after_8 | T8, T9 (note) |
| plan_rejects_cycle, plan_rejects_unknown_dep, plan_rejects_size_out_of_range | T5 |
| plan_map_marks_states | T25 |
| teach_rejects_step_with_unmet_deps, teach_orders_predict_explain_check | T8 |
| choice_check_graded_by_app | T7, T28 (display) |
| text_check_sent_to_model | T10, T7 (verdict) |
| failed_check_requires_same_node | T8 |
| third_fail_marks_shaky | T7 |
| lesson_done_saves_only_passed | T9, T18 |
| lesson_done_rejected_while_steps_remain | T8 |
| bad_reply_retries_once_then_errors | T17 |
| cli_error_shows_last_stderr_line | T12, T14 |
| cli_timeout_after_180s | T14 |
| failed_call_leaves_session_unchanged | T18 |
| stop_kills_process_and_restores | T14, T18 |
| second_call_refused_while_running | T18 |
| save_is_atomic | T15 |
| sessions_listed_newest_first | T15, T32 (display) |
| resume_shows_pending_question, resume_offers_retry_for_interrupted_call | T31 |
| delete_session_needs_confirm | T20, T32 |
| knowledge_listed_newest_first_with_source | T16, T20, T35 |
| knowledge_item_deleted | T16, T35 |
| prober_prompt_includes_newest_200 | T10 |
| detect_checks_all_three_clis | T50 |
| no_cli_shows_install_banner | T53 |
| picker_lists_three_and_greys_missing | T52 |
| picker_defaults_to_last_used_then_first_installed | T45 (rule), T53 |
| lesson_keeps_its_cli, old_lessons_stay_on_codex | T50 |
| lesson_header_names_the_tutor, missing_cli_blocks_lesson_with_banner | T54 |
| switch_tutor_asks_then_stores | T51 (ipc), T54 |
| switch_tutor_refused_while_running | T51 |
| claude_spawn_uses_safe_flags, claude_reads_structured_output, claude_error_names_the_cli | T48 |
| gemini_spawn_uses_safe_flags, gemini_writes_tool_exclusion_settings, gemini_prompt_carries_the_schema, gemini_reads_fenced_or_plain_json, gemini_error_uses_json_message | T49 |
| gemini_gets_two_retries_others_one | T50 |
| temp_dir_removed_for_every_cli, timeout_and_stop_work_for_every_cli | T46 |
| path_overrides_are_used | T46, T48, T49 |
| codex_spawn_uses_safe_flags, temp_dir_removed_after_call | T14 |
