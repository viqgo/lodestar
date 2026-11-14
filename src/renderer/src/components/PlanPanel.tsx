import { useEffect, useState } from "react";
import type { NodeState, PlanNode } from "../../../shared/types";
import { planToMermaid } from "../lib/planGraph";

let initialized = false;
let counter = 0;

function prefix(id: string, nodes: Record<string, NodeState>, currentNodeId: string | null) {
  if (id === currentNodeId) return "→ ";
  const status = nodes[id]?.status;
  if (status === "passed") return "✓ ";
  if (status === "shaky") return "~ ";
  return "";
}

export function PlanPanel(props: {
  plan: PlanNode[];
  nodes: Record<string, NodeState>;
  currentNodeId: string | null;
}) {
  const [svg, setSvg] = useState<string | null>(null);
  const text = planToMermaid(props.plan, props.nodes, props.currentNodeId);

  useEffect(() => {
    let cancelled = false;
    void import("mermaid").then(async ({ default: mermaid }) => {
      if (!initialized) {
        initialized = true;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: "base",
          themeVariables: {
            background: "#0e0e0f",
            primaryColor: "#17181a",
            primaryTextColor: "#ececec",
            primaryBorderColor: "#2c2d31",
            lineColor: "#8b8d93",
            fontFamily: "system-ui, sans-serif",
          },
        });
      }
      try {
        const { svg: drawn } = await mermaid.render("lh-plan-" + ++counter, text);
        if (!cancelled) setSvg(drawn);
      } catch {
        if (!cancelled) setSvg(null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [text]);

  return (
    <aside className="plan">
      <span className="label">Lesson map</span>
      {svg ? (
        <div className="plan-map" dangerouslySetInnerHTML={{ __html: svg }} />
      ) : (
        <ul>
          {props.plan.map((n) => (
            <li key={n.id}>{prefix(n.id, props.nodes, props.currentNodeId) + n.title}</li>
          ))}
        </ul>
      )}
    </aside>
  );
}
