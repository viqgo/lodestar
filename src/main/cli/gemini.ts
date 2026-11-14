import path from "node:path";
import { STDERR_MAX } from "../../shared/limits";
import type { DetectResult, RunRequest, RunResult } from "../../shared/types";
import type { CliAdapter } from "./adapter";
import {
  detectVersion,
  failureResult,
  findCommand,
  lastStderrLine,
  runProcess,
  type ProcessDeps,
} from "./process";

export const GEMINI_EXCLUDED_TOOLS = [
  "run_shell_command",
  "replace",
  "write_file",
  "read_file",
  "read_many_files",
  "glob",
  "grep_search",
  "list_directory",
  "web_fetch",
  "google_web_search",
  "invoke_agent",
  "activate_skill",
  "ask_user",
  "write_todos",
  "list_mcp_resources",
  "read_mcp_resource",
];

export function extractJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function findJson<T>(
  text: string,
  pick: (o: Record<string, unknown>) => T | undefined,
): T | undefined {
  for (let i = text.indexOf("{"); i !== -1; i = text.indexOf("{", i + 1)) {
    const obj = extractJsonObject(text.slice(i));
    if (obj === null) continue;
    try {
      const parsed: unknown = JSON.parse(obj);
      if (typeof parsed === "object" && parsed !== null) {
        const found = pick(parsed as Record<string, unknown>);
        if (found !== undefined) return found;
      }
    } catch {
      // try the next brace
    }
  }
  return undefined;
}

export function geminiErrorMessage(stderr: string): string {
  const message = findJson(stderr, (o) => {
    const m = (o.error as { message?: unknown } | null | undefined)?.message;
    return typeof m === "string" ? m.slice(0, STDERR_MAX) : undefined;
  });
  return message ?? lastStderrLine(stderr);
}

export function geminiPrompt(prompt: string, schema: object): string {
  return (
    prompt +
    "\n# Reply format\nReply with exactly one JSON object and nothing else: no code fence, no text before or after it. It must match this JSON Schema:\n" +
    JSON.stringify(schema) +
    "\n"
  );
}

export function createGeminiAdapter(deps: ProcessDeps): CliAdapter {
  const command = (): string | null => findCommand(deps, "gemini", "LEARN_GEMINI_PATH");
  return {
    id: "gemini",
    label: "Gemini",
    retries: 2,
    detect(): Promise<DetectResult> {
      return detectVersion(deps, command());
    },
    async run(req: RunRequest): Promise<RunResult> {
      const r = await runProcess(deps, {
        command: command(),
        args: () => ["-p", "", "-o", "json", "--approval-mode", "plan", "--skip-trust"],
        stdin: geminiPrompt(req.prompt, req.schema),
        signal: req.signal,
        timeoutMs: req.timeoutMs,
        prepare: (d) => {
          deps.fs.mkdirSync(path.join(d.work, ".gemini"));
          deps.fs.writeFileSync(
            path.join(d.work, ".gemini", "settings.json"),
            JSON.stringify({ tools: { exclude: GEMINI_EXCLUDED_TOOLS } }),
          );
        },
      });
      if (r.kind !== "exit") return failureResult(r, "Gemini", req.timeoutMs);
      if (r.code !== 0) return { ok: false, kind: "failed", message: geminiErrorMessage(r.stderr) };
      const response = findJson(r.stdout, (o) =>
        typeof o.response === "string" ? o.response : undefined,
      );
      if (response === undefined) {
        return { ok: false, kind: "failed", message: "Gemini returned no message" };
      }
      return { ok: true, text: extractJsonObject(response) ?? response, usage: null };
    },
  };
}
