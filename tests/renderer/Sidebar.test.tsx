// @vitest-environment jsdom
import "../helpers/dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Sidebar } from "../../src/renderer/src/components/Sidebar";
import type { SessionSummary, SubjectSummary } from "../../src/shared/types";

const NOW = new Date("2026-03-03T12:00:00.000Z");
const sessions: SessionSummary[] = [
  {
    id: "s_1",
    topic: "Derivatives",
    phase: "teach",
    cli: "codex",
    updatedAt: "2026-03-03T10:00:00.000Z",
    subjectId: null,
  },
];

const subjects: SubjectSummary[] = [
  { id: "u_1", name: "Physics", updatedAt: "2026-03-03T09:00:00.000Z" },
  { id: "u_2", name: "History", updatedAt: "2026-03-03T08:00:00.000Z" },
];
const inSubject = (id: string, topic: string, subjectId: string | null): SessionSummary => ({
  ...sessions[0],
  id,
  topic,
  subjectId,
});

function setup(over: Partial<Parameters<typeof Sidebar>[0]> = {}) {
  const props = {
    sessions,
    activeId: null,
    onNew: vi.fn(),
    onOpen: vi.fn(),
    onDelete: vi.fn(),
    onKnowledge: vi.fn(),
    onProfile: vi.fn(),
    due: 0,
    onReview: vi.fn(),
    onGraph: vi.fn(),
    newDisabled: false,
    subjects: [],
    activeSubjectId: null,
    onNewSubject: vi.fn(),
    onOpenSubject: vi.fn(),
    onDeleteSubject: vi.fn(),
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
  it("Sidebar opens the profile", async () => {
    const { props, user } = setup();
    await user.click(screen.getByRole("button", { name: "Profile" }));
    expect(props.onProfile).toHaveBeenCalledTimes(1);
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
  it("sidebar_groups_lessons_by_subject", () => {
    setup({
      subjects,
      sessions: [
        inSubject("s_a", "Unit A", "u_1"),
        inSubject("s_b", "Unit B", "u_2"),
        inSubject("s_c", "Free lesson", null),
      ],
    });
    const rows = (t: string) => screen.getByText(t).closest(".lesson-row");
    expect(rows("Unit A")).toHaveClass("is-unit");
    expect(rows("Unit B")).toHaveClass("is-unit");
    expect(rows("Free lesson")).not.toHaveClass("is-unit");
    const follows = (a: Node, b: Node) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    const subjectsLabel = screen.getByText("Subjects");
    const lessonsLabel = screen.getByText("Lessons");
    expect(follows(subjectsLabel, lessonsLabel)).toBe(true);
    expect(follows(screen.getByText("Physics"), screen.getByText("Unit A"))).toBe(true);
    expect(follows(screen.getByText("Unit A"), screen.getByText("History"))).toBe(true);
    expect(follows(screen.getByText("History"), screen.getByText("Unit B"))).toBe(true);
    expect(follows(screen.getByText("Unit B"), lessonsLabel)).toBe(true);
    expect(follows(lessonsLabel, screen.getByText("Free lesson"))).toBe(true);
  });
  it("Sidebar opens a subject and marks it active", async () => {
    const { props, user } = setup({ subjects, activeSubjectId: "u_2" });
    expect(screen.getByText("History").closest(".lesson-row")).toHaveClass("is-active");
    expect(screen.getByText("Physics").closest(".lesson-row")).not.toHaveClass("is-active");
    await user.click(screen.getByText("Physics"));
    expect(props.onOpenSubject).toHaveBeenCalledWith("u_1");
  });
  it("Sidebar asks before deleting a subject", async () => {
    const { props, user } = setup({
      subjects,
      sessions: [inSubject("s_a", "Unit A", "u_1"), inSubject("s_b", "Unit B", "u_1")],
    });
    const del = () => screen.getAllByRole("button", { name: "Delete subject" })[0];
    await user.click(del());
    expect(
      screen.getByText("Delete this subject and its 2 lessons? This cannot be undone."),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(props.onDeleteSubject).not.toHaveBeenCalled();
    await user.click(del());
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(props.onDeleteSubject).toHaveBeenCalledTimes(1);
    expect(props.onDeleteSubject).toHaveBeenCalledWith("u_1");
  });
  it("Sidebar New subject calls back and respects newDisabled", async () => {
    const { props, user, view } = setup();
    await user.click(screen.getByRole("button", { name: "New subject" }));
    expect(props.onNewSubject).toHaveBeenCalledTimes(1);
    view.rerender(<Sidebar {...props} newDisabled={true} />);
    expect(screen.getByRole("button", { name: "New subject" })).toBeDisabled();
  });
  it("Sidebar says No lessons yet when every lesson belongs to a subject", () => {
    setup({ subjects, sessions: [inSubject("s_a", "Unit A", "u_1")] });
    expect(screen.getByText("No lessons yet.")).toBeInTheDocument();
    expect(screen.getByText("Unit A")).toBeInTheDocument();
  });
  it("Sidebar shows Review with the due count", async () => {
    const { props, user, view } = setup();
    expect(screen.getByRole("button", { name: "Review" })).toBeInTheDocument();
    view.rerender(<Sidebar {...props} due={4} />);
    const button = screen.getByRole("button", { name: "Review · 4" });
    await user.click(button);
    expect(props.onReview).toHaveBeenCalledTimes(1);
    const follows = (a: Node, b: Node) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(follows(screen.getByText("Lessons"), button)).toBe(true);
    expect(follows(button, screen.getByRole("button", { name: "Knowledge" }))).toBe(true);
  });
  it("Sidebar opens the graph", async () => {
    const { props, user } = setup();
    const button = screen.getByRole("button", { name: "Graph" });
    await user.click(button);
    expect(props.onGraph).toHaveBeenCalledTimes(1);
    const follows = (a: Node, b: Node) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(follows(screen.getByRole("button", { name: "Review" }), button)).toBe(true);
    expect(follows(button, screen.getByRole("button", { name: "Knowledge" }))).toBe(true);
  });
});
