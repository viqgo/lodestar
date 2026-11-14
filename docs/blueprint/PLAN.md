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
- [ ] T6 Lesson state: start, probe, plan
- [ ] T7 Lesson state: teaching
- [ ] T8 What the model may do next
- [ ] T9 Answer checks, learned items, move notes
- [ ] T10 The prompt
- [ ] GATE A The lesson rules work from the test suite
- [ ] T11 Finding the CLI on disk
- [ ] T12 Reading Codex output
- [ ] T13 Codex adapter: detect
- [ ] T14 Codex adapter: run
- [ ] T15 Store: sessions
- [ ] T16 Store: knowledge
- [ ] T17 One model step with retry
- [ ] T18 The advance loop
- [ ] T19 Evals against real Codex
- [ ] GATE B A lesson runs headless against real Codex
- [ ] T20-T37 Stage C (outline)
- [ ] GATE C A full lesson in the window

Conventions used in every task:
- "Run tests" means `npm test`. The expected line is the vitest summary line, e.g. `Tests  9 passed (9)`.
- Test tables read: build the input in **Given**, call the function, assert **Expect**. One row is one `it(...)` named exactly as in **Test**.
- Fixture names (`A.probe()`, `toTeach`, `pick(1)`, ...) come from `tests/helpers/fixtures.ts` (created in T4).

---

## Stage A - the lesson rules
What the owner can see working at the end: `npm test` shows 61 passing tests that walk a whole lesson (probe, plan, teach, repair, finish) with no Codex and no window.

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

### GATE A - The lesson rules work from the test suite

The builder stops here. Nothing continues until the owner says so.

**Run**: `npm test` -> expect `Tests  61 passed (61)`; `npm run lint && npm run typecheck` -> exit 0
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
4. Run tests. Expected: `Tests  65 passed (65)`. Paste.
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
4. Run tests. Expected: `Tests  71 passed (71)`. Paste.
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
3. Run tests. Expected: 5 failed, 71 passed. Paste.
4. In `src/main/cli/codex.ts` add `createCodexAdapter(deps: { spawn: typeof import("node:child_process").spawn; env: NodeJS.ProcessEnv; home: string; tmpRoot: string; fs: typeof import("node:fs"); detectTimeoutMs?: number }): CliAdapter`:
   - command = `deps.env.LEARN_CODEX_PATH` if set and non-empty, else `resolveCommand("codex", deps.env.PATH ?? "", extraPathDirs(deps.home), deps.fs.existsSync)`. Resolve it on every `detect()` and `run()` call.
   - `detect()`: no command -> `{ ok: false }`. Otherwise spawn `command` with args `["--version"]` and options `{ shell: false }`, collect stdout, and resolve exactly once: on `"error"` -> `{ ok: false }`; on `"close"` with code 0 and a match of `/\d+\.\d+\.\d+/` in stdout -> `{ ok: true, version: match[0] }`; on any other close -> `{ ok: false }`; when `deps.detectTimeoutMs ?? DETECT_TIMEOUT_MS` passes first -> `child.kill("SIGKILL")` and `{ ok: false }`. Clear the timer when resolved.
5. Run tests. Expected: `Tests  76 passed (76)`. Paste.
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
2. Run tests. Expected: 8 failed, 76 passed. Paste.
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
4. Run tests. Expected: `Tests  84 passed (84)`. Paste.
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
4. Run tests. Expected: `Tests  90 passed (90)`. Paste.
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
2. Run tests. Expected: 4 failed, 90 passed. Paste.
3. Add to the store: `readKnowledge()` (missing or unparsable file -> `[]`; sorted by `createdAt` descending), `addKnowledge(items)` (read, append, `writeJsonAtomic`; no write when `items` is empty), `deleteKnowledge(id)` (read, filter, `writeJsonAtomic`).
4. Run tests. Expected: `Tests  94 passed (94)`. Paste.
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
5. Run tests. Expected: `Tests  99 passed (99)`. Paste.
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
2. Run tests. Expected: 6 failed, 99 passed. Paste.
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
4. Run tests. Expected: `Tests  105 passed (105)`. Paste. Run `npm run format && npm run lint && npm run typecheck`: exit 0.
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
3. Run `npm test`. Expected: `Tests  105 passed (105)` (evals are not part of `npm test`). Run `npm run format && npm run lint && npm run typecheck`: exit 0.
4. Tick T19, then `git add -A && git commit -m "test: evals against real codex"`.

**Stop and report instead of continuing if**
- the score is below the bar after one full re-run (paste both outputs; do not edit `src/` or the prompt: a prompt change is a change request for the owner),
- Codex reports a login, quota or network error,
- any call exceeds 60 seconds or E1 exceeds 30,000 input tokens.

### GATE B - A lesson runs headless against real Codex

The builder stops here. Nothing continues until the owner says so.

**Run**: `npm test` -> expect `Tests  105 passed (105)`; `npm run eval` -> expect `EVAL SCORE first-try N/7, with-retry 7/7`, N >= 6
**Look at**: `git diff <gate-A-commit>..HEAD --stat` -> only `src/main/cli/`, `src/main/store.ts`, `src/main/turn.ts`, `tests/`, `evals/`, `PLAN.md`
**Fresh review**: run the reviewer prompt from the skill's `references/execution.md` over T11-T19 against SPEC.md and ARCHITECTURE.md. Attach its verdict.
**Try it yourself**: read the seven `E` lines from the eval output: how many seconds and input tokens does one call cost on your account? Decide whether that is acceptable for a 40-call lesson before the window is built.
**Explain it back**: "Every reply from Codex is checked twice: against the schema, and against the rules. Give one reply that passes the schema but must still be refused, and say what the app does next."
**Then decide**: plan Stage C in detail / raise a change request (for example about cost per call or the prompt)

---

## Stage C - the window (outline; planned in detail after Gate B)
What the owner can see working at the end: start a lesson in the app, answer questions, see the map fill in, finish, and find the learned items on the Knowledge screen; quit mid-lesson and resume.

| Task | Delivers | Files | Behaviors / tests |
|------|----------|-------|-------------------|
| T20 | IPC handlers (`registerIpc`): all 11 channels, `session:updated`, `turn:ended` | `src/main/ipc.ts`, `tests/main/ipc.test.ts` | B2, B14, B16, B17, B18; `delete_session_needs_confirm` (main part), `knowledge_listed_newest_first_with_source` |
| T21 | Preload bridge and main wiring (store, adapter, runner, CSP, `LEARN_DATA_DIR`) | `src/preload/index.ts`, `src/main/index.ts` | B20; app still starts |
| T22 | Component styles copied from `ui-template.html` | `src/renderer/src/styles/app.css` | UI.md tokens and components |
| T23 | `buildItems` | `src/renderer/src/lib/view.ts` + test | B3, B4, B8 (grades) |
| T24 | `shuffledOrder` | `src/renderer/src/lib/shuffle.ts` + test | B8 (stable shuffle) |
| T25 | `planToMermaid` | `src/renderer/src/lib/planGraph.ts` + test | B6; `plan_map_marks_states` |
| T26 | `Banner`, `ThinkingBar`, `ConfirmDialog` | three components + tests | B12, B13, B17 |
| T27 | `MarkdownView` with KaTeX; proves math renders under the CSP | component + test | removes one `unverified` item |
| T28 | `QuestionCard` | component + test | B3, B8; `probe_card_collects_reasoning_and_confidence`, `choice_check_graded_by_app` (display) |
| T29 | `ChatItemView` | component + test | B4, B10 |
| T30 | `PlanPanel` with Mermaid and the plain-list fallback; proves Mermaid renders under the CSP | component + test | B6; removes one `unverified` item |
| T31 | `useLesson` | `src/renderer/src/lib/useLesson.ts` + test | B14, B16; `resume_shows_pending_question`, `resume_offers_retry_for_interrupted_call` |
| T32 | `Sidebar`, `CliGate` | components + tests | B1, B16, B17; `sessions_listed_newest_first` (display), `delete_session_needs_confirm` |
| T33 | `NewLessonForm` | component + test | B2 |
| T34 | `LessonScreen` | component + test | B6, B12, B13, B14 |
| T35 | `KnowledgeScreen` | component + test | B18 |
| T36 | `App` wiring and screen switching | `src/renderer/src/App.tsx` + test | all screens reachable |
| T37 | `README.md`: what it is, requirements, how to run, how lessons are stored | `README.md` | - |
| GATE C | full lesson by hand in the window, side by side with `ui-template.html` | - | every B-number walked once |

## Milestone 2 - Gemini CLI and Claude Code (outline)
Planned after Gate C. Each adapter implements `CliAdapter` (`detect`, `run`) and returns the same JSON reply.
- Verify each CLI's non-interactive and structured-output flags by running it (owner installs Gemini CLI first).
- `src/main/cli/gemini.ts`, `src/main/cli/claude.ts`, with tests using `fakeSpawn`.
- `Session.cli` and `CliAdapter.id` widen to `"codex" | "gemini" | "claude"`; a CLI picker on the New lesson form; `detect` for all three at launch.
- Run the same seven evals against each CLI.

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
| codex_spawn_uses_safe_flags, temp_dir_removed_after_call | T14 |
