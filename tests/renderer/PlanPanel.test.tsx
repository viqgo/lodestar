// @vitest-environment jsdom
import "../helpers/dom";
import { render, screen, waitFor } from "@testing-library/react";
import mermaid from "mermaid";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PlanPanel } from "../../src/renderer/src/components/PlanPanel";
import { planToMermaid } from "../../src/renderer/src/lib/planGraph";
import type { NodeState } from "../../src/shared/types";
import { PLAN } from "../helpers/fixtures";

vi.mock("mermaid", () => ({ default: { initialize: vi.fn(), render: vi.fn() } }));

const nodes: Record<string, NodeState> = {
  n1: { status: "passed", fails: 0 },
  n2: { status: "todo", fails: 0 },
};

describe("PlanPanel", () => {
  beforeEach(() => {
    vi.mocked(mermaid.render).mockReset();
    vi.mocked(mermaid.render).mockResolvedValue({
      svg: '<svg data-testid="map"></svg>',
      diagramType: "flowchart",
    });
  });

  it("PlanPanel shows its heading", () => {
    render(<PlanPanel plan={PLAN} nodes={nodes} currentNodeId="n2" />);
    expect(screen.getByText("Lesson map")).toBeInTheDocument();
  });

  it("PlanPanel shows the plain list until the map is ready", () => {
    render(<PlanPanel plan={PLAN} nodes={nodes} currentNodeId="n2" />);
    expect(screen.getByRole("list")).toBeInTheDocument();
    expect(screen.getByText(/One/)).toBeVisible();
    expect(screen.getByText(/Two/)).toBeVisible();
  });

  it("PlanPanel shows the drawn map when ready", async () => {
    render(<PlanPanel plan={PLAN} nodes={nodes} currentNodeId="n2" />);
    expect(await screen.findByTestId("map")).toBeInTheDocument();
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("PlanPanel draws what planToMermaid says", async () => {
    render(<PlanPanel plan={PLAN} nodes={nodes} currentNodeId="n1" />);
    await screen.findByTestId("map");
    expect(vi.mocked(mermaid.render).mock.calls[0][1]).toBe(planToMermaid(PLAN, nodes, "n1"));
  });

  it("PlanPanel falls back to the list when drawing fails", async () => {
    vi.mocked(mermaid.render).mockRejectedValue(new Error("bad"));
    const { container } = render(<PlanPanel plan={PLAN} nodes={nodes} currentNodeId="n2" />);
    await waitFor(() => expect(vi.mocked(mermaid.render)).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText("✓ One")).toBeInTheDocument());
    expect(container.querySelector("svg")).toBeNull();
  });

  it("PlanPanel fallback shows a passed current node as passed", async () => {
    vi.mocked(mermaid.render).mockRejectedValue(new Error("bad"));
    render(<PlanPanel plan={PLAN} nodes={nodes} currentNodeId="n1" />);
    await waitFor(() => expect(vi.mocked(mermaid.render)).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText("✓ One")).toBeInTheDocument());
    expect(screen.queryByText("→ One")).toBeNull();
  });
});
