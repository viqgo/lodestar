import { describe, expect, it } from "vitest";
import { allowedActions, checkAction, deriveState, validateNewLesson } from "../../src/core/engine";
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

describe("allowedActions and checkAction", () => {
  const st = (...events: SessionEvent[]) => deriveState([...toTeach, ...events]);
  const eight = Array.from({ length: 8 }, () => [act(A.probe()), pick(1)]).flat();

  it("probing allows probe and probe_done", () => {
    expect(allowedActions(deriveState([]))).toEqual(["probe", "probe_done"]);
  });

  it("probe_forces_conclusion_after_8", () => {
    const state = deriveState(eight);
    expect(allowedActions(state)).toEqual(["probe_done"]);
    expect(checkAction(state, A.probe())).toBe("probe is not allowed now");
    expect(checkAction(state, A.probeDone())).toBeNull();
  });

  it("the plan phase allows only a valid plan", () => {
    const state = deriveState(toPlan);
    expect(checkAction(state, A.predict())).toBe("predict is not allowed now");
    expect(checkAction(state, A.plan([PLAN[0]!]))).toBe("plan must have 2 to 12 nodes");
    expect(checkAction(state, A.plan())).toBeNull();
  });

  it("teach_rejects_step_with_unmet_deps", () => {
    expect(checkAction(st(), A.predict("n2"))).toBe("node n2 cannot start now");
    expect(checkAction(st(), A.predict("n1"))).toBeNull();
  });

  it("teach_orders_predict_explain_check", () => {
    expect(checkAction(st(), A.explain("n1"))).toBe("explain is not allowed now");
  });

  it("explain must be for the current node", () => {
    expect(checkAction(st(act(A.predict("n1")), say()), A.explain("n2"))).toBe(
      "explain must be for node n1",
    );
  });

  it("a choice check needs a correctIndex", () => {
    expect(
      checkAction(
        st(act(A.predict("n1")), say()),
        A.explain("n1", { ...choiceQ, correctIndex: null }),
      ),
    ).toBe("check needs a correctIndex");
  });

  it("failed_check_requires_same_node", () => {
    const state = st(...toCheck("n1"), pick(0));
    expect(checkAction(state, A.predict("n1"))).toBe("predict is not allowed now");
    expect(checkAction(state, A.explain("n1"))).toBeNull();
  });

  it("lesson_done_rejected_while_steps_remain", () => {
    expect(checkAction(st(...toCheck("n1"), pick(1)), A.done())).toBe(
      "lesson_done is not allowed now",
    );
  });

  it("lesson_done is allowed when every node is settled", () => {
    const state = st(...toCheck("n1"), pick(1), ...toCheck("n2"), pick(1));
    expect(allowedActions(state)).toEqual(["lesson_done"]);
    expect(checkAction(state, A.done())).toBeNull();
  });

  it("a text check needs a verdict and the verdict decides what follows", () => {
    const state = st(...toCheck("n1", textQ), say());
    expect(checkAction(state, A.predict("n2"))).toBe("verdict is required");
    expect(checkAction(state, A.predict("n2", "pass"))).toBeNull();
    expect(checkAction(state, A.predict("n2", "fail"))).toBe("predict is not allowed now");
    expect(checkAction(state, A.explain("n1", choiceQ, "fail"))).toBeNull();
  });
});
