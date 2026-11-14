// @vitest-environment jsdom
import "../helpers/dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MaterialControls } from "../../src/renderer/src/components/MaterialControls";

type Over = Partial<Parameters<typeof MaterialControls>[0]>;

function props(over: Over = {}) {
  return {
    cli: null,
    folder: null,
    attachments: [],
    webSearch: false,
    disabled: false,
    onPickFolder: vi.fn(),
    onRemoveFolder: vi.fn(),
    onAttach: vi.fn(),
    onRemoveAttachment: vi.fn(),
    onWebSearch: vi.fn(),
    ...over,
  } as Parameters<typeof MaterialControls>[0];
}

describe("MaterialControls", () => {
  it("MaterialControls offers to choose a folder", async () => {
    const p = props();
    render(<MaterialControls {...p} />);
    expect(screen.getByText("Material folder")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Choose folder" }));
    expect(p.onPickFolder).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Change" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Remove" })).toBeNull();
  });

  it("MaterialControls shows the folder name with Change and Remove", async () => {
    const p = props({ folder: "/Users/me/notes/physics" });
    render(<MaterialControls {...p} />);
    expect(screen.getByText("physics")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Choose folder" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Change" }));
    expect(p.onPickFolder).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(p.onRemoveFolder).toHaveBeenCalledTimes(1);
  });

  it("folder_note_matches_tutor (display)", () => {
    const { rerender } = render(<MaterialControls {...props({ folder: "/a/b", cli: "codex" })} />);
    expect(
      screen.getByText(
        "Codex cannot change your files, but it is able to read other files on this Mac.",
      ),
    ).toBeInTheDocument();
    rerender(<MaterialControls {...props({ folder: "/a/b", cli: "claude" })} />);
    expect(screen.getByText("Claude Code can only read inside this folder.")).toBeInTheDocument();
    rerender(<MaterialControls {...props({ folder: "/a/b", cli: "gemini" })} />);
    expect(
      screen.getByText("Gemini is experimental: what it can read has not been verified."),
    ).toBeInTheDocument();
    rerender(<MaterialControls {...props({ folder: null, cli: "codex" })} />);
    expect(document.querySelector(".note")).toBeNull();
    rerender(<MaterialControls {...props({ folder: "/a/b", cli: null })} />);
    expect(document.querySelector(".note")).toBeNull();
  });

  it("MaterialControls lists attachments and removes one", async () => {
    const p = props({
      attachments: [
        { name: "unit1.pdf", key: "k1" },
        { name: "board.jpg", key: "k2" },
      ],
    });
    render(<MaterialControls {...p} />);
    expect(screen.getByText("unit1.pdf").closest(".chip")).not.toBeNull();
    expect(screen.getByText("board.jpg").closest(".chip")).not.toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Remove board.jpg" }));
    expect(p.onRemoveAttachment).toHaveBeenCalledWith("k2");
    await userEvent.click(screen.getByRole("button", { name: "Attach files" }));
    expect(p.onAttach).toHaveBeenCalledTimes(1);
  });

  it("MaterialControls toggles web search", async () => {
    const p = props();
    const { rerender } = render(<MaterialControls {...p} />);
    const box = screen.getByRole("checkbox", { name: "Web search" });
    expect(box).not.toBeChecked();
    expect(box.closest("label")).toHaveClass("switch");
    await userEvent.click(box);
    expect(p.onWebSearch).toHaveBeenCalledWith(true);
    rerender(<MaterialControls {...props({ webSearch: true })} />);
    expect(screen.getByRole("checkbox", { name: "Web search" })).toBeChecked();
  });

  it("MaterialControls can be disabled", () => {
    render(
      <MaterialControls
        {...props({
          disabled: true,
          folder: "/a/b",
          attachments: [{ name: "x.pdf", key: "k" }],
        })}
      />,
    );
    for (const b of screen.getAllByRole("button")) expect(b).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Web search" })).toBeDisabled();
    expect(screen.getAllByRole("button")).toHaveLength(4);
  });
});
