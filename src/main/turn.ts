import path from "node:path";
import { allowedActions, checkAction, deriveState, learnedToSave } from "../core/engine";
import { buildPrompt } from "../core/prompt";
import { deriveSubject, handoverNote, renderSubjectSection } from "../core/subject";
import { callModel } from "./call";
import { attachmentKind, renderMaterial } from "../core/material";
import { CALL_TIMEOUT_MS, CALL_TIMEOUT_TOOLS_MS } from "../shared/limits";
import { ASIDE_JSON_SCHEMA, REPLY_JSON_SCHEMA, parseAside, parseReply } from "../shared/schema";
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
    subject?: string | null;
    attachmentsDir?: string;
    method?: string;
  },
  session: Session,
  state: LessonState,
  signal: AbortSignal,
): Promise<
  { ok: true; action: Action; usage: Usage | null; calls: number } | { ok: false; error: TurnError }
> {
  const r = await callModel(
    { adapter: deps.adapter },
    {
      prompt: (retryNote) =>
        buildPrompt({
          session,
          state,
          knowledge: deps.knowledge,
          retryNote,
          profile: deps.profile,
          material: deps.material ?? null,
          subject: deps.subject ?? null,
          webSearch: deps.options.webSearch,
          ...(deps.attachmentsDir !== undefined ? { attachmentsDir: deps.attachmentsDir } : {}),
          ...(deps.method !== undefined ? { method: deps.method } : {}),
        }),
      schema: REPLY_JSON_SCHEMA,
      parse: (text) => {
        const p = parseReply(text);
        return p.ok ? { ok: true, value: p.action } : p;
      },
      check: (action) => checkAction(state, action),
      allowed: allowedActions(state).join(", "),
      options: deps.options,
      timeoutMs: deps.timeoutMs,
      signal,
    },
  );
  return r.ok ? { ok: true, action: r.value, usage: r.usage, calls: r.calls } : r;
}

export type TurnRunner = {
  advance(id: string): Promise<TurnResult>;
  aside(id: string, text: string): Promise<TurnResult>;
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

  async function prepare(session: Session) {
    const knowledge = await deps.store.readKnowledge();
    const profile = await deps.store.readProfile();
    const settings = await deps.store.readSettings();
    const listing = session.folder !== null ? await deps.listFolder(session.folder) : null;
    if (session.folder !== null && listing === null) {
      return {
        ok: false as const,
        error: {
          kind: "folder_missing" as const,
          message: "The material folder was not found. Choose it again or remove it.",
        },
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
    let subjectSection: string | null = null;
    if (session.subjectId !== null && session.unitId !== null) {
      try {
        const subject = await deps.store.readSubject(session.subjectId);
        if (subject !== null) {
          subjectSection = renderSubjectSection(
            subject,
            deriveSubject(subject.events),
            session.unitId,
          );
        }
      } catch {
        subjectSection = null;
      }
    }
    const options = runOptions(session, attachmentsDir, null);
    const timeoutMs =
      options.readDirs.length > 0 || options.webSearch ? CALL_TIMEOUT_TOOLS_MS : CALL_TIMEOUT_MS;
    const adapter = deps.adapters[session.cli] ?? deps.adapters.codex;
    return {
      ok: true as const,
      knowledge,
      profile,
      method: settings.method,
      attachmentsDir,
      material,
      subjectSection,
      options,
      timeoutMs,
      adapter,
    };
  }

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
        const p = await prepare(session);
        if (!p.ok) return { ok: false, error: p.error, session };
        const {
          knowledge,
          profile,
          method,
          attachmentsDir,
          material,
          subjectSection,
          options,
          timeoutMs,
          adapter,
        } = p;
        const step = await modelStep(
          {
            adapter,
            knowledge,
            profile,
            options,
            timeoutMs,
            material,
            subject: subjectSection,
            attachmentsDir,
            method,
          },
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
          if (next.subjectId !== null && next.unitId !== null) {
            await deps.store.appendSubjectEvent(next.subjectId, (s) =>
              s.events.some((e) => e.kind === "note" && e.note.sessionId === next.id)
                ? null
                : { kind: "note", at: deps.now(), note: handoverNote(next) },
            );
          }
        }
        await deps.store.writeSession(next);
        session = next;
        deps.notify(session);
      }
    } finally {
      running.delete(id);
    }
  }

  async function aside(id: string, text: string): Promise<TurnResult> {
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
      const session = await deps.store.readSession(id);
      if (!session) {
        return {
          ok: false,
          error: { kind: "not_found", message: "This lesson no longer exists." },
          session: null,
        };
      }
      const state = deriveState(session.events);
      const p = await prepare(session);
      if (!p.ok) return { ok: false, error: p.error, session };
      const r = await callModel(
        { adapter: p.adapter },
        {
          prompt: (retryNote) =>
            buildPrompt({
              session,
              state,
              knowledge: p.knowledge,
              retryNote,
              profile: p.profile,
              material: p.material,
              subject: p.subjectSection,
              webSearch: p.options.webSearch,
              attachmentsDir: p.attachmentsDir,
              aside: text,
              method: p.method,
            }),
          schema: ASIDE_JSON_SCHEMA,
          parse: parseAside,
          check: (v) => (v.markdown.trim() === "" ? "markdown is empty" : null),
          allowed: "an answer in markdown",
          options: p.options,
          timeoutMs: p.timeoutMs,
          signal: controller.signal,
        },
      );
      if (!r.ok) return { ok: false, error: r.error, session };
      const next: Session = {
        ...session,
        updatedAt: deps.now(),
        events: [
          ...session.events,
          {
            kind: "aside",
            at: deps.now(),
            question: text,
            markdown: r.value.markdown,
            usage: r.usage,
          },
        ],
      };
      await deps.store.writeSession(next);
      deps.notify(next);
      return { ok: true, session: next };
    } finally {
      running.delete(id);
    }
  }

  return {
    advance,
    aside,
    stop: (id) => running.get(id)?.abort(),
    isRunning: (id) => running.has(id),
  };
}
