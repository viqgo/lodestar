// @vitest-environment jsdom
import "../helpers/dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Banner } from "../../src/renderer/src/components/Banner";

describe("Banner", () => {
  it("Banner shows its message", () => {
    const { container } = render(<Banner kind="error" message="Codex failed: x" />);
    expect(screen.getByText("Codex failed: x")).toBeInTheDocument();
    const root = container.firstElementChild;
    expect(root).toHaveClass("banner");
    expect(root).toHaveClass("is-error");
  });

  it("Banner action button calls back", async () => {
    const fn = vi.fn();
    const { container } = render(
      <Banner kind="info" message="Stopped." actionLabel="Retry" onAction={fn} />,
    );
    await userEvent.setup().click(screen.getByRole("button", { name: "Retry" }));
    expect(fn).toHaveBeenCalledTimes(1);
    expect(container.firstElementChild).toHaveClass("is-info");
  });

  it("Banner has no button without an action", () => {
    render(<Banner kind="error" message="m" />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
