// @vitest-environment jsdom
import "../helpers/dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { OutlineReview } from "../../src/renderer/src/components/OutlineReview";
import type { Unit } from "../../src/shared/types";

function unit(n: number): Unit {
  return { id: `u${n}`, title: `Title ${n}`, goal: `Goal ${n}`, files: [`f${n}.md`] };
}

function setup(count = 3) {
  const units = Array.from({ length: count }, (_, i) => unit(i + 1));
  const onAccept = vi.fn();
  render(<OutlineReview units={units} onAccept={onAccept} />);
  return { units, onAccept };
}

describe("OutlineReview", () => {
  it("OutlineReview shows a title and a goal box per unit", () => {
    setup(3);
    for (const n of [1, 2, 3]) {
      expect((screen.getByLabelText(`Title of unit ${n}`) as HTMLInputElement).value).toBe(
        `Title ${n}`,
      );
      expect((screen.getByLabelText(`Goal of unit ${n}`) as HTMLTextAreaElement).value).toBe(
        `Goal ${n}`,
      );
    }
  });

  it("outline_can_be_edited_before_accept", async () => {
    const user = userEvent.setup();
    const { onAccept } = setup(4);
    const t1 = screen.getByLabelText("Title of unit 1");
    await user.clear(t1);
    await user.type(t1, "New one");
    const g2 = screen.getByLabelText("Goal of unit 2");
    await user.clear(g2);
    await user.type(g2, "New goal");
    await user.click(screen.getAllByLabelText("Move up")[2]);
    await user.click(screen.getAllByLabelText("Remove unit")[3]);
    await user.click(screen.getByRole("button", { name: "Accept outline" }));
    expect(onAccept).toHaveBeenCalledWith([
      { id: "u1", title: "New one", goal: "Goal 1", files: ["f1.md"] },
      { id: "u3", title: "Title 3", goal: "Goal 3", files: ["f3.md"] },
      { id: "u2", title: "Title 2", goal: "New goal", files: ["f2.md"] },
    ]);
  });

  it("OutlineReview cannot go below 2 units", () => {
    setup(2);
    for (const b of screen.getAllByLabelText("Remove unit")) {
      expect((b as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it("OutlineReview disables up on the first and down on the last unit", () => {
    setup(3);
    const up = screen.getAllByLabelText("Move up") as HTMLButtonElement[];
    const down = screen.getAllByLabelText("Move down") as HTMLButtonElement[];
    expect(up[0].disabled).toBe(true);
    expect(up[1].disabled).toBe(false);
    expect(down[2].disabled).toBe(true);
    expect(down[0].disabled).toBe(false);
  });

  it("OutlineReview does not accept an empty title or goal", async () => {
    const user = userEvent.setup();
    setup(3);
    const accept = screen.getByRole("button", { name: "Accept outline" }) as HTMLButtonElement;
    expect(accept.disabled).toBe(false);
    await user.clear(screen.getByLabelText("Title of unit 1"));
    expect(accept.disabled).toBe(true);
    await user.type(screen.getByLabelText("Title of unit 1"), "x");
    expect(accept.disabled).toBe(false);
    await user.clear(screen.getByLabelText("Goal of unit 2"));
    await user.type(screen.getByLabelText("Goal of unit 2"), "   ");
    expect(accept.disabled).toBe(true);
  });
});
