import { describe, expect, it } from "vitest";
import { CLI_INFO, CLI_ORDER, cliName, defaultCli, isCliId } from "../../src/shared/clis";
import type { CliStatus } from "../../src/shared/types";

const status = (id: CliStatus["id"], installed: boolean): CliStatus => ({
  id,
  installed,
  version: installed ? "1.0.0" : null,
});

describe("clis", () => {
  it("cliName adds experimental to Gemini only", () => {
    expect(CLI_ORDER).toEqual(["codex", "claude", "gemini"]);
    expect(cliName("codex")).toBe("Codex");
    expect(cliName("claude")).toBe("Claude Code");
    expect(cliName("gemini")).toBe("Gemini (experimental)");
    expect(CLI_INFO.gemini.label).toBe("Gemini");
  });

  it("isCliId accepts the three ids only", () => {
    expect(isCliId("codex")).toBe(true);
    expect(isCliId("claude")).toBe(true);
    expect(isCliId("gemini")).toBe(true);
    expect(isCliId("gpt")).toBe(false);
    expect(isCliId("")).toBe(false);
    expect(isCliId(null)).toBe(false);
    expect(isCliId(5)).toBe(false);
  });

  it("defaultCli prefers the last used CLI when installed", () => {
    const all = [status("codex", true), status("claude", true), status("gemini", true)];
    expect(defaultCli(all, "claude")).toBe("claude");
  });

  it("defaultCli falls back to the first installed", () => {
    const some = [status("codex", false), status("claude", true), status("gemini", false)];
    expect(defaultCli(some, "codex")).toBe("claude");
    const gem = [status("codex", false), status("claude", false), status("gemini", true)];
    expect(defaultCli(gem, null)).toBe("gemini");
  });

  it("defaultCli is null when nothing is installed", () => {
    const none = [status("codex", false), status("claude", false), status("gemini", false)];
    expect(defaultCli(none, null)).toBeNull();
    expect(defaultCli(none, "codex")).toBeNull();
  });
});
