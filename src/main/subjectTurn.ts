import { plain } from "../core/material";
import { checkChange, deriveSubject, unitStatuses, validateOutline } from "../core/subject";
import { buildOutlinePrompt, buildSeniorPrompt } from "../core/subjectPrompt";
import { CALL_TIMEOUT_TOOLS_MS } from "../shared/limits";
import {
  OUTLINE_JSON_SCHEMA,
  SENIOR_JSON_SCHEMA,
  parseOutline,
  parseSenior,
} from "../shared/schema";
import type {
  CliId,
  FileEntry,
  OutlineChange,
  RunOptions,
  Subject,
  SubjectEvent,
  SubjectResult,
} from "../shared/types";
import type { CliAdapter } from "./cli/adapter";
import { callModel } from "./call";
import type { Store } from "./store";

export type SubjectRunner = {
  outline(id: string): Promise<SubjectResult>;
  reply(id: string): Promise<SubjectResult>;
  stop(id: string): void;
  isRunning(id: string): boolean;
};

export function createSubjectRunner(deps: {
  adapters: Record<CliId, CliAdapter>;
  store: Store;
  listFolder: (folder: string) => Promise<{ files: FileEntry[]; more: number } | null>;
  now: () => string;
  notify: (subject: Subject) => void;
}): SubjectRunner {
  const running = new Map<string, AbortController>();

  const notFound = (): SubjectResult => ({
    ok: false,
    error: { kind: "not_found", message: "This subject no longer exists." },
    subject: null,
  });

  async function run(id: string, mode: "outline" | "reply"): Promise<SubjectResult> {
    if (running.has(id)) {
      return {
        ok: false,
        error: { kind: "busy", message: "A reply is already on the way." },
        subject: null,
      };
    }
    const controller = new AbortController();
    running.set(id, controller);
    try {
      const subject = await deps.store.readSubject(id);
      if (subject === null) return notFound();
      const state = deriveSubject(subject.events);
      if (
        mode === "outline"
          ? state.phase !== "outline"
          : !(state.phase === "ready" && state.awaitingReply)
      ) {
        return { ok: true, subject };
      }
      const listing = await deps.listFolder(subject.folder);
      if (listing === null) {
        return {
          ok: false,
          error: {
            kind: "folder_missing",
            message: "The material folder was not found. Choose it again or remove it.",
          },
          subject,
        };
      }
      const profile = await deps.store.readProfile();
      const adapter = deps.adapters[subject.cli] ?? deps.adapters.codex;
      const options: RunOptions = {
        readDirs: [subject.folder],
        images: [],
        webSearch: false,
        model: null,
        effort: null,
      };
      const timeoutMs = CALL_TIMEOUT_TOOLS_MS;
      const known = listing.files.map((f) => f.path);
      const common = { subject, files: listing.files, more: listing.more, profile };
      let event: SubjectEvent;
      if (mode === "outline") {
        const r = await callModel(
          { adapter },
          {
            prompt: (retryNote) => buildOutlinePrompt({ ...common, retryNote }),
            schema: OUTLINE_JSON_SCHEMA,
            parse: parseOutline,
            check: (v) => {
              const c = validateOutline(v.units, known);
              return c.ok ? null : c.reason;
            },
            allowed: "an outline",
            options,
            timeoutMs,
            signal: controller.signal,
          },
        );
        if (!r.ok) return { ok: false, error: r.error, subject };
        const checked = validateOutline(r.value.units, known);
        if (!checked.ok)
          return {
            ok: false,
            error: { kind: "bad_reply", message: "The model gave an unusable reply. Press Retry." },
            subject,
          };
        event = { kind: "outline", at: deps.now(), units: checked.units, usage: r.usage };
      } else {
        const sessions = (await deps.store.listSessions()).filter((s) => s.subjectId === id);
        const statuses = unitStatuses(state.units, sessions);
        const started = statuses.filter((s) => s.status !== "not_started").map((s) => s.unitId);
        const r = await callModel(
          { adapter },
          {
            prompt: (retryNote) => buildSeniorPrompt({ ...common, state, statuses, retryNote }),
            schema: SENIOR_JSON_SCHEMA,
            parse: parseSenior,
            check: (v) => checkChange(state.units, started, v.change),
            allowed: "an answer with a change or null",
            options,
            timeoutMs,
            signal: controller.signal,
          },
        );
        if (!r.ok) return { ok: false, error: r.error, subject };
        const change: OutlineChange | null =
          r.value.change !== null && r.value.change.kind === "add"
            ? {
                ...r.value.change,
                unit: {
                  ...r.value.change.unit,
                  title: plain(r.value.change.unit.title),
                  goal: plain(r.value.change.unit.goal),
                  files: r.value.change.unit.files.filter((f) => known.includes(f)),
                },
              }
            : r.value.change;
        event = {
          kind: "reply",
          at: deps.now(),
          markdown: r.value.markdown,
          change,
          usage: r.usage,
        };
      }
      const fresh = await deps.store.readSubject(id);
      if (fresh === null) return notFound();
      const written: Subject = {
        ...fresh,
        updatedAt: deps.now(),
        events: [...fresh.events, event],
      };
      await deps.store.writeSubject(written);
      deps.notify(written);
      return { ok: true, subject: written };
    } finally {
      running.delete(id);
    }
  }

  return {
    outline: (id) => run(id, "outline"),
    reply: (id) => run(id, "reply"),
    stop: (id) => running.get(id)?.abort(),
    isRunning: (id) => running.has(id),
  };
}
