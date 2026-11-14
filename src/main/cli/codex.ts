import path from "node:path";
import { NO_OPTIONS } from "../../shared/clis";
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

type CodexEvent = {
  type?: string;
  item?: { type?: string; text?: string };
  usage?: { input_tokens: number; output_tokens: number };
};

export function parseCodexEvents(stdout: string): { text: string | null; usage: Usage | null } {
  let text: string | null = null;
  let usage: Usage | null = null;
  for (const line of stdout.split("\n")) {
    if (line.trim() === "") continue;
    let obj: CodexEvent | null;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    if (obj?.type === "item.completed" && obj.item?.type === "agent_message") {
      text = obj.item.text ?? null;
    } else if (obj?.type === "turn.completed" && obj.usage) {
      usage = { inputTokens: obj.usage.input_tokens, outputTokens: obj.usage.output_tokens };
    }
  }
  return { text, usage };
}

export { lastStderrLine } from "./process";

export function createCodexAdapter(deps: ProcessDeps): CliAdapter {
  const command = (): string | null => findCommand(deps, "codex", "LEARN_CODEX_PATH");
  return {
    id: "codex",
    label: "Codex",
    retries: 1,
    detect(): Promise<DetectResult> {
      return detectVersion(deps, command());
    },
    async run(req: RunRequest): Promise<RunResult> {
      const o = req.options ?? NO_OPTIONS;
      const r = await runProcess(deps, {
        command: command(),
        prepare: (d) =>
          deps.fs.writeFileSync(path.join(d.root, "schema.json"), JSON.stringify(req.schema)),
        args: (d) => [
          ...(o.webSearch ? ["--search"] : []),
          "exec",
          "--json",
          "--output-schema",
          path.join(d.root, "schema.json"),
          "--ephemeral",
          "--sandbox",
          "read-only",
          "--skip-git-repo-check",
          ...(o.model ? ["-m", o.model] : []),
          ...(o.effort ? ["-c", "model_reasoning_effort=" + o.effort] : []),
          ...o.images.flatMap((i) => ["-i", i]),
          "-",
        ],
        stdin: req.prompt,
        signal: req.signal,
        timeoutMs: req.timeoutMs,
      });
      if (r.kind !== "exit") return failureResult(r, "Codex", req.timeoutMs);
      if (r.code !== 0) return { ok: false, kind: "failed", message: lastStderrLine(r.stderr) };
      const { text, usage } = parseCodexEvents(r.stdout);
      return text === null
        ? { ok: false, kind: "failed", message: "Codex returned no message" }
        : { ok: true, text, usage };
    },
  };
}
