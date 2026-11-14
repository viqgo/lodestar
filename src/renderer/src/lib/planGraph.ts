import type { NodeState, PlanNode } from "../../../shared/types";

function escapeTitle(title: string): string {
  return title.replace(/"/g, "#quot;").replace(/</g, "#lt;").replace(/>/g, "#gt;");
}

export function planToMermaid(
  plan: PlanNode[],
  nodes: Record<string, NodeState>,
  currentNodeId: string | null,
): string {
  const lines: string[] = ["graph TD"];
  plan.forEach((node, i) => {
    const status = nodes[node.id]?.status ?? "todo";
    const cls = node.id === currentNodeId && status === "todo" ? "current" : status;
    const prefix = status === "passed" ? "✓ " : status === "shaky" ? "~ " : "";
    lines.push(`  n${i}["${prefix}${escapeTitle(node.title)}"]:::${cls}`);
  });
  plan.forEach((node, i) => {
    for (const dep of node.deps) {
      const j = plan.findIndex((p) => p.id === dep);
      if (j >= 0) lines.push(`  n${j} --> n${i}`);
    }
  });
  lines.push(
    "  classDef todo fill:#17181a,stroke:#2c2d31,color:#ececec",
    "  classDef current fill:#17181a,stroke:#e8b84a,stroke-width:2px,color:#e8b84a",
    "  classDef passed fill:#17181a,stroke:#6fcf8e,color:#ececec",
    "  classDef shaky fill:#17181a,stroke:#e8b84a,stroke-dasharray:4 3,color:#ececec",
  );
  return lines.join("\n");
}
