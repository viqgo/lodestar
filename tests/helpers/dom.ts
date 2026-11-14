import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";
import type {
  Api,
  CallState,
  Session,
  Subject,
  SubjectResult,
  TurnResult,
} from "../../src/shared/types";

afterEach(cleanup);

/** Installs a fake window.api. Returns it with helpers to fire the two events. */
export function installApi(over: Partial<Record<keyof Api, unknown>> = {}) {
  const updated = new Set<(s: Session) => void>();
  const ended = new Set<(id: string, r: TurnResult) => void>();
  const subjectUpdated = new Set<(s: Subject) => void>();
  const subjectEnded = new Set<(id: string, r: SubjectResult) => void>();
  const voiceState = new Set<(s: CallState) => void>();
  const voiceTranscript = new Set<(text: string, final: boolean) => void>();
  const voiceUtterance = new Set<() => void>();
  const voiceAudio = new Set<(audio: Uint8Array) => void>();
  const voiceError = new Set<(message: string) => void>();
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
    dueItems: vi.fn(async () => ({ due: [], nextDue: null })),
    recordReview: vi.fn(async () => undefined),
    practiceFronts: vi.fn(async () => ({ ok: true })),
    practiceAsk: vi.fn(async () => ({
      ok: false,
      error: { kind: "busy", message: "A reply is already on the way." },
    })),
    practiceGrade: vi.fn(async () => ({
      ok: false,
      error: { kind: "busy", message: "A reply is already on the way." },
    })),
    practiceStop: vi.fn(async () => undefined),
    aside: vi.fn(async () => busy),
    getGraph: vi.fn(async () => ({ groups: [], edges: [] })),
    getSettings: vi.fn(async () => ({ voice: { language: "en", voice: "aura-2-thalia-en" } })),
    saveSettings: vi.fn(async () => ({ ok: true })),
    voiceHasKey: vi.fn(async () => false),
    voiceSetKey: vi.fn(async () => ({ ok: true })),
    voiceRemoveKey: vi.fn(async () => undefined),
    voiceStart: vi.fn(async () => ({ ok: false, message: "unused" })),
    voiceAudio: vi.fn(),
    voiceSpeak: vi.fn(async () => undefined),
    voiceSkip: vi.fn(async () => undefined),
    voiceStop: vi.fn(async () => undefined),
    onVoiceState: vi.fn((cb: (s: CallState) => void) => {
      voiceState.add(cb);
      return () => voiceState.delete(cb);
    }),
    onVoiceTranscript: vi.fn((cb: (text: string, final: boolean) => void) => {
      voiceTranscript.add(cb);
      return () => voiceTranscript.delete(cb);
    }),
    onVoiceUtterance: vi.fn((cb: () => void) => {
      voiceUtterance.add(cb);
      return () => voiceUtterance.delete(cb);
    }),
    onVoiceAudio: vi.fn((cb: (audio: Uint8Array) => void) => {
      voiceAudio.add(cb);
      return () => voiceAudio.delete(cb);
    }),
    onVoiceError: vi.fn((cb: (message: string) => void) => {
      voiceError.add(cb);
      return () => voiceError.delete(cb);
    }),
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
    emitVoiceState: (s: CallState) => voiceState.forEach((cb) => cb(s)),
    emitVoiceTranscript: (text: string, final: boolean) =>
      voiceTranscript.forEach((cb) => cb(text, final)),
    emitVoiceUtterance: () => voiceUtterance.forEach((cb) => cb()),
    emitVoiceAudio: (bytes: Uint8Array) => voiceAudio.forEach((cb) => cb(bytes)),
    emitVoiceError: (message: string) => voiceError.forEach((cb) => cb(message)),
    listenerCounts: () => ({ updated: updated.size, ended: ended.size }),
  };
}
