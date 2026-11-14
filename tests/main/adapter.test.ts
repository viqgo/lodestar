import { describe, it, expect } from "vitest";
import { extraPathDirs, resolveCommand } from "../../src/main/cli/adapter";

describe("adapter", () => {
  it("extraPathDirs lists the common install folders", () => {
    expect(extraPathDirs("/Users/x")).toEqual([
      "/opt/homebrew/bin",
      "/usr/local/bin",
      "/Users/x/.local/bin",
      "/Users/x/.npm-global/bin",
    ]);
  });

  it("resolveCommand finds the command on PATH first", () => {
    expect(
      resolveCommand("codex", "/a:/b", ["/c"], (p) => p === "/b/codex" || p === "/c/codex"),
    ).toBe("/b/codex");
  });

  it("resolveCommand falls back to the extra folders", () => {
    expect(resolveCommand("codex", "/a:/b", ["/c"], (p) => p === "/c/codex")).toBe("/c/codex");
  });

  it("resolveCommand returns null when nothing exists", () => {
    expect(resolveCommand("codex", "/a:/b", ["/c"], () => false)).toBeNull();
  });
});
