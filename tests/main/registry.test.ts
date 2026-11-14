import { describe, expect, it, vi } from "vitest";
import type { CliAdapter } from "../../src/main/cli/adapter";
import { createAdapters, detectAll } from "../../src/main/cli/registry";
import type { CliId } from "../../src/shared/types";

const hand = (id: CliId, detect: CliAdapter["detect"]): CliAdapter => ({
  id,
  label: id,
  retries: 1,
  detect,
  run: async () => ({ ok: false, kind: "failed", message: "unused" }),
});

describe("registry", () => {
  it("createAdapters builds one adapter per CLI", () => {
    const adapters = createAdapters({
      spawn: (() => {}) as any,
      env: {},
      home: "/home/x",
      tmpRoot: "/tmp",
      fs: {} as any,
    });
    expect(Object.keys(adapters).sort()).toEqual(["claude", "codex", "gemini"]);
    for (const id of ["codex", "claude", "gemini"] as const) expect(adapters[id].id).toBe(id);
    expect(adapters.codex.label).toBe("Codex");
    expect(adapters.claude.label).toBe("Claude Code");
    expect(adapters.gemini.label).toBe("Gemini");
  });

  it("detect_checks_all_three_clis", async () => {
    const a = vi.fn(async () => ({ ok: true as const, version: "1.0.0" }));
    const b = vi.fn(async () => ({ ok: false as const }));
    const c = vi.fn(async () => {
      throw new Error("boom");
    });
    const result = await detectAll({
      codex: hand("codex", a),
      claude: hand("claude", b),
      gemini: hand("gemini", c),
    });
    expect(result).toEqual([
      { id: "codex", installed: true, version: "1.0.0" },
      { id: "claude", installed: false, version: null },
      { id: "gemini", installed: false, version: null },
    ]);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    expect(c).toHaveBeenCalledTimes(1);
  });
});
