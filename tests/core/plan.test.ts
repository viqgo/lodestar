import { describe, expect, it } from "vitest";
import { allNodesSettled, eligibleNodes, validatePlan } from "../../src/core/plan";
import { PLAN } from "../helpers/fixtures";
import type { NodeState, PlanNode } from "../../src/shared/types";

const n = (id: string, deps: string[] = []): PlanNode => ({ id, title: id.toUpperCase(), deps });
const todo: NodeState = { status: "todo", fails: 0 };
const passed: NodeState = { status: "passed", fails: 0 };
const shaky: NodeState = { status: "shaky", fails: 0 };

describe("validatePlan", () => {
  it("accepts a valid plan", () => {
    expect(validatePlan(PLAN)).toBeNull();
  });

  it("plan_rejects_size_out_of_range", () => {
    expect(validatePlan([n("a")])).toBe("plan must have 2 to 12 nodes");
    const many = Array.from({ length: 13 }, (_, i) => n("x" + i));
    expect(validatePlan(many)).toBe("plan must have 2 to 12 nodes");
  });

  it("rejects a duplicate id", () => {
    expect(validatePlan([n("a"), n("a")])).toBe("duplicate node id: a");
  });

  it("rejects an empty id or title", () => {
    expect(validatePlan([n("a"), { id: "b", title: "", deps: [] }])).toBe("empty id or title");
  });

  it("plan_rejects_unknown_dep", () => {
    expect(validatePlan([n("a"), n("b", ["zz"])])).toBe("unknown dep: zz");
  });

  it("rejects a node that depends on itself", () => {
    expect(validatePlan([n("a"), n("b", ["b"])])).toBe("node depends on itself: b");
  });

  it("plan_rejects_cycle", () => {
    expect(validatePlan([n("a", ["c"]), n("b", ["a"]), n("c", ["b"])])).toBe("plan has a cycle");
  });
});

describe("eligibleNodes", () => {
  it("eligibleNodes lists todo nodes whose deps are settled", () => {
    expect(eligibleNodes(PLAN, { n1: todo, n2: todo })).toEqual(["n1"]);
    expect(eligibleNodes(PLAN, { n1: passed, n2: todo })).toEqual(["n2"]);
    expect(eligibleNodes(PLAN, { n1: shaky, n2: todo })).toEqual(["n2"]);
  });
});

describe("allNodesSettled", () => {
  it("allNodesSettled is true only when no node is todo", () => {
    expect(allNodesSettled({ n1: passed, n2: todo })).toBe(false);
    expect(allNodesSettled({ n1: passed, n2: shaky })).toBe(true);
  });
});
