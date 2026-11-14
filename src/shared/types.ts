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
};

export type Usage = { inputTokens: number; outputTokens: number };
export type SessionEvent =
  | { kind: "action"; at: string; action: Action; usage: Usage | null }
  | { kind: "answer"; at: string; answer: Answer };

export type Session = {
  version: 1;
  id: string; // "s_" + crypto.randomUUID()
  topic: string;
  goal: string;
  cli: "codex";
  createdAt: string; // ISO 8601 UTC
  updatedAt: string;
  events: SessionEvent[];
};
export type SessionSummary = { id: string; topic: string; phase: Phase; updatedAt: string };

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
export type RunRequest = { prompt: string; schema: object; signal: AbortSignal; timeoutMs: number };
export type RunResult =
  | { ok: true; text: string; usage: Usage | null }
  | { ok: false; kind: "failed" | "timeout" | "aborted"; message: string };

export type TurnError = {
  kind: "cli" | "bad_reply" | "busy" | "stopped" | "not_found" | "invalid_answer";
  message: string;
};
export type TurnResult =
  { ok: true; session: Session } | { ok: false; error: TurnError; session: Session | null };

export type Api = {
  detectCli(): Promise<DetectResult>;
  listSessions(): Promise<SessionSummary[]>;
  createSession(input: {
    topic: string;
    goal: string;
  }): Promise<{ ok: true; session: Session } | { ok: false; message: string }>;
  getSession(id: string): Promise<Session | null>;
  deleteSession(id: string): Promise<void>;
  advance(id: string): Promise<TurnResult>;
  answer(id: string, answer: Answer): Promise<TurnResult>;
  stop(id: string): Promise<void>;
  isRunning(id: string): Promise<boolean>;
  listKnowledge(): Promise<KnowledgeView[]>;
  deleteKnowledge(id: string): Promise<void>;
  getProfile(): Promise<string>;
  saveProfile(text: string): Promise<{ ok: true } | { ok: false; message: string }>;
  onSessionUpdated(cb: (session: Session) => void): () => void; // returns unsubscribe
  onTurnEnded(cb: (id: string, result: TurnResult) => void): () => void;
};
