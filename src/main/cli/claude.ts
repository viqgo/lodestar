import { STDERR_MAX } from "../../shared/limits";
import type { DetectResult, RunRequest, RunResult, Usage } from "../../shared/types";
import type { CliAdapter } from "./adapter";
import {
  detectVersion,
  failureResult,
  findCommand,
  lastStderrLine,
  runProcess,
  type ProcessDeps,
} from "./process";

const UNREADABLE = "unreadable output";

export function parseClaudeResult(stdout: string): {
  text: string | null;
  usage: Usage | null;
  error: string | null;
} {
  let obj: unknown;
  try {
    obj = JSON.parse(stdout);
  } catch {
    return { text: null, usage: null, error: UNREADABLE };
  }
  if (typeof obj !== "object" || obj === null) {
    return { text: null, usage: null, error: UNREADABLE };
  }
  const o = obj as Record<string, unknown>;
  const error = o.is_error === true ? String(o.result ?? "error").slice(0, STDERR_MAX) : null;
  let text: string | null = null;
  if (typeof o.structured_output === "object" && o.structured_output !== null) {
    text = JSON.stringify(o.structured_output);
  } else if (typeof o.result === "string") {
    text = o.result;
  }
  let usage: Usage | null = null;
  if (typeof o.usage === "object" && o.usage !== null) {
    const u = o.usage as Record<string, unknown>;
    const n = (v: unknown) => (typeof v === "number" ? v : 0);
    usage = {
      inputTokens:
        n(u.input_tokens) + n(u.cache_creation_input_tokens) + n(u.cache_read_input_tokens),
      outputTokens: n(u.output_tokens),
    };
  }
  return { text, usage, error };
}

export function createClaudeAdapter(deps: ProcessDeps): CliAdapter {
  const command = (): string | null => findCommand(deps, "claude", "LEARN_CLAUDE_PATH");
  return {
    id: "claude",
    label: "Claude Code",
    retries: 1,
    detect(): Promise<DetectResult> {
      return detectVersion(deps, command());
    },
    async run(req: RunRequest): Promise<RunResult> {
      const r = await runProcess(deps, {
        command: command(),
        args: () => [
          "-p",
          "--output-format",
          "json",
          "--json-schema",
          JSON.stringify(req.schema),
          "--tools",
          "",
          "--setting-sources",
          "",
          "--strict-mcp-config",
          "--no-session-persistence",
          "--disable-slash-commands",
        ],
        stdin: req.prompt,
        signal: req.signal,
        timeoutMs: req.timeoutMs,
        dropEnv: ["CLAUDECODE", "CLAUDE_CODE_ENTRYPOINT"],
      });
      if (r.kind !== "exit") return failureResult(r, "Claude Code", req.timeoutMs);
      const p = parseClaudeResult(r.stdout);
      if (p.error !== null && p.error !== UNREADABLE) {
        return { ok: false, kind: "failed", message: p.error };
      }
      if (r.code !== 0) return { ok: false, kind: "failed", message: lastStderrLine(r.stderr) };
      if (p.error !== null) return { ok: false, kind: "failed", message: UNREADABLE };
      if (p.text === null) {
        return { ok: false, kind: "failed", message: "Claude Code returned no message" };
      }
      return { ok: true, text: p.text, usage: p.usage };
    },
  };
}
