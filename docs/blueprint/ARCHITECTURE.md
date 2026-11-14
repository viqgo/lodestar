# Architecture - lodestar, milestone 1

Status: approved 2026-11-13 (D23).

## Overview
The app has three parts. The **window** (React) shows the lesson and collects answers. The **main process** (Node, inside Electron) owns everything else. The **Codex CLI** is started fresh for every model reply and exits after it.

A lesson is stored as a list of events: each model action and each learner answer, in order. Nothing else is saved. Everything the app needs to know (which phase we are in, which step is current, what is allowed next) is recomputed from that list by one pure function, `deriveState`.

When it is the model's turn, the main process builds one prompt from the event list, runs `codex exec`, and gets back one JSON action. The action is checked twice: does it match the schema, and is it allowed right now. If yes it is appended to the event list and saved; if not the app retries once and then reports an error. The window is told to redraw.

Lessons are JSON files, one per lesson, plus one `knowledge.json`. The window never touches files or processes; it asks the main process through a small fixed API.

## Flows (read these first)

**1. Start a lesson**
`NewLessonForm` submit -> `api.createSession` -> `ipc: sessions:create` -> `validateNewLesson` -> `store.writeSession` -> window opens `LessonScreen` with `start=true` -> `useLesson` calls `api.advance` -> `turn.advance` -> `deriveState` -> `buildPrompt` -> `adapter.run` (`codex exec`) -> `parseReply` -> `checkAction` -> append event -> `store.writeSession` -> `session:updated` sent to window -> loop while it is still the model's turn -> returns when a question is waiting -> `LessonScreen` renders `buildItems(session)`.

**2. Answer a question**
`QuestionCard` submit -> `useLesson.submit(answer)` -> `api.answer` -> `ipc: lesson:answer` -> `checkAnswer` -> append answer event -> `store.writeSession` -> `turn.advance` (same chain as flow 1; a choice check is graded inside `deriveState`, a text check is graded by the model's `verdict`) -> on `lesson_done`: `learnedToSave` -> `store.addKnowledge`.

**3. Something fails**
`adapter.run` returns `{ok:false}` (exit code, timeout, stop) or `parseReply` / `checkAction` reject twice -> `turn.advance` returns `{ok:false, error}` without appending anything -> `useLesson` sets `error` -> `Banner` shows the exact SPEC message with Retry -> Retry calls `api.advance` again.

## File tree
```
package.json                         - scripts and pinned dependencies
electron.vite.config.ts              - build config for main, preload, renderer
tsconfig.json                        - one strict TypeScript config for all code
vitest.config.mts                    - unit test config (tests/**)
vitest.eval.config.mts               - eval config (evals/**), real Codex
eslint.config.mjs                    - lint rules
.prettierignore
.prettierrc.json                     - format rules
.gitignore
LICENSE                              - MIT
README.md                            - what it is, how to run
CLAUDE.md                            - builder rules (phase 8)

src/shared/limits.ts                 - every numeric limit, in one place
src/shared/types.ts                  - all types shared by main and window
src/shared/schema.ts                 - zod schema for model replies, JSON Schema for Codex, parseReply

src/core/plan.ts                     - plan validation and node eligibility
src/core/engine.ts                   - deriveState, checkAction, checkAnswer: the lesson rules
src/core/prompt.ts                   - builds the full prompt text

src/main/cli/adapter.ts              - CliAdapter interface, resolveCommand
src/main/cli/codex.ts                - Codex adapter: detect and run
src/main/store.ts                    - JSON file storage for sessions and knowledge
src/main/turn.ts                     - runs model turns: prompt, call, validate, retry, save
src/main/ipc.ts                      - registers the window-facing API
src/main/index.ts                    - Electron startup, window, security settings

src/preload/index.ts                 - exposes window.api (the only bridge)

src/renderer/index.html              - page shell
src/renderer/src/main.tsx            - React entry
src/renderer/src/vite-env.d.ts       - lets TypeScript accept CSS imports
src/renderer/src/App.tsx             - layout and screen switching
src/renderer/src/styles/tokens.css   - design tokens from UI.md
src/renderer/src/styles/app.css      - all component styles
src/renderer/src/lib/view.ts         - turns a session into the list of things to draw
src/renderer/src/lib/shuffle.ts      - stable option shuffling
src/renderer/src/lib/planGraph.ts    - plan -> Mermaid text
src/renderer/src/lib/useLesson.ts    - hook: load a lesson, submit, retry, stop
src/renderer/src/lib/time.ts         - relativeTime, phaseLabel (D31)
src/renderer/src/components/Sidebar.tsx
src/renderer/src/components/CliGate.tsx
src/renderer/src/components/NewLessonForm.tsx
src/renderer/src/components/LessonScreen.tsx
src/renderer/src/components/ChatItemView.tsx
src/renderer/src/components/QuestionCard.tsx
src/renderer/src/components/MarkdownView.tsx
src/renderer/src/components/PlanPanel.tsx
src/renderer/src/components/Banner.tsx
src/renderer/src/components/ThinkingBar.tsx
src/renderer/src/components/ConfirmDialog.tsx
src/renderer/src/components/KnowledgeScreen.tsx

tests/core/plan.test.ts
tests/core/engine.test.ts
tests/core/prompt.test.ts
tests/shared/schema.test.ts
tests/main/codex.test.ts
tests/main/store.test.ts
tests/main/turn.test.ts
tests/main/ipc.test.ts
tests/renderer/*.test.tsx            - one per component with behavior
tests/helpers/fixtures.ts            - sample actions and event lists
tests/helpers/fakes.ts               - fake spawn and fake adapter
tests/helpers/dom.ts                 - jest-dom setup and window.api fake for renderer tests (D31)
tests/smoke.test.ts                  - proves the test runner works
evals/loop.eval.ts                   - E1-E7 against real Codex
```

Import rules: `src/core` and `src/shared` import nothing from `main`, `preload`, `renderer`, Electron or Node built-ins. `src/renderer` imports only from `src/shared`, `src/core` and itself. Only `src/main` touches `fs`, `child_process` and Electron main APIs.

## Data model (`src/shared/types.ts`)

```ts
export type Question = {
  kind: "choice" | "text";
  prompt: string;
  options: string[];            // [] for text
  correctIndex: number | null;  // null for text, or for a probe choice with no right answer
};

export type PlanNode = { id: string; title: string; deps: string[] };
export type Verdict = "pass" | "fail";

export type Action =
  | { type: "probe"; question: Question }
  | { type: "probe_done"; known: string[]; goal: string }
  | { type: "plan"; nodes: PlanNode[] }
  | { type: "predict"; nodeId: string; verdict: Verdict | null; feedback: string | null; question: Question }
  | { type: "teach"; nodeId: string; verdict: Verdict | null; feedback: string | null; markdown: string }   // CR-3: a full reading, no question
  | { type: "explain"; nodeId: string; verdict: Verdict | null; feedback: string | null; markdown: string; check: Question }
  | { type: "lesson_done"; verdict: Verdict | null; feedback: string | null; summary: string;
      learned: { nodeId: string; text: string }[] };
export type ActionType = Action["type"];

export type Confidence = "sure" | "unsure" | "guessing";
export type Answer = {
  choiceIndex: number | null;   // index into Question.options (original order), null for text
  text: string | null;          // null for choice
  reasoning: string | null;
  confidence: Confidence | null;
};

export type Usage = { inputTokens: number; outputTokens: number };
export type SessionEvent =
  | { kind: "action"; at: string; action: Action; usage: Usage | null }
  | { kind: "answer"; at: string; answer: Answer };

export type Session = {
  version: 1;
  id: string;            // "s_" + crypto.randomUUID()
  topic: string;
  goal: string;
  cli: "codex";
  createdAt: string;     // ISO 8601 UTC
  updatedAt: string;
  events: SessionEvent[];
};
export type SessionSummary = { id: string; topic: string; phase: Phase; updatedAt: string };

export type KnowledgeItem = { id: string; text: string; sessionId: string; nodeId: string; createdAt: string };
export type KnowledgeView = KnowledgeItem & { lessonTopic: string | null };  // null if the lesson was deleted

export type Phase = "probe" | "plan" | "teach" | "done";
export type NodeState = { status: "todo" | "passed" | "shaky"; fails: number };
export type TeachStep = "need_predict" | "need_teach" | "need_explain" | "need_repair" | "need_verdict";
export type Awaiting =
  | { who: "model" }
  | { who: "learner"; purpose: "probe" | "predict" | "check"; question: Question;
      nodeId: string | null; eventIndex: number }
  | { who: "learner"; purpose: "read"; question: null; nodeId: string; eventIndex: number }   // CR-3: answered by Continue (an Answer with every field null)
  | { who: "nobody" };

export type LessonState = {
  phase: Phase;
  probeAnswered: number;
  known: string[];
  sharpGoal: string | null;
  plan: PlanNode[] | null;
  nodes: Record<string, NodeState>;
  currentNodeId: string | null;
  teachStep: TeachStep | null;   // meaningful only when phase is "teach" and awaiting.who is "model"
  awaiting: Awaiting;
  summary: string | null;
};

export type DetectResult = { ok: true; version: string } | { ok: false };
export type RunRequest = { prompt: string; schema: object; signal: AbortSignal; timeoutMs: number };
export type RunResult =
  | { ok: true; text: string; usage: Usage | null }
  | { ok: false; kind: "failed" | "timeout" | "aborted"; message: string };

export type TurnError = { kind: "cli" | "bad_reply" | "busy" | "stopped" | "not_found" | "invalid_answer"; message: string };
export type TurnResult = { ok: true; session: Session } | { ok: false; error: TurnError; session: Session | null };

export type Api = {
  detectCli(): Promise<DetectResult>;
  listSessions(): Promise<SessionSummary[]>;
  createSession(input: { topic: string; goal: string }): Promise<{ ok: true; session: Session } | { ok: false; message: string }>;
  getSession(id: string): Promise<Session | null>;
  deleteSession(id: string): Promise<void>;
  advance(id: string): Promise<TurnResult>;
  answer(id: string, answer: Answer): Promise<TurnResult>;
  stop(id: string): Promise<void>;
  isRunning(id: string): Promise<boolean>;
  listKnowledge(): Promise<KnowledgeView[]>;
  deleteKnowledge(id: string): Promise<void>;
  getProfile(): Promise<string>;   // CR-4: the saved tutor instructions, "" when none
  saveProfile(text: string): Promise<{ ok: true } | { ok: false; message: string }>;
  onSessionUpdated(cb: (session: Session) => void): () => void;   // returns unsubscribe
  onTurnEnded(cb: (id: string, result: TurnResult) => void): () => void;
};
```

How `deriveState` reads the event list (the lesson rules, D-numbers in SPEC B3-B10):
- No events: phase `probe`, awaiting model.
- `probe` action -> awaiting learner (purpose `probe`). Its answer -> `probeAnswered + 1`, awaiting model.
- `probe_done` -> `known`, `sharpGoal` set; phase `plan`; awaiting model.
- `plan` -> `plan` set, every node `{status:"todo", fails:0}`; phase `teach`; `teachStep = "need_predict"`; awaiting model.
- Before applying any action while `teachStep` is `need_verdict`: apply its `verdict` to `currentNodeId` (`pass` -> status `passed`; `fail` -> `fails + 1`, and status `shaky` if `fails` reaches 3).
- `predict` -> `currentNodeId = nodeId`; awaiting learner (purpose `predict`). Its answer -> `teachStep = "need_teach"`, awaiting model.
- `teach` (CR-3) -> awaiting learner (purpose `read`). Its answer (Continue) -> `teachStep = "need_explain"`, awaiting model.
- `explain` -> awaiting learner (purpose `check`). Its answer:
  - `choice` check: correct -> node `passed`, `teachStep = "need_predict"`; wrong -> `fails + 1`; if `fails` is 3 -> node `shaky`, `teachStep = "need_predict"`; else `teachStep = "need_repair"`.
  - `text` check: `teachStep = "need_verdict"`.
  - awaiting model.
- `lesson_done` -> phase `done`, `summary` set, awaiting nobody.

## Function inventory

### src/shared/limits.ts
Constants only: `MAX_PROBE = 8`, `PLAN_MIN = 2`, `PLAN_MAX = 12`, `MAX_FAILS = 3`, `CALL_TIMEOUT_MS = 180_000`, `DETECT_TIMEOUT_MS = 5_000`, `KNOWLEDGE_PROMPT_MAX = 200`, `FIELD_MAX = 500`, `ANSWER_TEXT_MAX = 4000`, `PROFILE_MAX = 2000` (CR-4), `OPTIONS_MIN = 2`, `OPTIONS_MAX = 6`, `STDERR_MAX = 200`.

### src/shared/schema.ts
| Signature | Purpose | On failure | Called by | Task |
|-----------|---------|------------|-----------|------|
| `export const ReplySchema: z.ZodType<{ action: Action }>` | zod schema for a reply, including the Question rules (choice: 2-6 options, `correctIndex` null or inside options; text: `options` empty and `correctIndex` null) | - | parseReply | |
| `export const REPLY_JSON_SCHEMA: object` | hand-written JSON Schema sent to Codex: root object with one property `action` = `anyOf` of the seven variants; every object has `additionalProperties:false` and lists every property in `required`; nullable fields use `["string","null"]` / `["integer","null"]` | - | turn.ts | |
| `parseReply(text: string): { ok: true; action: Action } \| { ok: false; reason: string }` | `JSON.parse` then `ReplySchema.safeParse` | `reason` is `"not valid JSON"` or `"does not match the schema: <first zod issue path and message>"` | turn.ts | |

### src/core/plan.ts
| Signature | Purpose | On failure | Called by | Task |
|-----------|---------|------------|-----------|------|
| `validatePlan(nodes: PlanNode[]): string \| null` | checks B5: size 2-12, ids unique and non-empty, titles non-empty, deps exist, no self-dep, no cycle | returns the reason: `"plan must have 2 to 12 nodes"`, `"duplicate node id: <id>"`, `"empty id or title"`, `"unknown dep: <dep>"`, `"node depends on itself: <id>"`, `"plan has a cycle"`; `null` when valid | checkAction | |
| `eligibleNodes(plan: PlanNode[], nodes: Record<string, NodeState>): string[]` | ids with status `todo` whose deps are all `passed` or `shaky`, in plan order | returns `[]` | checkAction, moveNotes | |
| `allNodesSettled(nodes: Record<string, NodeState>): boolean` | true when no node is `todo` | - | allowedActions | |

### src/core/engine.ts
| Signature | Purpose | On failure | Called by | Task |
|-----------|---------|------------|-----------|------|
| `validateProfile(text: string): string \| null` | (CR-4) length of `text` at most 2000 | returns `"Keep it under 2000 characters."` | ipc.ts | |
| `validateNewLesson(topic: string, goal: string): string \| null` | B2: both trimmed lengths 1-500 | returns `"Enter a topic and a goal."` | ipc.ts, NewLessonForm | |
| `deriveState(events: SessionEvent[]): LessonState` | folds the event list into the current state, by the rules under Data model | never throws for event lists the app wrote; throws `Error("corrupt session at event <i>")` for an answer event when not awaiting the learner, an action event when not awaiting the model, or a null verdict while `need_verdict` | turn.ts, ipc.ts, view.ts, prompt.ts | |
| `allowedActions(state: LessonState): ActionType[]` | which action types may come next (table below) | returns `[]` when not awaiting model | checkAction, prompt.ts | |
| `checkAction(state: LessonState, action: Action): string \| null` | full legality check (table below) | returns the reason string; `null` when allowed | turn.ts | |
| `checkAnswer(state: LessonState, answer: Answer): string \| null` | awaiting learner; choice: `choiceIndex` inside options and `text` null; text: trimmed `text` 1-4000 chars and `choiceIndex` null; read (CR-3): `choiceIndex` and `text` both null | returns `"No question is waiting for an answer."` or `"Pick an option."` or `"Write an answer."` or `"Press Continue."` (read with a choice or text) | ipc.ts | |
| `learnedToSave(state: LessonState, action: Extract<Action, {type:"lesson_done"}>): { nodeId: string; text: string }[]` | keeps learned items whose node is `passed` in `state` (state computed after the action) and whose text is non-empty | returns `[]` | turn.ts | |
| `moveNotes(state: LessonState): string[]` | the exact instruction lines for the prompt's "Your move" section (table below) | returns `[]` | prompt.ts | |

`allowedActions` and `checkAction` rules (state is awaiting model):

| State | Allowed types | Extra checks in `checkAction` (reason on failure) |
|-------|---------------|----------------------------------------------------|
| phase `probe`, `probeAnswered < 8` | `probe`, `probe_done` | `probe_done`: `goal` non-empty (`"goal is empty"`) |
| phase `probe`, `probeAnswered >= 8` | `probe_done` | same |
| phase `plan` | `plan` | `validatePlan` reason |
| teach, `need_predict`, nodes remain | `predict` | `nodeId` in `eligibleNodes` (`"node <id> cannot start now"`) |
| teach, `need_predict`, all settled | `lesson_done` | - |
| teach, `need_teach` | `teach` | `nodeId === currentNodeId` (`"teach must be for node <id>"`); `markdown` non-empty after trimming (`"reading is empty"`) |
| teach, `need_explain` | `explain` | `nodeId === currentNodeId` (`"explain must be for node <id>"`); `check.kind` any; a choice check needs non-null `correctIndex` (`"check needs a correctIndex"`) |
| teach, `need_repair` | `explain` | same as above |
| teach, `need_verdict` | `explain`, `predict`, `lesson_done` | `verdict` non-null (`"verdict is required"`); then apply the verdict to a copy of the state and re-check the action against the resulting state (`need_repair` if failed with fails < 3, else `need_predict`) |
| any other | none | `"<type> is not allowed now"` |

A type not in the allowed list always fails with `"<type> is not allowed now"`. A choice `predict` or `probe` question may have `correctIndex` null.

`moveNotes` lines (exact strings; `<...>` filled in):

| State | Lines |
|-------|-------|
| probe, `probeAnswered >= 8` | `You have asked 8 questions. You must return probe_done now.` |
| plan | `Return the plan: 2 to 12 nodes, each one idea, deps listing the nodes it builds on.` |
| `need_predict`, nodes remain | `Start the next node with a predict question. Nodes that can start now: <ids joined by ", ">.` |
| `need_predict`, all settled | `Every node is passed or shaky. Return lesson_done.` |
| `need_teach` | `Write the reading for node <id>: the whole idea derived step by step from what the learner holds, with at least one worked example, 500 to 1000 words. Do not ask a question yet.` |
| `need_explain` | `Add a short bridge (under 150 words) for node <id> that fills what the reading left open, and include a check question.` |
| `need_repair` | `The learner failed the check on node <id> (failure <fails> of 3). Explain node <id> again from a different angle that targets their mistake, with a new check question.` |
| `need_verdict`, `fails < 2` | `The learner's last answer is a free-text check on node <id>. Set verdict. If pass, continue with the next step. If fail, explain node <id> again from a different angle with a new check question.` |
| `need_verdict`, `fails === 2` | `The learner's last answer is a free-text check on node <id>, and it was their last attempt. Set verdict, then move on: predict for another node, or lesson_done if none remain.` |
| otherwise | (none) |

### src/core/prompt.ts
| Signature | Purpose | On failure | Called by | Task |
|-----------|---------|------------|-----------|------|
| `buildPrompt(input: { session: Session; state: LessonState; knowledge: KnowledgeItem[]; retryNote: string \| null; profile?: string }): string` | assembles the full prompt (text under "LLM calls") | - | turn.ts | |
| `renderTranscript(events: SessionEvent[]): string` | one line per event: `MODEL: <JSON of action>` or `LEARNER: <JSON>`; `(empty)` when there are none | - | buildPrompt | |
| `renderAnswer(answer: Answer, question: Question, grade: Verdict \| null): string` | JSON with keys `answer` (the chosen option's text, or the typed text), `reasoning`, `confidence`, `graded` (`"pass"`, `"fail"` or `null`) | - | renderTranscript | |

### src/main/cli/adapter.ts
| Signature | Purpose | On failure | Called by | Task |
|-----------|---------|------------|-----------|------|
| `export interface CliAdapter { id: "codex"; detect(): Promise<DetectResult>; run(req: RunRequest): Promise<RunResult> }` | what every CLI backend implements | - | turn.ts, ipc.ts | |
| `extraPathDirs(home: string): string[]` | `["/opt/homebrew/bin", "/usr/local/bin", "<home>/.local/bin", "<home>/.npm-global/bin"]` | - | resolveCommand, codex.ts | |
| `resolveCommand(name: string, pathEnv: string, extraDirs: string[], exists: (p: string) => boolean): string \| null` | first existing `<dir>/<name>` over `pathEnv` dirs then `extraDirs` (needed because a Mac app opened from Finder does not get the terminal's PATH) | returns `null` | codex.ts | |

### src/main/cli/codex.ts
| Signature | Purpose | On failure | Called by | Task |
|-----------|---------|------------|-----------|------|
| `createCodexAdapter(deps: { spawn: typeof import("node:child_process").spawn; env: NodeJS.ProcessEnv; home: string; tmpRoot: string; fs: typeof import("node:fs"); detectTimeoutMs?: number }): CliAdapter` (`detectTimeoutMs` defaults to `DETECT_TIMEOUT_MS`; tests pass a small value) | builds the adapter; command path is `env.LEARN_CODEX_PATH` if set, else `resolveCommand("codex", ...)` | `detect()` gives `{ok:false}` and `run()` gives `{ok:false, kind:"failed", message:"Codex CLI not found"}` when no command resolves | index.ts | |
| `detect()` (adapter method) | spawn `<codex> --version`, no shell, 5 s limit; version = first match of `/\d+\.\d+\.\d+/` in stdout | `{ok:false}` on missing command, non-zero exit, timeout, or no version match | ipc.ts | |
| `run(req)` (adapter method) | make `<tmpRoot>/lh-XXXXXX/` containing `schema.json` and empty `work/`; spawn `<codex> exec --json --output-schema <schema.json> --ephemeral --sandbox read-only --skip-git-repo-check -` with `cwd = work/`, `shell: false`, `stdio` pipes, env = `deps.env` with `extraPathDirs` appended to `PATH`; write prompt to stdin and end it; collect stdout and stderr; always remove the temp directory; an `error` on `child.stdin` (for example `EPIPE` when Codex exits early) is ignored, because `close` reports the failure; stdout and stderr are decoded as UTF-8 with `setEncoding` so split characters stay whole | non-zero exit -> `{ok:false, kind:"failed", message:lastStderrLine(stderr)}`; `timeoutMs` passed -> SIGKILL, `{kind:"timeout", message:"no reply after <timeoutMs / 1000> seconds"}`; `signal` aborted -> SIGKILL, `{kind:"aborted", message:"stopped"}`; exit 0 but no agent message -> `{kind:"failed", message:"Codex returned no message"}` | turn.ts | |
| `parseCodexEvents(stdout: string): { text: string \| null; usage: Usage \| null }` | per line `JSON.parse` (skip lines that fail); `text` = `item.text` of the last `item.completed` whose `item.type` is `"agent_message"`; `usage` from `turn.completed.usage.input_tokens` / `output_tokens` | `text: null`, `usage: null` | run | |
| `lastStderrLine(stderr: string): string` | last non-empty line, trimmed, cut to 200 chars | returns `"exited with an error"` when stderr is empty | run | |

### src/main/store.ts
| Signature | Purpose | On failure | Called by | Task |
|-----------|---------|------------|-----------|------|
| `createStore(dir: string, fs: typeof import("node:fs/promises")): Store` | creates `dir/sessions/` if missing | rejects with the fs error | index.ts | |
| `Store.writeJsonAtomic(path: string, data: unknown): Promise<void>` | write a uniquely named temp file next to `path` then `rename` over `path` (2-space JSON); the temp file is removed if the rename fails | rejects; old file untouched | other Store methods | |
| `Store.listSessions(): Promise<Session[]>` | all `sessions/*.json`, sorted by `updatedAt` descending; files that fail to parse are skipped | `[]` | ipc.ts | |
| `Store.readSession(id: string): Promise<Session \| null>` | - | `null` when missing or unparsable | turn.ts, ipc.ts | |
| `Store.writeSession(session: Session): Promise<void>` | atomic write to `sessions/<id>.json` | rejects | turn.ts, ipc.ts | |
| `Store.deleteSession(id: string): Promise<void>` | remove the file | resolves when already missing | ipc.ts | |
| `Store.readKnowledge(): Promise<KnowledgeItem[]>` | `knowledge.json`, sorted by `createdAt` descending | `[]` when missing or unparsable | turn.ts, ipc.ts | |
| `Store.addKnowledge(items: KnowledgeItem[]): Promise<void>` | append and write atomically; calls on the same file run one at a time; an item with the same `sessionId`, `nodeId` and `text` as an existing one is skipped | rejects | turn.ts | |
| `Store.readProfile(): Promise<string>` | (CR-4) `profile.json` field `instructions` | `""` when missing, unparsable or not a string | turn.ts, ipc.ts | |
| `Store.writeProfile(text: string): Promise<void>` | (CR-4) write `{ instructions: text }` atomically | rejects on disk error | ipc.ts | |
| `Store.deleteKnowledge(id: string): Promise<void>` | remove by id and write atomically | resolves when the id is absent | ipc.ts | |

Ids must match `/^[sk]_[0-9a-f-]{36}$/` before being used in a path; otherwise `readSession` returns `null` and `deleteSession` resolves without touching disk.

### src/main/turn.ts
| Signature | Purpose | On failure | Called by | Task |
|-----------|---------|------------|-----------|------|
| `createTurnRunner(deps: { adapter: CliAdapter; store: Store; now: () => string; newId: (prefix: "s" \| "k") => string; notify: (session: Session) => void }): TurnRunner` | - | - | index.ts | |
| `TurnRunner.advance(id: string): Promise<TurnResult>` | if a turn is running for `id` -> `busy`. Load session. Loop while `deriveState(events).awaiting.who === "model"`: `modelStep`; on success append `{kind:"action"}`, set `updatedAt`, `writeSession`, `notify`; on `lesson_done`, `addKnowledge(learnedToSave(...))` runs BEFORE the session is written, so a failed save leaves the lesson unfinished and Retry repeats it | `{ok:false, error}` with the session as last saved. Messages: `busy` -> `"A reply is already on the way."`; `not_found` -> `"This lesson no longer exists."`; `cli` -> `"Codex failed: " + message`; `stopped` -> `"Stopped."`; `bad_reply` -> `"The model gave an unusable reply. Press Retry."` | ipc.ts | |
| `modelStep(deps: { adapter: CliAdapter; knowledge: KnowledgeItem[] }, session: Session, state: LessonState, signal: AbortSignal): Promise<{ ok: true; action: Action; usage: Usage \| null; calls: number } \| { ok: false; error: TurnError }>` (exported; used by advance, tests and evals; `calls` is 1 or 2) | `buildPrompt` (which itself includes the newest 200 knowledge items only when phase is `probe`) -> `adapter.run` with `timeoutMs = CALL_TIMEOUT_MS` -> `parseReply` -> `checkAction`. On a bad reply, repeat once with `retryNote = "Your last reply was not usable: <reason>. Allowed now: <allowed types joined by ", ">."` | adapter failure is returned at once, with no retry; second bad reply -> `bad_reply` | advance | |
| `TurnRunner.stop(id: string): void` | aborts the running turn's `AbortController` | no-op when none | ipc.ts | |
| `TurnRunner.isRunning(id: string): boolean` | - | - | ipc.ts | |

### src/main/ipc.ts
| Signature | Purpose | On failure | Called by | Task |
|-----------|---------|------------|-----------|------|
| `registerIpc(deps: { ipcMain: Electron.IpcMain; adapter: CliAdapter; store: Store; turns: TurnRunner; now: () => string; newId: (prefix: "s" \| "k") => string; send: (channel: string, ...args: unknown[]) => void }): void` | registers one `ipcMain.handle` per channel below | - | index.ts | |

| Channel | Handler behavior |
|---------|------------------|
| `cli:detect` | `adapter.detect()` |
| `sessions:list` | `store.listSessions()` mapped to `SessionSummary` (`phase` from `deriveState`) |
| `sessions:create` | `validateNewLesson`; on error `{ok:false, message}`; else write a new Session (trimmed fields, no events) and return it |
| `sessions:get` | `store.readSession(id)` |
| `sessions:delete` | `turns.stop(id)` then `store.deleteSession(id)` |
| `lesson:advance` | `turns.advance(id)`, then `send("turn:ended", id, result)` |
| `lesson:answer` | if `turns.isRunning(id)` -> `busy`; read session (`not_found`); `checkAnswer` (-> `invalid_answer` with that message); append `{kind:"answer"}`, write, `send("session:updated")`, then as `lesson:advance` |
| `lesson:stop` | `turns.stop(id)` |
| `lesson:running` | `turns.isRunning(id)` |
| `knowledge:list` | `store.readKnowledge()` joined with session topics -> `KnowledgeView[]` |
| `knowledge:delete` | `store.deleteKnowledge(id)` |
| `profile:get` | (CR-4) `store.readProfile()` |
| `profile:save` | (CR-4) `validateProfile(text)`; a reason -> `{ ok: false, message: reason }`; else `store.writeProfile(text)` -> `{ ok: true }`; a thrown disk error -> `{ ok: false, message: "Could not save. Check free disk space." }` |

Events sent to the window: `session:updated` (session), `turn:ended` (id, TurnResult).

### src/main/index.ts
| Signature | Purpose | On failure | Called by | Task |
|-----------|---------|------------|-----------|------|
| `createWindow(): BrowserWindow` | 1200x800, `minWidth 960`, `minHeight 600`, background `#0e0e0f`; `webPreferences: { preload, contextIsolation: true, sandbox: true, nodeIntegration: false }`; `setWindowOpenHandler` returns `{action:"deny"}`; `will-navigate` is prevented (except reloads of the dev-server URL in dev); loads `process.env.ELECTRON_RENDERER_URL` in dev, else the built `index.html` | - | app `ready` | |
| `main(): Promise<void>` | on `app.whenReady`: data dir = `process.env.LEARN_DATA_DIR ?? app.getPath("userData")`; build store, adapter, turn runner, `registerIpc`, `createWindow`; when not in dev, set the CSP header `default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:` via `session.defaultSession.webRequest.onHeadersReceived`; quit on `window-all-closed` | - | module load | |

### src/preload/index.ts
`contextBridge.exposeInMainWorld("api", api)` where `api: Api` maps each method to `ipcRenderer.invoke(<channel>, ...args)` and each `on*` to `ipcRenderer.on` returning an unsubscribe function. Channel names as in the table above.

### src/renderer/src/lib
| File | Signature | Purpose | On failure | Called by | Task |
|------|-----------|---------|------------|-----------|------|
| view.ts | `buildItems(session: Session): ChatItem[]` | the ordered list to draw (types below) | - | LessonScreen | |
| shuffle.ts | `shuffledOrder(seed: string, n: number): number[]` | a permutation of `0..n-1` that is always the same for the same seed (seed = `<sessionId>:<eventIndex>`) | - | QuestionCard | |
| planGraph.ts | `planToMermaid(plan: PlanNode[], nodes: Record<string, NodeState>, currentNodeId: string \| null): string` | Mermaid `graph TD` text; node labels are titles with `"` replaced by `#quot;`; classes `passed`, `shaky`, `current`, `todo` | - | PlanPanel | |
| useLesson.ts | `useLesson(id: string, start: boolean): { session: Session \| null; state: LessonState \| null; busy: boolean; error: TurnError \| null; submit(a: Answer): void; retry(): void; stop(): void }` | loads the session; subscribes to `onSessionUpdated` and `onTurnEnded`; on mount sets `busy` from `api.isRunning`; if `start` and no events, calls `api.advance` once | `error` set from a failed `TurnResult` (`busy` errors are ignored) | LessonScreen | |

```ts
export type ChatItem =
  | { kind: "text"; key: string; markdown: string }                                  // feedback, explanation, summary
  | { kind: "probe_summary"; key: string; known: string[]; goal: string }
  | { kind: "plan_notice"; key: string; count: number }                               // "Your path: N steps"
  | { kind: "question"; key: string; eventIndex: number; purpose: "probe" | "predict" | "check";
      question: Question; answer: Answer | null; grade: Verdict | null };             // answer null = pending
```
Order per action event: `feedback` (if non-null) as `text`, then the action's own item(s): `probe` -> question; `probe_done` -> probe_summary; `plan` -> plan_notice; `predict` -> question; `explain` -> text (markdown) then question (check); `lesson_done` -> text (summary). `grade` is set for answered choice checks (by `correctIndex`) and for text checks once the next action carries a verdict.

### src/renderer/src components
| Component | Props | Purpose | Task |
|-----------|-------|---------|------|
| `App` | none | holds `screen: {name:"new"} \| {name:"lesson"; id: string; start: boolean} \| {name:"knowledge"}`, the session list and `DetectResult`; renders `Sidebar` + the screen; refreshes the list on `onSessionUpdated` | |
| `Sidebar` | `{ sessions: SessionSummary[]; activeId: string \| null; onNew(): void; onOpen(id: string): void; onDelete(id: string): void; onKnowledge(): void; newDisabled: boolean }` | lesson list, New lesson, Knowledge link; delete opens `ConfirmDialog` | |
| `CliGate` | `{ cli: DetectResult \| null; onRetry(): void }` | B1 banner when `cli.ok` is false; renders nothing otherwise | |
| `NewLessonForm` | `{ disabled: boolean; onCreated(session: Session): void }` | topic + goal form; shows the B2 message | |
| `LessonScreen` | `{ id: string; start: boolean }` | header, chat column (`ChatItemView` list, `ThinkingBar`, `Banner`), `PlanPanel` once a plan exists; scrolls to the newest item | |
| `ChatItemView` | `{ item: ChatItem; sessionId: string; disabled: boolean; onSubmit(a: Answer): void }` | draws one `ChatItem` | |
| `QuestionCard` | `{ seed: string; purpose: "probe" \| "predict" \| "check"; question: Question; answer: Answer \| null; grade: Verdict \| null; disabled: boolean; onSubmit(a: Answer): void }` | options (shuffled) or a text box, reasoning box, confidence buttons (probe only), Submit; read-only once answered, showing the grade | |
| `MarkdownView` | `{ markdown: string }` | `react-markdown` + `remark-math` + `rehype-katex`; no raw HTML | |
| `PlanPanel` | `{ plan: PlanNode[]; nodes: Record<string, NodeState>; currentNodeId: string \| null }` | renders `planToMermaid` output with `mermaid.render` (`securityLevel: "strict"`, theme `base` with token colors); on a Mermaid error shows the plan as a plain list | |
| `Banner` | `{ kind: "error" \| "info"; message: string; actionLabel?: string; onAction?(): void }` | message with an optional button | |
| `ThinkingBar` | `{ onStop(): void }` | "Thinking…" with a Stop button | |
| `ConfirmDialog` | `{ message: string; confirmLabel: string; onConfirm(): void; onCancel(): void }` | modal; Escape cancels | |
| `KnowledgeScreen` | none | B18 list with delete buttons | |
| `ProfileScreen` | none | (CR-4, B22) loads `getProfile`, textarea `maxLength` 2000, Save enabled only after an edit, "Saved." after success | |

Private helpers of a few lines may be added inside a file. No new exported function, file, component, IPC channel or dependency may be added without a change request.

## Task map (fills the Task columns above)
| File | Functions / contents | Task |
|------|----------------------|------|
| config files, `LICENSE`, `tests/smoke.test.ts` | - | T1 |
| `electron.vite.config.ts`, `src/renderer/index.html`, `main.tsx`, `vite-env.d.ts`, `styles/tokens.css` | - | T2 |
| `src/main/index.ts` | `createWindow` (T2); `main` wiring, CSP, `LEARN_DATA_DIR` (T21) | T2, T21 |
| `src/shared/limits.ts`, `src/shared/types.ts` | constants, types | T3 |
| `src/shared/schema.ts` | `ReplySchema`, `REPLY_JSON_SCHEMA`, `parseReply` | T4 |
| `tests/helpers/fixtures.ts` | fixtures | T4 |
| `src/core/plan.ts` | `validatePlan`, `eligibleNodes`, `allNodesSettled` | T5 |
| `src/core/engine.ts` | `validateNewLesson`, `deriveState` (T6, T7); `allowedActions`, `checkAction` (T8); `checkAnswer`, `learnedToSave`, `moveNotes` (T9) | T6-T9 |
| `src/core/prompt.ts` | `buildPrompt`, `renderTranscript`, `renderAnswer` | T10 |
| `src/main/cli/adapter.ts` | `CliAdapter`, `extraPathDirs`, `resolveCommand` | T11 |
| `src/main/cli/codex.ts` | `parseCodexEvents`, `lastStderrLine` (T12); `createCodexAdapter`, `detect` (T13); `run` (T14) | T12-T14 |
| `tests/helpers/fakes.ts` | `fakeSpawn` (T13), `fakeAdapter` (T17) | T13, T17 |
| `src/main/store.ts` | sessions (T15); knowledge (T16) | T15, T16 |
| `src/main/turn.ts` | `modelStep` (T17); `createTurnRunner`, `advance`, `stop`, `isRunning` (T18) | T17, T18 |
| `evals/loop.eval.ts`, `vitest.eval.config.mts` | E1-E7 | T19 (config in T1) |
| `src/main/ipc.ts` | `registerIpc`, all channels | T20 |
| `src/preload/index.ts` | `window.api` | T21 (stub in T2) |
| `src/renderer/src/styles/app.css` | component styles | T22 (base in T2) |
| `src/renderer/src/lib/view.ts` | `buildItems`, `ChatItem` | T23 |
| `src/renderer/src/lib/shuffle.ts` | `shuffledOrder` | T24 |
| `src/renderer/src/lib/planGraph.ts` | `planToMermaid` | T25 |
| `Banner`, `ThinkingBar`, `ConfirmDialog` | components | T26 |
| `MarkdownView` | component | T27 |
| `QuestionCard` | component | T28 |
| `ChatItemView` | component | T29 |
| `PlanPanel` | component | T30 |
| `src/renderer/src/lib/useLesson.ts` | `useLesson` | T31 |
| `Sidebar`, `CliGate` | components | T32 |
| `NewLessonForm` | component | T33 |
| `LessonScreen` | component | T34 |
| `KnowledgeScreen` | component | T35 |
| `src/renderer/src/App.tsx` | `App` | T36 (placeholder in T2) |
| `README.md` | - | T37 |

## Config
| Name | Default | Meaning |
|------|---------|---------|
| `LEARN_CODEX_PATH` | unset (resolve `codex` on PATH + common dirs) | absolute path to the Codex binary |
| `LEARN_DATA_DIR` | Electron `userData` | where `sessions/` and `knowledge.json` live |
| limits in `src/shared/limits.ts` | see that file | not user-configurable in milestone 1 |

## Errors
| Condition | Behavior |
|-----------|----------|
| Codex not found / version check fails / 5 s timeout | `CliGate` banner: "Codex CLI not found. Install it and sign in, then press Retry."; New lesson disabled |
| Empty or over-long topic or goal | form message "Enter a topic and a goal."; nothing created |
| Reply not JSON / not schema-valid / not allowed | one retry with the correction note; then banner "The model gave an unusable reply. Press Retry." |
| Codex exits non-zero | banner "Codex failed: <last stderr line, max 200 chars>" + Retry |
| Codex exits 0 with no agent message | banner "Codex failed: Codex returned no message" + Retry |
| Codex runs over 180 s | process killed; banner "Codex failed: no reply after 180 seconds" + Retry |
| Stop pressed | process killed; info banner "Stopped." + Retry |
| Second request while a turn runs | refused with `busy`; the window ignores it |
| Lesson file missing when opened | error banner "This lesson no longer exists."; no Retry |
| Session or knowledge file unparsable | skipped in lists; treated as missing |
| Mermaid fails to render | plan shown as a plain list in the panel |
| Disk write fails | the IPC call rejects; banner "Could not save. Check free disk space." + Retry |

## LLM calls
One call shape for the whole app. Model: whatever the user's Codex is configured to use (no `-m` flag). Parameters: none beyond the flags in `run`. Output: one JSON object matching `REPLY_JSON_SCHEMA`. Empty, malformed or disallowed reply: B11 (retry once, then error).

Full prompt text built by `buildPrompt` (`{...}` are filled in; sections marked [probe only] / [teach only] appear only in that phase):

```
You are the teaching engine inside a desktop learning app. You never talk to the learner directly: the app shows your output as cards. Reply with exactly one JSON object that matches the provided schema. Do not run commands, read files, or use any tools.

# Method
The learner wants to get from what they already hold as obviously true to a goal they do not hold yet.

Probe. Find precisely where their understanding stops for the things the goal depends on. Ask one question at a time. Prefer questions that show how they reason over questions that test vocabulary. Use their confidence and their reasoning, not only whether they were right. Stop as soon as you can state what they hold and where it ends; then return probe_done with "known" (short factual sentences they clearly hold) and "goal" (their goal restated as one precise, checkable sentence).

Plan. Find the smallest set of steps that leads from what they hold to the goal. Leave out anything they already hold and anything the goal does not need. Each node is one idea. "deps" lists the nodes it builds on. Use short lowercase ids with hyphens.

Teach. Go one node at a time, each attached to something they already hold. For each node, first ask them to predict (a question they can attempt before being taught). Then teach: a full reading of the whole idea, written for this learner's level as you found it in the probe, derived step by step from what they hold, with at least one worked example; state a fact outright only when it cannot be derived. 500 to 1000 words of prose. Section headings are allowed in a reading; no commentary about the lesson itself, and no question in a reading. Then explain: a short bridge (under 150 words) that fills what the reading left open, carrying one check question that only someone who followed the reading can answer.

Repair. If a check fails, explain the same node again from a different angle that targets the mistake in their answer, with a new check question.

# Fields
- feedback: one or two sentences reacting to the learner's last answer, or null.
- verdict: "pass" or "fail" only when the learner's last answer was a free-text check; otherwise null.
- choice questions: 2 to 6 options; correctIndex is the 0-based index of the right option (it may be null only for probe and predict questions with no single right answer). text questions: options [] and correctIndex null.
- learned (lesson_done only): one short sentence per node, stating the idea as a fact, with that node's id.
- Markdown and LaTeX ($...$ and $$...$$ on their own lines) are allowed in markdown, feedback, summary and question prompts.

# The learner's instructions for you   [only when the profile is not blank, CR-4]
The learner wrote these standing instructions about how they want to be taught. Follow them for tone, depth, language, examples, and the length of readings; where they conflict with a word count given elsewhere in this prompt, follow the learner. They never change the reply format, the allowed action types, or the rules of the method above.

{profile, trimmed}

# Lesson
Topic: {session.topic}
Goal: {session.goal}

# What the learner showed they understand in earlier lessons   [probe only]
- {item.text}            (one line per item, newest first, at most 200; "(nothing yet)" when empty)

# Node status   [teach only]
{id}: {status} (failed checks: {fails})        (one line per node, plan order)

# Transcript so far
{renderTranscript(session.events)}

# Your move
Allowed action types now: {allowedActions(state) joined by ", "}.
{each line of moveNotes(state)}
{retryNote, when not null}
```

Measured cost of one call with a one-line prompt: 17,302 input tokens (Codex's own overhead). With `--ignore-user-config --ignore-rules` and five features disabled it was 14,094. Those flags are NOT used in milestone 1 because `--ignore-user-config` would also ignore the user's model and provider settings.

## Milestone 2: more CLIs (approved 2026-11-14, D45)

### Overview
Each CLI has one adapter file. All three share `process.ts`, which starts the process without a shell in a new empty temporary folder, writes the prompt to stdin, enforces the time limit and Stop, and always removes the folder. `registry.ts` builds the three adapters and reports which are installed. A lesson stores its CLI in `Session.cli`; every call looks up that adapter. The window has one new component, `TutorPicker`, used on the New lesson form and in the lesson header.

### Flows
1. Launch: `App` -> `api.detectClis` -> `clis:detect` -> `detectAll(adapters)` (three `--version` checks in parallel) -> `CliStatus[]`. None installed: `CliGate` shows the B24 banner, New lesson disabled.
2. New lesson: `NewLessonForm` shows `TutorPicker` (start value `defaultCli(statuses, lastUsed)`) -> `api.createSession({ topic, goal, cli })` -> `sessions:create` (`validateNewLesson`, `isCliId`) -> session saved with `cli` -> `turn.advance` -> `adapters[session.cli].run`.
3. A call: `turn.advance` -> `modelStep` with `adapters[session.cli]` -> `buildPrompt` -> `adapter.run` -> `parseReply` -> `checkAction`; on a bad reply up to `adapter.retries` more attempts; CLI failure -> `"<adapter.label> failed: <message>"`.
4. Switch: `LessonScreen` "Change tutor" -> `TutorPicker` -> `ConfirmDialog` -> `api.setSessionCli(id, cli)` -> `sessions:setCli` -> session written with the new `cli` -> `session:updated`. No call starts.

### Files
```
src/shared/clis.ts                          - CLI ids, labels, order, defaultCli         (new)
src/main/cli/process.ts                     - findCommand, detectVersion, runProcess     (new)
src/main/cli/claude.ts                      - Claude Code adapter                        (new)
src/main/cli/gemini.ts                      - Gemini adapter (experimental)              (new)
src/main/cli/registry.ts                    - createAdapters, detectAll                  (new)
src/renderer/src/components/TutorPicker.tsx - radio rows for the three CLIs              (new)
tests/shared/clis.test.ts, tests/main/process.test.ts, claude.test.ts, gemini.test.ts, registry.test.ts, tests/renderer/TutorPicker.test.tsx (new)
```
Edited: `src/shared/types.ts`, `src/main/cli/adapter.ts`, `src/main/cli/codex.ts`, `src/main/turn.ts`, `src/main/ipc.ts`, `src/main/index.ts`, `src/preload/index.ts`, `CliGate.tsx`, `NewLessonForm.tsx`, `LessonScreen.tsx`, `App.tsx`, `app.css`, `evals/loop.eval.ts`, `README.md`, `tests/helpers/fakes.ts`, `tests/helpers/dom.ts`.

### Data model changes (`src/shared/types.ts`)
```ts
export type CliId = "codex" | "claude" | "gemini";
export type CliStatus = { id: CliId; installed: boolean; version: string | null };
// Session.cli: CliId                      (was "codex"; version stays 1)
// SessionSummary gains cli: CliId
// Api: detectClis(): Promise<CliStatus[]>              (replaces detectCli)
//      createSession(input: { topic: string; goal: string; cli: CliId }): ...
//      setSessionCli(id: string, cli: CliId): Promise<{ ok: true; session: Session } | { ok: false; message: string }>
```

### Function inventory
| File | Signature | Purpose | On failure | Task |
|------|-----------|---------|------------|------|
| `clis.ts` | `export const CLI_ORDER: CliId[]` | `["codex", "claude", "gemini"]` | - | T45 |
| `clis.ts` | `export const CLI_INFO: Record<CliId, { label: string; experimental: boolean }>` | `Codex`/false, `Claude Code`/false, `Gemini`/true | - | T45 |
| `clis.ts` | `isCliId(x: unknown): x is CliId` | guard | false | T45 |
| `clis.ts` | `cliName(id: CliId): string` | label, plus ` (experimental)` when experimental | - | T45 |
| `clis.ts` | `defaultCli(statuses: CliStatus[], lastUsed: CliId \| null): CliId \| null` | B26 | `null` when none installed | T45 |
| `process.ts` | `type ProcessDeps = { spawn; env: NodeJS.ProcessEnv; home: string; tmpRoot: string; fs: typeof import("node:fs"); detectTimeoutMs?: number }` | what every adapter is built from | - | T46 |
| `process.ts` | `type ProcessResult = { kind: "exit"; code: number \| null; stdout: string; stderr: string } \| { kind: "missing" } \| { kind: "aborted" } \| { kind: "timeout" }` | - | - | T46 |
| `process.ts` | `findCommand(deps: ProcessDeps, name: string, envVar: string): string \| null` | the env override, else `resolveCommand` | `null` | T46 |
| `process.ts` | `detectVersion(deps: ProcessDeps, command: string \| null): Promise<DetectResult>` | `<command> --version`, first `\d+\.\d+\.\d+` | `{ ok: false }` on null command, spawn error, non-zero exit, no version, timeout | T46 |
| `process.ts` | `runProcess(deps: ProcessDeps, spec: { command: string \| null; args(dirs: { root: string; work: string }): string[]; stdin: string; signal: AbortSignal; timeoutMs: number; prepare?(dirs: { root: string; work: string }): void; dropEnv?: string[] }): Promise<ProcessResult>` | temp folder `root` with empty `root/work` as cwd; no shell; ignores stdin write errors; UTF-8; kills on abort and timeout; removes `root` in every case | `missing` for a null command or spawn error; `aborted` when the signal is already aborted (no folder created) | T46 |
| `process.ts` | `failureResult(r: Exclude<ProcessResult, { kind: "exit" }>, label: string, timeoutMs: number): RunResult` | `missing` -> failed `"<label> CLI not found"`; `aborted` -> aborted `"stopped"`; `timeout` -> timeout `"no reply after <n> seconds"` | - | T46 |
| `process.ts` | `lastStderrLine(stderr: string): string` | moved from `codex.ts` (still re-exported there) | `"exited with an error"` | T46 |
| `adapter.ts` | `interface CliAdapter { id: CliId; label: string; retries: number; detect(): Promise<DetectResult>; run(req: RunRequest): Promise<RunResult> }` | `retries`: Codex 1, Claude Code 1, Gemini 2 | - | T47 |
| `codex.ts` | `createCodexAdapter(deps: ProcessDeps): CliAdapter` | same behavior as before, built on `process.ts` | as before | T47 |
| `claude.ts` | `parseClaudeResult(stdout: string): { text: string \| null; usage: Usage \| null; error: string \| null }` | B29 | `error` `"unreadable output"` when stdout is not a JSON object; the `result` string (cut to 200) when `is_error` | T48 |
| `claude.ts` | `createClaudeAdapter(deps: ProcessDeps): CliAdapter` | B29; env override `LEARN_CLAUDE_PATH`; drops `CLAUDECODE` and `CLAUDE_CODE_ENTRYPOINT` from the child env | failed `"Claude Code returned no message"` when text is null | T48 |
| `gemini.ts` | `export const GEMINI_EXCLUDED_TOOLS: string[]` | `run_shell_command, replace, write_file, read_file, read_many_files, glob, grep_search, list_directory, web_fetch, google_web_search, invoke_agent, activate_skill, ask_user, write_todos, list_mcp_resources, read_mcp_resource` | - | T49 |
| `gemini.ts` | `extractJsonObject(text: string): string \| null` | the first balanced `{...}` in the text, string-aware | `null` | T49 |
| `gemini.ts` | `geminiErrorMessage(stderr: string): string` | `error.message` of the JSON object found in stderr, else `lastStderrLine`; cut to 200 | - | T49 |
| `gemini.ts` | `geminiPrompt(prompt: string, schema: object): string` | prompt plus the "# Reply format" section with the schema | - | T49 |
| `gemini.ts` | `createGeminiAdapter(deps: ProcessDeps): CliAdapter` | B30; env override `LEARN_GEMINI_PATH`; `usage` is always `null` | failed `"Gemini returned no message"` when stdout has no string `response` | T49 |
| `registry.ts` | `createAdapters(deps: ProcessDeps): Record<CliId, CliAdapter>` | one of each | - | T50 |
| `registry.ts` | `detectAll(adapters: Record<CliId, CliAdapter>): Promise<CliStatus[]>` | all three in parallel, in `CLI_ORDER` | a rejected detect counts as not installed | T50 |
| `turn.ts` | `modelStep(deps: { adapter: CliAdapter; knowledge: KnowledgeItem[]; profile: string }, ...)` | attempts = `adapter.retries + 1`; failure message `"<adapter.label> failed: <message>"` | as before | T50 |
| `turn.ts` | `createTurnRunner(deps: { adapters: Record<CliId, CliAdapter>; store; now; newId; notify })` | uses `adapters[session.cli]` (an unknown value falls back to `codex`) | as before | T50 |
| `ipc.ts` | `IpcDeps.adapters: Record<CliId, CliAdapter>` (replaces `adapter`) | - | - | T50 |
| `ipc.ts` | `clis:detect` | `detectAll(adapters)` | - | T51 |
| `ipc.ts` | `sessions:create` | also checks `isCliId(input.cli)` | `{ ok: false, message: "Choose a tutor." }` | T51, T55 |
| `ipc.ts` | `sessions:list` | each summary carries `cli` | - | T51 |
| `ipc.ts` | `sessions:setCli (id, cli)` | B34: writes the session with the new `cli` and `updatedAt`, sends `session:updated` | `{ ok: false, message }` with `"Choose a tutor."`, `"A reply is already on the way."` or `"This lesson no longer exists."` | T51 |
| `TutorPicker.tsx` | `TutorPicker(props: { statuses: CliStatus[]; value: CliId \| null; disabled: boolean; onChange(cli: CliId): void })` | a `radiogroup` labelled "Tutor", one `.option` row per CLI in `CLI_ORDER`, text `cliName(id)`; a missing CLI is disabled, class `is-disabled`, text followed by ` · not installed` | - | T52 |
| `CliGate.tsx` | `CliGate(props: { clis: CliStatus[] \| null; onRetry(): void })` | B24 banner when the list is known and nothing is installed | renders nothing otherwise | T53 |
| `NewLessonForm.tsx` | `NewLessonForm(props: { disabled: boolean; statuses: CliStatus[]; lastUsed: CliId \| null; onCreated(session: Session): void })` | picker between Goal and Start; sends `cli` | - | T53 |
| `LessonScreen.tsx` | `LessonScreen(props: { id: string; start: boolean; statuses: CliStatus[] \| null; onRetryDetect(): void })` | B27 header, B28 banner, B34 switching | - | T54 |

### Errors (milestone 2)
| Condition | Result |
|-----------|--------|
| No CLI installed | banner B24 with Retry; New lesson disabled |
| The lesson's CLI is not installed | banner B28 with Retry; pending card disabled; no call |
| Unknown CLI id on create or switch | "Choose a tutor." |
| Switch while a call runs | "A reply is already on the way." |
| Switch on a deleted lesson | "This lesson no longer exists." |
| CLI exits non-zero, cannot be started, or times out | "<name> failed: <detail>" with Retry |

### LLM calls (milestone 2)
The prompt is unchanged for Codex and Claude Code. For Gemini, `geminiPrompt` appends exactly:

```

# Reply format
Reply with exactly one JSON object and nothing else: no code fence, no text before or after it. It must match this JSON Schema:
{JSON.stringify(schema)}
```
