import path from "node:path";
import type { KnowledgeItem, Session } from "../shared/types";

export type Store = {
  writeJsonAtomic(file: string, data: unknown): Promise<void>;
  listSessions(): Promise<Session[]>;
  readSession(id: string): Promise<Session | null>;
  writeSession(session: Session): Promise<void>;
  deleteSession(id: string): Promise<void>;
  readKnowledge(): Promise<KnowledgeItem[]>;
  addKnowledge(items: KnowledgeItem[]): Promise<void>;
  deleteKnowledge(id: string): Promise<void>;
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

  const readSession = async (id: string): Promise<Session | null> => {
    if (!ID.test(id)) return null;
    try {
      return JSON.parse(await fs.readFile(fileFor(id), "utf8")) as Session;
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
          JSON.parse(await fs.readFile(path.join(sessionsDir, name), "utf8")) as Session,
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

  return {
    writeJsonAtomic,
    listSessions,
    readSession,
    writeSession,
    deleteSession,
    readKnowledge,
    addKnowledge,
    deleteKnowledge,
  };
}
