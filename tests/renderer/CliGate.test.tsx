// @vitest-environment jsdom
import "../helpers/dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CliGate } from "../../src/renderer/src/components/CliGate";
import type { CliStatus } from "../../src/shared/types";

const NONE: CliStatus[] = [
  { id: "codex", installed: false, version: null },
  { id: "claude", installed: false, version: null },
  { id: "gemini", installed: false, version: null },
];
const BANNER =
  "No AI CLI found. Install Codex, Claude Code or Gemini CLI and sign in, then press Retry.";

describe("CliGate", () => {
  it("detect_reports_missing_cli", async () => {
    const onRetry = vi.fn();
    render(<CliGate clis={NONE} onRetry={onRetry} />);
    expect(screen.getByText(BANNER)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
  it("CliGate is silent while checking", () => {
    const { container } = render(<CliGate clis={null} onRetry={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
  it("CliGate is silent when Codex is found", () => {
    const { container } = render(
      <CliGate clis={[{ id: "codex", installed: true, version: "1.0.0" }]} onRetry={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
  it("no_cli_shows_install_banner", async () => {
    const onRetry = vi.fn();
    const { container, rerender } = render(<CliGate clis={NONE} onRetry={onRetry} />);
    expect(screen.getByText(BANNER)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    rerender(<CliGate clis={null} onRetry={onRetry} />);
    expect(container).toBeEmptyDOMElement();
    rerender(
      <CliGate
        clis={[
          { id: "codex", installed: false, version: null },
          { id: "claude", installed: true, version: "1" },
        ]}
        onRetry={onRetry}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
