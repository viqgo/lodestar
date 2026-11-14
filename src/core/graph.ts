import { newReview } from "./review";
import { deriveState } from "./engine";
import { plain } from "./material";
import type {
  GraphData,
  GraphGroup,
  KnowledgeItem,
  PlanNode,
  Review,
  Session,
  Subject,
} from "../shared/types";

export function knowledgeGraph(
  items: KnowledgeItem[],
  reviews: Review[],
  sessions: Session[],
  subjects: Subject[],
): GraphData {
  const groups = new Map<string, GraphGroup>();
  for (const item of items) {
    let group = groups.get(item.sessionId);
    if (!group) {
      const lesson = sessions.find((s) => s.id === item.sessionId);
      const subject = lesson ? subjects.find((u) => u.id === lesson.subjectId) : undefined;
      group = {
        sessionId: item.sessionId,
        title: lesson ? lesson.topic : "Deleted lesson",
        subject: subject ? subject.name : null,
        nodes: [],
      };
      groups.set(item.sessionId, group);
    }
    const r = reviews.find((x) => x.itemId === item.id) ?? newReview(item.id, item.createdAt);
    group.nodes.push({
      id: item.id,
      text: item.text,
      box: r.box,
      due: r.due,
      sessionId: item.sessionId,
    });
  }
  const edges: GraphData["edges"] = [];
  for (const group of groups.values()) {
    const lesson = sessions.find((s) => s.id === group.sessionId);
    if (!lesson) continue;
    let plan: PlanNode[] | null;
    try {
      plan = deriveState(lesson.events).plan;
    } catch {
      plan = null;
    }
    if (!plan) continue;
    const own = items.filter((i) => i.sessionId === group.sessionId);
    for (const item of own) {
      const node = plan.find((p) => p.id === item.nodeId);
      if (!node) continue;
      for (const dep of node.deps) {
        for (const target of own) {
          if (target.nodeId === dep) edges.push({ from: item.id, to: target.id });
        }
      }
    }
  }
  return { groups: [...groups.values()], edges };
}

const esc = (s: string): string =>
  plain(s)
    .replace(/#/g, "#35;")
    .replace(/%/g, "#37;")
    .replace(/"/g, "#quot;")
    .replace(/</g, "#lt;")
    .replace(/>/g, "#gt;");

export function graphToMermaid(data: GraphData): string {
  const ids = new Map<string, string>();
  data.groups.flatMap((g) => g.nodes).forEach((n, i) => ids.set(n.id, "k" + i));
  const lines = ["graph TD"];
  const drawGroup = (g: GraphGroup, i: number, pad: string): void => {
    lines.push(`${pad}subgraph g${i}["${esc(g.title)}"]`);
    for (const n of g.nodes) {
      lines.push(`${pad}  ${ids.get(n.id)}["${n.box} · ${esc(n.text)}"]:::box${n.box}`);
    }
    lines.push(`${pad}end`);
  };
  const drawn = new Set<string>();
  data.groups.forEach((g, i) => {
    if (g.subject === null) {
      drawGroup(g, i, "  ");
      return;
    }
    if (drawn.has(g.subject)) return;
    lines.push(`  subgraph s${drawn.size}["${esc(g.subject)}"]`);
    drawn.add(g.subject);
    data.groups.forEach((h, j) => {
      if (h.subject === g.subject) drawGroup(h, j, "    ");
    });
    lines.push("  end");
  });
  for (const e of data.edges) {
    const from = ids.get(e.from);
    const to = ids.get(e.to);
    if (from && to) lines.push(`  ${from} --> ${to}`);
  }
  lines.push("  classDef box1 fill:#17181a,stroke:#f0736a,color:#ececec");
  lines.push("  classDef box2 fill:#17181a,stroke:#e8b84a,color:#ececec");
  lines.push("  classDef box3 fill:#17181a,stroke:#e8b84a,color:#ececec");
  lines.push("  classDef box4 fill:#17181a,stroke:#6fcf8e,color:#ececec");
  lines.push("  classDef box5 fill:#17181a,stroke:#6fcf8e,color:#ececec");
  return lines.join("\n");
}
