// @vitest-environment jsdom
import "../helpers/dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CallBar } from "../../src/renderer/src/components/CallBar";
import type { CallState } from "../../src/shared/types";

function renderBar(state: CallState, hasKey: boolean) {
  const fns = { onStart: vi.fn(), onSkip: vi.fn(), onStartOver: vi.fn(), onEnd: vi.fn() };
  render(<CallBar state={state} hasKey={hasKey} {...fns} />);
  return fns;
}

describe("CallBar", () => {
  it("start_call_disabled_without_key", async () => {
    const { unmount } = render(
      <CallBar
        state="off"
        hasKey={false}
        onStart={vi.fn()}
        onSkip={vi.fn()}
        onStartOver={vi.fn()}
        onEnd={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Start call" })).toBeDisabled();
    expect(screen.getByText("Add a Deepgram key in Profile to use voice.")).toBeInTheDocument();
    unmount();
    const fns = renderBar("off", true);
    expect(screen.getByRole("button", { name: "Start call" })).toBeEnabled();
    expect(screen.queryByText("Add a Deepgram key in Profile to use voice.")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Start call" }));
    expect(fns.onStart).toHaveBeenCalledTimes(1);
  });

  it("CallBar shows the state during a call", () => {
    for (const state of ["listening", "thinking", "speaking"] as const) {
      const { unmount } = render(
        <CallBar
          state={state}
          hasKey={true}
          onStart={vi.fn()}
          onSkip={vi.fn()}
          onStartOver={vi.fn()}
          onEnd={vi.fn()}
        />,
      );
      expect(screen.getByText(`On call · ${state}`)).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Start call" })).toBeNull();
      unmount();
    }
  });

  it("CallBar buttons call back", async () => {
    const fns = renderBar("listening", true);
    await userEvent.click(screen.getByRole("button", { name: "Skip" }));
    await userEvent.click(screen.getByRole("button", { name: "Start over" }));
    const end = screen.getByRole("button", { name: "End call" });
    expect(end).toHaveClass("is-danger");
    await userEvent.click(end);
    expect(fns.onSkip).toHaveBeenCalledTimes(1);
    expect(fns.onStartOver).toHaveBeenCalledTimes(1);
    expect(fns.onEnd).toHaveBeenCalledTimes(1);
  });
});
