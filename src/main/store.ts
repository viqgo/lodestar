import path from "node:path";
import { attachmentKind, checkAttachment } from "../core/material";
import type { Attachment, KnowledgeItem, Session } from "../shared/types";

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
  readKnowledge(): Promise<KnowledgeItem[]>;
  addKnowledge(items: KnowledgeItem[]): Promise<void>;
  deleteKnowledge(id: string): Promise<void>;
  readProfile(): Promise<string>;
  writeProfile(text: string): Promise<void>;
};

const ID = /^[sk]_[0-9a-f-]{36}$/;

export async function createStore(
  dir: string,
  fs: typeof import("node:fs/promises"),
): Promise<Store> {
  const sessionsDir = path.join(dir, "sessions");
  await fs.mkdir(sessionsDir, { recursive: true });
  const fileFor = (id: string) => path.join(sessionsDir, id + ".json");

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
      const safe = name.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 80);
      const taken = new Set(await fs.readdir(target));
      let k = 1;
      while (taken.has("a" + k + "-" + safe)) k++;
      const file = "a" + k + "-" + safe;
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

  const writeSession = (s: Session): Promise<void> => writeJsonAtomic(fileFor(s.id), s);

  const deleteSession = async (id: string): Promise<void> => {
    if (!ID.test(id)) return;
    await fs.rm(fileFor(id), { force: true });
    await fs.rm(attachmentsDir(id), { recursive: true, force: true });
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
    });

  const deleteKnowledge = (id: string): Promise<void> =>
    serial(knowledgeFile, async () => {
      const all = await readAllKnowledge();
      await writeJsonAtomic(
        knowledgeFile,
        all.filter((k) => k.id !== id),
      );
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

  return {
    writeJsonAtomic,
    listSessions,
    readSession,
    writeSession,
    deleteSession,
    attachmentsDir,
    addAttachment,
    removeAttachment,
    readKnowledge,
    addKnowledge,
    deleteKnowledge,
    readProfile,
    writeProfile,
  };
}
