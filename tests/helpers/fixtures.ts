import type {
  Action,
  Answer,
  OutlineChange,
  PlanNode,
  Question,
  Session,
  SessionEvent,
  Subject,
  SubjectEvent,
  Unit,
  Verdict,
} from "../../src/shared/types";

export const AT = "2026-01-01T00:00:00.000Z";
export const choiceQ: Question = {
  kind: "choice",
  prompt: "Pick",
  options: ["a", "b", "c"],
  correctIndex: 1,
};
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
    type: "predict",
    nodeId,
    verdict,
    feedback: null,
    question: textQ,
  }),
  teach: (nodeId = "n1", verdict: Verdict | null = null): Action => ({
    type: "teach",
    nodeId,
    verdict,
    feedback: null,
    markdown: "reading",
  }),
  explain: (nodeId = "n1", check: Question = choiceQ, verdict: Verdict | null = null): Action => ({
    type: "explain",
    nodeId,
    verdict,
    feedback: null,
    markdown: "m",
    check,
  }),
  done: (verdict: Verdict | null = null): Action => ({
    type: "lesson_done",
    verdict,
    feedback: null,
    summary: "s",
    learned: [
      { nodeId: "n1", text: "t1" },
      { nodeId: "n2", text: "t2" },
    ],
  }),
};
export const act = (action: Action): SessionEvent => ({
  kind: "action",
  at: AT,
  action,
  usage: null,
});
export const ans = (p: Partial<Answer> = {}): SessionEvent => ({
  kind: "answer",
  at: AT,
  answer: { choiceIndex: null, text: null, reasoning: null, confidence: null, ...p },
});
export const cont = () => ans();
export const pick = (i: number): SessionEvent => ans({ choiceIndex: i });
export const say = (text = "words"): SessionEvent => ans({ text });
export const session = (events: SessionEvent[] = []): Session => ({
  version: 1,
  id: "s_00000000-0000-0000-0000-000000000000",
  topic: "T",
  goal: "G",
  cli: "codex",
  createdAt: AT,
  updatedAt: AT,
  events,
  folder: null,
  attachments: [],
  webSearch: false,
  subjectId: null,
  unitId: null,
});
/** probe answered once, probing declared done: now the model must plan */
export const toPlan: SessionEvent[] = [act(A.probe()), pick(1), act(A.probeDone())];
/** plan accepted: now the model must send a predict */
export const toTeach: SessionEvent[] = [...toPlan, act(A.plan())];
/** predict asked and answered, explanation with a choice check shown: now the learner must answer the check */
export const toCheck = (nodeId = "n1", check: Question = choiceQ): SessionEvent[] => [
  act(A.predict(nodeId)),
  say(),
  act(A.teach(nodeId)),
  cont(),
  act(A.explain(nodeId, check)),
];
/** predict answered, reading shown: now the learner must press Continue */
export const toRead = (nodeId = "n1"): SessionEvent[] => [
  act(A.predict(nodeId)),
  say(),
  act(A.teach(nodeId)),
];

export const UNITS: Unit[] = [
  { id: "u1", title: "Unit one", goal: "Goal one", files: ["a.txt"] },
  { id: "u2", title: "Unit two", goal: "Goal two", files: ["b.txt"] },
  { id: "u3", title: "Unit three", goal: "Goal three", files: [] },
];
export const subject = (events: SubjectEvent[] = []): Subject => ({
  version: 1,
  id: "u_00000000-0000-0000-0000-000000000000",
  name: "Course",
  folder: "/course",
  cli: "codex",
  createdAt: AT,
  updatedAt: AT,
  events,
});
export const SE = {
  outline: (units: Unit[] = UNITS): SubjectEvent => ({
    kind: "outline",
    at: AT,
    units,
    usage: null,
  }),
  accepted: (units: Unit[] = UNITS): SubjectEvent => ({ kind: "accepted", at: AT, units }),
  message: (text = "hi"): SubjectEvent => ({ kind: "message", at: AT, text }),
  reply: (markdown = "ok", change: OutlineChange | null = null): SubjectEvent => ({
    kind: "reply",
    at: AT,
    markdown,
    change,
    usage: null,
  }),
  change: (accepted: boolean): SubjectEvent => ({ kind: "change", at: AT, accepted }),
  note: (unitId: string, sessionId: string): SubjectEvent => ({
    kind: "note",
    at: AT,
    note: { unitId, sessionId, summary: "s", learned: ["t1"], shaky: [] },
  }),
};
export const readySubject: SubjectEvent[] = [SE.outline(), SE.accepted()];
