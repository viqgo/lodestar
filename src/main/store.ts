import path from "node:path";
import type { Session } from "../shared/types";

export type Store = {
  writeJsonAtomic(file: string, data: unknown): Promise<void>;
  listSessions(): Promise<Session[]>;
  readSession(id: string): Promise<Session | null>;
  writeSession(session: Session): Promise<void>;
  deleteSession(id: string): Promise<void>;
};

const ID = /^[sk]_[0-9a-f-]{36}$/;

export async function createStore(
  dir: string,
  fs: typeof import("node:fs/promises"),
): Promise<Store> {
  const sessionsDir = path.join(dir, "sessions");
  await fs.mkdir(sessionsDir, { recursive: true });
  const fileFor = (id: string) => path.join(sessionsDir, id + ".json");

  const writeJsonAtomic = async (file: string, data: unknown): Promise<void> => {
    await fs.writeFile(file + ".tmp", JSON.stringify(data, null, 2), "utf8");
    await fs.rename(file + ".tmp", file);
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

  return { writeJsonAtomic, listSessions, readSession, writeSession, deleteSession };
}
