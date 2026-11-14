import { CLI_ORDER } from "../shared/clis";
import { METHOD_MAX, MODEL_MAX, PROFILE_MAX } from "../shared/limits";
import type { CliId, Settings } from "../shared/types";

export const EFFORTS: Record<CliId, string[]> = {
  codex: ["low", "medium", "high"],
  claude: ["low", "medium", "high", "xhigh", "max"],
  gemini: [],
};

export const DEFAULT_SETTINGS: Settings = {
  voice: { language: "en", voice: "aura-2-thalia-en" },
  theme: "dark",
  method: "",
  instructions: "",
  clis: {
    codex: { model: "", effort: "" },
    claude: { model: "", effort: "" },
    gemini: { model: "", effort: "" },
  },
};

const THEMES = ["dark", "light", "system"];
const MODEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/[\]@-]*$/;

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export function mergeSettings(raw: unknown): Settings {
  const obj = isObject(raw) ? raw : {};
  const voice = isObject(obj.voice) ? obj.voice : {};
  const clis = isObject(obj.clis) ? obj.clis : {};
  const pick = (value: unknown, fallback: string): string =>
    typeof value === "string" ? value.trim() : fallback;
  const theme = THEMES.includes(obj.theme as string)
    ? (obj.theme as Settings["theme"])
    : DEFAULT_SETTINGS.theme;
  const entry = (id: CliId): { model: string; effort: string } => {
    const c = isObject(clis[id]) ? clis[id] : {};
    return {
      model: typeof c.model === "string" ? c.model.trim() : "",
      effort: typeof c.effort === "string" && EFFORTS[id].includes(c.effort) ? c.effort : "",
    };
  };
  return {
    voice: {
      language: pick(voice.language, DEFAULT_SETTINGS.voice.language),
      voice: pick(voice.voice, DEFAULT_SETTINGS.voice.voice),
    },
    theme,
    method: typeof obj.method === "string" ? obj.method : "",
    instructions: typeof obj.instructions === "string" ? obj.instructions : "",
    clis: { codex: entry("codex"), claude: entry("claude"), gemini: entry("gemini") },
  };
}

export function validateSettings(s: Settings): string | null {
  const ok = /^[A-Za-z0-9-]{1,40}$/;
  if (!(ok.test(s.voice.language) && ok.test(s.voice.voice))) {
    return "Enter a speech language and a voice.";
  }
  if (!THEMES.includes(s.theme)) return "Choose a theme.";
  if (s.method.length > METHOD_MAX) return "Keep it under 6000 characters.";
  if (s.instructions.length > PROFILE_MAX) return "Keep it under 2000 characters.";
  for (const id of CLI_ORDER) {
    const { model, effort } = s.clis[id];
    if (model !== "" && (model.length > MODEL_MAX || !MODEL_PATTERN.test(model))) {
      return "Enter a model name without spaces.";
    }
    if (effort !== "" && !EFFORTS[id].includes(effort)) return "Choose an effort from the list.";
  }
  return null;
}

export function cliChoice(
  settings: Settings | null,
  cli: CliId,
): { model: string | null; effort: string | null } {
  const c = settings?.clis[cli];
  const model = c ? c.model.trim() : "";
  const efforts = EFFORTS[cli] as string[] | undefined;
  return {
    model: model === "" ? null : model,
    effort: c && efforts && efforts.includes(c.effort) ? c.effort : null,
  };
}
