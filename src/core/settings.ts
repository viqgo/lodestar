import type { Settings } from "../shared/types";

export const DEFAULT_SETTINGS: Settings = { voice: { language: "en", voice: "aura-2-thalia-en" } };

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export function mergeSettings(raw: unknown): Settings {
  const voice = isObject(raw) && isObject(raw.voice) ? raw.voice : {};
  const pick = (value: unknown, fallback: string): string =>
    typeof value === "string" ? value.trim() : fallback;
  return {
    voice: {
      language: pick(voice.language, DEFAULT_SETTINGS.voice.language),
      voice: pick(voice.voice, DEFAULT_SETTINGS.voice.voice),
    },
  };
}

export function validateSettings(s: Settings): string | null {
  const ok = /^[A-Za-z0-9-]{1,40}$/;
  return ok.test(s.voice.language) && ok.test(s.voice.voice)
    ? null
    : "Enter a speech language and a voice.";
}
