// @vitest-environment jsdom
import "../helpers/dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NewLessonForm } from "../../src/renderer/src/components/NewLessonForm";
import { installApi } from "../helpers/dom";
import { session } from "../helpers/fixtures";

describe("NewLessonForm", () => {
  it("NewLessonForm shows its title, labels and button", () => {
    installApi();
    render(<NewLessonForm disabled={false} onCreated={vi.fn()} />);
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
    render(<NewLessonForm disabled={false} onCreated={onCreated} />);
    await userEvent.click(screen.getByRole("button", { name: "Start" }));
    expect(await screen.findByText("Enter a topic and a goal.")).toBeInTheDocument();
    expect(api.createSession).toHaveBeenCalledTimes(1);
    expect(onCreated).not.toHaveBeenCalled();
  });
  it("NewLessonForm sends the typed values", async () => {
    const { api } = installApi();
    render(<NewLessonForm disabled={false} onCreated={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("Topic"), "Derivatives");
    await userEvent.type(screen.getByLabelText("Goal"), "Limits");
    await userEvent.click(screen.getByRole("button", { name: "Start" }));
    expect(api.createSession).toHaveBeenCalledWith({ topic: "Derivatives", goal: "Limits" });
  });
  it("NewLessonForm hands the created lesson on", async () => {
    const S = session();
    installApi({ createSession: vi.fn(async () => ({ ok: true, session: S })) });
    const onCreated = vi.fn();
    render(<NewLessonForm disabled={false} onCreated={onCreated} />);
    await userEvent.click(screen.getByRole("button", { name: "Start" }));
    await vi.waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    expect(onCreated).toHaveBeenCalledWith(S);
  });
  it("NewLessonForm moves to the goal on Enter", async () => {
    installApi();
    render(<NewLessonForm disabled={false} onCreated={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("Topic"), "Derivatives{Enter}");
    expect(screen.getByLabelText("Goal")).toHaveFocus();
  });
  it("NewLessonForm can be disabled", () => {
    installApi();
    render(<NewLessonForm disabled={true} onCreated={vi.fn()} />);
    expect(screen.getByLabelText("Topic")).toBeDisabled();
    expect(screen.getByLabelText("Goal")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Start" })).toBeDisabled();
  });
});
