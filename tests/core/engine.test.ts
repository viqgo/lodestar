import { describe, expect, it } from "vitest";
import { deriveState, validateNewLesson } from "../../src/core/engine";
import { A, PLAN, act, choiceQ, pick, toPlan, toTeach } from "../helpers/fixtures";

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
