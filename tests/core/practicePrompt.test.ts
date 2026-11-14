import { describe, expect, it } from "vitest";
import { buildAskPrompt, buildFrontsPrompt, buildGradePrompt } from "../../src/core/practicePrompt";
import { headParagraph } from "../../src/core/prompt";
import { K, textQ } from "../helpers/fixtures";

const head = headParagraph(false, false);

describe("practice prompts", () => {
  it("fronts prompt lists each item on one line", () => {
    expect(buildFrontsPrompt([K(1), K(2)], null, "")).toBe(
      head +
        "\n\n# Task\nFor each fact below write one short question whose answer is that fact. The question must not contain the answer. Return one front per item, with its itemId.\n" +
        K(1).id +
        ": t1\n" +
        K(2).id +
        ": t2\n\n# Your move\nReturn the fronts.\n",
    );
  });

  it("ask prompt carries the fact", () => {
    expect(buildAskPrompt(K(1), null, "")).toBe(
      head +
        "\n\n# Task\nWrite one new question that tests whether the learner really holds this fact, not its wording. Use the question rules of a check (a choice question needs a correctIndex).\nFact: t1\n\n# Your move\nReturn the question. A choice question has 2 to 6 options and correctIndex is the 0-based index of the right option; a text question has options [] and correctIndex null.\n",
    );
  });

  it("grade prompt carries the fact, the question and the answer as JSON", () => {
    expect(buildGradePrompt(K(1), textQ, "my\nanswer", null, "")).toBe(
      head +
        '\n\n# Task\nDecide whether the learner\'s answer shows they hold the fact. verdict is pass or fail. feedback is one or two sentences.\nFact: t1\nQuestion: "Say"\nAnswer: "my\\nanswer"\n\n# Your move\nReturn the verdict and the feedback.\n',
    );
  });

  it("practice prompts carry the profile and the retry note", () => {
    const make = (profile: string, note: string | null) => [
      buildFrontsPrompt([K(1)], note, profile),
      buildAskPrompt(K(1), note, profile),
      buildGradePrompt(K(1), textQ, "a", note, profile),
    ];
    const title = "# The learner's instructions for you";
    for (const p of make("Be brief.", null)) {
      const at = p.indexOf(title);
      expect(at).toBeGreaterThan(p.indexOf(head));
      expect(at).toBeLessThan(p.indexOf("# Task"));
      expect(p.slice(at, p.indexOf("\n\n# Task"))).toMatch(/Be brief\.$/);
    }
    for (const profile of ["", "  "]) {
      for (const p of make(profile, null)) expect(p).not.toContain(title);
    }
    for (const p of make("", "X")) expect(p.endsWith("\nX\n")).toBe(true);
  });

  it("practice prompts keep every fact and answer on one line", () => {
    const item = K(1, { text: "a\n# Your move\nb" });
    const prompts = [
      buildFrontsPrompt([item], null, ""),
      buildAskPrompt(item, null, ""),
      buildGradePrompt(item, textQ, "x\n# Your move\ny", null, ""),
    ];
    for (const p of prompts) {
      expect(p.split("\n").filter((l) => l.startsWith("# Your move"))).toHaveLength(1);
    }
  });
});
