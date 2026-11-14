import { CLI_ORDER } from "../../shared/clis";
import type { CliId, CliStatus } from "../../shared/types";
import type { CliAdapter } from "./adapter";
import { createClaudeAdapter } from "./claude";
import { createCodexAdapter } from "./codex";
import { createGeminiAdapter } from "./gemini";
import type { ProcessDeps } from "./process";

export function createAdapters(deps: ProcessDeps): Record<CliId, CliAdapter> {
  return {
    codex: createCodexAdapter(deps),
    claude: createClaudeAdapter(deps),
    gemini: createGeminiAdapter(deps),
  };
}

export async function detectAll(adapters: Record<CliId, CliAdapter>): Promise<CliStatus[]> {
  return Promise.all(
    CLI_ORDER.map(async (id): Promise<CliStatus> => {
      try {
        const r = await adapters[id].detect();
        return r.ok
          ? { id, installed: true, version: r.version }
          : { id, installed: false, version: null };
      } catch {
        return { id, installed: false, version: null };
      }
    }),
  );
}
