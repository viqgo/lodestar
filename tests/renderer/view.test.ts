import { describe, expect, it } from "vitest";
import type { Action } from "../../src/shared/types";
import { buildItems } from "../../src/renderer/src/lib/view";
import {
  A,
  act,
  choiceQ,
  pick,
  say,
  session,
  textQ,
  toCheck,
  toPlan,
  toTeach,
} from "../helpers/fixtures";

describe("buildItems", () => {
  it("an empty lesson has nothing to draw", () => {
    expect(buildItems(session([]))).toEqual([]);
  });

  it("a pending probe question has no answer", () => {
    expect(buildItems(session([act(A.probe())]))).toEqual([
      {
        kind: "question",
        key: "e0-q",
        eventIndex: 0,
        purpose: "probe",
        question: choiceQ,
        answer: null,
        grade: null,
      },
    ]);
  });

  it("an answered probe carries its answer and no grade", () => {
    const items = buildItems(session([act(A.probe()), pick(1)]));
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      kind: "question",
      answer: (pick(1) as { answer: unknown }).answer,
      grade: null,
    });
  });

  it("probe_done becomes a probe summary", () => {
    const items = buildItems(session(toPlan));
    expect(items[items.length - 1]).toEqual({
      kind: "probe_summary",
      key: "e2-ps",
      known: ["k1"],
      goal: "g",
    });
  });

  it("a plan becomes a plan notice", () => {
    const items = buildItems(session(toTeach));
    expect(items[items.length - 1]).toEqual({ kind: "plan_notice", key: "e3-pn", count: 2 });
  });

  it("explain gives feedback, explanation, then the check, graded by the app", () => {
    const events = [
      ...toTeach,
      act({ ...A.predict("n1"), feedback: "Nice" } as Action),
      say(),
      act({ ...A.explain("n1"), feedback: "Good" } as Action),
      pick(1),
    ];
    const items = buildItems(session(events));
    expect(items.slice(3)).toEqual([
      { kind: "text", key: "e4-fb", markdown: "Nice" },
      {
        kind: "question",
        key: "e4-q",
        eventIndex: 4,
        purpose: "predict",
        question: textQ,
        answer: (say() as { answer: unknown }).answer,
        grade: null,
      },
      { kind: "text", key: "e6-fb", markdown: "Good" },
      { kind: "text", key: "e6-md", markdown: "m" },
      {
        kind: "question",
        key: "e6-q",
        eventIndex: 6,
        purpose: "check",
        question: choiceQ,
        answer: (pick(1) as { answer: unknown }).answer,
        grade: "pass",
      },
    ]);
  });

  it("a text check is graded by the next verdict", () => {
    const grade = (v: "pass" | "fail") => {
      const items = buildItems(
        session([...toTeach, ...toCheck("n1", textQ), say(), act(A.predict("n2", v))]),
      );
      const q = items.find((i) => i.kind === "question" && i.purpose === "check");
      return q && q.kind === "question" ? q.grade : undefined;
    };
    expect(grade("pass")).toBe("pass");
    expect(grade("fail")).toBe("fail");
  });

  it("lesson_done gives feedback and the summary", () => {
    const events = [
      ...toTeach,
      ...toCheck("n1"),
      pick(1),
      ...toCheck("n2"),
      pick(1),
      act({ ...A.done(), feedback: "Well done" } as Action),
    ];
    const i = events.length - 1;
    const items = buildItems(session(events));
    expect(items.slice(-2)).toEqual([
      { kind: "text", key: `e${i}-fb`, markdown: "Well done" },
      { kind: "text", key: `e${i}-sum`, markdown: "s" },
    ]);
  });
});
