import path from "node:path";
import { mergeSettings } from "../core/settings";
import { newReview } from "../core/review";
import { attachmentKind, checkAttachment } from "../core/material";
import type {
  Attachment,
  KnowledgeItem,
  Review,
  Session,
  Settings,
  Subject,
  SubjectEvent,
} from "../shared/types";

export type Store = {
  writeJsonAtomic(file: string, data: unknown): Promise<void>;
  listSessions(): Promise<Session[]>;
  readSession(id: string): Promise<Session | null>;
  writeSession(session: Session): Promise<void>;
  deleteSession(id: string): Promise<void>;
  attachmentsDir(sessionId: string): string;
  addAttachment(
    sessionId: string,
    sourcePath: string,
    countBefore: number,
    limit: number,
  ): Promise<{ ok: true; attachment: Attachment } | { ok: false; message: string }>;
  removeAttachment(sessionId: string, file: string): Promise<void>;
  listSubjects(): Promise<Subject[]>;
  readSubject(id: string): Promise<Subject | null>;
  writeSubject(subject: Subject): Promise<void>;
  appendSubjectEvent(
    id: string,
    make: (subject: Subject) => SubjectEvent | null,
  ): Promise<Subject | null>;
  setSubjectFolder(id: string, folder: string, at: string): Promise<Subject | null>;
  deleteSubject(id: string): Promise<void>;
  readKnowledge(): Promise<KnowledgeItem[]>;
  addKnowledge(items: KnowledgeItem[]): Promise<void>;
  deleteKnowledge(id: string): Promise<void>;
  readReviews(): Promise<Review[]>;
  writeReviews(reviews: Review[]): Promise<void>;
  updateReviews(change: (reviews: Review[]) => Review[]): Promise<void>;
  readProfile(): Promise<string>;
  writeProfile(text: string): Promise<void>;
  readSettings(): Promise<Settings>;
  writeSettings(settings: Settings): Promise<void>;
};

const ID = /^[sk]_[0-9a-f-]{36}$/;
const SUBJECT_ID = /^u_[0-9a-f-]{36}$/;
const SUBJECT_FILE = /^u_[0-9a-f-]{36}\.json$/;

export async function createStore(
  dir: string,
  fs: typeof import("node:fs/promises"),
): Promise<Store> {
  const sessionsDir = path.join(dir, "sessions");
  await fs.mkdir(sessionsDir, { recursive: true });
  const subjectsDir = path.join(dir, "subjects");
  await fs.mkdir(subjectsDir, { recursive: true });
  const subjectFile = (id: string) => path.join(subjectsDir, id + ".json");
  const fileFor = (id: string) => path.join(sessionsDir, id + ".json");

  const deleted = new Set<string>();
  const tails = new Map<string, Promise<unknown>>();
  const serial = <T>(key: string, fn: () => Promise<T>): Promise<T> => {
    const result = (tails.get(key) ?? Promise.resolve()).then(fn, fn);
    tails.set(
      key,
      result.catch(() => undefined),
    );
    return result;
  };
  let tmpCounter = 0;

  const writeJsonAtomic = async (file: string, data: unknown): Promise<void> => {
    const tmp = file + "." + process.pid + "." + tmpCounter++ + ".tmp";
    try {
      await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
      await fs.rename(tmp, file);
    } catch (err) {
      await fs.rm(tmp, { force: true });
      throw err;
    }
  };

  const withDefaults = (s: Session): Session => ({
    ...s,
    folder: s.folder ?? null,
    attachments: s.attachments ?? [],
    webSearch: s.webSearch ?? false,
    subjectId: s.subjectId ?? null,
    unitId: s.unitId ?? null,
  });

  const attachmentsDir = (id: string): string => {
    if (!ID.test(id)) throw new Error("bad id");
    return path.join(dir, "attachments", id);
  };

  const addAttachment = async (
    sessionId: string,
    sourcePath: string,
    countBefore: number,
    limit: number,
  ): Promise<{ ok: true; attachment: Attachment } | { ok: false; message: string }> => {
    const target = attachmentsDir(sessionId);
    let bytes: number;
    try {
      bytes = (await fs.stat(sourcePath)).size;
    } catch {
      return { ok: false, message: "That file could not be read." };
    }
    const name = path.basename(sourcePath);
    const refusal = checkAttachment(name, bytes, countBefore, limit);
    if (refusal !== null) return { ok: false, message: refusal };
    try {
      await fs.mkdir(target, { recursive: true });
      const safe = name.replace(/[^A-Za-z0-9._-]/g, "_");
      const dot = safe.lastIndexOf(".");
      const ext = dot > 0 ? safe.slice(dot) : "";
      const stem = (dot > 0 ? safe.slice(0, dot) : safe).slice(0, Math.max(1, 80 - ext.length));
      const taken = new Set(await fs.readdir(target));
      let k = 1;
      while (taken.has("a" + k + "-" + stem + ext)) k++;
      const file = "a" + k + "-" + stem + ext;
      await fs.copyFile(sourcePath, path.join(target, file));
      return {
        ok: true,
        attachment: { file, name, bytes, kind: attachmentKind(name) ?? "text" },
      };
    } catch {
      return { ok: false, message: "Could not save. Check free disk space." };
    }
  };

  const removeAttachment = async (sessionId: string, file: string): Promise<void> => {
    if (!/^a\d+-[A-Za-z0-9._-]+$/.test(file)) return;
    await fs.rm(path.join(attachmentsDir(sessionId), file), { force: true });
  };

  const readSession = async (id: string): Promise<Session | null> => {
    if (!ID.test(id)) return null;
    try {
      return withDefaults(JSON.parse(await fs.readFile(fileFor(id), "utf8")) as Session);
    } catch {
      return null;
    }
  };

  const listSessions = async (): Promise<Session[]> => {
    const names = (await fs.readdir(sessionsDir)).filter((n) => n.endsWith(".json"));
    const sessions: Session[] = [];
    for (const name of names) {
      try {
        sessions.push(
          withDefaults(
            JSON.parse(await fs.readFile(path.join(sessionsDir, name), "utf8")) as Session,
          ),
        );
      } catch {
        // skip unparsable files
      }
    }
    return sessions.sort((a, b) =>
      a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0,
    );
  };

  const writeSession = (s: Session): Promise<void> =>
    deleted.has(s.id) ? Promise.resolve() : writeJsonAtomic(fileFor(s.id), s);

  const deleteSession = async (id: string): Promise<void> => {
    if (!ID.test(id)) return;
    deleted.add(id);
    await fs.rm(fileFor(id), { force: true });
    await fs.rm(attachmentsDir(id), { recursive: true, force: true });
  };

  const readSubject = async (id: string): Promise<Subject | null> => {
    if (!SUBJECT_ID.test(id)) return null;
    try {
      return JSON.parse(await fs.readFile(subjectFile(id), "utf8")) as Subject;
    } catch {
      return null;
    }
  };

  const listSubjects = async (): Promise<Subject[]> => {
    const names = (await fs.readdir(subjectsDir)).filter((n) => SUBJECT_FILE.test(n));
    const subjects: Subject[] = [];
    for (const name of names) {
      try {
        const value: unknown = JSON.parse(await fs.readFile(path.join(subjectsDir, name), "utf8"));
        const o = value as Record<string, unknown> | null;
        if (
          typeof o === "object" &&
          o !== null &&
          typeof o.id === "string" &&
          typeof o.updatedAt === "string" &&
          Array.isArray(o.events)
        ) {
          subjects.push(value as Subject);
        }
      } catch {
        // skip unparsable files
      }
    }
    return subjects.sort((a, b) =>
      a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0,
    );
  };

  const writeSubject = (s: Subject): Promise<void> =>
    serial(subjectFile(s.id), () => writeJsonAtomic(subjectFile(s.id), s));

  const appendSubjectEvent = async (
    id: string,
    make: (subject: Subject) => SubjectEvent | null,
  ): Promise<Subject | null> => {
    if (!SUBJECT_ID.test(id)) return null;
    return serial(subjectFile(id), async () => {
      const subject = await readSubject(id);
      if (subject === null) return null;
      const event = make(subject);
      if (event === null) return subject;
      const next: Subject = { ...subject, updatedAt: event.at, events: [...subject.events, event] };
      await writeJsonAtomic(subjectFile(id), next);
      return next;
    });
  };

  const setSubjectFolder = async (
    id: string,
    folder: string,
    at: string,
  ): Promise<Subject | null> => {
    if (!SUBJECT_ID.test(id)) return null;
    return serial(subjectFile(id), async () => {
      const subject = await readSubject(id);
      if (subject === null) return null;
      const next: Subject = { ...subject, folder, updatedAt: at };
      await writeJsonAtomic(subjectFile(id), next);
      return next;
    });
  };

  const deleteSubject = async (id: string): Promise<void> => {
    if (!SUBJECT_ID.test(id)) return;
    for (const s of await listSessions()) {
      if (s.subjectId === id) await deleteSession(s.id);
    }
    await fs.rm(subjectFile(id), { force: true });
  };

  const knowledgeFile = path.join(dir, "knowledge.json");

  const readAllKnowledge = async (): Promise<KnowledgeItem[]> => {
    try {
      const parsed: unknown = JSON.parse(await fs.readFile(knowledgeFile, "utf8"));
      return Array.isArray(parsed) ? (parsed as KnowledgeItem[]) : [];
    } catch {
      return [];
    }
  };

  const reviewsFile = path.join(dir, "reviews.json");

  const readReviews = async (): Promise<Review[]> => {
    try {
      const parsed: unknown = JSON.parse(await fs.readFile(reviewsFile, "utf8"));
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((r): r is Review => {
        if (typeof r !== "object" || r === null) return false;
        const o = r as Record<string, unknown>;
        return (
          typeof o.itemId === "string" &&
          (o.box === 1 || o.box === 2 || o.box === 3 || o.box === 4 || o.box === 5) &&
          typeof o.due === "string" &&
          !Number.isNaN(Date.parse(o.due)) &&
          (typeof o.front === "string" || o.front === null)
        );
      });
    } catch {
      return [];
    }
  };

  const writeReviews = (reviews: Review[]): Promise<void> =>
    serial(reviewsFile, () => writeJsonAtomic(reviewsFile, reviews));

  const updateReviews = (change: (reviews: Review[]) => Review[]): Promise<void> =>
    serial(reviewsFile, async () => {
      const have = await readReviews();
      const known = new Set((await readAllKnowledge()).map((k) => k.id));
      await writeJsonAtomic(
        reviewsFile,
        change(have).filter((r) => known.has(r.itemId)),
      );
    });

  const readKnowledge = async (): Promise<KnowledgeItem[]> =>
    (await readAllKnowledge()).sort((a, b) =>
      a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0,
    );

  const addKnowledge = (items: KnowledgeItem[]): Promise<void> =>
    serial(knowledgeFile, async () => {
      if (items.length === 0) return;
      const existing = await readAllKnowledge();
      const seen = new Set(existing.map((k) => JSON.stringify([k.sessionId, k.nodeId, k.text])));
      const fresh: KnowledgeItem[] = [];
      for (const it of items) {
        const key = JSON.stringify([it.sessionId, it.nodeId, it.text]);
        if (seen.has(key)) continue;
        seen.add(key);
        fresh.push(it);
      }
      if (fresh.length === 0) return;
      await writeJsonAtomic(knowledgeFile, [...existing, ...fresh]);
      try {
        await serial(reviewsFile, async () => {
          const have = await readReviews();
          const ids = new Set(have.map((r) => r.itemId));
          await writeJsonAtomic(reviewsFile, [
            ...have,
            ...fresh.filter((k) => !ids.has(k.id)).map((k) => newReview(k.id, k.createdAt)),
          ]);
        });
      } catch {
        // a missing review counts as box one
      }
    });

  const deleteKnowledge = (id: string): Promise<void> =>
    serial(knowledgeFile, async () => {
      const all = await readAllKnowledge();
      await writeJsonAtomic(
        knowledgeFile,
        all.filter((k) => k.id !== id),
      );
      await serial(reviewsFile, async () => {
        const have = await readReviews();
        if (have.some((r) => r.itemId === id)) {
          await writeJsonAtomic(
            reviewsFile,
            have.filter((r) => r.itemId !== id),
          );
        }
      });
    });

  const profileFile = path.join(dir, "profile.json");

  const readProfile = async (): Promise<string> => {
    try {
      const parsed: unknown = JSON.parse(await fs.readFile(profileFile, "utf8"));
      const text =
        typeof parsed === "object" && parsed !== null
          ? (parsed as { instructions?: unknown }).instructions
          : undefined;
      return typeof text === "string" ? text : "";
    } catch {
      return "";
    }
  };

  const writeProfile = (text: string): Promise<void> =>
    serial(profileFile, () => writeJsonAtomic(profileFile, { instructions: text }));

  const settingsFile = path.join(dir, "settings.json");

  const readSettings = async (): Promise<Settings> => {
    try {
      return mergeSettings(JSON.parse(await fs.readFile(settingsFile, "utf8")));
    } catch {
      return mergeSettings(null);
    }
  };

  const writeSettings = (settings: Settings): Promise<void> =>
    serial(settingsFile, () => writeJsonAtomic(settingsFile, settings));

  return {
    writeJsonAtomic,
    listSessions,
    readSession,
    writeSession,
    deleteSession,
    attachmentsDir,
    addAttachment,
    removeAttachment,
    listSubjects,
    readSubject,
    writeSubject,
    appendSubjectEvent,
    setSubjectFolder,
    deleteSubject,
    readKnowledge,
    addKnowledge,
    readSettings,
    writeSettings,
    deleteKnowledge,
    readReviews,
    writeReviews,
    updateReviews,
    readProfile,
    writeProfile,
  };
}
