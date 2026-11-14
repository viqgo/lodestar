import { describe, expect, it } from "vitest";
import { graphToMermaid, knowledgeGraph } from "../../src/core/graph";
import {
  A,
  AT,
  K,
  act,
  pick,
  readySubject,
  review,
  session,
  subject,
  toCheck,
  toTeach,
} from "../helpers/fixtures";

const S2 = "s_00000002-0000-0000-0000-000000000000";
const done = [...toTeach, ...toCheck("n1"), pick(1), ...toCheck("n2"), pick(1), act(A.done())];
const sessions = [
  { ...session(done), subjectId: subject().id, unitId: "u1" },
  { ...session(done), id: S2, topic: 'Say "hi" <b>' },
];
const items = [K(1), K(2), K(3, { sessionId: S2 }), K(4, { sessionId: "s_gone" })];
const reviews = [review(2, { box: 3, due: "2026-02-01T00:00:00.000Z" })];
const data = () => knowledgeGraph(items, reviews, sessions, [subject(readySubject)]);

const CLASSES = [
  "  classDef box1 fill:#17181a,stroke:#f0736a,color:#ececec",
  "  classDef box2 fill:#17181a,stroke:#e8b84a,color:#ececec",
  "  classDef box3 fill:#17181a,stroke:#e8b84a,color:#ececec",
  "  classDef box4 fill:#17181a,stroke:#6fcf8e,color:#ececec",
  "  classDef box5 fill:#17181a,stroke:#6fcf8e,color:#ececec",
];

describe("graph", () => {
  it("graph_groups_by_lesson_and_subject", () => {
    const g = data().groups;
    expect(g.map((x) => [x.title, x.subject, x.nodes.map((n) => n.id)])).toEqual([
      ["T", "Course", [K(1).id, K(2).id]],
      ['Say "hi" <b>', null, [K(3).id]],
      ["Deleted lesson", null, [K(4).id]],
    ]);
    expect(g.map((x) => x.sessionId)).toEqual([sessions[0]!.id, S2, "s_gone"]);
    for (const n of g.flatMap((x) => x.nodes)) {
      const item = items.find((i) => i.id === n.id)!;
      expect(n.text).toBe(item.text);
      expect(n.sessionId).toBe(item.sessionId);
    }
  });

  it("graph_arrows_follow_plan_deps", () => {
    expect(data().edges).toEqual([{ from: K(2).id, to: K(1).id }]);
  });

  it("knowledgeGraph gives an item without a review box one, due since it was created", () => {
    const nodes = data().groups[0]!.nodes;
    expect(nodes[0]).toMatchObject({ box: 1, due: AT });
    expect(nodes[1]).toMatchObject({ box: 3, due: "2026-02-01T00:00:00.000Z" });
  });

  it("knowledgeGraph draws no arrows for a lesson that cannot be read", () => {
    const broken = [{ ...sessions[0]!, events: [pick(0)] }, sessions[1]!];
    const d = knowledgeGraph(items, reviews, broken, [subject(readySubject)]);
    expect(d.groups).toEqual(data().groups);
    expect(d.edges).toEqual([]);
  });

  it("knowledgeGraph is empty without items", () => {
    const d = knowledgeGraph([], [], sessions, []);
    expect(d).toEqual({ groups: [], edges: [] });
    expect(graphToMermaid(d)).toBe(["graph TD", ...CLASSES].join("\n"));
  });

  it("graphToMermaid draws subjects, lessons, box marks and arrows", () => {
    expect(graphToMermaid(data())).toBe(
      [
        "graph TD",
        '  subgraph s0["Course"]',
        '    subgraph g0["T"]',
        '      k0["1 · t1"]:::box1',
        '      k1["3 · t2"]:::box3',
        "    end",
        "  end",
        '  subgraph g1["Say #quot;hi#quot; #lt;b#gt;"]',
        '    k2["1 · t3"]:::box1',
        "  end",
        '  subgraph g2["Deleted lesson"]',
        '    k3["1 · t4"]:::box1',
        "  end",
        "  k1 --> k0",
        ...CLASSES,
      ].join("\n"),
    );
  });

  it("graph labels cannot carry a directive or an entity", () => {
    const d = knowledgeGraph([K(1, { text: "a%%b #lt; c" })], [], sessions, []);
    expect(graphToMermaid(d)).toContain('k0["1 · a#37;#37;b #35;lt; c"]:::box1');
  });

  it("graphToMermaid keeps every label on one line", () => {
    const d = knowledgeGraph([K(1, { text: 'a"b\nc' })], [], sessions, []);
    const text = graphToMermaid(d);
    expect(text).toContain('k0["1 · a#quot;b?c"]:::box1');
    for (const line of text.split("\n")) expect(/^(graph| {2})/.test(line)).toBe(true);
  });
});
