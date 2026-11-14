import { describe, expect, it } from "vitest";
import {
  allowedActions,
  checkAction,
  checkAnswer,
  deriveState,
  learnedToSave,
  moveNotes,
  validateNewLesson,
  validateProfile,
} from "../../src/core/engine";
import type { Action, Answer, SessionEvent } from "../../src/shared/types";
import {
  A,
  PLAN,
  act,
  choiceQ,
  cont,
  pick,
  say,
  textQ,
  toCheck,
  toRead,
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
    const r = s(...toRead(), cont());
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
    expect(checkAction(st(...toRead(), cont()), A.explain("n2"))).toBe(
      "explain must be for node n1",
    );
  });

  it("a choice check needs a correctIndex", () => {
    expect(
      checkAction(st(...toRead(), cont()), A.explain("n1", { ...choiceQ, correctIndex: null })),
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

describe("checkAnswer, learnedToSave and moveNotes", () => {
  const st = (...events: SessionEvent[]) => deriveState([...toTeach, ...events]);
  const eight = Array.from({ length: 8 }, () => [act(A.probe()), pick(1)]).flat();
  const answerOf = (e: SessionEvent): Answer => {
    if (e.kind !== "answer") throw new Error("not an answer");
    return e.answer;
  };
  const pickAnswer = (i: number) => answerOf(pick(i));
  const sayAnswer = (t: string) => answerOf(say(t));

  it("checkAnswer refuses when no question is waiting", () => {
    expect(checkAnswer(deriveState([]), pickAnswer(0))).toBe(
      "No question is waiting for an answer.",
    );
  });

  it("checkAnswer needs a valid option for a choice question", () => {
    const state = deriveState([act(A.probe())]);
    expect(checkAnswer(state, { ...pickAnswer(0), choiceIndex: null })).toBe("Pick an option.");
    expect(checkAnswer(state, pickAnswer(3))).toBe("Pick an option.");
    expect(checkAnswer(state, pickAnswer(1))).toBeNull();
  });

  it("checkAnswer needs text for a text question", () => {
    const state = st(act(A.predict("n1")));
    expect(checkAnswer(state, sayAnswer("  "))).toBe("Write an answer.");
    expect(checkAnswer(state, sayAnswer("x".repeat(4001)))).toBe("Write an answer.");
    expect(checkAnswer(state, sayAnswer("ok"))).toBeNull();
  });

  it("lesson_done_saves_only_passed", () => {
    const events = [
      ...toTeach,
      ...toCheck("n1"),
      pick(1),
      ...toCheck("n2"),
      pick(0),
      act(A.explain("n2")),
      pick(0),
      act(A.explain("n2")),
      pick(0),
      act(A.done()),
    ];
    expect(learnedToSave(deriveState(events), A.done() as any)).toEqual([
      { nodeId: "n1", text: "t1" },
    ]);
  });

  it("moveNotes tells the model to conclude after 8 probe answers", () => {
    expect(moveNotes(deriveState(eight))).toEqual([
      "You have asked 8 questions. You must return probe_done now.",
    ]);
  });

  it("moveNotes lists the nodes that can start", () => {
    expect(moveNotes(st())).toEqual([
      "Start the next node with a predict question. Nodes that can start now: n1.",
    ]);
  });

  it("moveNotes asks for a repair after a failed check", () => {
    expect(moveNotes(st(...toCheck("n1"), pick(0)))).toEqual([
      "The learner failed the check on node n1 (failure 1 of 3). Explain node n1 again from a different angle that targets their mistake, with a new check question.",
    ]);
  });

  it("moveNotes flags the last attempt on a text check", () => {
    expect(
      moveNotes(
        st(
          ...toCheck("n1"),
          pick(0),
          act(A.explain("n1")),
          pick(0),
          act(A.explain("n1", textQ)),
          say(),
        ),
      ),
    ).toEqual([
      "The learner's last answer is a free-text check on node n1, and it was their last attempt. Set verdict, then move on: predict for another node, or lesson_done if none remain.",
    ]);
  });
});

describe("hardening: rules without a test before", () => {
  const st = (...events: SessionEvent[]) => deriveState([...toTeach, ...events]);

  it("moveNotes asks for the plan", () => {
    expect(moveNotes(deriveState(toPlan))).toEqual([
      "Return the plan: 2 to 12 nodes, each one idea, deps listing the nodes it builds on.",
    ]);
  });

  it("moveNotes says to finish when every node is settled", () => {
    expect(moveNotes(st(...toCheck("n1"), pick(1), ...toCheck("n2"), pick(1)))).toEqual([
      "Every node is passed or shaky. Return lesson_done.",
    ]);
  });

  it("moveNotes asks for an explanation after a predict", () => {
    expect(moveNotes(st(...toRead(), cont()))).toEqual([
      "Add a short bridge (under 150 words) for node n1 that fills what the reading left open, and include a check question.",
    ]);
  });

  it("moveNotes asks for a verdict on the first text check", () => {
    expect(moveNotes(st(...toCheck("n1", textQ), say()))).toEqual([
      "The learner's last answer is a free-text check on node n1. Set verdict. If pass, continue with the next step. If fail, explain node n1 again from a different angle with a new check question.",
    ]);
  });

  it("checkAction rejects an empty goal", () => {
    expect(
      checkAction(deriveState([act(A.probe()), pick(1)]), { ...A.probeDone(), goal: "  " } as any),
    ).toBe("goal is empty");
  });

  it("checkAction rejects a predict for a node that is already passed", () => {
    expect(checkAction(st(...toCheck("n1"), pick(1)), A.predict("n1"))).toBe(
      "node n1 cannot start now",
    );
  });

  it("a text check on the last node allows lesson_done with a verdict", () => {
    const state = st(...toCheck("n1"), pick(1), ...toCheck("n2", textQ), say());
    expect(checkAction(state, A.done("pass"))).toBeNull();
    expect(checkAction(state, A.done(null))).toBe("verdict is required");
  });

  it("deriveState throws on an action while the learner is meant to answer", () => {
    expect(() => deriveState([act(A.probe()), act(A.probe())])).toThrow(
      "corrupt session at event 1",
    );
  });

  it("deriveState throws on a null verdict after a text check", () => {
    expect(() =>
      deriveState([...toTeach, ...toCheck("n1", textQ), say(), act(A.predict("n2"))]),
    ).toThrow("corrupt session at event 10");
  });

  it("learnedToSave drops items with empty text", () => {
    const state = st(...toCheck("n1"), pick(1));
    const action = {
      ...A.done(),
      learned: [
        { nodeId: "n1", text: "  " },
        { nodeId: "n1", text: "ok" },
      ],
    } as Extract<ReturnType<typeof A.done>, { type: "lesson_done" }>;
    expect(learnedToSave(state, action)).toEqual([{ nodeId: "n1", text: "ok" }]);
  });
});

describe("deriveState and rules: the teach step", () => {
  const st = (...events: SessionEvent[]) => deriveState([...toTeach, ...events]);
  const answerOf = (e: SessionEvent): Answer => {
    if (e.kind !== "answer") throw new Error("not an answer");
    return e.answer;
  };

  it("predict answer leads to need_teach", () => {
    const r = deriveState([...toTeach, act(A.predict()), say()]);
    expect(r.teachStep).toBe("need_teach");
    expect(r.awaiting).toEqual({ who: "model" });
  });

  it("teach asks the learner to read", () => {
    const r = deriveState([...toTeach, ...toRead()]);
    expect(r.awaiting).toMatchObject({
      who: "learner",
      purpose: "read",
      question: null,
      nodeId: "n1",
    });
  });

  it("continue after teach leads to need_explain", () => {
    const r = deriveState([...toTeach, ...toRead(), cont()]);
    expect(r.teachStep).toBe("need_explain");
    expect(r.awaiting).toEqual({ who: "model" });
  });

  it("teach is allowed only after a predict", () => {
    const state = st(act(A.predict("n1")), say());
    expect(allowedActions(state)).toEqual(["teach"]);
    expect(checkAction(state, A.explain("n1"))).toBe("explain is not allowed now");
    expect(checkAction(st(), A.teach("n1"))).toBe("teach is not allowed now");
  });

  it("teach must be for the current node", () => {
    const state = st(act(A.predict("n1")), say());
    expect(checkAction(state, A.teach("n2"))).toBe("teach must be for node n1");
  });

  it("teach needs a non-empty reading", () => {
    const state = st(act(A.predict("n1")), say());
    expect(checkAction(state, { ...A.teach("n1"), markdown: "  " } as Action)).toBe(
      "reading is empty",
    );
  });

  it("checkAnswer accepts continue for a reading", () => {
    const state = st(...toRead());
    expect(checkAnswer(state, answerOf(cont()))).toBeNull();
    expect(checkAnswer(state, answerOf(say("x")))).toBe("Press Continue.");
    expect(checkAnswer(state, answerOf(pick(0)))).toBe("Press Continue.");
  });

  it("moveNotes asks for a reading in need_teach", () => {
    expect(moveNotes(st(act(A.predict("n1")), say()))).toEqual([
      "Write the reading for node n1: the whole idea derived step by step from what the learner holds, with at least one worked example, 500 to 1000 words. Do not ask a question yet.",
    ]);
  });
});

describe("validateProfile", () => {
  it("validateProfile accepts blank and 2000 characters, rejects 2001", () => {
    expect(validateProfile("")).toBeNull();
    expect(validateProfile("a".repeat(2000))).toBeNull();
    expect(validateProfile("a".repeat(2001))).toBe("Keep it under 2000 characters.");
  });
});
