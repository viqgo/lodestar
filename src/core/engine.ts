import { FIELD_MAX } from "../shared/limits";
import type { LessonState, SessionEvent } from "../shared/types";

export function validateNewLesson(topic: string, goal: string): string | null {
  const ok = (s: string) => s.trim().length >= 1 && s.trim().length <= FIELD_MAX;
  return ok(topic) && ok(goal) ? null : "Enter a topic and a goal.";
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
      throw corrupt();
    }
    if (awaiting.who !== "model") throw corrupt();
    const action = event.action;
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
      default:
        throw corrupt();
    }
  });

  return state;
}
