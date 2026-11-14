// @vitest-environment jsdom
import "../helpers/dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { QuestionCard } from "../../src/renderer/src/components/QuestionCard";
import { shuffledOrder } from "../../src/renderer/src/lib/shuffle";
import type { Answer } from "../../src/shared/types";
import { choiceQ, pick, textQ } from "../helpers/fixtures";

function renderCard(over: Record<string, unknown> = {}) {
  const onSubmit = vi.fn();
  render(
    <QuestionCard
      seed="s:1"
      purpose="check"
      question={choiceQ}
      answer={null}
      grade={null}
      disabled={false}
      onSubmit={onSubmit}
      {...over}
    />,
  );
  return onSubmit;
}

const answerOf = (i: number): Answer => {
  const e = pick(i);
  if (e.kind !== "answer") throw new Error("not an answer");
  return e.answer;
};

describe("QuestionCard", () => {
  it("shows the purpose label and the prompt", () => {
    renderCard({ purpose: "probe" });
    expect(screen.getByText("Probe")).toBeInTheDocument();
    expect(screen.getByText("Pick")).toBeInTheDocument();
  });

  it("shows options in the shuffled order for its seed", () => {
    renderCard();
    const labels = screen
      .getAllByRole("radio")
      .map((r) => (r.closest("label") as HTMLElement).textContent);
    expect(labels).toEqual(shuffledOrder("s:1", 3).map((i) => ["a", "b", "c"][i]));
  });

  it("submit needs a picked option and sends the original index", async () => {
    const onSubmit = renderCard();
    const user = userEvent.setup();
    const submit = screen.getByRole("button", { name: "Submit" });
    expect(submit).toBeDisabled();
    await user.click(screen.getByLabelText("b"));
    expect(submit).toBeEnabled();
    await user.click(submit);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({
      choiceIndex: 1,
      text: null,
      reasoning: null,
      confidence: null,
    });
  });

  it("a text answer is required and trimmed", async () => {
    const onSubmit = renderCard({ question: textQ });
    const user = userEvent.setup();
    const submit = screen.getByRole("button", { name: "Submit" });
    expect(submit).toBeDisabled();
    await user.type(screen.getByLabelText("Your answer"), "  hello  ");
    await user.click(submit);
    expect(onSubmit).toHaveBeenCalledWith({
      choiceIndex: null,
      text: "hello",
      reasoning: null,
      confidence: null,
    });
  });

  it("reasoning is sent when typed, null when blank", async () => {
    const user = userEvent.setup();
    const first = renderCard();
    await user.click(screen.getByLabelText("a"));
    await user.type(screen.getByLabelText("Your thinking (optional)"), " because ");
    await user.click(screen.getByRole("button", { name: "Submit" }));
    expect(first.mock.calls[0]![0].reasoning).toBe("because");
    document.body.innerHTML = "";
    const second = renderCard();
    await user.click(screen.getByLabelText("a"));
    await user.click(screen.getByRole("button", { name: "Submit" }));
    expect(second.mock.calls[0]![0].reasoning).toBeNull();
  });

  it("confidence buttons appear on probe only and toggle", async () => {
    const user = userEvent.setup();
    renderCard({ purpose: "probe" });
    expect(screen.getByRole("button", { name: "Unsure" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guessing" })).toBeInTheDocument();
    const sure = screen.getByRole("button", { name: "Sure" });
    await user.click(sure);
    expect(sure).toHaveClass("is-selected");
    await user.click(sure);
    expect(sure).not.toHaveClass("is-selected");
    document.body.innerHTML = "";
    renderCard({ purpose: "check" });
    expect(screen.queryByRole("button", { name: "Sure" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Unsure" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Guessing" })).toBeNull();
  });

  it("a probe confidence goes into the answer", async () => {
    const user = userEvent.setup();
    const onSubmit = renderCard({ purpose: "probe" });
    await user.click(screen.getByLabelText("a"));
    await user.click(screen.getByRole("button", { name: "Unsure" }));
    await user.click(screen.getByRole("button", { name: "Submit" }));
    expect(onSubmit.mock.calls[0]![0].confidence).toBe("unsure");
  });

  it("a predict card says it is not graded", () => {
    renderCard({ purpose: "predict", question: textQ });
    expect(screen.getByLabelText("Your answer")).toHaveAttribute(
      "placeholder",
      "Take a guess. This is not graded.",
    );
  });

  it("Cmd+Enter submits when enabled and not otherwise", async () => {
    const user = userEvent.setup();
    const onSubmit = renderCard();
    await user.click(screen.getByLabelText("a"));
    await user.click(screen.getByLabelText("Your thinking (optional)"));
    await user.keyboard("{Meta>}{Enter}{/Meta}");
    expect(onSubmit).toHaveBeenCalledTimes(1);
    document.body.innerHTML = "";
    const none = renderCard();
    await user.click(screen.getByLabelText("Your thinking (optional)"));
    await user.keyboard("{Meta>}{Enter}{/Meta}");
    expect(none).not.toHaveBeenCalled();
  });

  it("an answered passed check shows Correct", () => {
    renderCard({ answer: answerOf(1), grade: "pass" });
    expect(screen.getByText("Correct")).toBeInTheDocument();
    const option = screen.getByLabelText("b").closest("label");
    expect(option).toHaveClass("is-correct");
    expect(option).toHaveClass("is-selected");
    expect(screen.queryByRole("button", { name: "Submit" })).toBeNull();
  });

  it("an answered failed check shows Not yet", () => {
    renderCard({ answer: answerOf(0), grade: "fail" });
    expect(screen.getByText("Not yet")).toBeInTheDocument();
    expect(screen.getByLabelText("a").closest("label")).toHaveClass("is-wrong");
    expect(screen.queryByRole("button", { name: "Submit" })).toBeNull();
  });

  it("disabled disables everything", () => {
    renderCard({ disabled: true });
    for (const r of screen.getAllByRole("radio")) expect(r).toBeDisabled();
    for (const t of screen.getAllByRole("textbox")) expect(t).toBeDisabled();
    expect(screen.getByRole("button", { name: "Submit" })).toBeDisabled();
  });
});
