import { DETECT_TIMEOUT_MS, STDERR_MAX } from "../../shared/limits";
import type { DetectResult, Usage } from "../../shared/types";
import { extraPathDirs, resolveCommand, type CliAdapter } from "./adapter";

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

export function lastStderrLine(stderr: string): string {
  const found = stderr.split("\n").filter((l) => l.trim() !== "");
  if (found.length === 0) return "exited with an error";
  return found[found.length - 1].trim().slice(0, STDERR_MAX);
}

export function createCodexAdapter(deps: {
  spawn: typeof import("node:child_process").spawn;
  env: NodeJS.ProcessEnv;
  home: string;
  tmpRoot: string;
  fs: typeof import("node:fs");
  detectTimeoutMs?: number;
}): CliAdapter {
  const findCommand = (): string | null => {
    const fromEnv = deps.env.LEARN_CODEX_PATH;
    if (fromEnv) return fromEnv;
    return resolveCommand(
      "codex",
      deps.env.PATH ?? "",
      extraPathDirs(deps.home),
      deps.fs.existsSync,
    );
  };

  return {
    id: "codex",
    detect(): Promise<DetectResult> {
      const command = findCommand();
      if (!command) return Promise.resolve({ ok: false });
      return new Promise((resolve) => {
        let done = false;
        let stdout = "";
        const child = deps.spawn(command, ["--version"], { shell: false });
        const finish = (result: DetectResult) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          resolve(result);
        };
        const timer = setTimeout(() => {
          child.kill("SIGKILL");
          finish({ ok: false });
        }, deps.detectTimeoutMs ?? DETECT_TIMEOUT_MS);
        child.stdout?.on("data", (d: Buffer) => (stdout += d.toString()));
        child.on("error", () => finish({ ok: false }));
        child.on("close", (code) => {
          const match = /\d+\.\d+\.\d+/.exec(stdout);
          finish(code === 0 && match ? { ok: true, version: match[0] } : { ok: false });
        });
      });
    },
    run() {
      return Promise.resolve({ ok: false, kind: "failed", message: "not implemented" });
    },
  };
}
