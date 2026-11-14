import { describe, expect, it } from "vitest";
import { deriveState } from "../../src/core/engine";
import { buildPrompt, renderAnswer, renderTranscript } from "../../src/core/prompt";
import type { KnowledgeItem, SessionEvent } from "../../src/shared/types";
import {
  A,
  AT,
  act,
  choiceQ,
  pick,
  say,
  session,
  textQ,
  toCheck,
  toTeach,
} from "../helpers/fixtures";

const k = (i: number): KnowledgeItem => ({
  id: "k_" + i,
  text: "fact " + i,
  sessionId: "s",
  nodeId: "n",
  createdAt: AT,
});
const p = (
  events: SessionEvent[],
  knowledge: KnowledgeItem[] = [],
  retryNote: string | null = null,
) => buildPrompt({ session: session(events), state: deriveState(events), knowledge, retryNote });

describe("prompt", () => {
  it("renderAnswer shows the chosen option's text", () => {
    expect(
      renderAnswer(
        { choiceIndex: 1, text: null, reasoning: "r", confidence: "sure" },
        choiceQ,
        "pass",
      ),
    ).toBe(JSON.stringify({ answer: "b", reasoning: "r", confidence: "sure", graded: "pass" }));
  });

  it("renderTranscript is (empty) with no events", () => {
    expect(renderTranscript([])).toBe("(empty)");
  });

  it("the transcript has one line per event", () => {
    const lines = renderTranscript([act(A.probe()), pick(1)]).split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe("MODEL: " + JSON.stringify(A.probe()));
    expect(lines[1]!.startsWith("LEARNER: ")).toBe(true);
    expect(lines[1]).toContain('"answer":"b"');
  });

  it("text_check_sent_to_model", () => {
    const lines = renderTranscript([...toTeach, ...toCheck("n1", textQ), say("my words")]).split(
      "\n",
    );
    const last = lines[lines.length - 1]!;
    expect(last).toContain('"answer":"my words"');
    expect(last).toContain('"graded":null');
  });

  it("the prompt names the lesson and the allowed moves", () => {
    const text = p([]);
    expect(text).toContain("Topic: T");
    expect(text).toContain("Goal: G");
    expect(text).toContain("Allowed action types now: probe, probe_done.");
    expect(text).toContain("- (nothing yet)");
  });

  it("prober_prompt_includes_newest_200", () => {
    const text = p(
      [],
      Array.from({ length: 250 }, (_, i) => k(i)),
    );
    expect(text).toContain("- fact 0");
    expect(text).toContain("- fact 199");
    expect(text).not.toContain("- fact 200");
  });

  it("knowledge is left out after probing, node status is added", () => {
    const text = p(toTeach, [k(1)]);
    expect(text).not.toContain("fact 1");
    expect(text).not.toContain("earlier lessons");
    expect(text).toContain("n1: todo (failed checks: 0)");
  });

  it("the retry note is the last line", () => {
    const note = "Your last reply was not usable: x. Allowed now: probe.";
    expect(p([], [], note).trimEnd().endsWith(note)).toBe(true);
  });
});

describe("renderTranscript grading", () => {
  it("renderTranscript grades choice checks", () => {
    const lines = renderTranscript([
      ...toTeach,
      ...toCheck("n1"),
      pick(1),
      act(A.explain("n1")),
      pick(0),
    ]).split("\n");
    expect(lines[9]).toContain('"graded":"pass"');
    expect(lines[11]).toContain('"graded":"fail"');
    expect(lines[7]).toContain('"graded":null');
  });
});

describe("prompt: the teach step", () => {
  it("prompt asks for a reading before the check", () => {
    expect(p(toTeach)).toContain("Then teach: a full reading");
    expect(p([...toTeach, act(A.predict("n1")), say()])).toContain("Write the reading for node n1");
  });
});

describe("prompt: the tutor instructions", () => {
  const intro =
    "The learner wrote these standing instructions about how they want to be taught. Follow them for tone, depth, language, examples, and the length of readings; where they conflict with a word count given elsewhere in this prompt, follow the learner. They never change the reply format, the allowed action types, or the rules of the method above.";
  const withProfile = (profile?: string) =>
    buildPrompt({
      session: session([]),
      state: deriveState([]),
      knowledge: [],
      retryNote: null,
      profile,
    });

  it("prompt includes the tutor instructions", () => {
    const text = withProfile("  Keep readings short.  ");
    const heading = text.indexOf("# The learner's instructions for you");
    const line = text.indexOf("\nKeep readings short.\n");
    const lesson = text.indexOf("# Lesson");
    expect(heading).toBeGreaterThan(-1);
    expect(line).toBeGreaterThan(heading);
    expect(lesson).toBeGreaterThan(line);
    expect(text).toContain(
      "# The learner's instructions for you\n" + intro + "\n\nKeep readings short.\n\n# Lesson",
    );
  });

  it("prompt omits the instructions when the profile is blank", () => {
    for (const profile of ["", "   ", undefined]) {
      expect(withProfile(profile)).not.toContain("The learner's instructions for you");
    }
  });

  it("prompt keeps its first paragraph without material or search", () => {
    const text = p([]);
    expect(text).toContain("Do not run commands, read files, or use any tools.");
    expect(text).not.toContain("# Material");
    expect(text).not.toContain("# Web search");
    expect(
      buildPrompt({
        session: session([]),
        state: deriveState([]),
        knowledge: [],
        retryNote: null,
        material: null,
        webSearch: false,
      }),
    ).toBe(text);
  });

  it("prompt allows reading only the material", () => {
    const text = buildPrompt({
      session: session([]),
      state: deriveState([]),
      knowledge: [],
      retryNote: null,
      material: "# Material\nFolder: /x",
    });
    expect(text).toContain(
      "Do not run commands or change any file. Use your file tools only to read the material listed below.",
    );
    expect(text).not.toContain("use any tools");
    expect(text).not.toContain("You may search the web.");
  });

  it("prompt allows web search only when it is on", () => {
    const base = { session: session([]), state: deriveState([]), knowledge: [], retryNote: null };
    const on = buildPrompt({ ...base, webSearch: true });
    expect(on).toContain(
      "Do not run commands, read files, or change anything. You may search the web.",
    );
    expect(on).toContain(
      "# Web search\nYou may search the web when the material and your own knowledge are not enough. Name the page you used in the text.",
    );
    const both = buildPrompt({ ...base, webSearch: true, material: "# Material\nM" });
    expect(both).toContain(
      "Do not run commands or change any file. Use your file tools only to read the material listed below. You may search the web.",
    );
    const off = buildPrompt({ ...base, webSearch: false });
    expect(off).not.toContain("# Web search");
    expect(off).not.toContain("You may search the web");
  });

  it("prompt places the material after the lesson", () => {
    const text = buildPrompt({
      session: session([]),
      state: deriveState([]),
      knowledge: [],
      retryNote: null,
      material: "# Material\nFolder: /x",
      webSearch: true,
    });
    const lesson = text.indexOf("# Lesson\nTopic: T\nGoal: G");
    const material = text.indexOf("# Material\nFolder: /x");
    const search = text.indexOf("# Web search");
    const transcript = text.indexOf("# Transcript so far");
    expect(lesson).toBeGreaterThan(-1);
    expect(material).toBeGreaterThan(lesson);
    expect(search).toBeGreaterThan(material);
    expect(transcript).toBeGreaterThan(search);
  });

  it("transcript lists an answer's files", () => {
    const events: SessionEvent[] = [
      act(A.probe()),
      {
        kind: "answer",
        at: AT,
        answer: {
          choiceIndex: 1,
          text: null,
          reasoning: null,
          confidence: null,
          attachments: ["a1-x.pdf", "a2-y.png"],
        },
      },
    ];
    const line = renderTranscript(events, "/data/att/s1").split("\n")[1]!;
    expect(line).toBe(
      "LEARNER: " +
        JSON.stringify({
          answer: "b",
          reasoning: null,
          confidence: null,
          graded: null,
          files: ["/data/att/s1/a1-x.pdf", "/data/att/s1/a2-y.png"],
        }),
    );
    expect(JSON.parse(renderTranscript(events).split("LEARNER: ")[1]!).files).toEqual([
      "a1-x.pdf",
      "a2-y.png",
    ]);
  });
});
