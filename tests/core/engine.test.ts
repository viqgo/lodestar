import { describe, expect, it } from "vitest";
import { deriveState, validateNewLesson } from "../../src/core/engine";
import type { SessionEvent } from "../../src/shared/types";
import {
  A,
  PLAN,
  act,
  choiceQ,
  pick,
  say,
  textQ,
  toCheck,
  toPlan,
  toTeach,
} from "../helpers/fixtures";

const MSG = "Enter a topic and a goal.";

describe("validateNewLesson", () => {
  it("new_lesson_rejects_empty_fields", () => {
    expect(validateNewLesson("", "g")).toBe(MSG);
    expect(validateNewLesson("t", "   ")).toBe(MSG);
    expect(validateNewLesson("t", "g")).toBeNull();
  });

  it("new_lesson_rejects_over_500_chars", () => {
    expect(validateNewLesson("x".repeat(501), "g")).toBe(MSG);
    expect(validateNewLesson("x".repeat(500), "g")).toBeNull();
  });
});

describe("deriveState: probe and plan", () => {
  it("a new lesson waits for the model in the probe phase", () => {
    const s = deriveState([]);
    expect(s.phase).toBe("probe");
    expect(s.awaiting).toEqual({ who: "model" });
    expect(s.probeAnswered).toBe(0);
    expect(s.plan).toBeNull();
    expect(s.nodes).toEqual({});
    expect(s.currentNodeId).toBeNull();
    expect(s.teachStep).toBeNull();
    expect(s.known).toEqual([]);
    expect(s.sharpGoal).toBeNull();
    expect(s.summary).toBeNull();
  });

  it("a probe question waits for the learner", () => {
    expect(deriveState([act(A.probe())]).awaiting).toEqual({
      who: "learner",
      purpose: "probe",
      question: choiceQ,
      nodeId: null,
      eventIndex: 0,
    });
  });

  it("a probe answer is counted and hands back to the model", () => {
    const s = deriveState([act(A.probe()), pick(1)]);
    expect(s.probeAnswered).toBe(1);
    expect(s.awaiting.who).toBe("model");
    expect(s.phase).toBe("probe");
  });

  it("probe_ends_on_probe_done", () => {
    const s = deriveState(toPlan);
    expect(s.phase).toBe("plan");
    expect(s.known).toEqual(["k1"]);
    expect(s.sharpGoal).toBe("g");
    expect(s.awaiting.who).toBe("model");
  });

  it("a plan starts the teach phase", () => {
    const s = deriveState(toTeach);
    expect(s.phase).toBe("teach");
    expect(s.plan).toEqual(PLAN);
    expect(s.nodes).toEqual({
      n1: { status: "todo", fails: 0 },
      n2: { status: "todo", fails: 0 },
    });
    expect(s.teachStep).toBe("need_predict");
    expect(s.awaiting.who).toBe("model");
    expect(() => deriveState([pick(1)])).toThrow("corrupt session at event 0");
  });
});

describe("deriveState: teaching", () => {
  const s = (...events: SessionEvent[]) => deriveState([...toTeach, ...events]);

  it("a predict question waits for the learner", () => {
    const r = s(act(A.predict("n1")));
    expect(r.currentNodeId).toBe("n1");
    expect(r.awaiting).toEqual({
      who: "learner",
      purpose: "predict",
      question: textQ,
      nodeId: "n1",
      eventIndex: 4,
    });
  });

  it("a predict answer asks the model to explain", () => {
    const r = s(act(A.predict("n1")), say());
    expect(r.teachStep).toBe("need_explain");
    expect(r.awaiting.who).toBe("model");
  });

  it("choice_check_graded_by_app", () => {
    const r = s(...toCheck("n1"), pick(1));
    expect(r.nodes.n1).toEqual({ status: "passed", fails: 0 });
    expect(r.teachStep).toBe("need_predict");
  });

  it("a wrong choice check asks for a repair", () => {
    const r = s(...toCheck("n1"), pick(0));
    expect(r.nodes.n1).toEqual({ status: "todo", fails: 1 });
    expect(r.teachStep).toBe("need_repair");
    expect(r.currentNodeId).toBe("n1");
  });

  it("third_fail_marks_shaky", () => {
    const r = s(
      ...toCheck("n1"),
      pick(0),
      act(A.explain("n1")),
      pick(0),
      act(A.explain("n1")),
      pick(0),
    );
    expect(r.nodes.n1).toEqual({ status: "shaky", fails: 3 });
    expect(r.teachStep).toBe("need_predict");
  });

  it("a text check waits for the model's verdict", () => {
    const r = s(...toCheck("n1", textQ), say());
    expect(r.teachStep).toBe("need_verdict");
    expect(r.nodes.n1!.status).toBe("todo");
  });

  it("a pass verdict settles the node", () => {
    const r = s(...toCheck("n1", textQ), say(), act(A.predict("n2", "pass")));
    expect(r.nodes.n1!.status).toBe("passed");
    expect(r.currentNodeId).toBe("n2");
  });

  it("a fail verdict counts a failure", () => {
    const r = s(...toCheck("n1", textQ), say(), act(A.explain("n1", choiceQ, "fail")));
    expect(r.nodes.n1).toEqual({ status: "todo", fails: 1 });
    expect(r.awaiting.who).toBe("learner");
  });

  it("lesson_done ends the lesson", () => {
    const r = s(...toCheck("n1"), pick(1), ...toCheck("n2"), pick(1), act(A.done()));
    expect(r.phase).toBe("done");
    expect(r.summary).toBe("s");
    expect(r.awaiting).toEqual({ who: "nobody" });
  });
});
