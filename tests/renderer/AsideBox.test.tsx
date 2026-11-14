// @vitest-environment jsdom
import "../helpers/dom";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AsideBox } from "../../src/renderer/src/components/AsideBox";

describe("AsideBox", () => {
  it("AsideBox sends a trimmed question and empties the box", async () => {
    const onAsk = vi.fn();
    render(<AsideBox disabled={false} onAsk={onAsk} />);
    const box = screen.getByLabelText("Ask a side question");
    await userEvent.type(box, "  why?  ");
    await userEvent.click(screen.getByRole("button", { name: "Ask" }));
    expect(onAsk).toHaveBeenCalledWith("why?");
    expect(box).toHaveValue("");
  });

  it("AsideBox cannot send while disabled, empty or over 4000 characters", () => {
    const { rerender } = render(<AsideBox disabled={true} onAsk={vi.fn()} />);
    expect(screen.getByLabelText("Ask a side question")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Ask" })).toBeDisabled();
    rerender(<AsideBox disabled={false} onAsk={vi.fn()} />);
    const box = screen.getByLabelText("Ask a side question");
    const button = screen.getByRole("button", { name: "Ask" });
    expect(button).toBeDisabled();
    fireEvent.change(box, { target: { value: "   " } });
    expect(button).toBeDisabled();
    fireEvent.change(box, { target: { value: "a".repeat(4001) } });
    expect(button).toBeDisabled();
    fireEvent.change(box, { target: { value: "a".repeat(4000) } });
    expect(button).toBeEnabled();
  });

  it("AsideBox sends on Cmd+Enter", () => {
    const onAsk = vi.fn();
    render(<AsideBox disabled={false} onAsk={onAsk} />);
    const box = screen.getByLabelText("Ask a side question");
    fireEvent.keyDown(box, { key: "Enter", metaKey: true });
    fireEvent.keyDown(box, { key: "Enter", ctrlKey: true });
    expect(onAsk).not.toHaveBeenCalled();
    fireEvent.change(box, { target: { value: "one" } });
    fireEvent.keyDown(box, { key: "Enter", metaKey: true });
    expect(onAsk).toHaveBeenCalledTimes(1);
    expect(onAsk).toHaveBeenLastCalledWith("one");
    fireEvent.change(box, { target: { value: "two" } });
    fireEvent.keyDown(box, { key: "Enter", ctrlKey: true });
    expect(onAsk).toHaveBeenCalledTimes(2);
    expect(onAsk).toHaveBeenLastCalledWith("two");
  });
});
