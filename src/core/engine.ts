import { ANSWER_TEXT_MAX, FIELD_MAX, MAX_FAILS, MAX_PROBE } from "../shared/limits";
import type {
  Action,
  ActionType,
  Answer,
  LessonState,
  SessionEvent,
  Verdict,
} from "../shared/types";
import { allNodesSettled, eligibleNodes, validatePlan } from "./plan";

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
        state = { ...state, teachStep: "need_teach", awaiting: { who: "model" } };
        return;
      }
      if (awaiting.purpose === "read") {
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
      case "teach":
        state = {
          ...state,
          awaiting: {
            who: "learner",
            purpose: "read",
            question: null,
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

export function allowedActions(state: LessonState): ActionType[] {
  if (state.awaiting.who !== "model") return [];
  if (state.phase === "probe") {
    return state.probeAnswered < MAX_PROBE ? ["probe", "probe_done"] : ["probe_done"];
  }
  if (state.phase === "plan") return ["plan"];
  if (state.phase === "teach") {
    switch (state.teachStep) {
      case "need_predict":
        return allNodesSettled(state.nodes) ? ["lesson_done"] : ["predict"];
      case "need_teach":
        return ["teach"];
      case "need_explain":
      case "need_repair":
        return ["explain"];
      case "need_verdict":
        return ["explain", "predict", "lesson_done"];
    }
  }
  return [];
}

export function checkAction(state: LessonState, action: Action): string | null {
  if (!allowedActions(state).includes(action.type)) return `${action.type} is not allowed now`;
  if (state.teachStep === "need_verdict") {
    if (!("verdict" in action) || action.verdict === null) return "verdict is required";
    return checkAction(applyVerdict(state, action.verdict), action);
  }
  switch (action.type) {
    case "probe_done":
      return action.goal.trim().length === 0 ? "goal is empty" : null;
    case "plan":
      return validatePlan(action.nodes);
    case "predict":
      return eligibleNodes(state.plan!, state.nodes).includes(action.nodeId)
        ? null
        : `node ${action.nodeId} cannot start now`;
    case "teach":
      if (action.nodeId !== state.currentNodeId) {
        return `teach must be for node ${state.currentNodeId}`;
      }
      return action.markdown.trim().length === 0 ? "reading is empty" : null;
    case "explain":
      if (action.nodeId !== state.currentNodeId) {
        return `explain must be for node ${state.currentNodeId}`;
      }
      if (action.check.kind === "choice" && action.check.correctIndex === null) {
        return "check needs a correctIndex";
      }
      return null;
    default:
      return null;
  }
}

export function checkAnswer(state: LessonState, answer: Answer): string | null {
  const awaiting = state.awaiting;
  if (awaiting.who !== "learner") return "No question is waiting for an answer.";
  if (awaiting.question === null) {
    return answer.choiceIndex === null && answer.text === null ? null : "Press Continue.";
  }
  if (awaiting.question.kind === "choice") {
    const i = answer.choiceIndex;
    const valid =
      i !== null &&
      Number.isInteger(i) &&
      i >= 0 &&
      i <= awaiting.question.options.length - 1 &&
      answer.text === null;
    return valid ? null : "Pick an option.";
  }
  const length = answer.text === null ? 0 : answer.text.trim().length;
  return length >= 1 && length <= ANSWER_TEXT_MAX && answer.choiceIndex === null
    ? null
    : "Write an answer.";
}

export function learnedToSave(
  state: LessonState,
  action: Extract<Action, { type: "lesson_done" }>,
): { nodeId: string; text: string }[] {
  return action.learned.filter(
    (item) => state.nodes[item.nodeId]?.status === "passed" && item.text.trim().length > 0,
  );
}

export function moveNotes(state: LessonState): string[] {
  if (state.awaiting.who !== "model") return [];
  const id = state.currentNodeId;
  if (state.phase === "probe") {
    return state.probeAnswered >= MAX_PROBE
      ? [`You have asked ${MAX_PROBE} questions. You must return probe_done now.`]
      : [];
  }
  if (state.phase === "plan") {
    return ["Return the plan: 2 to 12 nodes, each one idea, deps listing the nodes it builds on."];
  }
  if (state.phase !== "teach") return [];
  const fails = id === null ? 0 : (state.nodes[id]?.fails ?? 0);
  switch (state.teachStep) {
    case "need_predict":
      return allNodesSettled(state.nodes)
        ? ["Every node is passed or shaky. Return lesson_done."]
        : [
            `Start the next node with a predict question. Nodes that can start now: ${eligibleNodes(state.plan!, state.nodes).join(", ")}.`,
          ];
    case "need_teach":
      return [
        `Write the reading for node ${id}: the whole idea derived step by step from what the learner holds, with at least one worked example, 500 to 1000 words. Do not ask a question yet.`,
      ];
    case "need_explain":
      return [
        `Add a short bridge (under 150 words) for node ${id} that fills what the reading left open, and include a check question.`,
      ];
    case "need_repair":
      return [
        `The learner failed the check on node ${id} (failure ${fails} of 3). Explain node ${id} again from a different angle that targets their mistake, with a new check question.`,
      ];
    case "need_verdict":
      return fails < 2
        ? [
            `The learner's last answer is a free-text check on node ${id}. Set verdict. If pass, continue with the next step. If fail, explain node ${id} again from a different angle with a new check question.`,
          ]
        : [
            `The learner's last answer is a free-text check on node ${id}, and it was their last attempt. Set verdict, then move on: predict for another node, or lesson_done if none remain.`,
          ];
    default:
      return [];
  }
}
