import { useEffect, useState } from "react";
import type { MouseEvent } from "react";
import { graphToMermaid } from "../../../core/graph";
import type { GraphData, GraphGroup, GraphNode } from "../../../shared/types";
import { dateLabel } from "../lib/time";

let initialized = false;
let counter = 0;

function ordered(groups: GraphGroup[]): { subject: string | null; group: GraphGroup }[] {
  const out: { subject: string | null; group: GraphGroup }[] = [];
  const seen = new Set<string>();
  for (const g of groups) {
    if (g.subject === null) {
      out.push({ subject: null, group: g });
      continue;
    }
    if (seen.has(g.subject)) continue;
    seen.add(g.subject);
    groups
      .filter((h) => h.subject === g.subject)
      .forEach((h, i) => out.push({ subject: i === 0 ? g.subject : null, group: h }));
  }
  return out;
}

export function GraphScreen() {
  const [data, setData] = useState<GraphData | null>(null);
  const [svg, setSvg] = useState<string | null>(null);
  const [selected, setSelected] = useState<GraphNode | null>(null);

  useEffect(() => {
    let cancelled = false;
    void window.api.getGraph().then((graph) => {
      if (!cancelled) setData(graph);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const nodes = data === null ? [] : data.groups.flatMap((g) => g.nodes);
  const text = data !== null && nodes.length > 0 ? graphToMermaid(data) : null;

  useEffect(() => {
    if (text === null) return;
    let cancelled = false;
    void import("mermaid").then(async ({ default: mermaid }) => {
      if (!initialized) {
        initialized = true;
        mermaid.initialize({
          startOnLoad: false,
          suppressErrorRendering: true,
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
        const { svg: drawn } = await mermaid.render("lh-graph-" + ++counter, text);
        if (!cancelled) setSvg(drawn);
      } catch {
        if (!cancelled) setSvg(null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [text]);

  const pick = (event: MouseEvent) => {
    const el = (event.target as Element).closest("g.node");
    const m = el === null ? null : /flowchart-k(\d+)-\d+$/.exec(el.id);
    if (m !== null) setSelected(nodes[Number(m[1])] ?? null);
  };

  return (
    <div className="content">
      <h3>Graph</h3>
      {data !== null && nodes.length === 0 ? (
        <p className="note">
          Nothing here yet. Finish a lesson and what you learned will appear here.
        </p>
      ) : null}
      {svg ? (
        <div className="plan-map" onClick={pick} dangerouslySetInnerHTML={{ __html: svg }} />
      ) : data !== null && nodes.length > 0 ? (
        <div>
          {ordered(data.groups).map(({ subject, group }) => (
            <div key={group.sessionId}>
              {subject !== null ? <span className="label">{subject}</span> : null}
              <span className="label">{group.title}</span>
              {group.nodes.map((node) => (
                <button key={node.id} className="btn" onClick={() => setSelected(node)}>
                  <span className={"box-" + node.box}>{node.box}</span>
                  {" · " + node.text}
                </button>
              ))}
            </div>
          ))}
        </div>
      ) : null}
      {selected !== null ? (
        <div className="summary">
          <p>{selected.text}</p>
          <p className="note">
            <span className={"box-" + selected.box}>box {selected.box}</span>
            {" · Due: " + dateLabel(selected.due)}
          </p>
        </div>
      ) : null}
    </div>
  );
}
