// @vitest-environment jsdom
import "../helpers/dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TutorPicker } from "../../src/renderer/src/components/TutorPicker";
import type { CliStatus } from "../../src/shared/types";

const STATUSES: CliStatus[] = [
  { id: "codex", installed: true, version: "0.167.0" },
  { id: "claude", installed: true, version: "2.0.0" },
  { id: "gemini", installed: false, version: null },
];

describe("TutorPicker", () => {
  it("picker_lists_three_and_greys_missing", () => {
    render(<TutorPicker statuses={STATUSES} value={null} disabled={false} onChange={() => {}} />);
    expect(screen.getByRole("radio", { name: "Codex" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Claude Code" })).toBeInTheDocument();
    const gemini = screen.getByRole("radio", { name: "Gemini (experimental) · not installed" });
    expect(gemini).toBeDisabled();
    expect(gemini.closest("label")).toHaveClass("is-disabled");
  });

  it("TutorPicker marks the current value", () => {
    const { rerender } = render(
      <TutorPicker statuses={STATUSES} value="claude" disabled={false} onChange={() => {}} />,
    );
    const radios = screen.getAllByRole("radio") as HTMLInputElement[];
    expect(radios.filter((r) => r.checked)).toHaveLength(1);
    expect(screen.getByRole("radio", { name: "Claude Code" })).toBeChecked();
    rerender(<TutorPicker statuses={STATUSES} value={null} disabled={false} onChange={() => {}} />);
    expect((screen.getAllByRole("radio") as HTMLInputElement[]).some((r) => r.checked)).toBe(false);
  });

  it("TutorPicker reports a choice", async () => {
    const fn = vi.fn();
    render(<TutorPicker statuses={STATUSES} value="codex" disabled={false} onChange={fn} />);
    await userEvent.click(screen.getByRole("radio", { name: "Claude Code" }));
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("claude");
    await userEvent.click(
      screen.getByRole("radio", { name: "Gemini (experimental) · not installed" }),
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("TutorPicker can be disabled", () => {
    render(<TutorPicker statuses={STATUSES} value="codex" disabled={true} onChange={() => {}} />);
    for (const r of screen.getAllByRole("radio")) expect(r).toBeDisabled();
    expect(screen.getAllByRole("radio")).toHaveLength(3);
  });
});
