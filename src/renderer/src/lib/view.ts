import type { Answer, Question, Session, Verdict } from "../../../shared/types";

export type ChatItem =
  | { kind: "text"; key: string; markdown: string }
  | { kind: "probe_summary"; key: string; known: string[]; goal: string }
  | { kind: "aside"; key: string; question: string; markdown: string }
  | { kind: "plan_notice"; key: string; count: number }
  | { kind: "reading"; key: string; eventIndex: number; markdown: string; answered: boolean }
  | {
      kind: "question";
      key: string;
      eventIndex: number;
      purpose: "probe" | "predict" | "check";
      question: Question;
      answer: Answer | null;
      grade: Verdict | null;
    };

type QuestionItem = Extract<ChatItem, { kind: "question" }>;

export function buildItems(session: Session): ChatItem[] {
  const items: ChatItem[] = [];
  let pending: QuestionItem | null = null;
  let lastCheck: QuestionItem | null = null;
  let pendingRead: Extract<ChatItem, { kind: "reading" }> | null = null;

  const ask = (i: number, purpose: QuestionItem["purpose"], question: Question): void => {
    const item: QuestionItem = {
      kind: "question",
      key: `e${i}-q`,
      eventIndex: i,
      purpose,
      question,
      answer: null,
      grade: null,
    };
    items.push(item);
    pending = item;
  };

  session.events.forEach((event, i) => {
    if (event.kind === "answer") {
      if (pendingRead !== null) {
        (pendingRead as Extract<ChatItem, { kind: "reading" }>).answered = true;
        pendingRead = null;
        return;
      }
      const q = pending as QuestionItem | null;
      if (q === null) return;
      q.answer = event.answer;
      if (q.purpose === "check") {
        if (q.question.kind === "choice") {
          q.grade = event.answer.choiceIndex === q.question.correctIndex ? "pass" : "fail";
        }
        lastCheck = q;
      }
      pending = null;
      return;
    }
    if (event.kind === "aside") {
      items.push({
        kind: "aside",
        key: `e${i}-as`,
        question: event.question,
        markdown: event.markdown,
      });
      return;
    }
    const action = event.action;
    if (action.type !== "probe" && action.type !== "probe_done" && action.type !== "plan") {
      if (action.verdict !== null && lastCheck !== null) {
        const c = lastCheck as QuestionItem;
        if (c.question.kind === "text" && c.grade === null) c.grade = action.verdict;
      }
      if (action.feedback !== null && action.feedback !== "") {
        items.push({ kind: "text", key: `e${i}-fb`, markdown: action.feedback });
      }
    }
    switch (action.type) {
      case "probe":
        ask(i, "probe", action.question);
        break;
      case "probe_done":
        items.push({
          kind: "probe_summary",
          key: `e${i}-ps`,
          known: action.known,
          goal: action.goal,
        });
        break;
      case "plan":
        items.push({ kind: "plan_notice", key: `e${i}-pn`, count: action.nodes.length });
        break;
      case "predict":
        ask(i, "predict", action.question);
        break;
      case "teach": {
        const reading = {
          kind: "reading" as const,
          key: `e${i}-rd`,
          eventIndex: i,
          markdown: action.markdown,
          answered: false,
        };
        items.push(reading);
        pendingRead = reading;
        break;
      }
      case "explain":
        items.push({ kind: "text", key: `e${i}-md`, markdown: action.markdown });
        ask(i, "check", action.check);
        break;
      case "lesson_done":
        items.push({ kind: "text", key: `e${i}-sum`, markdown: action.summary });
        break;
    }
  });

  return items;
}
