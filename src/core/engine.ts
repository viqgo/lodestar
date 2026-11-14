import { FIELD_MAX, MAX_FAILS } from "../shared/limits";
import type { LessonState, SessionEvent, Verdict } from "../shared/types";

export function validateNewLesson(topic: string, goal: string): string | null {
  const ok = (s: string) => s.trim().length >= 1 && s.trim().length <= FIELD_MAX;
  return ok(topic) && ok(goal) ? null : "Enter a topic and a goal.";
}

function applyVerdict(state: LessonState, verdict: Verdict): LessonState {
  const id = state.currentNodeId;
  if (id === null) return state;
  const node = state.nodes[id]!;
  if (verdict === "pass") {
    return {
      ...state,
      nodes: { ...state.nodes, [id]: { ...node, status: "passed" } },
      teachStep: "need_predict",
    };
  }
  const fails = node.fails + 1;
  const shaky = fails >= MAX_FAILS;
  return {
    ...state,
    nodes: { ...state.nodes, [id]: { status: shaky ? "shaky" : node.status, fails } },
    teachStep: shaky ? "need_predict" : "need_repair",
  };
}

export function deriveState(events: SessionEvent[]): LessonState {
  let state: LessonState = {
    phase: "probe",
    probeAnswered: 0,
    known: [],
    sharpGoal: null,
    plan: null,
    nodes: {},
    currentNodeId: null,
    teachStep: null,
    awaiting: { who: "model" },
    summary: null,
  };

  events.forEach((event, i) => {
    const corrupt = () => new Error("corrupt session at event " + i);
    const awaiting = state.awaiting;
    if (event.kind === "answer") {
      if (awaiting.who !== "learner") throw corrupt();
      if (awaiting.purpose === "probe") {
        state = { ...state, probeAnswered: state.probeAnswered + 1, awaiting: { who: "model" } };
        return;
      }
      if (awaiting.purpose === "predict") {
        state = { ...state, teachStep: "need_explain", awaiting: { who: "model" } };
        return;
      }
      if (awaiting.purpose === "check") {
        const q = awaiting.question;
        if (q.kind === "choice") {
          const ok = event.answer.choiceIndex === q.correctIndex;
          state = applyVerdict(state, ok ? "pass" : "fail");
        } else {
          state = { ...state, teachStep: "need_verdict" };
        }
        state = { ...state, awaiting: { who: "model" } };
        return;
      }
      throw corrupt();
    }
    if (awaiting.who !== "model") throw corrupt();
    const action = event.action;
    if (state.teachStep === "need_verdict") {
      if (!("verdict" in action) || action.verdict === null) throw corrupt();
      state = applyVerdict(state, action.verdict);
    }
    switch (action.type) {
      case "probe":
        state = {
          ...state,
          awaiting: {
            who: "learner",
            purpose: "probe",
            question: action.question,
            nodeId: null,
            eventIndex: i,
          },
        };
        return;
      case "probe_done":
        state = { ...state, known: [...action.known], sharpGoal: action.goal, phase: "plan" };
        return;
      case "plan": {
        const nodes: LessonState["nodes"] = {};
        for (const node of action.nodes) nodes[node.id] = { status: "todo", fails: 0 };
        state = {
          ...state,
          plan: action.nodes.map((n) => ({ ...n, deps: [...n.deps] })),
          nodes,
          phase: "teach",
          teachStep: "need_predict",
        };
        return;
      }
      case "predict":
        state = {
          ...state,
          currentNodeId: action.nodeId,
          awaiting: {
            who: "learner",
            purpose: "predict",
            question: action.question,
            nodeId: action.nodeId,
            eventIndex: i,
          },
        };
        return;
      case "explain":
        state = {
          ...state,
          awaiting: {
            who: "learner",
            purpose: "check",
            question: action.check,
            nodeId: action.nodeId,
            eventIndex: i,
          },
        };
        return;
      case "lesson_done":
        state = { ...state, phase: "done", summary: action.summary, awaiting: { who: "nobody" } };
        return;
    }
  });

  return state;
}
