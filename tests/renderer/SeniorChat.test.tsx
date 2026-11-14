// @vitest-environment jsdom
import "../helpers/dom";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SeniorChat } from "../../src/renderer/src/components/SeniorChat";
import type { OutlineChange, SubjectState } from "../../src/shared/types";

type Chat = SubjectState["chat"];

function setup(over: { chat?: Chat; pendingChange?: OutlineChange | null; busy?: boolean } = {}) {
  const onSend = vi.fn();
  const onResolve = vi.fn();
  const utils = render(
    <SeniorChat
      chat={over.chat ?? []}
      pendingChange={over.pendingChange ?? null}
      busy={over.busy ?? false}
      onSend={onSend}
      onResolve={onResolve}
    />,
  );
  return { onSend, onResolve, ...utils };
}

const send = () => screen.getByRole("button", { name: "Send" }) as HTMLButtonElement;
const box = () => screen.getByLabelText("Message") as HTMLTextAreaElement;

describe("SeniorChat", () => {
  it("SeniorChat shows owner and tutor messages", () => {
    const { container } = setup({
      chat: [
        { who: "owner", markdown: "What next?" },
        { who: "tutor", markdown: "Start **unit 2**." },
        { who: "owner", markdown: "Thanks" },
      ],
    });
    const msgs = Array.from(container.querySelectorAll(".chat > .chat-msg"));
    expect(msgs.map((m) => m.className)).toEqual([
      "chat-msg is-owner",
      "chat-msg is-tutor",
      "chat-msg is-owner",
    ]);
    expect(msgs[0].textContent).toBe("What next?");
    expect(msgs[1].querySelector("strong")?.textContent).toBe("unit 2");
  });

  it("SeniorChat sends a trimmed message and clears the box", async () => {
    const { onSend } = setup();
    await userEvent.type(box(), "  hello  ");
    await userEvent.click(send());
    expect(onSend).toHaveBeenCalledWith("hello");
    expect(box().value).toBe("");
    await userEvent.type(box(), "again");
    fireEvent.keyDown(box(), { key: "Enter", ctrlKey: true });
    expect(onSend).toHaveBeenLastCalledWith("again");
    expect(box().value).toBe("");
  });

  it("message box limits", () => {
    const { unmount } = setup();
    expect(send().disabled).toBe(true);
    fireEvent.change(box(), { target: { value: "   " } });
    expect(send().disabled).toBe(true);
    fireEvent.change(box(), { target: { value: "a".repeat(4001) } });
    expect(send().disabled).toBe(true);
    fireEvent.change(box(), { target: { value: "a".repeat(4000) } });
    expect(send().disabled).toBe(false);
    unmount();
    setup({ busy: true });
    fireEvent.change(box(), { target: { value: "hi" } });
    expect(send().disabled).toBe(true);
  });

  it("proposed_change_accept_and_dismiss (display)", async () => {
    const none = setup();
    expect(screen.queryByText("Proposed change")).toBeNull();
    none.unmount();
    const { onResolve } = setup({ pendingChange: { kind: "remove", unitId: "u2" } });
    expect(screen.getByText("Proposed change")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(onResolve).toHaveBeenLastCalledWith(true);
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onResolve).toHaveBeenLastCalledWith(false);
  });

  it("SeniorChat describes each kind of change", () => {
    const unit = { id: "u9", title: "Forces", goal: "Know Newton.", files: ["f.md"] };
    const a = setup({ pendingChange: { kind: "add", unit, afterId: null } });
    expect(screen.getByText("Add unit: Forces")).toBeTruthy();
    expect(screen.getByText("Know Newton.").className).toBe("note");
    a.unmount();
    const r = setup({ pendingChange: { kind: "remove", unitId: "u3" } });
    expect(screen.getByText("Remove unit: u3")).toBeTruthy();
    r.unmount();
    setup({ pendingChange: { kind: "reorder", order: ["u2", "u1", "u3"] } });
    expect(screen.getByText("New order: u2, u1, u3")).toBeTruthy();
  });

  it("SeniorChat disables Accept and Dismiss while a reply is on the way", () => {
    setup({ busy: true, pendingChange: { kind: "remove", unitId: "u1" } });
    expect((screen.getByRole("button", { name: "Accept" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect((screen.getByRole("button", { name: "Dismiss" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });
});
