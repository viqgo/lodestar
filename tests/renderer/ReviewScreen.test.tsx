// @vitest-environment jsdom
import "../helpers/dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ReviewScreen } from "../../src/renderer/src/components/ReviewScreen";
import { dateLabel } from "../../src/renderer/src/lib/time";
import type { SessionSummary } from "../../src/shared/types";
import { installApi } from "../helpers/dom";
import { AT, K, choiceQ, dueItem, session } from "../helpers/fixtures";

const lesson: SessionSummary = {
  id: session().id,
  topic: "T",
  phase: "teach",
  cli: "claude",
  updatedAt: AT,
  subjectId: null,
};
const statuses = [
  { id: "codex" as const, installed: true, version: "0.0.0" },
  { id: "claude" as const, installed: true, version: "0.0.0" },
  { id: "gemini" as const, installed: false, version: null },
];
const FRONT = (n: number) => `Front ${n}`;
const withFront = (n: number) => dueItem(n, { front: FRONT(n) });

function renderReview(
  api: Partial<Record<string, unknown>> = {},
  props: Partial<Parameters<typeof ReviewScreen>[0]> = {},
) {
  const installed = installApi(api);
  const onChanged = vi.fn();
  const rendered = render(
    <ReviewScreen
      statuses={statuses}
      lastUsed="claude"
      sessions={[lesson]}
      subjects={[{ id: "u_1", name: "Physics", updatedAt: AT }]}
      onChanged={onChanged}
      {...props}
    />,
  );
  return { ...installed, onChanged, rerender: rendered.rerender, user: userEvent.setup() };
}

describe("ReviewScreen", () => {
  it("review_counts_due_with_filter (display)", async () => {
    const dueItems = vi.fn(async (f: { subjectId: string | null; sessionId: string | null }) =>
      f.subjectId === "u_1"
        ? { due: [dueItem(1)], nextDue: null }
        : f.sessionId !== null
          ? { due: [dueItem(1), dueItem(2)], nextDue: null }
          : { due: [dueItem(1), dueItem(2), dueItem(3)], nextDue: null },
    );
    const { user } = renderReview({ dueItems });
    expect(await screen.findByText("3 due")).toBeInTheDocument();
    expect(dueItems).toHaveBeenCalledWith({ subjectId: null, sessionId: null });
    await user.selectOptions(screen.getByLabelText("Filter"), "Physics");
    expect(await screen.findByText("1 due")).toBeInTheDocument();
    expect(dueItems).toHaveBeenLastCalledWith({ subjectId: "u_1", sessionId: null });
    await user.selectOptions(screen.getByLabelText("Filter"), "T");
    expect(await screen.findByText("2 due")).toBeInTheDocument();
    expect(dueItems).toHaveBeenLastCalledWith({ subjectId: null, sessionId: lesson.id });
    expect(screen.getByRole("option", { name: "All" })).toBeInTheDocument();
  });

  it("nothing_due_names_next_date", async () => {
    const next = "2026-03-10T12:00:00.000Z";
    renderReview({ dueItems: vi.fn(async () => ({ due: [], nextDue: next })) });
    expect(
      await screen.findByText(
        "Nothing is due. The next item comes back on " + dateLabel(next) + ".",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Flashcards" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Practice" })).toBeDisabled();
  });

  it("Review says only Nothing is due when there is no item", async () => {
    renderReview({ dueItems: vi.fn(async () => ({ due: [], nextDue: null })) });
    expect(await screen.findByText("Nothing is due.")).toBeInTheDocument();
  });

  it("Flashcards writes the missing fronts first", async () => {
    const dueItems = vi
      .fn()
      .mockResolvedValueOnce({ due: [withFront(1), dueItem(2), dueItem(3)], nextDue: null })
      .mockResolvedValue({ due: [withFront(1), withFront(2), withFront(3)], nextDue: null });
    const { api, user } = renderReview({ dueItems });
    await screen.findByText("3 due");
    await user.click(screen.getByRole("button", { name: "Flashcards" }));
    expect(await screen.findByText(FRONT(1))).toBeInTheDocument();
    expect(api.practiceFronts).toHaveBeenCalledWith([K(2).id, K(3).id], "claude");
    expect(dueItems).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("button", { name: "Flashcards" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Practice" })).toBeNull();
  });

  it("Flashcards starts without a call when every front exists", async () => {
    const { api, user } = renderReview({
      dueItems: vi.fn(async () => ({ due: [withFront(1), withFront(2)], nextDue: null })),
    });
    await screen.findByText("2 due");
    await user.click(screen.getByRole("button", { name: "Flashcards" }));
    expect(await screen.findByText(FRONT(1))).toBeInTheDocument();
    expect(api.practiceFronts).not.toHaveBeenCalled();
  });

  it("a failed fronts call shows its message with Retry", async () => {
    const message = "The model gave an unusable reply. Press Retry.";
    const practiceFronts = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: { kind: "bad_reply", message } })
      .mockResolvedValueOnce({ ok: false, error: { kind: "stopped", message: "Stopped." } });
    const { user } = renderReview({
      dueItems: vi.fn(async () => ({ due: [dueItem(1)], nextDue: null })),
      practiceFronts,
    });
    await screen.findByText("1 due");
    await user.click(screen.getByRole("button", { name: "Flashcards" }));
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.queryByText(FRONT(1))).toBeNull();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Stopped.")).toBeInTheDocument();
    expect(practiceFronts).toHaveBeenCalledTimes(2);
  });

  it("flashcard_grades_update_box (screen)", async () => {
    const dueItems = vi.fn(async () => ({
      due: [withFront(1), withFront(2)],
      nextDue: null,
    }));
    const { api, user, onChanged } = renderReview({ dueItems });
    await screen.findByText("2 due");
    await user.click(screen.getByRole("button", { name: "Flashcards" }));
    await user.click(await screen.findByRole("button", { name: "Show answer" }));
    await user.click(screen.getByRole("button", { name: "I knew it" }));
    await user.click(await screen.findByRole("button", { name: "Show answer" }));
    await user.click(screen.getByRole("button", { name: "I did not" }));
    expect(api.recordReview).toHaveBeenCalledWith(K(1).id, true);
    expect(api.recordReview).toHaveBeenCalledWith(K(2).id, false);
    expect(await screen.findByRole("button", { name: "Flashcards" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Practice" })).toBeInTheDocument();
    expect(dueItems).toHaveBeenCalledTimes(2);
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("Practice starts a run with the chosen tutor and the buttons return when it ends", async () => {
    const { api, user, onChanged } = renderReview({
      dueItems: vi.fn(async () => ({ due: [dueItem(1)], nextDue: null })),
      practiceAsk: vi.fn(async () => ({ ok: true, question: choiceQ })),
    });
    await screen.findByText("1 due");
    await user.click(screen.getByLabelText("Codex"));
    await user.click(screen.getByRole("button", { name: "Practice" }));
    expect(await screen.findByLabelText("b")).toBeInTheDocument();
    expect(api.practiceAsk).toHaveBeenCalledWith(K(1).id, "codex");
    expect(screen.queryByRole("button", { name: "Flashcards" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Practice" })).toBeNull();
    expect(screen.getByLabelText("Filter")).toBeDisabled();
    expect(screen.getByLabelText("Codex")).toBeDisabled();
    await user.click(screen.getByLabelText("b"));
    await user.click(screen.getByRole("button", { name: "Submit" }));
    await user.click(await screen.findByRole("button", { name: "Continue" }));
    expect(await screen.findByText("1 of 1 correct.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Flashcards" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Practice" })).toBeInTheDocument();
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("the filter is disabled while flashcards load", async () => {
    let release: (v: unknown) => void = () => {};
    const { user } = renderReview({
      dueItems: vi.fn(async () => ({ due: [dueItem(1)], nextDue: null })),
      practiceFronts: vi.fn(() => new Promise((r) => (release = r))),
    });
    await screen.findByText("1 due");
    await user.click(screen.getByRole("button", { name: "Flashcards" }));
    expect(screen.getByLabelText("Filter")).toBeDisabled();
    expect(screen.getByLabelText("Claude Code")).toBeDisabled();
    release({ ok: false, error: { kind: "stopped", message: "Stopped." } });
    expect(await screen.findByText("Stopped.")).toBeInTheDocument();
    expect(screen.getByLabelText("Filter")).toBeEnabled();
  });

  it("starting practice clears a stale Retry banner", async () => {
    const message = "The model gave an unusable reply. Press Retry.";
    const { user } = renderReview({
      dueItems: vi.fn(async () => ({ due: [dueItem(1)], nextDue: null })),
      practiceFronts: vi.fn(async () => ({ ok: false, error: { kind: "bad_reply", message } })),
      practiceAsk: vi.fn(async () => ({ ok: true, question: choiceQ })),
    });
    await screen.findByText("1 due");
    await user.click(screen.getByRole("button", { name: "Flashcards" }));
    expect(await screen.findByText(message)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Practice" }));
    expect(await screen.findByLabelText("b")).toBeInTheDocument();
    expect(screen.queryByText(message)).toBeNull();
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });

  it("a flashcard run ends when the last record fails", async () => {
    const recordReview = vi.fn(async () => {
      throw new Error("disk");
    });
    const { user, onChanged } = renderReview({
      dueItems: vi.fn(async () => ({ due: [withFront(1)], nextDue: null })),
      recordReview,
    });
    await screen.findByText("1 due");
    await user.click(screen.getByRole("button", { name: "Flashcards" }));
    await user.click(await screen.findByRole("button", { name: "Show answer" }));
    await user.click(screen.getByRole("button", { name: "I knew it" }));
    expect(await screen.findByRole("button", { name: "Flashcards" })).toBeInTheDocument();
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("the filter resets when its lesson is deleted", async () => {
    const dueItems = vi.fn(async () => ({ due: [dueItem(1)], nextDue: null }));
    const { rerender } = renderReview({ dueItems });
    await screen.findByText("1 due");
    await userEvent.selectOptions(screen.getByLabelText("Filter"), "T");
    expect(dueItems).toHaveBeenLastCalledWith({ subjectId: null, sessionId: lesson.id });
    rerender(
      <ReviewScreen
        statuses={statuses}
        lastUsed="claude"
        sessions={[]}
        subjects={[{ id: "u_1", name: "Physics", updatedAt: AT }]}
        onChanged={vi.fn()}
      />,
    );
    await vi.waitFor(() =>
      expect(dueItems).toHaveBeenLastCalledWith({ subjectId: null, sessionId: null }),
    );
    expect((screen.getByLabelText("Filter") as HTMLSelectElement).value).toBe("");
  });
});
