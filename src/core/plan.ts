import { PLAN_MAX, PLAN_MIN } from "../shared/limits";
import type { NodeState, PlanNode } from "../shared/types";

export function validatePlan(nodes: PlanNode[]): string | null {
  if (nodes.length < PLAN_MIN || nodes.length > PLAN_MAX) {
    return `plan must have ${PLAN_MIN} to ${PLAN_MAX} nodes`;
  }
  if (nodes.some((x) => x.id === "" || x.title === "")) return "empty id or title";
  const ids = new Set<string>();
  for (const x of nodes) {
    if (ids.has(x.id)) return "duplicate node id: " + x.id;
    ids.add(x.id);
  }
  for (const x of nodes) {
    if (x.deps.includes(x.id)) return "node depends on itself: " + x.id;
  }
  for (const x of nodes) {
    for (const d of x.deps) {
      if (!ids.has(d)) return "unknown dep: " + d;
    }
  }
  const removed = new Set<string>();
  let remaining = nodes;
  while (remaining.length > 0) {
    const next = remaining.filter((x) => !x.deps.every((d) => removed.has(d)));
    if (next.length === remaining.length) return "plan has a cycle";
    for (const x of remaining) {
      if (x.deps.every((d) => removed.has(d))) removed.add(x.id);
    }
    remaining = next;
  }
  return null;
}

export function eligibleNodes(plan: PlanNode[], nodes: Record<string, NodeState>): string[] {
  return plan
    .filter(
      (x) =>
        nodes[x.id]?.status === "todo" &&
        x.deps.every((d) => nodes[d]?.status === "passed" || nodes[d]?.status === "shaky"),
    )
    .map((x) => x.id);
}

export function allNodesSettled(nodes: Record<string, NodeState>): boolean {
  return Object.values(nodes).every((s) => s.status !== "todo");
}
