import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  EFFORTS,
  cliChoice,
  mergeSettings,
  validateSettings,
} from "../../src/core/settings";
import { MODEL_MAX } from "../../src/shared/limits";
import type { CliId, Settings } from "../../src/shared/types";

const TEXT = "Enter a speech language and a voice.";

describe("settings", () => {
  it("mergeSettings returns the defaults for anything that is not a settings object", () => {
    for (const raw of [null, 3, "x", [], {}, { voice: 1 }]) {
      const merged = mergeSettings(raw);
      expect(merged).toEqual(DEFAULT_SETTINGS);
      expect(merged).not.toBe(DEFAULT_SETTINGS);
      expect(merged.voice).not.toBe(DEFAULT_SETTINGS.voice);
    }
  });

  it("mergeSettings keeps good values, trims them and replaces wrong ones", () => {
    expect(mergeSettings({ voice: { language: " de ", voice: 7 }, extra: 1 })).toEqual({
      ...DEFAULT_SETTINGS,
      voice: { language: "de", voice: "aura-2-thalia-en" },
    });
  });

  it("validateSettings accepts the defaults and refuses a bad language or voice", () => {
    expect(validateSettings(DEFAULT_SETTINGS)).toBeNull();
    const ok = DEFAULT_SETTINGS.voice;
    for (const bad of ["", "en US", "en&x=1", "a".repeat(41)]) {
      expect(validateSettings({ ...DEFAULT_SETTINGS, voice: { ...ok, language: bad } })).toBe(TEXT);
      expect(validateSettings({ ...DEFAULT_SETTINGS, voice: { ...ok, voice: bad } })).toBe(TEXT);
    }
  });

  it("method_over_6000_refused", () => {
    expect(validateSettings({ ...DEFAULT_SETTINGS, method: "x".repeat(6000) })).toBeNull();
    expect(validateSettings({ ...DEFAULT_SETTINGS, method: "x".repeat(6001) })).toBe(
      "Keep it under 6000 characters.",
    );
    expect(mergeSettings({ method: "x".repeat(6001) }).method).toHaveLength(6001);
  });

  it("mergeSettings fills theme, method, instructions and clis", () => {
    const merged = mergeSettings({
      theme: "light",
      method: " M ",
      instructions: " I ",
      clis: {
        claude: { model: " sonnet ", effort: "max" },
        codex: { model: 7, effort: "xhigh" },
        gemini: { model: "g", effort: "low" },
        other: { model: "x" },
      },
    });
    expect(merged).toEqual({
      ...DEFAULT_SETTINGS,
      theme: "light",
      method: " M ",
      instructions: " I ",
      clis: {
        codex: { model: "", effort: "" },
        claude: { model: "sonnet", effort: "max" },
        gemini: { model: "g", effort: "" },
      },
    });
    expect(Object.keys(merged.clis)).not.toContain("other");
    for (const raw of [{ theme: "blue" }, { theme: 3 }, { clis: 5 }, { clis: { claude: "x" } }]) {
      expect(mergeSettings(raw)).toEqual(DEFAULT_SETTINGS);
    }
    const fresh = mergeSettings(null);
    expect(fresh.clis).not.toBe(DEFAULT_SETTINGS.clis);
    for (const id of ["codex", "claude", "gemini"] as CliId[]) {
      expect(fresh.clis[id]).not.toBe(DEFAULT_SETTINGS.clis[id]);
    }
  });

  it("validateSettings checks theme, instructions, models and efforts", () => {
    expect(EFFORTS).toEqual({
      codex: ["low", "medium", "high"],
      claude: ["low", "medium", "high", "xhigh", "max"],
      gemini: [],
    });
    const ids: CliId[] = ["codex", "claude", "gemini"];
    const withCli = (id: CliId, patch: { model?: string; effort?: string }): Settings => ({
      ...DEFAULT_SETTINGS,
      clis: { ...DEFAULT_SETTINGS.clis, [id]: { ...DEFAULT_SETTINGS.clis[id], ...patch } },
    });
    expect(validateSettings({ ...DEFAULT_SETTINGS, theme: "blue" as never })).toBe(
      "Choose a theme.",
    );
    expect(validateSettings({ ...DEFAULT_SETTINGS, instructions: "x".repeat(2001) })).toBe(
      "Keep it under 2000 characters.",
    );
    expect(validateSettings({ ...DEFAULT_SETTINGS, instructions: "x".repeat(2000) })).toBeNull();
    for (const id of ids) {
      for (const bad of ["--yolo", "-m", "a b", "a\nb", "x".repeat(101)]) {
        expect(validateSettings(withCli(id, { model: bad }))).toBe(
          "Enter a model name without spaces.",
        );
      }
      for (const good of [
        "sonnet",
        "opus[1m]",
        "claude-sonnet-5-5",
        "gpt-5.5-codex",
        "us.anthropic.claude-x:0",
        "models/gemini-x",
        "x".repeat(100),
      ]) {
        expect(validateSettings(withCli(id, { model: good }))).toBeNull();
      }
    }
    expect(validateSettings(withCli("codex", { effort: "xhigh" }))).toBe(
      "Choose an effort from the list.",
    );
    expect(validateSettings(withCli("gemini", { effort: "low" }))).toBe(
      "Choose an effort from the list.",
    );
    for (const effort of EFFORTS.claude) {
      expect(validateSettings(withCli("claude", { effort }))).toBeNull();
    }
    expect(
      validateSettings({
        ...DEFAULT_SETTINGS,
        voice: { language: "en US", voice: "x" },
        theme: "blue" as never,
      }),
    ).toBe(TEXT);
  });

  it("cliChoice gives the model and effort of one cli", () => {
    const settings: Settings = {
      ...DEFAULT_SETTINGS,
      clis: {
        claude: { model: " sonnet ", effort: "medium" },
        codex: { model: "", effort: "low" },
        gemini: { model: "g", effort: "high" },
      },
    };
    expect(cliChoice(settings, "claude")).toEqual({ model: "sonnet", effort: "medium" });
    expect(cliChoice(settings, "codex")).toEqual({ model: null, effort: "low" });
    expect(cliChoice(settings, "gemini")).toEqual({ model: "g", effort: null });
    const none = { model: null, effort: null };
    expect(cliChoice(null, "codex")).toEqual(none);
    expect(cliChoice(DEFAULT_SETTINGS, "claude")).toEqual(none);
    expect(cliChoice(DEFAULT_SETTINGS, "nope" as CliId)).toEqual(none);
  });

  it("a model name that fails the pattern never reaches a CLI", () => {
    const bad = mergeSettings({ clis: { gemini: { model: "--yolo" } } });
    expect(cliChoice(bad, "gemini").model).toBeNull();
    const long = mergeSettings({ clis: { gemini: { model: "a".repeat(MODEL_MAX + 1) } } });
    expect(cliChoice(long, "gemini").model).toBeNull();
    const good = mergeSettings({ clis: { gemini: { model: " gemini-2.5-pro " } } });
    expect(cliChoice(good, "gemini").model).toBe("gemini-2.5-pro");
  });
});
