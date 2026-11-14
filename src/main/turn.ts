import path from "node:path";
import { allowedActions, checkAction, deriveState, learnedToSave } from "../core/engine";
import { buildPrompt } from "../core/prompt";
import { attachmentKind, renderMaterial } from "../core/material";
import { CALL_TIMEOUT_MS, CALL_TIMEOUT_TOOLS_MS } from "../shared/limits";
import { REPLY_JSON_SCHEMA, parseReply } from "../shared/schema";
import type {
  Action,
  CliId,
  FileEntry,
  KnowledgeItem,
  LessonState,
  RunOptions,
  Session,
  SessionEvent,
  TurnError,
  TurnResult,
  Usage,
} from "../shared/types";
import type { CliAdapter } from "./cli/adapter";
import type { Store } from "./store";

export function runOptions(session: Session, attachmentsDir: string, settings: null): RunOptions {
  void settings;
  const answers = session.events.flatMap((e) => (e.kind === "answer" ? [e.answer] : []));
  const last = [...answers].reverse().find((a) => (a.attachments?.length ?? 0) > 0);
  const anyAnswerFiles = answers.some((a) => (a.attachments?.length ?? 0) > 0);
  const readDirs = [
    ...(session.folder !== null ? [session.folder] : []),
    ...(session.attachments.length > 0 || anyAnswerFiles ? [attachmentsDir] : []),
  ];
  const images = [
    ...session.attachments.filter((a) => a.kind === "image").map((a) => a.file),
    ...(last?.attachments ?? []).filter((f) => attachmentKind(f) === "image"),
  ].map((f) => path.join(attachmentsDir, f));
  return { readDirs, images, webSearch: session.webSearch, model: null, effort: null };
}

export async function modelStep(
  deps: {
    adapter: CliAdapter;
    knowledge: KnowledgeItem[];
    profile: string;
    options: RunOptions;
    timeoutMs: number;
    material?: string | null;
    attachmentsDir?: string;
  },
  session: Session,
  state: LessonState,
  signal: AbortSignal,
): Promise<
  { ok: true; action: Action; usage: Usage | null; calls: number } | { ok: false; error: TurnError }
> {
  let retryNote: string | null = null;
  for (let attempt = 1; attempt <= deps.adapter.retries + 1; attempt++) {
    const prompt = buildPrompt({
      session,
      state,
      knowledge: deps.knowledge,
      retryNote,
      profile: deps.profile,
      material: deps.material ?? null,
      webSearch: deps.options.webSearch,
      ...(deps.attachmentsDir !== undefined ? { attachmentsDir: deps.attachmentsDir } : {}),
    });
    const run = await deps.adapter.run({
      prompt,
      schema: REPLY_JSON_SCHEMA,
      signal,
      timeoutMs: deps.timeoutMs,
      options: deps.options,
    });
    if (!run.ok) {
      if (run.kind === "aborted")
        return { ok: false, error: { kind: "stopped", message: "Stopped." } };
      return {
        ok: false,
        error: { kind: "cli", message: deps.adapter.label + " failed: " + run.message },
      };
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

export type TurnRunner = {
  advance(id: string): Promise<TurnResult>;
  stop(id: string): void;
  isRunning(id: string): boolean;
};

export function createTurnRunner(deps: {
  adapters: Record<CliId, CliAdapter>;
  store: Store;
  now: () => string;
  newId: (prefix: "s" | "k") => string;
  notify: (session: Session) => void;
  listFolder: (folder: string) => Promise<{ files: FileEntry[]; more: number } | null>;
}): TurnRunner {
  const running = new Map<string, AbortController>();

  async function advance(id: string): Promise<TurnResult> {
    if (running.has(id)) {
      return {
        ok: false,
        error: { kind: "busy", message: "A reply is already on the way." },
        session: null,
      };
    }
    const controller = new AbortController();
    running.set(id, controller);
    try {
      let session = await deps.store.readSession(id);
      if (!session) {
        return {
          ok: false,
          error: { kind: "not_found", message: "This lesson no longer exists." },
          session: null,
        };
      }
      for (;;) {
        const state = deriveState(session.events);
        if (state.awaiting.who !== "model") return { ok: true, session };
        const knowledge = await deps.store.readKnowledge();
        const profile = await deps.store.readProfile();
        const listing = session.folder !== null ? await deps.listFolder(session.folder) : null;
        if (session.folder !== null && listing === null) {
          return {
            ok: false,
            error: {
              kind: "folder_missing",
              message: "The material folder was not found. Choose it again or remove it.",
            },
            session,
          };
        }
        const attachmentsDir = deps.store.attachmentsDir(session.id);
        const material = renderMaterial({
          folder: session.folder,
          files: listing?.files ?? [],
          more: listing?.more ?? 0,
          attachments: session.attachments.map((a) => ({
            name: a.name,
            path: path.join(attachmentsDir, a.file),
          })),
        });
        const options = runOptions(session, attachmentsDir, null);
        const timeoutMs =
          options.readDirs.length > 0 || options.webSearch
            ? CALL_TIMEOUT_TOOLS_MS
            : CALL_TIMEOUT_MS;
        const adapter = deps.adapters[session.cli] ?? deps.adapters.codex;
        const step = await modelStep(
          { adapter, knowledge, profile, options, timeoutMs, material, attachmentsDir },
          session,
          state,
          controller.signal,
        );
        if (!step.ok) return { ok: false, error: step.error, session };
        const event: SessionEvent = {
          kind: "action",
          at: deps.now(),
          action: step.action,
          usage: step.usage,
        };
        const next: Session = {
          ...session,
          updatedAt: deps.now(),
          events: [...session.events, event],
        };
        if (step.action.type === "lesson_done") {
          const items = learnedToSave(deriveState(next.events), step.action);
          const sessionId = next.id;
          await deps.store.addKnowledge(
            items.map((it) => ({
              id: deps.newId("k"),
              text: it.text,
              sessionId,
              nodeId: it.nodeId,
              createdAt: deps.now(),
            })),
          );
        }
        await deps.store.writeSession(next);
        session = next;
        deps.notify(session);
      }
    } finally {
      running.delete(id);
    }
  }

  return {
    advance,
    stop: (id) => running.get(id)?.abort(),
    isRunning: (id) => running.has(id),
  };
}
