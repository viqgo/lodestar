// @vitest-environment jsdom
import "../helpers/dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "../../src/renderer/src/components/ConfirmDialog";

const MESSAGE = "Delete this lesson? This cannot be undone.";

describe("ConfirmDialog", () => {
  it("ConfirmDialog shows message and labels", () => {
    render(
      <ConfirmDialog
        message={MESSAGE}
        confirmLabel="Delete"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText(MESSAGE)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });

  it("ConfirmDialog confirm calls back", async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        message={MESSAGE}
        confirmLabel="Delete"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    await userEvent.setup().click(screen.getByRole("button", { name: "Delete" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("ConfirmDialog cancel calls back", async () => {
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        message={MESSAGE}
        confirmLabel="Delete"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );
    await userEvent.setup().click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("ConfirmDialog Escape cancels", async () => {
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        message={MESSAGE}
        confirmLabel="Delete"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );
    await userEvent.setup().keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("dialog_traps_focus", async () => {
    const user = userEvent.setup();
    render(
      <>
        <button>outside</button>
        <ConfirmDialog
          message={MESSAGE}
          confirmLabel="Delete"
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />
      </>,
    );
    const cancel = screen.getByRole("button", { name: "Cancel" });
    const confirm = screen.getByRole("button", { name: "Delete" });
    const outside = screen.getByRole("button", { name: "outside" });
    expect(confirm).toHaveFocus();
    await user.tab();
    expect(cancel).toHaveFocus();
    await user.tab();
    expect(confirm).toHaveFocus();
    await user.tab({ shift: true });
    expect(cancel).toHaveFocus();
    await user.tab({ shift: true });
    expect(confirm).toHaveFocus();
    expect(outside).not.toHaveFocus();
    outside.focus();
    await user.tab();
    expect(cancel).toHaveFocus();
  });
});
