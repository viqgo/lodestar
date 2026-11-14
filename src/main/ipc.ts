import type { IpcMain } from "electron";
import { checkAnswer, deriveState, validateNewLesson } from "../core/engine";
import type { Answer, KnowledgeView, Session, SessionSummary, TurnResult } from "../shared/types";
import type { CliAdapter } from "./cli/adapter";
import type { Store } from "./store";
import type { TurnRunner } from "./turn";

export type IpcDeps = {
  ipcMain: Pick<IpcMain, "handle">;
  adapter: CliAdapter;
  store: Store;
  turns: TurnRunner;
  now: () => string;
  newId: (prefix: "s" | "k") => string;
  send: (channel: string, ...args: unknown[]) => void;
};

export function registerIpc(deps: IpcDeps): void {
  const { ipcMain, adapter, store, turns, now, newId, send } = deps;

  const runTurn = async (id: string): Promise<TurnResult> => {
    const result = await turns.advance(id);
    send("turn:ended", id, result);
    return result;
  };

  ipcMain.handle("cli:detect", () => adapter.detect());

  ipcMain.handle("sessions:list", async (): Promise<SessionSummary[]> => {
    const out: SessionSummary[] = [];
    for (const s of await store.listSessions()) {
      try {
        out.push({
          id: s.id,
          topic: s.topic,
          phase: deriveState(s.events).phase,
          updatedAt: s.updatedAt,
        });
      } catch {
        // a lesson that cannot be read is left out
      }
    }
    return out;
  });

  ipcMain.handle("sessions:create", async (_event, input: { topic: string; goal: string }) => {
    const message = validateNewLesson(input.topic, input.goal);
    if (message !== null) return { ok: false as const, message };
    const session: Session = {
      version: 1,
      id: newId("s"),
      topic: input.topic.trim(),
      goal: input.goal.trim(),
      cli: "codex",
      createdAt: now(),
      updatedAt: now(),
      events: [],
    };
    await store.writeSession(session);
    return { ok: true as const, session };
  });

  ipcMain.handle("sessions:get", (_event, id: string) => store.readSession(id));

  ipcMain.handle("sessions:delete", async (_event, id: string) => {
    turns.stop(id);
    await store.deleteSession(id);
  });

  ipcMain.handle("lesson:advance", (_event, id: string) => runTurn(id));

  ipcMain.handle("lesson:answer", async (_event, id: string, answer: Answer) => {
    if (turns.isRunning(id)) {
      return {
        ok: false as const,
        error: { kind: "busy" as const, message: "A reply is already on the way." },
        session: null,
      };
    }
    const session = await store.readSession(id);
    if (session === null) {
      return {
        ok: false as const,
        error: { kind: "not_found" as const, message: "This lesson no longer exists." },
        session: null,
      };
    }
    const message = checkAnswer(deriveState(session.events), answer);
    if (message !== null) {
      return {
        ok: false as const,
        error: { kind: "invalid_answer" as const, message },
        session,
      };
    }
    const updated: Session = {
      ...session,
      updatedAt: now(),
      events: [...session.events, { kind: "answer", at: now(), answer }],
    };
    await store.writeSession(updated);
    send("session:updated", updated);
    return runTurn(id);
  });

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
}
