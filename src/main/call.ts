import type { RunOptions, TurnError, Usage } from "../shared/types";
import type { CliAdapter } from "./cli/adapter";

export async function callModel<T>(
  deps: { adapter: CliAdapter },
  req: {
    prompt(retryNote: string | null): string;
    schema: object;
    parse(text: string): { ok: true; value: T } | { ok: false; reason: string };
    check(value: T): string | null;
    allowed: string;
    options: RunOptions;
    timeoutMs: number;
    signal: AbortSignal;
  },
): Promise<
  { ok: true; value: T; usage: Usage | null; calls: number } | { ok: false; error: TurnError }
> {
  let retryNote: string | null = null;
  for (let attempt = 1; attempt <= deps.adapter.retries + 1; attempt++) {
    const run = await deps.adapter.run({
      prompt: req.prompt(retryNote),
      schema: req.schema,
      signal: req.signal,
      timeoutMs: req.timeoutMs,
      options: req.options,
    });
    if (!run.ok) {
      if (run.kind === "aborted")
        return { ok: false, error: { kind: "stopped", message: "Stopped." } };
      return {
        ok: false,
        error: { kind: "cli", message: deps.adapter.label + " failed: " + run.message },
      };
    }
    const parsed = req.parse(run.text);
    const reason = parsed.ok ? req.check(parsed.value) : parsed.reason;
    if (parsed.ok && reason === null) {
      return { ok: true, value: parsed.value, usage: run.usage, calls: attempt };
    }
    retryNote = `Your last reply was not usable: ${reason}. Allowed now: ${req.allowed}.`;
  }
  return {
    ok: false,
    error: { kind: "bad_reply", message: "The model gave an unusable reply. Press Retry." },
  };
}
