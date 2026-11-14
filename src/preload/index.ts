import { contextBridge, ipcRenderer } from "electron";
import type { Api, Session, TurnResult } from "../shared/types";

const api: Api = {
  detectClis: () => ipcRenderer.invoke("clis:detect") as ReturnType<Api["detectClis"]>,
  listSessions: () => ipcRenderer.invoke("sessions:list") as ReturnType<Api["listSessions"]>,
  createSession: (input) =>
    ipcRenderer.invoke("sessions:create", input) as ReturnType<Api["createSession"]>,
  setSessionCli: (id, cli) =>
    ipcRenderer.invoke("sessions:setCli", id, cli) as ReturnType<Api["setSessionCli"]>,
  getSession: (id) => ipcRenderer.invoke("sessions:get", id) as ReturnType<Api["getSession"]>,
  deleteSession: (id) => ipcRenderer.invoke("sessions:delete", id) as Promise<void>,
  advance: (id) => ipcRenderer.invoke("lesson:advance", id) as Promise<TurnResult>,
  answer: (id, answer) => ipcRenderer.invoke("lesson:answer", id, answer) as Promise<TurnResult>,
  stop: (id) => ipcRenderer.invoke("lesson:stop", id) as Promise<void>,
  isRunning: (id) => ipcRenderer.invoke("lesson:running", id) as Promise<boolean>,
  listKnowledge: () => ipcRenderer.invoke("knowledge:list") as ReturnType<Api["listKnowledge"]>,
  deleteKnowledge: (id) => ipcRenderer.invoke("knowledge:delete", id) as Promise<void>,
  getProfile: () => ipcRenderer.invoke("profile:get") as Promise<string>,
  saveProfile: (text) => ipcRenderer.invoke("profile:save", text) as ReturnType<Api["saveProfile"]>,
  onSessionUpdated: (cb) => {
    const handler = (_event: unknown, session: Session): void => {
      cb(session);
    };
    ipcRenderer.on("session:updated", handler);
    return () => {
      ipcRenderer.removeListener("session:updated", handler);
    };
  },
  onTurnEnded: (cb) => {
    const handler = (_event: unknown, id: string, result: TurnResult): void => {
      cb(id, result);
    };
    ipcRenderer.on("turn:ended", handler);
    return () => {
      ipcRenderer.removeListener("turn:ended", handler);
    };
  },
};

contextBridge.exposeInMainWorld("api", api);
