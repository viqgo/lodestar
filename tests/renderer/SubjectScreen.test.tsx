// @vitest-environment jsdom
import "../helpers/dom";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SubjectScreen } from "../../src/renderer/src/components/SubjectScreen";
import { installApi } from "../helpers/dom";
import type { Subject, SubjectEvent, UnitStatus } from "../../src/shared/types";
import { SE, UNITS, readySubject, session, subject } from "../helpers/fixtures";

const U = (events: SubjectEvent[]): Subject => ({ ...subject(events), id: "u_1" });
const ST = (
  unitId: string,
  status: UnitStatus["status"],
  shaky = 0,
  sessionId: string | null = null,
): UnitStatus => ({ unitId, sessionId, status, shaky });

function setup(over: Record<string, unknown> = {}, start = false) {
  const onOpenLesson = vi.fn();
  const r = installApi(over);
  render(<SubjectScreen id="u_1" start={start} onOpenLesson={onOpenLesson} />);
  return { ...r, onOpenLesson };
}

describe("SubjectScreen", () => {
  it("SubjectScreen shows the outline review until it is accepted", async () => {
    const accepted = U(readySubject);
    const { api } = setup({
      getSubject: async () => U([SE.outline()]),
      acceptOutline: vi.fn(async () => ({ ok: true, subject: accepted })),
    });
    expect(await screen.findByRole("button", { name: "Accept outline" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Course" })).toBeInTheDocument();
    expect(screen.getByText("Material folder: course")).toBeInTheDocument();
    expect(screen.queryByText("Senior tutor")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Accept outline" }));
    expect(api.acceptOutline).toHaveBeenCalledWith("u_1", UNITS);
  });

  it("the unit list shows each status", async () => {
    const units = [...UNITS, { id: "u4", title: "Unit four", goal: "Goal four", files: [] }];
    setup({
      getSubject: async () => U([SE.outline(units), SE.accepted(units)]),
      subjectStatuses: async () => [
        ST("u1", "not_started"),
        ST("u2", "in_progress", 0, "s_2"),
        ST("u3", "done", 0, "s_3"),
        ST("u4", "done", 2, "s_4"),
      ],
    });
    expect(await screen.findByText("not started")).toBeInTheDocument();
    expect(screen.getByText("in progress")).toBeInTheDocument();
    expect(screen.getByText("done")).toBeInTheDocument();
    expect(screen.getByText("done, 2 shaky")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Start" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Open" })).toHaveLength(3);
    expect(screen.getByText("Goal one")).toBeInTheDocument();
  });

  it("start and open a unit", async () => {
    const { api, onOpenLesson } = setup({
      getSubject: async () => U(readySubject),
      subjectStatuses: async () => [
        ST("u1", "not_started"),
        ST("u2", "in_progress", 0, "s_2"),
        ST("u3", "not_started"),
      ],
      startUnit: vi.fn(async () => ({ ok: true, session: { ...session(), id: "s_new" } })),
    });
    const starts = await screen.findAllByRole("button", { name: "Start" });
    await userEvent.click(starts[0]);
    expect(api.startUnit).toHaveBeenCalledWith("u_1", "u1");
    await waitFor(() => expect(onOpenLesson).toHaveBeenCalledWith("s_new", true));
    await userEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(onOpenLesson).toHaveBeenCalledWith("s_2", false);
  });

  it("SubjectScreen shows a refused start", async () => {
    const { onOpenLesson } = setup({
      getSubject: async () => U(readySubject),
      subjectStatuses: async () => [ST("u1", "not_started")],
      startUnit: vi.fn(async () => ({ ok: false, message: "This unit already has a lesson." })),
    });
    await userEvent.click((await screen.findAllByRole("button", { name: "Start" }))[0]);
    expect(await screen.findByText("This unit already has a lesson.")).toBeInTheDocument();
    expect(onOpenLesson).not.toHaveBeenCalled();
  });

  it("SubjectScreen shows the thinking bar and Stop while a call runs", async () => {
    const { api } = setup({
      getSubject: async () => U([SE.outline()]),
      isSubjectRunning: async () => true,
    });
    expect(await screen.findByText("Thinking…")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Stop" }));
    expect(api.stopSubject).toHaveBeenCalledWith("u_1");
  });

  it("SubjectScreen offers Retry after a failure and after an interrupted call", async () => {
    const { api, emitSubjectEnded } = setup({
      getSubject: async () => U([SE.outline()]),
    });
    await screen.findByRole("button", { name: "Accept outline" });
    emitSubjectEnded("u_1", {
      ok: false,
      error: { kind: "cli", message: "Codex failed: x" },
      subject: null,
    });
    expect(await screen.findByText("Codex failed: x")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(api.advanceSubject).toHaveBeenCalledWith("u_1");
  });

  it("SubjectScreen shows the missing folder banner", async () => {
    const { emitSubjectEnded } = setup({ getSubject: async () => U([SE.outline()]) });
    await screen.findByRole("button", { name: "Accept outline" });
    emitSubjectEnded("u_1", {
      ok: false,
      error: { kind: "folder_missing", message: "The folder is missing." },
      subject: null,
    });
    expect(await screen.findByText("The folder is missing.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("the subject folder can be changed", async () => {
    const pickFolder = vi.fn<() => Promise<string | null>>(async () => "/new/folder");
    const setSubjectFolder = vi.fn<
      (
        id: string,
        folder: string,
      ) => Promise<{ ok: true; subject: Subject } | { ok: false; message: string }>
    >(async () => ({ ok: true, subject: U(readySubject) }));
    const { api } = setup({
      getSubject: async () => U(readySubject),
      pickFolder,
      setSubjectFolder,
    });
    expect(await screen.findByText("Material folder: course")).toBeInTheDocument();
    const change = screen.getByRole("button", { name: "Change" });
    await userEvent.click(change);
    expect(api.setSubjectFolder).toHaveBeenCalledWith("u_1", "/new/folder");
    pickFolder.mockResolvedValueOnce(null);
    await userEvent.click(change);
    expect(api.setSubjectFolder).toHaveBeenCalledTimes(1);
    setSubjectFolder.mockResolvedValueOnce({
      ok: false,
      message: "A reply is already on the way.",
    });
    await userEvent.click(change);
    expect(await screen.findByText("A reply is already on the way.")).toBeInTheDocument();
    cleanup();
    setup({ getSubject: async () => U(readySubject), isSubjectRunning: async () => true });
    await screen.findByText("Thinking…");
    expect(screen.getByRole("button", { name: "Change" })).toBeDisabled();
  });

  it("changing a missing subject folder repeats the call", async () => {
    const { api, emitSubjectEnded } = setup({
      getSubject: async () => U([SE.outline()]),
      pickFolder: vi.fn(async () => "/new/folder"),
      setSubjectFolder: vi.fn(async () => ({ ok: true, subject: U([SE.outline()]) })),
    });
    await screen.findByRole("button", { name: "Accept outline" });
    await userEvent.click(screen.getByRole("button", { name: "Change" }));
    await waitFor(() => expect(api.setSubjectFolder).toHaveBeenCalledTimes(1));
    expect(api.advanceSubject).not.toHaveBeenCalled();
    emitSubjectEnded("u_1", {
      ok: false,
      error: { kind: "folder_missing", message: "The folder is missing." },
      subject: null,
    });
    expect(await screen.findByText("The folder is missing.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Change" }));
    await waitFor(() => expect(api.advanceSubject).toHaveBeenCalledTimes(1));
    expect(api.advanceSubject).toHaveBeenCalledWith("u_1");
  });

  it("SubjectScreen shows the senior chat once the outline is accepted", async () => {
    const change = { kind: "remove" as const, unitId: "u3" };
    const withChange = U([
      ...readySubject,
      SE.message("what next?"),
      SE.reply("Do unit 1.", change),
    ]);
    const { api } = setup({
      getSubject: async () => withChange,
      subjectMessage: vi.fn(async () => ({ ok: true, subject: withChange })),
      resolveChange: vi.fn(async () => ({ ok: true, subject: U(readySubject) })),
    });
    expect(await screen.findByText("Senior tutor")).toBeInTheDocument();
    expect(screen.getByText("Do unit 1.")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Message"), "thanks");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(api.subjectMessage).toHaveBeenCalledWith("u_1", "thanks");
    await waitFor(() => expect(screen.getByRole("button", { name: "Accept" })).toBeEnabled());
    await userEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(api.resolveChange).toHaveBeenCalledWith("u_1", true);
  });
});
