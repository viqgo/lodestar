import { contextBridge, ipcRenderer } from "electron";
import type { Api, Session, Settings, Subject, SubjectResult, TurnResult } from "../shared/types";

const api: Api = {
  detectClis: () => ipcRenderer.invoke("clis:detect") as ReturnType<Api["detectClis"]>,
  listSessions: () => ipcRenderer.invoke("sessions:list") as ReturnType<Api["listSessions"]>,
  createSession: (input) =>
    ipcRenderer.invoke("sessions:create", input) as ReturnType<Api["createSession"]>,
  pickFolder: () => ipcRenderer.invoke("dialog:pickFolder") as Promise<string | null>,
  pickFiles: () => ipcRenderer.invoke("dialog:pickFiles") as Promise<string[]>,
  setSessionFolder: (id, folder) =>
    ipcRenderer.invoke("sessions:setFolder", id, folder) as ReturnType<Api["setSessionFolder"]>,
  setSessionWebSearch: (id, on) =>
    ipcRenderer.invoke("sessions:setWebSearch", id, on) as ReturnType<Api["setSessionWebSearch"]>,
  addAttachments: (id, paths) =>
    ipcRenderer.invoke("sessions:addAttachments", id, paths) as ReturnType<Api["addAttachments"]>,
  removeAttachment: (id, file) =>
    ipcRenderer.invoke("sessions:removeAttachment", id, file) as ReturnType<
      Api["removeAttachment"]
    >,
  setSessionCli: (id, cli) =>
    ipcRenderer.invoke("sessions:setCli", id, cli) as ReturnType<Api["setSessionCli"]>,
  getSession: (id) => ipcRenderer.invoke("sessions:get", id) as ReturnType<Api["getSession"]>,
  deleteSession: (id) => ipcRenderer.invoke("sessions:delete", id) as Promise<void>,
  advance: (id) => ipcRenderer.invoke("lesson:advance", id) as Promise<TurnResult>,
  answer: (id, answer, attachPaths) =>
    ipcRenderer.invoke("lesson:answer", id, answer, attachPaths) as Promise<TurnResult>,
  stop: (id) => ipcRenderer.invoke("lesson:stop", id) as Promise<void>,
  isRunning: (id) => ipcRenderer.invoke("lesson:running", id) as Promise<boolean>,
  listKnowledge: () => ipcRenderer.invoke("knowledge:list") as ReturnType<Api["listKnowledge"]>,
  deleteKnowledge: (id) => ipcRenderer.invoke("knowledge:delete", id) as Promise<void>,
  getSettings: () => ipcRenderer.invoke("settings:get") as Promise<Settings>,
  saveSettings: (settings) =>
    ipcRenderer.invoke("settings:save", settings) as ReturnType<Api["saveSettings"]>,
  getProfile: () => ipcRenderer.invoke("profile:get") as Promise<string>,
  saveProfile: (text) => ipcRenderer.invoke("profile:save", text) as ReturnType<Api["saveProfile"]>,
  listSubjects: () => ipcRenderer.invoke("subjects:list") as ReturnType<Api["listSubjects"]>,
  createSubject: (input) =>
    ipcRenderer.invoke("subjects:create", input) as ReturnType<Api["createSubject"]>,
  getSubject: (id) => ipcRenderer.invoke("subjects:get", id) as ReturnType<Api["getSubject"]>,
  deleteSubject: (id) => ipcRenderer.invoke("subjects:delete", id) as Promise<void>,
  advanceSubject: (id) => ipcRenderer.invoke("subject:advance", id) as Promise<SubjectResult>,
  acceptOutline: (id, units) =>
    ipcRenderer.invoke("subject:accept", id, units) as ReturnType<Api["acceptOutline"]>,
  subjectMessage: (id, text) =>
    ipcRenderer.invoke("subject:message", id, text) as Promise<SubjectResult>,
  resolveChange: (id, accept) =>
    ipcRenderer.invoke("subject:resolveChange", id, accept) as ReturnType<Api["resolveChange"]>,
  startUnit: (subjectId, unitId) =>
    ipcRenderer.invoke("subject:startUnit", subjectId, unitId) as ReturnType<Api["startUnit"]>,
  stopSubject: (id) => ipcRenderer.invoke("subject:stop", id) as Promise<void>,
  isSubjectRunning: (id) => ipcRenderer.invoke("subject:running", id) as Promise<boolean>,
  subjectStatuses: (id) =>
    ipcRenderer.invoke("subject:statuses", id) as ReturnType<Api["subjectStatuses"]>,
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
  onSubjectUpdated: (cb) => {
    const handler = (_event: unknown, subject: Subject): void => {
      cb(subject);
    };
    ipcRenderer.on("subject:updated", handler);
    return () => {
      ipcRenderer.removeListener("subject:updated", handler);
    };
  },
  onSubjectEnded: (cb) => {
    const handler = (_event: unknown, id: string, result: SubjectResult): void => {
      cb(id, result);
    };
    ipcRenderer.on("subject:ended", handler);
    return () => {
      ipcRenderer.removeListener("subject:ended", handler);
    };
  },
};

contextBridge.exposeInMainWorld("api", api);
