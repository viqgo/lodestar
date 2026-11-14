import { allowedActions, checkAction } from "../core/engine";
import { buildPrompt } from "../core/prompt";
import { CALL_TIMEOUT_MS } from "../shared/limits";
import { REPLY_JSON_SCHEMA, parseReply } from "../shared/schema";
import type {
  Action,
  KnowledgeItem,
  LessonState,
  Session,
  TurnError,
  Usage,
} from "../shared/types";
import type { CliAdapter } from "./cli/adapter";

export async function modelStep(
  deps: { adapter: CliAdapter; knowledge: KnowledgeItem[] },
  session: Session,
  state: LessonState,
  signal: AbortSignal,
): Promise<
  { ok: true; action: Action; usage: Usage | null; calls: number } | { ok: false; error: TurnError }
> {
  let retryNote: string | null = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const prompt = buildPrompt({ session, state, knowledge: deps.knowledge, retryNote });
    const run = await deps.adapter.run({
      prompt,
      schema: REPLY_JSON_SCHEMA,
      signal,
      timeoutMs: CALL_TIMEOUT_MS,
    });
    if (!run.ok) {
      if (run.kind === "aborted")
        return { ok: false, error: { kind: "stopped", message: "Stopped." } };
      return { ok: false, error: { kind: "cli", message: "Codex failed: " + run.message } };
    }
    const parsed = parseReply(run.text);
    const reason = parsed.ok ? checkAction(state, parsed.action) : parsed.reason;
    if (parsed.ok && reason === null) {
      return { ok: true, action: parsed.action, usage: run.usage, calls: attempt };
    }
    retryNote = `Your last reply was not usable: ${reason}. Allowed now: ${allowedActions(state).join(", ")}.`;
  }
  return {
    ok: false,
    error: { kind: "bad_reply", message: "The model gave an unusable reply. Press Retry." },
  };
}
