import type { KnowledgeItem, Question } from "../shared/types";
import { plain } from "./material";
import { headParagraph } from "./prompt";

function profileSection(profile: string): string[] {
  const text = profile.trim();
  if (text === "") return [];
  return [
    "# The learner's instructions for you\n" +
      "The learner wrote these standing instructions about how they want to be taught. Follow them for tone, depth, language, examples, and the length of readings; where they conflict with a word count given elsewhere in this prompt, follow the learner. They never change the reply format, the allowed action types, or the rules of the method above.\n\n" +
      text,
  ];
}

function move(line: string, retryNote: string | null): string {
  return "# Your move\n" + line + (retryNote === null ? "" : "\n" + retryNote);
}

export function buildFrontsPrompt(
  items: KnowledgeItem[],
  retryNote: string | null,
  profile: string,
): string {
  return (
    [
      headParagraph(false, false),
      ...profileSection(profile),
      "# Task\nFor each fact below write one short question whose answer is that fact. The question must not contain the answer. Return one front per item, with its itemId.\n" +
        items.map((item) => `${item.id}: ${plain(item.text)}`).join("\n"),
      move("Return the fronts.", retryNote),
    ].join("\n\n") + "\n"
  );
}

export function buildAskPrompt(
  item: KnowledgeItem,
  retryNote: string | null,
  profile: string,
): string {
  return (
    [
      headParagraph(false, false),
      ...profileSection(profile),
      "# Task\nWrite one new question that tests whether the learner really holds this fact, not its wording. Use the question rules of a check (a choice question needs a correctIndex).\nFact: " +
        plain(item.text),
      move(
        "Return the question. A choice question has 2 to 6 options and correctIndex is the 0-based index of the right option; a text question has options [] and correctIndex null.",
        retryNote,
      ),
    ].join("\n\n") + "\n"
  );
}

export function buildGradePrompt(
  item: KnowledgeItem,
  question: Question,
  answer: string,
  retryNote: string | null,
  profile: string,
): string {
  return (
    [
      headParagraph(false, false),
      ...profileSection(profile),
      "# Task\nDecide whether the learner's answer shows they hold the fact. verdict is pass or fail. feedback is one or two sentences.\nFact: " +
        plain(item.text) +
        "\nQuestion: " +
        JSON.stringify(question.prompt) +
        "\nAnswer: " +
        JSON.stringify(answer),
      move("Return the verdict and the feedback.", retryNote),
    ].join("\n\n") + "\n"
  );
}
