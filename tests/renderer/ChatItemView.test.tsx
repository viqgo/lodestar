// @vitest-environment jsdom
import "../helpers/dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ChatItemView } from "../../src/renderer/src/components/ChatItemView";
import type { ChatItem } from "../../src/renderer/src/lib/view";
import { choiceQ, pick } from "../helpers/fixtures";

const SESSION_ID = "s_1";

function renderItem(item: ChatItem, over: Record<string, unknown> = {}) {
  const onSubmit = vi.fn();
  render(
    <ChatItemView
      item={item}
      sessionId={SESSION_ID}
      disabled={false}
      onSubmit={onSubmit}
      {...over}
    />,
  );
  return onSubmit;
}

describe("ChatItemView", () => {
  it("ChatItemView wraps tutor text as reading", () => {
    const { container } = render(
      <ChatItemView
        item={{ kind: "text", key: "k", markdown: "hello" }}
        sessionId={SESSION_ID}
        disabled={false}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByText("hello").closest(".reading")).not.toBeNull();
    expect(container.querySelector(".reading")).not.toBeNull();
    const q = renderItem({
      kind: "question",
      key: "q",
      eventIndex: 1,
      purpose: "predict",
      question: choiceQ,
      answer: null,
      grade: null,
    } as ChatItem);
    expect(q).toBeDefined();
    expect(screen.getByText(choiceQ.prompt).closest(".reading")).toBeNull();
  });

  it("a text item renders its markdown", () => {
    const { container } = render(
      <ChatItemView
        item={{ kind: "text", key: "k", markdown: "Hello **there**" }}
        sessionId={SESSION_ID}
        disabled={false}
        onSubmit={vi.fn()}
      />,
    );
    const strong = container.querySelector("strong");
    expect(strong).not.toBeNull();
    expect(strong?.textContent).toBe("there");
  });

  it("a probe summary lists what is known and the goal", () => {
    renderItem({
      kind: "probe_summary",
      key: "k",
      known: ["Slope is rise over run"],
      goal: "Explain limits",
    });
    expect(screen.getByText("What you already know")).toBeInTheDocument();
    expect(screen.getByRole("listitem")).toHaveTextContent("Slope is rise over run");
    expect(screen.getByText("Your goal")).toBeInTheDocument();
    expect(screen.getByText("Explain limits")).toBeInTheDocument();
  });

  it("a plan notice says how many steps", () => {
    renderItem({ kind: "plan_notice", key: "k", count: 4 });
    expect(screen.getByText("Your path: 4 steps")).toBeInTheDocument();
  });

  it("a pending question can be answered", async () => {
    const onSubmit = renderItem({
      kind: "question",
      key: "k",
      eventIndex: 7,
      purpose: "check",
      question: choiceQ,
      answer: null,
      grade: null,
    });
    const user = userEvent.setup();
    await user.click(screen.getAllByRole("radio")[0]!);
    await user.click(screen.getByRole("button", { name: "Submit" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("an answered question is read-only", () => {
    const answer = pick(1);
    if (answer.kind !== "answer") throw new Error("not an answer");
    renderItem({
      kind: "question",
      key: "k",
      eventIndex: 7,
      purpose: "check",
      question: choiceQ,
      answer: answer.answer,
      grade: "pass",
    });
    expect(screen.queryByRole("button", { name: "Submit" })).toBeNull();
    expect(screen.getByText("Correct")).toBeInTheDocument();
  });
});
