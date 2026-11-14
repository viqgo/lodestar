// @vitest-environment jsdom
import "../helpers/dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ThinkingBar } from "../../src/renderer/src/components/ThinkingBar";

describe("ThinkingBar", () => {
  it("ThinkingBar shows the text", () => {
    render(<ThinkingBar onStop={vi.fn()} />);
    expect(screen.getByText("Thinking…")).toBeVisible();
  });

  it("ThinkingBar Stop calls back", async () => {
    const fn = vi.fn();
    render(<ThinkingBar onStop={fn} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Stop" }));
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
