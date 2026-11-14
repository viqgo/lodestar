// @vitest-environment jsdom
import "../helpers/dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Sidebar } from "../../src/renderer/src/components/Sidebar";
import type { SessionSummary } from "../../src/shared/types";

const NOW = new Date("2026-03-03T12:00:00.000Z");
const sessions: SessionSummary[] = [
  { id: "s_1", topic: "Derivatives", phase: "teach", updatedAt: "2026-03-03T10:00:00.000Z" },
];

function setup(over: Partial<Parameters<typeof Sidebar>[0]> = {}) {
  const props = {
    sessions,
    activeId: null,
    onNew: vi.fn(),
    onOpen: vi.fn(),
    onDelete: vi.fn(),
    onKnowledge: vi.fn(),
    newDisabled: false,
    ...over,
  };
  const user = userEvent.setup();
  const view = render(<Sidebar {...props} />);
  return { props, user, view };
}

describe("Sidebar", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("Sidebar shows the empty text", () => {
    setup({ sessions: [] });
    expect(screen.getByText("No lessons yet.")).toBeInTheDocument();
  });
  it("Sidebar lists lessons with phase and age", () => {
    setup();
    expect(screen.getByText("Derivatives")).toBeInTheDocument();
    expect(screen.getByText("teaching · 2h ago")).toBeInTheDocument();
  });
  it("Sidebar marks the active lesson", () => {
    setup({ activeId: "s_1" });
    expect(screen.getByText("Derivatives").closest(".lesson-row")).toHaveClass("is-active");
  });
  it("Sidebar opens a lesson on click", async () => {
    const { props, user } = setup();
    await user.click(screen.getByText("Derivatives"));
    expect(props.onOpen).toHaveBeenCalledWith("s_1");
  });
  it("Sidebar deletes only after confirming", async () => {
    const { props, user } = setup();
    await user.click(screen.getByRole("button", { name: "Delete lesson" }));
    expect(screen.getByText("Delete this lesson? This cannot be undone.")).toBeInTheDocument();
    expect(props.onDelete).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(props.onDelete).toHaveBeenCalledTimes(1);
    expect(props.onDelete).toHaveBeenCalledWith("s_1");
    expect(props.onOpen).not.toHaveBeenCalled();
  });
  it("Sidebar keeps the lesson when cancelled", async () => {
    const { props, user } = setup();
    await user.click(screen.getByRole("button", { name: "Delete lesson" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(props.onDelete).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("Sidebar buttons call back and respect newDisabled", async () => {
    const { props, user, view } = setup();
    await user.click(screen.getByRole("button", { name: "New lesson" }));
    await user.click(screen.getByRole("button", { name: "Knowledge" }));
    expect(props.onNew).toHaveBeenCalledTimes(1);
    expect(props.onKnowledge).toHaveBeenCalledTimes(1);
    view.rerender(<Sidebar {...props} newDisabled={true} />);
    expect(screen.getByRole("button", { name: "New lesson" })).toBeDisabled();
  });
  it("Sidebar lets a lesson be opened with the keyboard", async () => {
    const { props, user } = setup();
    for (let i = 0; i < 3; i++) {
      if (screen.getByRole("button", { name: /Derivatives/ }) === document.activeElement) break;
      await user.tab();
    }
    expect(screen.getByRole("button", { name: /Derivatives/ })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(props.onOpen).toHaveBeenCalledTimes(1);
    expect(props.onOpen).toHaveBeenCalledWith("s_1");
  });
});
