// @vitest-environment jsdom
import "../helpers/dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Flashcards } from "../../src/renderer/src/components/Flashcards";
import { installApi } from "../helpers/dom";
import { K, dueItem } from "../helpers/fixtures";

const due = () => [dueItem(1, { front: "front 1", box: 2 }), dueItem(2, { front: "front 2" })];

describe("Flashcards", () => {
  it("Flashcards shows the front and the box mark", () => {
    installApi();
    render(<Flashcards due={due()} onGrade={vi.fn()} />);
    expect(screen.getByText("front 1")).toBeVisible();
    expect(screen.getByText("box 2")).toHaveClass("box-2");
    expect(screen.queryByText("t1")).toBeNull();
  });

  it("Flashcards hides the answer until Show answer", async () => {
    installApi();
    render(<Flashcards due={due()} onGrade={vi.fn()} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Show answer" }));
    expect(screen.getByText("t1")).toBeVisible();
    expect(screen.getByRole("button", { name: "I knew it" })).toBeVisible();
    expect(screen.getByRole("button", { name: "I did not" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Show answer" })).toBeNull();
  });

  it("flashcard_grades_update_box", async () => {
    installApi();
    const onGrade = vi.fn();
    const user = userEvent.setup();
    render(<Flashcards due={due()} onGrade={onGrade} />);
    await user.click(screen.getByRole("button", { name: "Show answer" }));
    await user.click(screen.getByRole("button", { name: "I knew it" }));
    expect(onGrade).toHaveBeenCalledWith(K(1).id, true);
    expect(screen.getByText("front 2")).toBeVisible();
    expect(screen.queryByText("t2")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Show answer" }));
    await user.click(screen.getByRole("button", { name: "I did not" }));
    expect(onGrade).toHaveBeenCalledWith(K(2).id, false);
  });

  it("flashcard_review_makes_no_call", async () => {
    const { api } = installApi();
    const user = userEvent.setup();
    render(<Flashcards due={due()} onGrade={vi.fn()} />);
    for (const name of ["I knew it", "I did not"]) {
      await user.click(screen.getByRole("button", { name: "Show answer" }));
      await user.click(screen.getByRole("button", { name }));
    }
    for (const fn of Object.values(api)) {
      if (typeof fn === "function" && "mock" in fn) {
        expect((fn as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
      }
    }
  });

  it("Flashcards shows nothing after the last card", async () => {
    installApi();
    const user = userEvent.setup();
    const { container } = render(<Flashcards due={due()} onGrade={vi.fn()} />);
    for (let i = 0; i < 2; i++) {
      await user.click(screen.getByRole("button", { name: "Show answer" }));
      await user.click(screen.getByRole("button", { name: "I knew it" }));
    }
    expect(container).toBeEmptyDOMElement();
  });
});
