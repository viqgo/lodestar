// @vitest-environment jsdom
import "../helpers/dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CliGate } from "../../src/renderer/src/components/CliGate";

describe("CliGate", () => {
  it("detect_reports_missing_cli", async () => {
    const onRetry = vi.fn();
    render(<CliGate cli={{ ok: false }} onRetry={onRetry} />);
    expect(
      screen.getByText("Codex CLI not found. Install it and sign in, then press Retry."),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
  it("CliGate is silent while checking", () => {
    const { container } = render(<CliGate cli={null} onRetry={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
  it("CliGate is silent when Codex is found", () => {
    const { container } = render(
      <CliGate cli={{ ok: true, version: "1.0.0" }} onRetry={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
