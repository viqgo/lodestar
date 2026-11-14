import { basename, isAbsolute } from "node:path";
import { isCliId } from "../shared/clis";
import type { IpcMain } from "electron";
import { checkAnswer, deriveState, validateNewLesson, validateProfile } from "../core/engine";
import { plain } from "../core/material";
import { knowledgeGraph } from "../core/graph";
import { dueItems, newReview, nextDue, nextReview } from "../core/review";
import { mergeSettings, validateSettings } from "../core/settings";
import {
  checkChange,
  deriveSubject,
  unitStatuses,
  validateNewSubject,
  validateOutline,
} from "../core/subject";
import {
  ANSWER_TEXT_MAX,
  ATTACH_PER_ANSWER,
  ATTACH_PER_LESSON,
  CHAT_TEXT_MAX,
  KEY_MAX,
  VOICE_CHUNK_MAX,
  VOICE_SAY_MAX,
} from "../shared/limits";
import { parseAsk } from "../shared/schema";
import type {
  Answer,
  Attachment,
  CliId,
  KnowledgeView,
  ReviewFilter,
  Session,
  SessionSummary,
  Subject,
  SubjectEvent,
  SubjectResult,
  SubjectState,
  SubjectSummary,
  TurnResult,
  Unit,
  UnitStatus,
} from "../shared/types";
import type { CliAdapter } from "./cli/adapter";
import { detectAll } from "./cli/registry";
import type { Practice } from "./practice";
import type { Secrets } from "./secrets";
import type { Store } from "./store";
import type { SubjectRunner } from "./subjectTurn";
import type { TurnRunner } from "./turn";
import type { VoiceHub } from "./voice/hub";

export type IpcDeps = {
  ipcMain: Pick<IpcMain, "handle" | "on">;
  adapters: Record<CliId, CliAdapter>;
  store: Store;
  turns: TurnRunner;
  subjects: SubjectRunner;
  now: () => string;
  newId: (prefix: "s" | "k" | "u") => string;
  send: (channel: string, ...args: unknown[]) => void;
  dialogs: { pickFolder(): Promise<string | null>; pickFiles(): Promise<string[]> };
  secrets: Secrets;
  voice: VoiceHub;
  practice: Practice;
};

const chains = new Map<string, Promise<unknown>>();
const withLock = <T>(id: string, fn: () => Promise<T>): Promise<T> => {
  const next = (chains.get(id) ?? Promise.resolve()).then(fn, fn);
  chains.set(
    id,
    next.catch(() => undefined),
  );
  return next;
};

const goodFolder = (folder: unknown): boolean =>
  folder === null || (typeof folder === "string" && isAbsolute(folder));

type SessionResult = { ok: true; session: Session } | { ok: false; message: string };

export function registerIpc(deps: IpcDeps): void {
  const { ipcMain, adapters, store, turns, subjects, now, newId, send, dialogs, secrets, voice } =
    deps;
  const { practice } = deps;

  const runTurn = async (id: string): Promise<TurnResult> => {
    const result = turns.isRunning(id)
      ? await turns.advance(id)
      : await withLock(id, () => turns.advance(id));
    send("turn:ended", id, result);
    return result;
  };

  ipcMain.handle("dialog:pickFolder", () => dialogs.pickFolder());
  ipcMain.handle("dialog:pickFiles", () => dialogs.pickFiles());

  ipcMain.handle("clis:detect", () => detectAll(adapters));

  ipcMain.handle("sessions:list", async (): Promise<SessionSummary[]> => {
    const out: SessionSummary[] = [];
    for (const s of await store.listSessions()) {
      try {
        out.push({
          id: s.id,
          topic: s.topic,
          phase: deriveState(s.events).phase,
          cli: s.cli,
          updatedAt: s.updatedAt,
          subjectId: s.subjectId,
        });
      } catch {
        // a lesson that cannot be read is left out
      }
    }
    return out;
  });

  ipcMain.handle(
    "sessions:create",
    async (
      _event,
      input: {
        topic: string;
        goal: string;
        cli: CliId;
        folder?: string | null;
        webSearch?: boolean;
        attachPaths?: string[];
      },
    ) => {
      const message = validateNewLesson(input.topic, input.goal);
      if (message !== null) return { ok: false as const, message };
      const cli = input.cli;
      if (!isCliId(cli)) return { ok: false as const, message: "Choose a tutor." };
      if (!goodFolder(input.folder ?? null)) {
        return { ok: false as const, message: "Choose a folder." };
      }
      const session: Session = {
        version: 1,
        id: newId("s"),
        topic: input.topic.trim(),
        goal: input.goal.trim(),
        cli,
        createdAt: now(),
        updatedAt: now(),
        events: [],
        folder: input.folder ?? null,
        attachments: [],
        webSearch: input.webSearch ?? false,
        subjectId: null,
        unitId: null,
      };
      await store.writeSession(session);
      const attachments: Attachment[] = [];
      for (const [i, p] of (input.attachPaths ?? []).entries()) {
        const r = await store.addAttachment(session.id, p, i, ATTACH_PER_LESSON);
        if (!r.ok) {
          await store.deleteSession(session.id);
          return { ok: false as const, message: r.message };
        }
        attachments.push(r.attachment);
      }
      if (attachments.length === 0) return { ok: true as const, session };
      const withFiles: Session = { ...session, attachments };
      try {
        await store.writeSession(withFiles);
      } catch {
        await store.deleteSession(session.id);
        return { ok: false as const, message: "Could not save. Check free disk space." };
      }
      return { ok: true as const, session: withFiles };
    },
  );

  const mutate = async (
    id: string,
    change: (session: Session) => Promise<{ session: Session; message?: string }>,
  ): Promise<SessionResult> => {
    const busy = { ok: false as const, message: "A reply is already on the way." };
    if (turns.isRunning(id)) return busy;
    return withLock(id, async (): Promise<SessionResult> => {
      const session = await store.readSession(id);
      if (session === null) {
        return { ok: false as const, message: "This lesson no longer exists." };
      }
      if (turns.isRunning(id)) return busy;
      const { session: next, message } = await change(session);
      const updated: Session = { ...next, updatedAt: now() };
      if (turns.isRunning(id)) return busy;
      await store.writeSession(updated);
      send("session:updated", updated);
      if (message !== undefined) return { ok: false as const, message };
      return { ok: true as const, session: updated };
    });
  };

  ipcMain.handle("sessions:setCli", async (_event, id: string, cli: unknown) => {
    if (!isCliId(cli)) return { ok: false as const, message: "Choose a tutor." };
    return mutate(id, async (s) => ({ session: { ...s, cli } }));
  });

  ipcMain.handle("sessions:setFolder", (_event, id: string, folder: string | null) => {
    if (!goodFolder(folder)) return { ok: false as const, message: "Choose a folder." };
    return mutate(id, async (s) => ({ session: { ...s, folder } }));
  });

  ipcMain.handle("sessions:setWebSearch", (_event, id: string, on: boolean) =>
    mutate(id, async (s) => ({ session: { ...s, webSearch: on } })),
  );

  ipcMain.handle("sessions:addAttachments", (_event, id: string, paths: string[]) =>
    mutate(id, async (s) => {
      const attachments = [...s.attachments];
      for (const p of paths) {
        const r = await store.addAttachment(id, p, attachments.length, ATTACH_PER_LESSON);
        if (!r.ok) return { session: { ...s, attachments }, message: r.message };
        attachments.push(r.attachment);
      }
      return { session: { ...s, attachments } };
    }),
  );

  ipcMain.handle("sessions:removeAttachment", (_event, id: string, file: string) =>
    mutate(id, async (s) => {
      if (!s.attachments.some((a) => a.file === file)) return { session: s };
      await store.removeAttachment(id, file);
      return { session: { ...s, attachments: s.attachments.filter((a) => a.file !== file) } };
    }),
  );

  ipcMain.handle("sessions:get", (_event, id: string) => store.readSession(id));

  ipcMain.handle("sessions:delete", async (_event, id: string) => {
    turns.stop(id);
    await withLock(id, () => store.deleteSession(id));
  });

  ipcMain.handle("lesson:advance", (_event, id: string) => runTurn(id));

  ipcMain.handle(
    "lesson:answer",
    async (_event, id: string, answer: Answer, attachPaths: string[] = []) => {
      const busy = {
        ok: false as const,
        error: { kind: "busy" as const, message: "A reply is already on the way." },
        session: null,
      };
      if (turns.isRunning(id)) return busy;
      const outcome = await withLock(id, async () => {
        if (turns.isRunning(id)) return busy;
        const session = await store.readSession(id);
        if (session === null) {
          return {
            ok: false as const,
            error: { kind: "not_found" as const, message: "This lesson no longer exists." },
            session: null,
          };
        }
        const message = checkAnswer(deriveState(session.events), {
          ...answer,
          attachments: attachPaths.map((p) => basename(p)),
        });
        if (message !== null) {
          return {
            ok: false as const,
            error: { kind: "invalid_answer" as const, message },
            session,
          };
        }
        const stored: string[] = [];
        for (const [i, p] of attachPaths.entries()) {
          const r = await store.addAttachment(id, p, i, ATTACH_PER_ANSWER);
          if (!r.ok) {
            for (const file of stored) await store.removeAttachment(id, file);
            return {
              ok: false as const,
              error: { kind: "invalid_answer" as const, message: r.message },
              session,
            };
          }
          stored.push(r.attachment.file);
        }
        const saved: Answer = { ...answer };
        delete saved.attachments;
        if (stored.length > 0) saved.attachments = stored;
        const updated: Session = {
          ...session,
          updatedAt: now(),
          events: [...session.events, { kind: "answer", at: now(), answer: saved }],
        };
        await store.writeSession(updated);
        send("session:updated", updated);
        return null;
      });
      if (outcome !== null) return outcome;
      return runTurn(id);
    },
  );

  ipcMain.handle("lesson:stop", (_event, id: string) => {
    turns.stop(id);
  });
  ipcMain.handle("lesson:running", (_event, id: string) => turns.isRunning(id));

  ipcMain.handle("knowledge:list", async (): Promise<KnowledgeView[]> => {
    const topics = new Map((await store.listSessions()).map((s) => [s.id, s.topic]));
    return (await store.readKnowledge()).map((item) => ({
      ...item,
      lessonTopic: topics.get(item.sessionId) ?? null,
    }));
  });

  ipcMain.handle("knowledge:delete", (_event, id: string) => store.deleteKnowledge(id));

  ipcMain.handle("review:due", async (_event, filter: ReviewFilter) => {
    const f: ReviewFilter = {
      subjectId: typeof filter?.subjectId === "string" ? filter.subjectId : null,
      sessionId: typeof filter?.sessionId === "string" ? filter.sessionId : null,
    };
    const items = await store.readKnowledge();
    const reviews = await store.readReviews();
    const sessions = await store.listSessions();
    const due = dueItems(items, reviews, now(), f, sessions);
    const all = dueItems(items, reviews, "9999-12-31T23:59:59.999Z", f, sessions);
    const dueIds = new Set(due.map((d) => d.item.id));
    return {
      due,
      nextDue: nextDue(all.filter((d) => !dueIds.has(d.item.id)).map((d) => d.review)),
    };
  });

  ipcMain.handle("review:record", (_event, itemId: string, correct: boolean) =>
    withLock("reviews", async (): Promise<void> => {
      if (typeof itemId !== "string" || typeof correct !== "boolean") return;
      const item = (await store.readKnowledge()).find((k) => k.id === itemId);
      if (!item) return;
      const reviews = await store.readReviews();
      const current = reviews.find((r) => r.itemId === itemId) ?? newReview(itemId, item.createdAt);
      try {
        await store.writeReviews([
          ...reviews.filter((r) => r.itemId !== itemId),
          nextReview(current, correct, now()),
        ]);
      } catch {
        // nothing changes
      }
    }),
  );

  ipcMain.handle("graph:get", async () =>
    knowledgeGraph(
      await store.readKnowledge(),
      await store.readReviews(),
      await store.listSessions(),
      await store.listSubjects(),
    ),
  );

  ipcMain.handle("profile:get", () => store.readProfile());

  ipcMain.handle("profile:save", async (_event, text: string) => {
    const reason = validateProfile(text);
    if (reason !== null) return { ok: false as const, message: reason };
    try {
      await store.writeProfile(text);
      return { ok: true as const };
    } catch {
      return { ok: false as const, message: "Could not save. Check free disk space." };
    }
  });

  ipcMain.handle("settings:get", () => store.readSettings());

  ipcMain.handle("settings:save", async (_event, input: unknown) => {
    const s = mergeSettings(input);
    const reason = validateSettings(s);
    if (reason !== null) return { ok: false as const, message: reason };
    try {
      await store.writeSettings(s);
      return { ok: true as const };
    } catch {
      return { ok: false as const, message: "Could not save. Check free disk space." };
    }
  });

  ipcMain.handle("voice:hasKey", () => secrets.has());
  ipcMain.handle("voice:setKey", (_event, key: unknown) =>
    typeof key === "string" && key.length <= KEY_MAX
      ? secrets.set(key)
      : { ok: false as const, message: "Enter a key." },
  );
  ipcMain.handle("voice:start", (_event, lessonId: unknown) =>
    typeof lessonId === "string"
      ? voice.start(lessonId)
      : { ok: false as const, message: "could not start the call" },
  );
  ipcMain.on("voice:audio", (_event, chunk: unknown) => {
    if (chunk instanceof ArrayBuffer) {
      if (chunk.byteLength <= VOICE_CHUNK_MAX) voice.audio(Buffer.from(chunk));
    } else if (ArrayBuffer.isView(chunk) && chunk.byteLength <= VOICE_CHUNK_MAX)
      voice.audio(Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength));
  });
  ipcMain.handle("voice:say", (_event, text: unknown) =>
    typeof text === "string" && text.length <= VOICE_SAY_MAX ? voice.say(text) : undefined,
  );
  ipcMain.handle("voice:skip", () => {
    voice.skip();
  });
  ipcMain.handle("voice:stop", () => {
    voice.stop();
  });
  ipcMain.handle("voice:removeKey", () => secrets.remove());

  const OUTLINE_TEXT = "An outline needs 2 to 30 units, each with a title and a goal.";
  const SAVE_TEXT = "Could not save. Check free disk space.";
  const RUNNING_TEXT = "A reply is already on the way.";

  const sessionsOf = async (id: string): Promise<Session[]> =>
    (await store.listSessions()).filter((s) => s.subjectId === id);

  const runSubject = async (id: string): Promise<SubjectResult> => {
    const result = subjects.isRunning(id)
      ? await subjects.outline(id)
      : await withLock(id, async (): Promise<SubjectResult> => {
          const s = await store.readSubject(id);
          if (s === null) {
            return {
              ok: false,
              error: { kind: "not_found", message: "This subject no longer exists." },
              subject: null,
            };
          }
          return deriveSubject(s.events).phase === "outline"
            ? subjects.outline(id)
            : subjects.reply(id);
        });
    send("subject:ended", id, result);
    return result;
  };

  type SubjectChange = { event?: SubjectEvent; message?: string };
  type SubjectMutation = { ok: true; subject: Subject } | { ok: false; message: string };

  const mutateSubject = async (
    id: string,
    change: (subject: Subject, state: SubjectState) => Promise<SubjectChange> | SubjectChange,
  ): Promise<SubjectMutation> => {
    const busy = { ok: false as const, message: RUNNING_TEXT };
    if (subjects.isRunning(id)) return busy;
    return withLock("start:" + id, () =>
      withLock(id, async (): Promise<SubjectMutation> => {
        const subject = await store.readSubject(id);
        if (subject === null) {
          return { ok: false as const, message: "This subject no longer exists." };
        }
        if (subjects.isRunning(id)) return busy;
        const { event, message } = await change(subject, deriveSubject(subject.events));
        if (event !== undefined) {
          const updated: Subject = {
            ...subject,
            updatedAt: now(),
            events: [...subject.events, event],
          };
          await store.writeSubject(updated);
          send("subject:updated", updated);
          return { ok: true as const, subject: updated };
        }
        if (message !== undefined) return { ok: false as const, message };
        return { ok: true as const, subject };
      }),
    );
  };

  ipcMain.handle("subjects:list", async (): Promise<SubjectSummary[]> =>
    (await store.listSubjects()).map((s) => ({ id: s.id, name: s.name, updatedAt: s.updatedAt })),
  );

  ipcMain.handle(
    "subjects:create",
    async (_event, input: { name: string; folder: string | null; cli: CliId }) => {
      const message = validateNewSubject(
        typeof input.name === "string" ? input.name : "",
        input.folder ?? null,
      );
      if (message !== null) return { ok: false as const, message };
      if (!isCliId(input.cli)) return { ok: false as const, message: "Choose a tutor." };
      if (!goodFolder(input.folder) || input.folder === null) {
        return { ok: false as const, message: "Choose a folder." };
      }
      const subject: Subject = {
        version: 1,
        id: newId("u"),
        name: input.name.trim(),
        folder: input.folder,
        cli: input.cli,
        createdAt: now(),
        updatedAt: now(),
        events: [],
      };
      try {
        await store.writeSubject(subject);
      } catch {
        return { ok: false as const, message: SAVE_TEXT };
      }
      return { ok: true as const, subject };
    },
  );

  ipcMain.handle("subjects:get", (_event, id: string) => store.readSubject(id));

  ipcMain.handle("subjects:delete", async (_event, id: string) => {
    subjects.stop(id);
    await withLock("start:" + id, async () => {
      for (const s of await sessionsOf(id)) {
        turns.stop(s.id);
        await withLock(s.id, () => store.deleteSession(s.id));
      }
      await withLock(id, () => store.deleteSubject(id));
    });
  });

  ipcMain.handle("subject:advance", (_event, id: string) => runSubject(id));

  ipcMain.handle("subject:accept", (_event, id: string, units: Unit[]) =>
    mutateSubject(id, (_subject, state) => {
      if (state.phase !== "review") return {};
      if (!Array.isArray(units)) return { message: OUTLINE_TEXT };
      const rebuilt: Unit[] = [];
      for (const u of units) {
        const p = state.units.find((x) => x.id === u?.id);
        if (p === undefined || typeof u.title !== "string" || typeof u.goal !== "string") {
          return { message: OUTLINE_TEXT };
        }
        rebuilt.push({ id: p.id, title: u.title, goal: u.goal, files: p.files });
      }
      const checked = validateOutline(
        rebuilt,
        rebuilt.flatMap((x) => x.files),
      );
      if (!checked.ok) return { message: OUTLINE_TEXT };
      return { event: { kind: "accepted", at: now(), units: checked.units } };
    }),
  );

  ipcMain.handle(
    "subject:message",
    async (_event, id: string, text: string): Promise<SubjectResult> => {
      const busy: SubjectResult = {
        ok: false,
        error: { kind: "busy", message: RUNNING_TEXT },
        subject: null,
      };
      if (subjects.isRunning(id)) return busy;
      const outcome = await withLock(id, async (): Promise<SubjectResult | null> => {
        if (subjects.isRunning(id)) return busy;
        const subject = await store.readSubject(id);
        if (subject === null) {
          return {
            ok: false,
            error: { kind: "not_found", message: "This subject no longer exists." },
            subject: null,
          };
        }
        if (deriveSubject(subject.events).phase !== "ready") {
          return {
            ok: false,
            error: { kind: "invalid_answer", message: "Accept the outline first." },
            subject,
          };
        }
        if (
          typeof text !== "string" ||
          text.trim().length < 1 ||
          text.trim().length > CHAT_TEXT_MAX
        ) {
          return {
            ok: false,
            error: { kind: "invalid_answer", message: "Write a message." },
            subject,
          };
        }
        const updated: Subject = {
          ...subject,
          updatedAt: now(),
          events: [...subject.events, { kind: "message", at: now(), text: text.trim() }],
        };
        await store.writeSubject(updated);
        send("subject:updated", updated);
        return null;
      });
      if (outcome !== null) return outcome;
      return runSubject(id);
    },
  );

  ipcMain.handle("subject:resolveChange", (_event, id: string, accept: boolean) =>
    mutateSubject(id, async (_subject, state) => {
      if (state.pendingChange === null) return {};
      if (accept === true) {
        const started = unitStatuses(state.units, await sessionsOf(id))
          .filter((u) => u.status !== "not_started")
          .map((u) => u.unitId);
        if (checkChange(state.units, started, state.pendingChange) !== null) {
          return { message: "This change no longer fits the outline. Dismiss it." };
        }
      }
      return { event: { kind: "change", at: now(), accepted: accept === true } };
    }),
  );

  ipcMain.handle("subject:startUnit", (_event, id: string, unitId: string) =>
    withLock("start:" + id, async (): Promise<SessionResult> => {
      const subject = await store.readSubject(id);
      if (subject === null) {
        return { ok: false as const, message: "This subject no longer exists." };
      }
      const state = deriveSubject(subject.events);
      if (state.phase !== "ready") {
        return { ok: false as const, message: "Accept the outline first." };
      }
      const unit = state.units.find((u) => u.id === unitId);
      if (unit === undefined) {
        return { ok: false as const, message: "This unit no longer exists." };
      }
      const existing = (await sessionsOf(id)).find((s) => s.unitId === unitId);
      if (existing !== undefined) return { ok: true as const, session: existing };
      const session: Session = {
        version: 1,
        id: newId("s"),
        topic: plain(unit.title),
        goal: plain(unit.goal),
        cli: subject.cli,
        createdAt: now(),
        updatedAt: now(),
        events: [],
        folder: subject.folder,
        attachments: [],
        webSearch: false,
        subjectId: id,
        unitId,
      };
      try {
        await store.writeSession(session);
      } catch {
        return { ok: false as const, message: SAVE_TEXT };
      }
      return { ok: true as const, session };
    }),
  );

  const badTutor = {
    ok: false as const,
    error: { kind: "invalid_answer" as const, message: "Choose a tutor." },
  };
  const badAnswer = {
    ok: false as const,
    error: { kind: "invalid_answer" as const, message: "Write an answer." },
  };
  const gone = {
    ok: false as const,
    error: { kind: "not_found" as const, message: "This item no longer exists." },
  };
  ipcMain.handle("practice:fronts", (_event, itemIds: unknown, cli: unknown) =>
    !isCliId(cli)
      ? badTutor
      : practice.fronts(
          cli,
          Array.isArray(itemIds) ? itemIds.filter((x): x is string => typeof x === "string") : [],
        ),
  );
  ipcMain.handle("practice:ask", (_event, itemId: unknown, cli: unknown) =>
    !isCliId(cli) ? badTutor : typeof itemId !== "string" ? gone : practice.ask(cli, itemId),
  );
  ipcMain.handle(
    "practice:grade",
    (_event, itemId: unknown, question: unknown, text: unknown, cli: unknown) => {
      if (!isCliId(cli)) return badTutor;
      let q: ReturnType<typeof parseAsk> = { ok: false, reason: "bad question" };
      try {
        q = parseAsk(JSON.stringify({ question }));
      } catch {
        // a throw counts as not ok
      }
      if (
        typeof itemId !== "string" ||
        !q.ok ||
        q.value.question.kind !== "text" ||
        typeof text !== "string" ||
        text.trim().length < 1 ||
        text.trim().length > ANSWER_TEXT_MAX
      ) {
        return badAnswer;
      }
      return practice.grade(cli, itemId, q.value.question, text.trim());
    },
  );
  ipcMain.handle("practice:stop", () => {
    practice.stop();
  });

  ipcMain.handle("subject:stop", (_event, id: string) => {
    subjects.stop(id);
  });
  ipcMain.handle("subject:running", (_event, id: string) => subjects.isRunning(id));
  ipcMain.handle("subject:statuses", async (_event, id: string): Promise<UnitStatus[]> => {
    const s = await store.readSubject(id);
    if (s === null) return [];
    return unitStatuses(deriveSubject(s.events).units, await sessionsOf(id));
  });
}
