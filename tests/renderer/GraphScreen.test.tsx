// @vitest-environment jsdom
import "../helpers/dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import mermaid from "mermaid";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { graphToMermaid } from "../../src/core/graph";
import { GraphScreen } from "../../src/renderer/src/components/GraphScreen";
import { dateLabel } from "../../src/renderer/src/lib/time";
import type { GraphData, GraphNode } from "../../src/shared/types";
import { installApi } from "../helpers/dom";

vi.mock("mermaid", () => ({ default: { initialize: vi.fn(), render: vi.fn() } }));

const DUE = "2026-03-10T12:00:00.000Z";
const n1: GraphNode = { id: "k1", text: "first fact", box: 1, due: DUE, sessionId: "s1" };
const n2: GraphNode = { id: "k2", text: "second fact", box: 4, due: DUE, sessionId: "s1" };
const n3: GraphNode = { id: "k3", text: "third fact", box: 2, due: DUE, sessionId: "s2" };
const DATA: GraphData = {
  groups: [
    { sessionId: "s1", title: "Derivatives", subject: "Physics", nodes: [n1, n2] },
    { sessionId: "s2", title: "Limits", subject: null, nodes: [n3] },
  ],
  edges: [],
};

describe("GraphScreen", () => {
  beforeEach(() => {
    vi.mocked(mermaid.render).mockReset();
    installApi({ getGraph: vi.fn(async () => DATA) });
  });

  it("GraphScreen draws the map", async () => {
    vi.mocked(mermaid.render).mockResolvedValue({
      svg: '<svg data-testid="map"></svg>',
      diagramType: "flowchart",
    });
    render(<GraphScreen />);
    expect(await screen.findByTestId("map")).toBeInTheDocument();
    const call = vi.mocked(mermaid.render).mock.calls[0];
    expect(call[0].startsWith("lh-graph-")).toBe(true);
    expect(call[1]).toBe(graphToMermaid(DATA));
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("graph_falls_back_to_list", async () => {
    vi.mocked(mermaid.render).mockRejectedValue(new Error("bad"));
    render(<GraphScreen />);
    await screen.findByText("first fact", { exact: false });
    const labels = ["Physics", "Derivatives", "Limits"].map((t) => screen.getByText(t));
    const follows = (a: Node, b: Node) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(follows(labels[0], labels[1])).toBe(true);
    expect(follows(labels[1], labels[2])).toBe(true);
    expect(screen.getAllByRole("button")).toHaveLength(3);
    const mark = screen.getByText("4");
    expect(mark).toHaveClass("box-4");
    expect(mark.closest("button")).toHaveTextContent("second fact");
  });

  it("selecting an item shows its text and due date", async () => {
    vi.mocked(mermaid.render).mockRejectedValue(new Error("bad"));
    render(<GraphScreen />);
    const button = await screen.findByRole("button", { name: /first fact/ });
    expect(screen.queryByText(/Due:/)).toBeNull();
    await userEvent.click(button);
    expect(screen.getByText("box 1")).toBeInTheDocument();
    expect(screen.getByText("Due: " + dateLabel(DUE), { exact: false })).toBeInTheDocument();
    expect(screen.getAllByText("first fact").length).toBeGreaterThan(0);
  });

  it("a click on a node of the map selects its item", async () => {
    vi.mocked(mermaid.render).mockResolvedValue({
      svg: '<svg><g class="node" id="lh-graph-1-flowchart-k1-7"><text>x</text></g><g class="cluster" id="g0"><text>y</text></g></svg>',
      diagramType: "flowchart",
    });
    render(<GraphScreen />);
    await userEvent.click(await screen.findByText("y"));
    expect(screen.queryByText(/Due:/)).toBeNull();
    await userEvent.click(screen.getByText("x"));
    expect(screen.getByText("second fact")).toBeInTheDocument();
    expect(screen.getByText("Due: " + dateLabel(DUE), { exact: false })).toBeInTheDocument();
  });

  it("GraphScreen says when there is nothing", async () => {
    installApi({ getGraph: vi.fn(async () => ({ groups: [], edges: [] })) });
    render(<GraphScreen />);
    expect(
      await screen.findByText(
        "Nothing here yet. Finish a lesson and what you learned will appear here.",
      ),
    ).toBeInTheDocument();
    expect(mermaid.render).not.toHaveBeenCalled();
  });
});
