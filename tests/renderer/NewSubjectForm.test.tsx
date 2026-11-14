// @vitest-environment jsdom
import "../helpers/dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NewSubjectForm } from "../../src/renderer/src/components/NewSubjectForm";
import { installApi } from "../helpers/dom";
import type { CliStatus } from "../../src/shared/types";
import { subject } from "../helpers/fixtures";

const STATUSES: CliStatus[] = [
  { id: "codex", installed: true, version: "1" },
  { id: "claude", installed: true, version: "1" },
  { id: "gemini", installed: false, version: null },
];
const NONE: CliStatus[] = STATUSES.map((s) => ({ ...s, installed: false }));

describe("NewSubjectForm", () => {
  it("new_subject_needs_name_and_folder (form)", async () => {
    const text = "Enter a name and choose a folder.";
    const { api } = installApi({
      createSubject: vi.fn(async () => ({ ok: false, message: text })),
    });
    const onCreated = vi.fn();
    render(
      <NewSubjectForm disabled={false} statuses={STATUSES} lastUsed={null} onCreated={onCreated} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(await screen.findByText(text)).toBeInTheDocument();
    expect(api.createSubject).toHaveBeenCalledTimes(1);
    expect(onCreated).not.toHaveBeenCalled();
  });

  it("NewSubjectForm sends name, folder and tutor", async () => {
    const created = subject();
    const { api } = installApi({
      pickFolder: vi.fn(async () => "/home/me/Physics"),
      createSubject: vi.fn(async () => ({ ok: true, subject: created })),
    });
    const onCreated = vi.fn();
    render(
      <NewSubjectForm
        disabled={false}
        statuses={STATUSES}
        lastUsed="claude"
        onCreated={onCreated}
      />,
    );
    await userEvent.type(screen.getByLabelText("Name"), "Physics");
    await userEvent.click(screen.getByRole("button", { name: "Choose folder" }));
    expect(await screen.findByText("Physics", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Change" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(api.createSubject).toHaveBeenCalledWith({
      name: "Physics",
      folder: "/home/me/Physics",
      cli: "claude",
    });
    expect(onCreated).toHaveBeenCalledWith(created);
  });

  it("NewSubjectForm shows the tutor note under the folder", async () => {
    installApi({ pickFolder: vi.fn(async () => "/x/y") });
    render(
      <NewSubjectForm disabled={false} statuses={STATUSES} lastUsed="claude" onCreated={vi.fn()} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Choose folder" }));
    expect(
      await screen.findByText("Claude Code can only read inside this folder."),
    ).toBeInTheDocument();
  });

  it("NewSubjectForm is disabled without a CLI", () => {
    installApi();
    render(<NewSubjectForm disabled={false} statuses={NONE} lastUsed={null} onCreated={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Create" })).toBeDisabled();
  });
});
