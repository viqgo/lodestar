// @vitest-environment jsdom
import "../helpers/dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NewLessonForm } from "../../src/renderer/src/components/NewLessonForm";
import { installApi } from "../helpers/dom";
import type { CliStatus } from "../../src/shared/types";
import { session } from "../helpers/fixtures";

const STATUSES: CliStatus[] = [
  { id: "codex", installed: true, version: "1" },
  { id: "claude", installed: true, version: "1" },
  { id: "gemini", installed: false, version: null },
];

describe("NewLessonForm", () => {
  it("NewLessonForm shows its title, labels and button", () => {
    installApi();
    render(
      <NewLessonForm disabled={false} statuses={STATUSES} lastUsed={null} onCreated={vi.fn()} />,
    );
    expect(screen.getByText("What do you want to learn?")).toBeInTheDocument();
    expect(screen.getByLabelText("Topic")).toBeInTheDocument();
    expect(screen.getByLabelText("Goal")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start" })).toBeInTheDocument();
  });
  it("new_lesson_rejects_empty_fields", async () => {
    const { api } = installApi({
      createSession: vi.fn(async () => ({ ok: false, message: "Enter a topic and a goal." })),
    });
    const onCreated = vi.fn();
    render(
      <NewLessonForm disabled={false} statuses={STATUSES} lastUsed={null} onCreated={onCreated} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Start" }));
    expect(await screen.findByText("Enter a topic and a goal.")).toBeInTheDocument();
    expect(api.createSession).toHaveBeenCalledTimes(1);
    expect(onCreated).not.toHaveBeenCalled();
  });
  it("NewLessonForm sends the typed values", async () => {
    const { api } = installApi();
    render(
      <NewLessonForm disabled={false} statuses={STATUSES} lastUsed={null} onCreated={vi.fn()} />,
    );
    await userEvent.type(screen.getByLabelText("Topic"), "Derivatives");
    await userEvent.type(screen.getByLabelText("Goal"), "Limits");
    await userEvent.click(screen.getByRole("button", { name: "Start" }));
    expect(api.createSession).toHaveBeenCalledWith({
      topic: "Derivatives",
      goal: "Limits",
      cli: "codex",
    });
  });
  it("NewLessonForm hands the created lesson on", async () => {
    const S = session();
    installApi({ createSession: vi.fn(async () => ({ ok: true, session: S })) });
    const onCreated = vi.fn();
    render(
      <NewLessonForm disabled={false} statuses={STATUSES} lastUsed={null} onCreated={onCreated} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Start" }));
    await vi.waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    expect(onCreated).toHaveBeenCalledWith(S);
  });
  it("NewLessonForm moves to the goal on Enter", async () => {
    installApi();
    render(
      <NewLessonForm disabled={false} statuses={STATUSES} lastUsed={null} onCreated={vi.fn()} />,
    );
    await userEvent.type(screen.getByLabelText("Topic"), "Derivatives{Enter}");
    expect(screen.getByLabelText("Goal")).toHaveFocus();
  });
  it("NewLessonForm can be disabled", () => {
    installApi();
    render(
      <NewLessonForm disabled={true} statuses={STATUSES} lastUsed={null} onCreated={vi.fn()} />,
    );
    expect(screen.getByLabelText("Topic")).toBeDisabled();
    expect(screen.getByLabelText("Goal")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Start" })).toBeDisabled();
  });
  it("NewLessonForm creates a lesson only once when Start is clicked twice", async () => {
    const S = session();
    let resolve: (v: { ok: true; session: typeof S }) => void = () => {};
    const { api } = installApi({
      createSession: vi.fn(
        () =>
          new Promise((r) => {
            resolve = r;
          }),
      ),
    });
    const onCreated = vi.fn();
    render(
      <NewLessonForm disabled={false} statuses={STATUSES} lastUsed={null} onCreated={onCreated} />,
    );
    await userEvent.dblClick(screen.getByRole("button", { name: "Start" }));
    expect(api.createSession).toHaveBeenCalledTimes(1);
    resolve({ ok: true, session: S });
    await vi.waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
  });

  it("NewLessonForm reports a failed save", async () => {
    const { api } = installApi({
      createSession: vi.fn(async () => {
        throw new Error("disk");
      }),
    });
    const onCreated = vi.fn();
    render(
      <NewLessonForm disabled={false} statuses={STATUSES} lastUsed={null} onCreated={onCreated} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Start" }));
    expect(await screen.findByText("Could not save. Check free disk space.")).toBeInTheDocument();
    expect(onCreated).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Start" }));
    expect(api.createSession).toHaveBeenCalledTimes(2);
  });

  it("picker_defaults_to_last_used_then_first_installed", () => {
    installApi();
    const { unmount } = render(
      <NewLessonForm disabled={false} statuses={STATUSES} lastUsed="claude" onCreated={vi.fn()} />,
    );
    expect(screen.getByRole("radio", { name: "Claude Code" })).toBeChecked();
    unmount();
    const second = render(
      <NewLessonForm disabled={false} statuses={STATUSES} lastUsed={null} onCreated={vi.fn()} />,
    );
    expect(screen.getByRole("radio", { name: "Codex" })).toBeChecked();
    second.unmount();
    render(
      <NewLessonForm
        disabled={false}
        statuses={[
          { id: "codex", installed: false, version: null },
          { id: "claude", installed: true, version: "1" },
          { id: "gemini", installed: false, version: null },
        ]}
        lastUsed="codex"
        onCreated={vi.fn()}
      />,
    );
    expect(screen.getByRole("radio", { name: "Claude Code" })).toBeChecked();
  });

  it("NewLessonForm sends the chosen tutor", async () => {
    const { api } = installApi();
    render(
      <NewLessonForm disabled={false} statuses={STATUSES} lastUsed={null} onCreated={vi.fn()} />,
    );
    await userEvent.type(screen.getByLabelText("Topic"), "Derivatives");
    await userEvent.type(screen.getByLabelText("Goal"), "Limits");
    await userEvent.click(screen.getByRole("radio", { name: "Claude Code" }));
    await userEvent.click(screen.getByRole("button", { name: "Start" }));
    expect(api.createSession).toHaveBeenCalledWith({
      topic: "Derivatives",
      goal: "Limits",
      cli: "claude",
    });
  });
});
