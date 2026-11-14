// @vitest-environment jsdom
import "../helpers/dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { App } from "../../src/renderer/src/App";
import type { SessionSummary, Subject, SubjectSummary } from "../../src/shared/types";
import { installApi } from "../helpers/dom";
import { AT, UNITS, readySubject, session, subject } from "../helpers/fixtures";

vi.mock("../../src/renderer/src/components/PlanPanel", () => ({
  PlanPanel: () => <div data-testid="plan" />,
}));

const ID = session().id;
const summary = (id: string, topic: string): SessionSummary => ({
  id,
  topic,
  phase: "probe",
  cli: "codex",
  updatedAt: AT,
  subjectId: null,
});

const subjSummary = (id: string, name: string): SubjectSummary => ({ id, name, updatedAt: AT });
const SUBJ: Subject = { ...subject(readySubject), id: "u_1" };

describe("App", () => {
  it("App starts on the new lesson screen", async () => {
    installApi();
    render(<App />);
    expect(await screen.findByText("What do you want to learn?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New lesson" })).toBeEnabled();
  });

  it("App shows the Codex banner and disables New lesson", async () => {
    installApi({
      detectClis: vi.fn(async () => [
        { id: "codex", installed: false, version: null },
        { id: "claude", installed: false, version: null },
        { id: "gemini", installed: false, version: null },
      ]),
    });
    render(<App />);
    expect(
      await screen.findByText(
        "No AI CLI found. Install Codex, Claude Code or Gemini CLI and sign in, then press Retry.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New lesson" })).toBeDisabled();
  });

  it("App Retry checks for Codex again", async () => {
    const detectClis = vi
      .fn()
      .mockResolvedValueOnce([
        { id: "codex", installed: false, version: null },
        { id: "claude", installed: false, version: null },
        { id: "gemini", installed: false, version: null },
      ])
      .mockResolvedValue([{ id: "codex", installed: true, version: "1" }]);
    installApi({ detectClis });
    render(<App />);
    await userEvent.click(await screen.findByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("button", { name: "New lesson", hidden: false })).toBeEnabled();
    expect(
      screen.queryByText(
        "No AI CLI found. Install Codex, Claude Code or Gemini CLI and sign in, then press Retry.",
      ),
    ).not.toBeInTheDocument();
  });

  it("sessions_listed_newest_first (display)", async () => {
    installApi({
      listSessions: vi.fn(async () => [summary("a", "Alpha"), summary("b", "Beta")]),
    });
    render(<App />);
    const first = await screen.findByText("Alpha");
    const second = screen.getByText("Beta");
    expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("App opens a lesson from the list", async () => {
    const { api } = installApi({
      listSessions: vi.fn(async () => [summary(ID, "Alpha")]),
      getSession: vi.fn(async () => ({ ...session(), topic: "Alpha" })),
    });
    render(<App />);
    await userEvent.click(await screen.findByText("Alpha"));
    expect(await screen.findByRole("heading", { name: "Alpha" })).toBeInTheDocument();
    expect(api.getSession).toHaveBeenCalledWith(ID);
    expect(api.advance).not.toHaveBeenCalled();
  });

  it("App creating a lesson opens it and starts it", async () => {
    const S = session();
    const { api } = installApi({
      createSession: vi.fn(async () => ({ ok: true, session: S })),
      getSession: vi.fn(async () => S),
    });
    render(<App />);
    await userEvent.type(await screen.findByLabelText("Topic"), "T");
    await userEvent.type(screen.getByLabelText("Goal"), "G");
    await userEvent.click(screen.getByRole("button", { name: "Start" }));
    expect(await screen.findByRole("heading", { name: "T" })).toBeInTheDocument();
    expect(api.advance).toHaveBeenCalledTimes(1);
  });

  it("delete_session_needs_confirm", async () => {
    const { api } = installApi({
      listSessions: vi.fn(async () => [summary(ID, "Alpha")]),
      getSession: vi.fn(async () => ({ ...session(), topic: "Alpha" })),
    });
    render(<App />);
    await userEvent.click(await screen.findByText("Alpha"));
    await screen.findByRole("heading", { name: "Alpha" });

    await userEvent.click(screen.getByRole("button", { name: "Delete lesson" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(api.deleteSession).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Alpha" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Delete lesson" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(api.deleteSession).toHaveBeenCalledWith(ID);
    expect(await screen.findByText("What do you want to learn?")).toBeInTheDocument();
  });

  it("App shows the Codex banner on every screen", async () => {
    installApi({
      detectClis: vi.fn(async () => [
        { id: "codex", installed: false, version: null },
        { id: "claude", installed: false, version: null },
        { id: "gemini", installed: false, version: null },
      ]),
    });
    render(<App />);
    await userEvent.click(await screen.findByRole("button", { name: "Knowledge" }));
    await screen.findByText("What you have shown you understand. Later lessons start from here.");
    expect(
      screen.getByText(
        "No AI CLI found. Install Codex, Claude Code or Gemini CLI and sign in, then press Retry.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("App opens the profile screen", async () => {
    const { api } = installApi();
    render(<App />);
    await userEvent.click(await screen.findByRole("button", { name: "Profile" }));
    expect(await screen.findByText("Tutor instructions")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Profile" })).toBeInTheDocument();
    expect(api.getProfile).toHaveBeenCalled();
  });

  it("App passes the last used tutor to the form", async () => {
    installApi({
      listSessions: vi.fn(async () => [{ ...summary("a", "Alpha"), cli: "claude" as const }]),
    });
    render(<App />);
    expect(await screen.findByRole("radio", { name: "Claude Code" })).toBeChecked();
  });

  it("App opens the new subject form and then the created subject", async () => {
    const fresh: Subject = { ...subject(), id: "u_1" };
    const { api } = installApi({
      createSubject: vi.fn(async () => ({ ok: true as const, subject: fresh })),
      getSubject: vi.fn(async () => fresh),
    });
    render(<App />);
    await userEvent.click(await screen.findByRole("button", { name: "New subject" }));
    expect(await screen.findByRole("heading", { name: "New subject" })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Name"), "Course");
    await userEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(await screen.findByRole("heading", { name: "Course" })).toBeInTheDocument();
    expect(api.advanceSubject).toHaveBeenCalledTimes(1);
  });

  it("App opens a subject from the sidebar", async () => {
    const { api } = installApi({
      listSubjects: vi.fn(async () => [subjSummary("u_1", "Course")]),
      getSubject: vi.fn(async () => SUBJ),
    });
    render(<App />);
    await userEvent.click(await screen.findByText("Course"));
    expect(await screen.findByRole("heading", { name: "Course" })).toBeInTheDocument();
    expect(api.getSubject).toHaveBeenCalledWith("u_1");
    expect(api.advanceSubject).not.toHaveBeenCalled();
  });

  it("App opens a unit lesson from the subject screen", async () => {
    const unit = { ...session(), topic: "Unit one", subjectId: "u_1" };
    const { api } = installApi({
      listSubjects: vi.fn(async () => [subjSummary("u_1", "Course")]),
      getSubject: vi.fn(async () => SUBJ),
      subjectStatuses: vi.fn(async () => [
        { unitId: UNITS[0].id, sessionId: ID, status: "in_progress" as const, shaky: 0 },
      ]),
      getSession: vi.fn(async () => unit),
    });
    render(<App />);
    await userEvent.click(await screen.findByText("Course"));
    await userEvent.click(await screen.findByRole("button", { name: "Open" }));
    expect(await screen.findByRole("heading", { name: "Unit one" })).toBeInTheDocument();
    expect(api.getSession).toHaveBeenCalledWith(ID);
    expect(api.advance).not.toHaveBeenCalled();
  });

  it("delete_subject_removes_its_lessons_keeps_knowledge (display)", async () => {
    const unit = { ...session(), topic: "Unit one", subjectId: "u_1" };
    const { api } = installApi({
      listSubjects: vi.fn(async () => [subjSummary("u_1", "Course")]),
      listSessions: vi.fn(async () => [{ ...summary(ID, "Unit one"), subjectId: "u_1" }]),
      getSubject: vi.fn(async () => SUBJ),
      getSession: vi.fn(async () => unit),
    });
    render(<App />);
    await userEvent.click(await screen.findByText("Unit one"));
    await screen.findByRole("heading", { name: "Unit one" });
    await userEvent.click(screen.getByRole("button", { name: "Delete subject" }));
    expect(
      screen.getByText("Delete this subject and its 1 lessons? This cannot be undone."),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(api.deleteSubject).toHaveBeenCalledWith("u_1");
    expect(await screen.findByText("What do you want to learn?")).toBeInTheDocument();
    expect(api.deleteKnowledge).not.toHaveBeenCalled();
  });

  it("App reloads both lists when a subject changes", async () => {
    const { api, emitSubjectUpdated } = installApi();
    render(<App />);
    await screen.findByText("What do you want to learn?");
    await vi.waitFor(() => expect(api.listSubjects).toHaveBeenCalledTimes(1));
    const sessionsBefore = (api.listSessions as ReturnType<typeof vi.fn>).mock.calls.length;
    emitSubjectUpdated(SUBJ);
    await vi.waitFor(() => expect(api.listSubjects).toHaveBeenCalledTimes(2));
    expect((api.listSessions as ReturnType<typeof vi.fn>).mock.calls.length).toBe(
      sessionsBefore + 1,
    );
  });
});
