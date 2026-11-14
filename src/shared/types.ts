export type Question = {
  kind: "choice" | "text";
  prompt: string;
  options: string[]; // [] for text
  correctIndex: number | null; // null for text, or for a probe choice with no right answer
};

export type PlanNode = { id: string; title: string; deps: string[] };
export type Verdict = "pass" | "fail";

export type Action =
  | { type: "probe"; question: Question }
  | { type: "probe_done"; known: string[]; goal: string }
  | { type: "plan"; nodes: PlanNode[] }
  | {
      type: "predict";
      nodeId: string;
      verdict: Verdict | null;
      feedback: string | null;
      question: Question;
    }
  | {
      type: "teach";
      nodeId: string;
      verdict: Verdict | null;
      feedback: string | null;
      markdown: string;
    }
  | {
      type: "explain";
      nodeId: string;
      verdict: Verdict | null;
      feedback: string | null;
      markdown: string;
      check: Question;
    }
  | {
      type: "lesson_done";
      verdict: Verdict | null;
      feedback: string | null;
      summary: string;
      learned: { nodeId: string; text: string }[];
    };
export type ActionType = Action["type"];

export type Confidence = "sure" | "unsure" | "guessing";
export type Answer = {
  choiceIndex: number | null; // index into Question.options (original order), null for text
  text: string | null; // null for choice
  reasoning: string | null;
  confidence: Confidence | null;
  attachments?: string[]; // stored file names
};

export type Usage = { inputTokens: number; outputTokens: number };
export type SessionEvent =
  | { kind: "action"; at: string; action: Action; usage: Usage | null }
  | { kind: "answer"; at: string; answer: Answer }
  | { kind: "aside"; at: string; question: string; markdown: string; usage: Usage | null };

export type AttachmentKind = "pdf" | "image" | "text";
export type Attachment = { file: string; name: string; bytes: number; kind: AttachmentKind }; // file: unique stored name
export type FileEntry = { path: string; bytes: number }; // path relative to the folder
export type RunOptions = {
  readDirs: string[];
  images: string[];
  webSearch: boolean;
  model: string | null;
  effort: string | null;
};

export type CliId = "codex" | "claude" | "gemini";

export type CliStatus = { id: CliId; installed: boolean; version: string | null };

export type Session = {
  version: 1;
  id: string; // "s_" + crypto.randomUUID()
  topic: string;
  goal: string;
  cli: CliId;
  createdAt: string; // ISO 8601 UTC
  updatedAt: string;
  events: SessionEvent[];
  folder: string | null;
  attachments: Attachment[];
  webSearch: boolean;
  subjectId: string | null;
  unitId: string | null;
};
export type SessionSummary = {
  id: string;
  topic: string;
  phase: Phase;
  cli: CliId;
  updatedAt: string;
  subjectId: string | null;
};

export type KnowledgeItem = {
  id: string;
  text: string;
  sessionId: string;
  nodeId: string;
  createdAt: string;
};
export type KnowledgeView = KnowledgeItem & { lessonTopic: string | null }; // null if the lesson was deleted

export type Phase = "probe" | "plan" | "teach" | "done";
export type NodeState = { status: "todo" | "passed" | "shaky"; fails: number };
export type TeachStep =
  "need_predict" | "need_teach" | "need_explain" | "need_repair" | "need_verdict";
export type Awaiting =
  | { who: "model" }
  | {
      who: "learner";
      purpose: "probe" | "predict" | "check";
      question: Question;
      nodeId: string | null;
      eventIndex: number;
    }
  | { who: "learner"; purpose: "read"; question: null; nodeId: string; eventIndex: number }
  | { who: "nobody" };

export type LessonState = {
  phase: Phase;
  probeAnswered: number;
  known: string[];
  sharpGoal: string | null;
  plan: PlanNode[] | null;
  nodes: Record<string, NodeState>;
  currentNodeId: string | null;
  teachStep: TeachStep | null; // meaningful only when phase is "teach" and awaiting.who is "model"
  awaiting: Awaiting;
  summary: string | null;
};

export type DetectResult = { ok: true; version: string } | { ok: false };
export type RunRequest = {
  prompt: string;
  schema: object;
  signal: AbortSignal;
  timeoutMs: number;
  options?: RunOptions;
};
export type RunResult =
  | { ok: true; text: string; usage: Usage | null }
  | { ok: false; kind: "failed" | "timeout" | "aborted"; message: string };

export type TurnError = {
  kind:
    "cli" | "bad_reply" | "busy" | "stopped" | "not_found" | "invalid_answer" | "folder_missing";
  message: string;
};
export type TurnResult =
  { ok: true; session: Session } | { ok: false; error: TurnError; session: Session | null };

export type CallState = "off" | "listening" | "thinking" | "speaking";

export type Settings = {
  voice: { language: string; voice: string };
  theme: "dark" | "light" | "system";
  method: string;
  instructions: string;
  clis: Record<CliId, { model: string; effort: string }>;
};

export type Api = {
  detectClis(): Promise<CliStatus[]>;
  listSessions(): Promise<SessionSummary[]>;
  createSession(input: {
    topic: string;
    goal: string;
    cli: CliId;
    folder: string | null;
    webSearch: boolean;
    attachPaths: string[];
  }): Promise<{ ok: true; session: Session } | { ok: false; message: string }>;
  pickFolder(): Promise<string | null>;
  pickFiles(): Promise<string[]>;
  setSessionFolder(
    id: string,
    folder: string | null,
  ): Promise<{ ok: true; session: Session } | { ok: false; message: string }>;
  setSessionWebSearch(
    id: string,
    on: boolean,
  ): Promise<{ ok: true; session: Session } | { ok: false; message: string }>;
  addAttachments(
    id: string,
    paths: string[],
  ): Promise<{ ok: true; session: Session } | { ok: false; message: string }>;
  removeAttachment(
    id: string,
    file: string,
  ): Promise<{ ok: true; session: Session } | { ok: false; message: string }>;
  setSessionCli(
    id: string,
    cli: CliId,
  ): Promise<{ ok: true; session: Session } | { ok: false; message: string }>;
  getSession(id: string): Promise<Session | null>;
  deleteSession(id: string): Promise<void>;
  advance(id: string): Promise<TurnResult>;
  answer(id: string, answer: Answer, attachPaths: string[]): Promise<TurnResult>;
  stop(id: string): Promise<void>;
  isRunning(id: string): Promise<boolean>;
  listKnowledge(): Promise<KnowledgeView[]>;
  deleteKnowledge(id: string): Promise<void>;
  dueItems(filter: ReviewFilter): Promise<{ due: DueItem[]; nextDue: string | null }>;
  recordReview(itemId: string, correct: boolean): Promise<void>;
  practiceFronts(
    itemIds: string[],
    cli: CliId,
  ): Promise<{ ok: true } | { ok: false; error: TurnError }>;
  practiceAsk(
    itemId: string,
    cli: CliId,
  ): Promise<{ ok: true; question: Question } | { ok: false; error: TurnError }>;
  practiceGrade(
    itemId: string,
    question: Question,
    text: string,
    cli: CliId,
  ): Promise<{ ok: true; verdict: Verdict; feedback: string } | { ok: false; error: TurnError }>;
  practiceStop(): Promise<void>;
  aside(id: string, text: string): Promise<TurnResult>;
  getGraph(): Promise<GraphData>;
  getSettings(): Promise<Settings>;
  saveSettings(settings: Settings): Promise<{ ok: true } | { ok: false; message: string }>;
  voiceHasKey(): Promise<boolean>;
  voiceSetKey(key: string): Promise<{ ok: true } | { ok: false; message: string }>;
  voiceRemoveKey(): Promise<void>;
  voiceStart(lessonId: string): Promise<{ ok: true } | { ok: false; message: string }>;
  voiceAudio(pcm: ArrayBuffer): void;
  voiceSpeak(text: string): Promise<void>;
  voiceSkip(): Promise<void>;
  voiceStop(lessonId: string): Promise<void>;
  onVoiceState(cb: (state: CallState) => void): () => void;
  onVoiceTranscript(cb: (text: string, final: boolean) => void): () => void;
  onVoiceUtterance(cb: () => void): () => void;
  onVoiceAudio(cb: (audio: Uint8Array) => void): () => void;
  onVoiceError(cb: (message: string) => void): () => void;
  getProfile(): Promise<string>;
  saveProfile(text: string): Promise<{ ok: true } | { ok: false; message: string }>;
  onSessionUpdated(cb: (session: Session) => void): () => void; // returns unsubscribe
  onTurnEnded(cb: (id: string, result: TurnResult) => void): () => void;
  onAsideEnded(cb: (id: string) => void): () => void;
  listSubjects(): Promise<SubjectSummary[]>;
  createSubject(input: {
    name: string;
    folder: string | null;
    cli: CliId;
  }): Promise<{ ok: true; subject: Subject } | { ok: false; message: string }>;
  getSubject(id: string): Promise<Subject | null>;
  deleteSubject(id: string): Promise<void>;
  setSubjectFolder(
    id: string,
    folder: string,
  ): Promise<{ ok: true; subject: Subject } | { ok: false; message: string }>;
  advanceSubject(id: string): Promise<SubjectResult>;
  acceptOutline(
    id: string,
    units: Unit[],
  ): Promise<{ ok: true; subject: Subject } | { ok: false; message: string }>;
  subjectMessage(id: string, text: string): Promise<SubjectResult>;
  resolveChange(
    id: string,
    accept: boolean,
  ): Promise<{ ok: true; subject: Subject } | { ok: false; message: string }>;
  startUnit(
    subjectId: string,
    unitId: string,
  ): Promise<{ ok: true; session: Session } | { ok: false; message: string }>;
  stopSubject(id: string): Promise<void>;
  isSubjectRunning(id: string): Promise<boolean>;
  subjectStatuses(id: string): Promise<UnitStatus[]>;
  onSubjectUpdated(cb: (subject: Subject) => void): () => void;
  onSubjectEnded(cb: (id: string, result: SubjectResult) => void): () => void;
};

export type Unit = { id: string; title: string; goal: string; files: string[] };
export type OutlineChange =
  | { kind: "add"; unit: Unit; afterId: string | null }
  | { kind: "remove"; unitId: string }
  | { kind: "reorder"; order: string[] };
export type HandoverNote = {
  unitId: string;
  sessionId: string;
  summary: string;
  learned: string[];
  shaky: string[];
};
export type SubjectEvent =
  | { kind: "outline"; at: string; units: Unit[]; usage: Usage | null }
  | { kind: "accepted"; at: string; units: Unit[] }
  | { kind: "message"; at: string; text: string }
  | {
      kind: "reply";
      at: string;
      markdown: string;
      change: OutlineChange | null;
      usage: Usage | null;
    }
  | { kind: "change"; at: string; accepted: boolean }
  | { kind: "note"; at: string; note: HandoverNote };
export type Subject = {
  version: 1;
  id: string; // "u_" + crypto.randomUUID()
  name: string;
  folder: string;
  cli: CliId;
  createdAt: string;
  updatedAt: string;
  events: SubjectEvent[];
};
export type SubjectState = {
  phase: "outline" | "review" | "ready";
  units: Unit[];
  notes: HandoverNote[];
  chat: { who: "owner" | "tutor"; markdown: string }[];
  pendingChange: OutlineChange | null;
  awaitingReply: boolean;
};
export type UnitStatus = {
  unitId: string;
  sessionId: string | null;
  status: "not_started" | "in_progress" | "done";
  shaky: number;
};
export type SubjectSummary = { id: string; name: string; updatedAt: string };
export type SubjectResult =
  { ok: true; subject: Subject } | { ok: false; error: TurnError; subject: Subject | null };
export type Review = {
  itemId: string;
  box: 1 | 2 | 3 | 4 | 5;
  due: string;
  front: string | null;
};
export type ReviewFilter = { subjectId: string | null; sessionId: string | null };
export type DueItem = { item: KnowledgeItem; review: Review };
export type GraphNode = { id: string; text: string; box: number; due: string; sessionId: string };
export type GraphGroup = {
  sessionId: string;
  title: string;
  subject: string | null;
  nodes: GraphNode[];
};
export type GraphData = { groups: GraphGroup[]; edges: { from: string; to: string }[] };
