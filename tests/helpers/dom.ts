import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";
import type { Api, Session, TurnResult } from "../../src/shared/types";

afterEach(cleanup);

/** Installs a fake window.api. Returns it with helpers to fire the two events. */
export function installApi(over: Partial<Record<keyof Api, unknown>> = {}) {
  const updated = new Set<(s: Session) => void>();
  const ended = new Set<(id: string, r: TurnResult) => void>();
  const busy: TurnResult = {
    ok: false,
    error: { kind: "busy", message: "A reply is already on the way." },
    session: null,
  };
  const api = {
    detectCli: vi.fn(async () => ({ ok: true, version: "0.0.0" })),
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
    onSessionUpdated: vi.fn((cb: (s: Session) => void) => {
      updated.add(cb);
      return () => updated.delete(cb);
    }),
    onTurnEnded: vi.fn((cb: (id: string, r: TurnResult) => void) => {
      ended.add(cb);
      return () => ended.delete(cb);
    }),
    ...over,
  };
  (window as unknown as { api: unknown }).api = api;
  return {
    api: api as unknown as Api & typeof api,
    emitUpdated: (s: Session) => updated.forEach((cb) => cb(s)),
    emitEnded: (id: string, r: TurnResult) => ended.forEach((cb) => cb(id, r)),
    listenerCounts: () => ({ updated: updated.size, ended: ended.size }),
  };
}
