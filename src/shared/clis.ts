import type { CliId, CliStatus, RunOptions } from "./types";

export const CLI_ORDER: CliId[] = ["codex", "claude", "gemini"];

export const CLI_INFO: Record<CliId, { label: string; experimental: boolean }> = {
  codex: { label: "Codex", experimental: false },
  claude: { label: "Claude Code", experimental: false },
  gemini: { label: "Gemini", experimental: true },
};

export function isCliId(x: unknown): x is CliId {
  return typeof x === "string" && (CLI_ORDER as string[]).includes(x);
}

export function cliName(id: CliId): string {
  const info = CLI_INFO[id];
  return info.experimental ? `${info.label} (experimental)` : info.label;
}

export function defaultCli(statuses: CliStatus[], lastUsed: CliId | null): CliId | null {
  const installed = (id: CliId): boolean => statuses.some((s) => s.id === id && s.installed);
  if (lastUsed !== null && installed(lastUsed)) return lastUsed;
  return CLI_ORDER.find(installed) ?? null;
}

export const NO_OPTIONS: RunOptions = {
  readDirs: [],
  images: [],
  webSearch: false,
  model: null,
  effort: null,
};
