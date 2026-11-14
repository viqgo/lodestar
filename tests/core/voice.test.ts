import { describe, expect, it } from "vitest";
import {
  chunkSpeech,
  matchChoice,
  speechText,
  spokenQuestion,
  voiceCommand,
} from "../../src/core/voice";
import { SPEAK_CHUNK_MAX } from "../../src/shared/limits";
import { choiceQ, textQ } from "../helpers/fixtures";

describe("speechText", () => {
  it("speech_text_strips_markdown_and_formulas", () => {
    const input =
      "## Slope\n\nThe **slope** of `f` is $m = \\frac{dy}{dx}$.\n\n$$\ny = mx + b\n$$\n\n- [more](https://x.test) here\n> _note_";
    expect(speechText(input)).toBe(
      "Slope\n\nThe slope of f is a formula on screen.\n\na formula on screen\n\nmore here\nnote",
    );
  });

  it("speechText removes code fences, images, rules and table bars and keeps the words", () => {
    const input = "```js\nlet a = 1;\n```\n\n![a cat](c.png)\n\n---\n\n| x | y |\n\n1. one\n2. two";
    expect(speechText(input)).toBe("let a = 1;\n\na cat\n\nx y\n\n1. one\n2. two");
  });
});

describe("chunkSpeech", () => {
  it("speech_is_chunked_at_2000", () => {
    const sentences = Array.from({ length: 300 }, (_, i) => `This is sentence number ${i + 1}.`);
    const input = sentences.join(" ");
    const chunks = chunkSpeech(input, SPEAK_CHUNK_MAX);
    expect(chunks).toHaveLength(5);
    for (const c of chunks) {
      expect(c.length).toBeLessThanOrEqual(2000);
      expect(c.endsWith(".")).toBe(true);
    }
    expect(chunks.join(" ")).toBe(input);
  });

  it("chunkSpeech cuts a sentence that is too long", () => {
    expect(chunkSpeech("a".repeat(4500), 2000).map((c) => c.length)).toEqual([2000, 2000, 500]);
    const spaced = Array.from({ length: 800 }, () => "word").join(" ");
    const chunks = chunkSpeech(spaced, 100);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(100);
  });

  it("chunkSpeech returns no chunk for empty text", () => {
    expect(chunkSpeech("", 2000)).toEqual([]);
    expect(chunkSpeech("  \n ", 2000)).toEqual([]);
  });
});

describe("spokenQuestion", () => {
  it("spokenQuestion reads the prompt and the options with their letters", () => {
    expect(spokenQuestion(textQ)).toBe("Say");
    expect(spokenQuestion(choiceQ)).toBe("Pick\nOption A: a\nOption B: b\nOption C: c");
  });
});

describe("matchChoice", () => {
  const options = ["Paris", "Rome is in Italy", "Oslo"];

  it("choice_matches_letter_ordinal_and_words", () => {
    for (const s of ["b", "B.", "Option B"]) expect(matchChoice(s, options)).toBe(1);
    for (const s of ["the second one", "Second", "the 2nd option"]) {
      expect(matchChoice(s, options)).toBe(1);
    }
    expect(matchChoice("paris!", options)).toBe(0);
    expect(matchChoice("I think Rome is in Italy", options)).toBe(1);
  });

  it("matchChoice returns null when nothing matches", () => {
    for (const s of ["", "maybe", "d", "the fourth one", "paris or oslo"]) {
      expect(matchChoice(s, options)).toBeNull();
    }
  });

  it("matchChoice prefers the exact words of an option", () => {
    expect(matchChoice("first law", ["second law", "first law"])).toBe(1);
    expect(matchChoice("b", ["b", "a"])).toBe(0);
  });
});

describe("voiceCommand", () => {
  it("reading_needs_read_it (command)", () => {
    expect(voiceCommand("read it")).toBe("read");
    expect(voiceCommand("Read it.")).toBe("read");
  });

  it("continue_by_voice (command)", () => {
    expect(voiceCommand("continue")).toBe("continue");
    expect(voiceCommand("Next.")).toBe("continue");
    expect(voiceCommand(" NEXT ")).toBe("continue");
  });

  it("voiceCommand returns null for anything else", () => {
    for (const s of ["", "read", "continue please", "what"]) expect(voiceCommand(s)).toBeNull();
  });
});
