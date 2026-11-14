import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, mergeSettings, validateSettings } from "../../src/core/settings";

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
      voice: { language: "de", voice: "aura-2-thalia-en" },
    });
  });

  it("validateSettings accepts the defaults and refuses a bad language or voice", () => {
    expect(validateSettings(DEFAULT_SETTINGS)).toBeNull();
    const ok = DEFAULT_SETTINGS.voice;
    for (const bad of ["", "en US", "en&x=1", "a".repeat(41)]) {
      expect(validateSettings({ voice: { ...ok, language: bad } })).toBe(TEXT);
      expect(validateSettings({ voice: { ...ok, voice: bad } })).toBe(TEXT);
    }
  });
});
