import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { NodeState, PlanNode } from "../../src/shared/types";
import { planToMermaid } from "../../src/renderer/src/lib/planGraph";

const PLAN: PlanNode[] = [
  { id: "n1", title: "One", deps: [] },
  { id: "n2", title: "Two", deps: ["n1"] },
];
const todo: NodeState = { status: "todo", fails: 0 };
const passed: NodeState = { status: "passed", fails: 0 };
const shaky: NodeState = { status: "shaky", fails: 0 };

describe("planToMermaid", () => {
  it("planToMermaid draws nodes and edges", () => {
    const lines = planToMermaid(PLAN, { n1: todo, n2: todo }, null).split("\n");
    expect(lines[0]).toBe("graph TD");
    expect(lines).toContain('  n0["One"]:::todo');
    expect(lines).toContain('  n1["Two"]:::todo');
    expect(lines).toContain("  n0 --> n1");
  });

  it("the current node gets the current class", () => {
    const lines = planToMermaid(PLAN, { n1: todo, n2: todo }, "n1").split("\n");
    expect(lines).toContain('  n0["One"]:::current');
    expect(lines).toContain('  n1["Two"]:::todo');
  });

  it("passed and shaky nodes carry a symbol and their class", () => {
    const lines = planToMermaid(PLAN, { n1: passed, n2: shaky }, null).split("\n");
    expect(lines).toContain('  n0["✓ One"]:::passed');
    expect(lines).toContain('  n1["~ Two"]:::shaky');
  });

  it("titles are escaped", () => {
    const plan: PlanNode[] = [{ id: "n1", title: 'Say "hi" <b>', deps: [] }];
    const lines = planToMermaid(plan, { n1: todo }, null).split("\n");
    expect(lines).toContain('  n0["Say #quot;hi#quot; #lt;b#gt;"]:::todo');
  });

  it("class colors equal the design tokens", () => {
    const tokens = fs
      .readFileSync(path.join(process.cwd(), "src/renderer/src/styles/tokens.css"), "utf8")
      .toLowerCase();
    const out = planToMermaid(PLAN, { n1: todo, n2: todo }, null);
    const colors = out.match(/#[0-9a-fA-F]{6}\b/g) ?? [];
    expect(colors.length).toBeGreaterThan(0);
    for (const c of colors) expect(tokens).toContain(c.toLowerCase());
  });

  it("node ids do not leak into the graph", () => {
    const plan: PlanNode[] = [
      { id: "a-b", title: "One", deps: [] },
      { id: "c-d", title: "Two", deps: ["a-b"] },
    ];
    const out = planToMermaid(plan, { "a-b": todo, "c-d": todo }, null);
    expect(out).not.toContain("a-b");
    expect(out).not.toContain("c-d");
  });
});
