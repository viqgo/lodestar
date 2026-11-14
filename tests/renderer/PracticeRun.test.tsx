// @vitest-environment jsdom
import "../helpers/dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PracticeRun } from "../../src/renderer/src/components/PracticeRun";
import type { TurnError } from "../../src/shared/types";
import { installApi } from "../helpers/dom";
import { K, choiceQ, dueItem, textQ } from "../helpers/fixtures";

const dues = (n: number) => Array.from({ length: n }, (_, i) => dueItem(i + 1));

async function pickAndSubmit(user: ReturnType<typeof userEvent.setup>, option: string) {
  await user.click(await screen.findByLabelText(option));
  await user.click(screen.getByRole("button", { name: "Submit" }));
}

describe("PracticeRun", () => {
  it("practice_takes_at_most_10_due", async () => {
    const practiceAsk = vi.fn(async (id: string, cli: string) => ({
      id,
      cli,
      ok: true,
      question: choiceQ,
    }));
    installApi({ practiceAsk });
    const user = userEvent.setup();
    const due = dues(12);
    render(<PracticeRun due={due} cli="claude" />);
    for (let i = 0; i < 10; i++) {
      await pickAndSubmit(user, "b");
      await user.click(await screen.findByRole("button", { name: "Continue" }));
    }
    expect(await screen.findByText("10 of 10 correct.")).toBeInTheDocument();
    expect(practiceAsk).toHaveBeenCalledTimes(10);
    expect(practiceAsk.mock.calls.map((c) => c[0])).toEqual(due.slice(0, 10).map((d) => d.item.id));
    expect(practiceAsk.mock.calls.every((c) => c[1] === "claude")).toBe(true);
  });

  it("practice_choice_graded_by_app", async () => {
    for (const [option, ok, word] of [
      ["b", true, "Correct"],
      ["a", false, "Not yet"],
    ] as const) {
      const { api } = installApi({
        practiceAsk: vi.fn(async () => ({ ok: true, question: choiceQ })),
      });
      const user = userEvent.setup();
      const { unmount } = render(<PracticeRun due={dues(1)} cli="claude" />);
      await pickAndSubmit(user, option);
      expect(await screen.findByText(word)).toBeInTheDocument();
      expect(api.practiceGrade).not.toHaveBeenCalled();
      expect(api.recordReview).toHaveBeenCalledTimes(1);
      expect(api.recordReview).toHaveBeenCalledWith(K(1).id, ok);
      unmount();
    }
  });

  it("practice_text_graded_by_tutor", async () => {
    const { api } = installApi({
      practiceAsk: vi.fn(async () => ({ ok: true, question: textQ })),
      practiceGrade: vi.fn(async () => ({ ok: true, verdict: "fail", feedback: "Not quite." })),
    });
    const user = userEvent.setup();
    render(<PracticeRun due={dues(1)} cli="claude" />);
    await user.type(await screen.findByLabelText("Your answer"), "words");
    await user.click(screen.getByRole("button", { name: "Submit" }));
    expect(await screen.findByText("Not yet")).toBeInTheDocument();
    expect(screen.getByText("Not quite.")).toBeInTheDocument();
    expect(api.practiceGrade).toHaveBeenCalledWith(K(1).id, textQ, "words", "claude");
    expect(api.recordReview).toHaveBeenCalledTimes(1);
    expect(api.recordReview).toHaveBeenCalledWith(K(1).id, false);
  });

  it("practice_ends_with_score", async () => {
    installApi({ practiceAsk: vi.fn(async () => ({ ok: true, question: choiceQ })) });
    const user = userEvent.setup();
    const onEnd = vi.fn();
    const { unmount } = render(<PracticeRun due={dues(2)} cli="claude" onEnd={onEnd} />);
    await pickAndSubmit(user, "b");
    await user.click(await screen.findByRole("button", { name: "Continue" }));
    await pickAndSubmit(user, "a");
    await user.click(await screen.findByRole("button", { name: "Continue" }));
    expect(await screen.findByText("1 of 2 correct.")).toBeInTheDocument();
    expect(screen.queryByText("Check")).toBeNull();
    expect(onEnd).toHaveBeenCalledTimes(1);
    unmount();
    const onEnd0 = vi.fn();
    render(<PracticeRun due={[]} cli="claude" onEnd={onEnd0} />);
    expect(await screen.findByText("0 of 0 correct.")).toBeInTheDocument();
    expect(onEnd0).toHaveBeenCalledTimes(1);
  });

  it("a failed practice question shows its message and Retry asks again", async () => {
    const practiceAsk = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: { kind: "cli", message: "Codex failed: boom" } })
      .mockResolvedValue({ ok: true, question: choiceQ });
    installApi({ practiceAsk });
    const due = dues(1);
    render(<PracticeRun due={due} cli="claude" />);
    expect(await screen.findByText("Codex failed: boom")).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Pick")).toBeInTheDocument();
    expect(practiceAsk).toHaveBeenCalledTimes(2);
    expect(practiceAsk.mock.calls[1]![0]).toBe(due[0]!.item.id);
  });

  it("a failed grade keeps the answer and Retry grades it again", async () => {
    const error: TurnError = {
      kind: "bad_reply",
      message: "The tutor sent a reply I could not use.",
    };
    const practiceGrade = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error })
      .mockResolvedValue({ ok: true, verdict: "pass", feedback: "Good." });
    const { api } = installApi({
      practiceAsk: vi.fn(async () => ({ ok: true, question: textQ })),
      practiceGrade,
    });
    const user = userEvent.setup();
    render(<PracticeRun due={dues(1)} cli="claude" />);
    await user.type(await screen.findByLabelText("Your answer"), "words");
    await user.click(screen.getByRole("button", { name: "Submit" }));
    expect(await screen.findByText(error.message)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Correct")).toBeInTheDocument();
    expect(practiceGrade).toHaveBeenCalledTimes(2);
    expect(practiceGrade.mock.calls[1]![2]).toBe("words");
    expect(practiceGrade.mock.calls[0]![2]).toBe("words");
    expect(api.recordReview).toHaveBeenCalledTimes(1);
  });

  it("Stop stops the practice call and shows Stopped", async () => {
    let resolve: (v: unknown) => void = () => undefined;
    const { api } = installApi({
      practiceAsk: vi.fn(() => new Promise((r) => (resolve = r))),
    });
    const user = userEvent.setup();
    render(<PracticeRun due={dues(1)} cli="claude" />);
    expect(await screen.findByText("Thinking…")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Stop" }));
    expect(api.practiceStop).toHaveBeenCalledTimes(1);
    resolve({ ok: false, error: { kind: "stopped", message: "Stopped." } });
    expect(await screen.findByText("Stopped.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});
