import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";
import type { Api, Session, Subject, SubjectResult, TurnResult } from "../../src/shared/types";

afterEach(cleanup);

/** Installs a fake window.api. Returns it with helpers to fire the two events. */
export function installApi(over: Partial<Record<keyof Api, unknown>> = {}) {
  const updated = new Set<(s: Session) => void>();
  const ended = new Set<(id: string, r: TurnResult) => void>();
  const subjectUpdated = new Set<(s: Subject) => void>();
  const subjectEnded = new Set<(id: string, r: SubjectResult) => void>();
  const subjectBusy: SubjectResult = {
    ok: false,
    error: { kind: "busy", message: "A reply is already on the way." },
    subject: null,
  };
  const busy: TurnResult = {
    ok: false,
    error: { kind: "busy", message: "A reply is already on the way." },
    session: null,
  };
  const api = {
    detectClis: vi.fn(async () => [
      { id: "codex", installed: true, version: "0.0.0" },
      { id: "claude", installed: true, version: "0.0.0" },
      { id: "gemini", installed: false, version: null },
    ]),
    pickFolder: vi.fn(async () => null),
    pickFiles: vi.fn(async () => []),
    setSessionFolder: vi.fn(async () => ({ ok: false, message: "unused" })),
    setSessionWebSearch: vi.fn(async () => ({ ok: false, message: "unused" })),
    addAttachments: vi.fn(async () => ({ ok: false, message: "unused" })),
    removeAttachment: vi.fn(async () => ({ ok: false, message: "unused" })),
    setSessionCli: vi.fn(async () => ({ ok: false, message: "unused" })),
    listSessions: vi.fn(async () => []),
    createSession: vi.fn(async () => ({ ok: false, message: "unused" })),
    getSession: vi.fn(async () => null),
    deleteSession: vi.fn(async () => undefined),
    advance: vi.fn(async () => busy),
    answer: vi.fn(async () => busy),
    stop: vi.fn(async () => undefined),
    isRunning: vi.fn(async () => false),
    listKnowledge: vi.fn(async () => []),
    deleteKnowledge: vi.fn(async () => undefined),
    getProfile: vi.fn(async () => ""),
    saveProfile: vi.fn(async () => ({ ok: true })),
    onSessionUpdated: vi.fn((cb: (s: Session) => void) => {
      updated.add(cb);
      return () => updated.delete(cb);
    }),
    onTurnEnded: vi.fn((cb: (id: string, r: TurnResult) => void) => {
      ended.add(cb);
      return () => ended.delete(cb);
    }),
    listSubjects: vi.fn(async () => []),
    getSubject: vi.fn(async () => null),
    deleteSubject: vi.fn(async () => undefined),
    stopSubject: vi.fn(async () => undefined),
    isSubjectRunning: vi.fn(async () => false),
    subjectStatuses: vi.fn(async () => []),
    createSubject: vi.fn(async () => ({ ok: false, message: "unused" })),
    acceptOutline: vi.fn(async () => ({ ok: false, message: "unused" })),
    resolveChange: vi.fn(async () => ({ ok: false, message: "unused" })),
    startUnit: vi.fn(async () => ({ ok: false, message: "unused" })),
    advanceSubject: vi.fn(async () => subjectBusy),
    subjectMessage: vi.fn(async () => subjectBusy),
    onSubjectUpdated: vi.fn((cb: (s: Subject) => void) => {
      subjectUpdated.add(cb);
      return () => subjectUpdated.delete(cb);
    }),
    onSubjectEnded: vi.fn((cb: (id: string, r: SubjectResult) => void) => {
      subjectEnded.add(cb);
      return () => subjectEnded.delete(cb);
    }),
    ...over,
  };
  (window as unknown as { api: unknown }).api = api;
  return {
    api: api as unknown as Api & typeof api,
    emitUpdated: (s: Session) => updated.forEach((cb) => cb(s)),
    emitEnded: (id: string, r: TurnResult) => ended.forEach((cb) => cb(id, r)),
    emitSubjectUpdated: (s: Subject) => subjectUpdated.forEach((cb) => cb(s)),
    emitSubjectEnded: (id: string, r: SubjectResult) => subjectEnded.forEach((cb) => cb(id, r)),
    listenerCounts: () => ({ updated: updated.size, ended: ended.size }),
  };
}
