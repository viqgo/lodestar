import { STDERR_MAX } from "../../shared/limits";
import type { Usage } from "../../shared/types";

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
