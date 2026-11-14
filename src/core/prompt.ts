import { KNOWLEDGE_PROMPT_MAX } from "../shared/limits";
import type {
  Action,
  Answer,
  KnowledgeItem,
  LessonState,
  Question,
  Session,
  SessionEvent,
  Verdict,
} from "../shared/types";
import { allowedActions, moveNotes } from "./engine";

const STATIC_HEAD = [
  "You are the teaching engine inside a desktop learning app. You never talk to the learner directly: the app shows your output as cards. Reply with exactly one JSON object that matches the provided schema. Do not run commands, read files, or use any tools.",
  "# Method\nThe learner wants to get from what they already hold as obviously true to a goal they do not hold yet.",
  'Probe. Find precisely where their understanding stops for the things the goal depends on. Ask one question at a time. Prefer questions that show how they reason over questions that test vocabulary. Use their confidence and their reasoning, not only whether they were right. Stop as soon as you can state what they hold and where it ends; then return probe_done with "known" (short factual sentences they clearly hold) and "goal" (their goal restated as one precise, checkable sentence).',
  'Plan. Find the smallest set of steps that leads from what they hold to the goal. Leave out anything they already hold and anything the goal does not need. Each node is one idea. "deps" lists the nodes it builds on. Use short lowercase ids with hyphens.',
  "Teach. Go one node at a time, each attached to something they already hold. For each node, first ask them to predict (a question they can attempt before being taught). Then teach: a full reading of the whole idea, written for this learner's level as you found it in the probe, derived step by step from what they hold, with at least one worked example; state a fact outright only when it cannot be derived. 500 to 1000 words of prose. Section headings are allowed in a reading; no commentary about the lesson itself, and no question in a reading. Then explain: a short bridge (under 150 words) that fills what the reading left open, carrying one check question that only someone who followed the reading can answer.",
  "Repair. If a check fails, explain the same node again from a different angle that targets the mistake in their answer, with a new check question.",
  '# Fields\n- feedback: one or two sentences reacting to the learner\'s last answer, or null.\n- verdict: "pass" or "fail" only when the learner\'s last answer was a free-text check; otherwise null.\n- choice questions: 2 to 6 options; correctIndex is the 0-based index of the right option (it may be null only for probe and predict questions with no single right answer). text questions: options [] and correctIndex null.\n- learned (lesson_done only): one short sentence per node, stating the idea as a fact, with that node\'s id.\n- Markdown and LaTeX ($...$ and $$...$$ on their own lines) are allowed in markdown, feedback, summary and question prompts.',
].join("\n\n");

export function renderAnswer(answer: Answer, question: Question, grade: Verdict | null): string {
  const shown =
    question.kind === "choice" && answer.choiceIndex !== null
      ? question.options[answer.choiceIndex]
      : answer.text;
  return JSON.stringify({
    answer: shown,
    reasoning: answer.reasoning,
    confidence: answer.confidence,
    graded: grade,
  });
}

function questionOf(action: Action): { question: Question; fromExplain: boolean } | null {
  if (action.type === "probe" || action.type === "predict") {
    return { question: action.question, fromExplain: false };
  }
  if (action.type === "explain") return { question: action.check, fromExplain: true };
  return null;
}

export function renderTranscript(events: SessionEvent[]): string {
  if (events.length === 0) return "(empty)";
  const lines: string[] = [];
  let asked: { question: Question; fromExplain: boolean } | null = null;
  for (const event of events) {
    if (event.kind === "action") {
      lines.push("MODEL: " + JSON.stringify(event.action));
      asked = questionOf(event.action) ?? asked;
      continue;
    }
    if (asked === null) {
      lines.push("LEARNER: " + JSON.stringify(event.answer));
      continue;
    }
    const { question, fromExplain } = asked;
    const index = event.answer.choiceIndex;
    const grade: Verdict | null =
      fromExplain && question.kind === "choice" && index !== null
        ? index === question.correctIndex
          ? "pass"
          : "fail"
        : null;
    lines.push("LEARNER: " + renderAnswer(event.answer, question, grade));
  }
  return lines.join("\n");
}

export function buildPrompt(input: {
  session: Session;
  state: LessonState;
  knowledge: KnowledgeItem[];
  retryNote: string | null;
}): string {
  const { session, state, knowledge, retryNote } = input;
  const sections: string[] = [
    STATIC_HEAD,
    `# Lesson\nTopic: ${session.topic}\nGoal: ${session.goal}`,
  ];
  if (state.phase === "probe") {
    const items = knowledge.slice(0, KNOWLEDGE_PROMPT_MAX).map((item) => "- " + item.text);
    sections.push(
      [
        "# What the learner showed they understand in earlier lessons",
        ...(items.length > 0 ? items : ["- (nothing yet)"]),
      ].join("\n"),
    );
  }
  if (state.phase === "teach") {
    const lines = (state.plan ?? []).map((node) => {
      const n = state.nodes[node.id]!;
      return `${node.id}: ${n.status} (failed checks: ${n.fails})`;
    });
    sections.push(["# Node status", ...lines].join("\n"));
  }
  sections.push("# Transcript so far\n" + renderTranscript(session.events));
  const move = [
    "# Your move",
    `Allowed action types now: ${allowedActions(state).join(", ")}.`,
    ...moveNotes(state),
  ];
  if (retryNote !== null) move.push(retryNote);
  sections.push(move.join("\n"));
  return sections.join("\n\n") + "\n";
}
