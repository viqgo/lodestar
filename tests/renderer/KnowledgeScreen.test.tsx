// @vitest-environment jsdom
import "../helpers/dom";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KnowledgeScreen } from "../../src/renderer/src/components/KnowledgeScreen";
import type { KnowledgeView } from "../../src/shared/types";
import { installApi } from "../helpers/dom";

const NOW = new Date("2026-03-03T12:00:00.000Z");
const TWO_HOURS_AGO = "2026-03-03T10:00:00.000Z";

function item(over: Partial<KnowledgeView>): KnowledgeView {
  return {
    id: "k_1",
    text: "The derivative is the limit of average slopes",
    sessionId: "s",
    nodeId: "n1",
    createdAt: TWO_HOURS_AGO,
    lessonTopic: "Derivatives",
    ...over,
  };
}

beforeEach(() => {
  // Fake only Date: faking setTimeout too hangs userEvent in this setup.
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("KnowledgeScreen", () => {
  it("KnowledgeScreen shows its title and intro", async () => {
    installApi({ listKnowledge: async () => [] });
    render(<KnowledgeScreen />);
    expect(screen.getByText("Knowledge")).toBeInTheDocument();
    expect(
      screen.getByText("What you have shown you understand. Later lessons start from here."),
    ).toBeInTheDocument();
  });

  it("KnowledgeScreen shows the empty text", async () => {
    installApi({ listKnowledge: async () => [] });
    const { container } = render(<KnowledgeScreen />);
    expect(
      await screen.findByText(
        "Nothing here yet. Finish a lesson and what you learned will appear here.",
      ),
    ).toBeInTheDocument();
    expect(container.querySelectorAll(".k-row")).toHaveLength(0);
  });

  it("knowledge_listed_newest_first_with_source", async () => {
    const first = item({ id: "k_2", text: "Newest point" });
    const second = item({ id: "k_1", text: "Older point" });
    installApi({ listKnowledge: async () => [first, second] });
    const { container } = render(<KnowledgeScreen />);
    await waitFor(() => expect(container.querySelectorAll(".k-row")).toHaveLength(2));
    const rows = Array.from(container.querySelectorAll(".k-row")) as HTMLElement[];
    expect(rows[0]).toHaveTextContent("Newest point");
    expect(rows[1]).toHaveTextContent("Older point");
    for (const row of rows) {
      expect(within(row).getByText("Derivatives · 2h ago")).toBeInTheDocument();
    }
  });

  it("KnowledgeScreen names a deleted lesson", async () => {
    installApi({ listKnowledge: async () => [item({ lessonTopic: null })] });
    render(<KnowledgeScreen />);
    expect(await screen.findByText("Deleted lesson · 2h ago")).toBeInTheDocument();
  });

  it("knowledge_item_deleted", async () => {
    const a = item({ id: "k_a", text: "First point" });
    const b = item({ id: "k_b", text: "Second point" });
    const { api } = installApi();
    api.listKnowledge = vi.fn().mockResolvedValueOnce([a, b]).mockResolvedValueOnce([b]);
    api.deleteKnowledge = vi.fn(async () => undefined);
    const user = userEvent.setup();
    const { container } = render(<KnowledgeScreen />);
    await waitFor(() => expect(container.querySelectorAll(".k-row")).toHaveLength(2));

    await user.click(screen.getAllByLabelText("Delete item")[0]);

    await waitFor(() => expect(container.querySelectorAll(".k-row")).toHaveLength(1));
    expect(api.deleteKnowledge).toHaveBeenCalledWith("k_a");
    expect(api.listKnowledge).toHaveBeenCalledTimes(2);
    expect(container).not.toHaveTextContent("First point");
    expect(container).toHaveTextContent("Second point");
  });
});
