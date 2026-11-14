// @vitest-environment jsdom
import "../helpers/dom";
import { act as rtlAct, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Subject, SubjectEvent, UnitStatus } from "../../src/shared/types";
import { useSubject } from "../../src/renderer/src/lib/useSubject";
import { SE, readySubject, subject } from "../helpers/fixtures";
import { installApi } from "../helpers/dom";

const U = (events: SubjectEvent[]): Subject => ({ ...subject(events), id: "u_1" });
const STATUSES: UnitStatus[] = [{ unitId: "u1", sessionId: null, status: "not_started", shaky: 0 }];

describe("useSubject", () => {
  it("useSubject loads the subject, its state and the unit statuses", async () => {
    const s = U(readySubject);
    installApi({ getSubject: async () => s, subjectStatuses: async () => STATUSES });
    const { result } = renderHook(() => useSubject("u_1", false));
    await waitFor(() => expect(result.current.subject).toEqual(s));
    await waitFor(() => expect(result.current.statuses).toEqual(STATUSES));
    expect(result.current.state?.phase).toBe("ready");
  });

  it("useSubject starts the outline of a new subject once", async () => {
    const { api } = installApi({ getSubject: async () => U([]) });
    const { result, rerender } = renderHook(() => useSubject("u_1", true));
    await waitFor(() => expect(result.current.subject).not.toBeNull());
    await waitFor(() => expect(api.advanceSubject).toHaveBeenCalledTimes(1));
    expect(api.advanceSubject).toHaveBeenCalledWith("u_1");
    rerender();
    expect(api.advanceSubject).toHaveBeenCalledTimes(1);
  });

  it("useSubject does not start anything when reopened", async () => {
    const { api } = installApi({ getSubject: async () => U([SE.outline()]) });
    const { result } = renderHook(() => useSubject("u_1", true));
    await waitFor(() => expect(result.current.subject).not.toBeNull());
    const second = renderHook(() => useSubject("u_1", false));
    await waitFor(() => expect(second.result.current.subject).not.toBeNull());
    expect(api.advanceSubject).not.toHaveBeenCalled();
  });

  it("useSubject shows a running call as busy", async () => {
    installApi({ getSubject: async () => U([SE.outline()]), isSubjectRunning: async () => true });
    const { result } = renderHook(() => useSubject("u_1", false));
    await waitFor(() => expect(result.current.busy).toBe(true));
  });

  it("useSubject does not stay busy when the call ended during the load", async () => {
    const s = U([SE.outline()]);
    let release: (v: boolean) => void = () => undefined;
    const running = new Promise<boolean>((r) => {
      release = r;
    });
    const getSubject = vi.fn(async () => s);
    const { emitSubjectEnded } = installApi({ getSubject, isSubjectRunning: () => running });
    const { result } = renderHook(() => useSubject("u_1", false));
    await waitFor(() => expect(getSubject).toHaveBeenCalledTimes(1));
    rtlAct(() => emitSubjectEnded("u_1", { ok: true, subject: s }));
    await rtlAct(async () => {
      release(true);
      await running;
    });
    await waitFor(() => expect(getSubject).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.subject).toEqual(s));
    expect(result.current.busy).toBe(false);
  });

  it("useSubject shows a missing subject when the events are corrupt", async () => {
    installApi({ getSubject: async () => U([SE.outline(), SE.outline()]) });
    const { result } = renderHook(() => useSubject("u_1", false));
    await waitFor(() =>
      expect(result.current.error).toEqual({
        kind: "not_found",
        message: "This subject no longer exists.",
      }),
    );
    expect(result.current.subject).toBeNull();
    expect(result.current.state).toBeNull();
  });

  it("useSubject follows its own updates and results only", async () => {
    const first = U([SE.outline()]);
    const statusCalls = vi.fn(async () => [] as UnitStatus[]);
    const { emitSubjectUpdated, emitSubjectEnded } = installApi({
      getSubject: async () => first,
      subjectStatuses: statusCalls,
    });
    const { result } = renderHook(() => useSubject("u_1", false));
    await waitFor(() => expect(result.current.subject).toEqual(first));
    const calls = statusCalls.mock.calls.length;
    const next = U(readySubject);
    rtlAct(() => emitSubjectUpdated(next));
    expect(result.current.subject).toEqual(next);
    await waitFor(() => expect(statusCalls.mock.calls.length).toBeGreaterThan(calls));
    rtlAct(() => emitSubjectUpdated({ ...U([]), id: "u_2" }));
    expect(result.current.subject).toEqual(next);
    rtlAct(() =>
      emitSubjectEnded("u_1", {
        ok: false,
        error: { kind: "cli", message: "Codex failed: x" },
        subject: next,
      }),
    );
    expect(result.current.error?.message).toBe("Codex failed: x");
    expect(result.current.busy).toBe(false);
    rtlAct(() =>
      emitSubjectEnded("u_1", {
        ok: false,
        error: { kind: "busy", message: "A reply is already on the way." },
        subject: null,
      }),
    );
    expect(result.current.error?.message).toBe("Codex failed: x");
    rtlAct(() =>
      emitSubjectEnded("u_2", {
        ok: false,
        error: { kind: "cli", message: "other" },
        subject: null,
      }),
    );
    expect(result.current.error?.message).toBe("Codex failed: x");
  });

  it("useSubject send and retry call the api and unsubscribe on unmount", async () => {
    const s = U(readySubject);
    const ok = { ok: true as const, subject: s };
    const offs = [vi.fn(), vi.fn(), vi.fn()];
    const { api } = installApi({
      getSubject: async () => s,
      subjectMessage: vi.fn(async () => ok),
      advanceSubject: vi.fn(async () => ok),
      onSubjectUpdated: vi.fn(() => offs[0]),
      onSubjectEnded: vi.fn(() => offs[1]),
      onSessionUpdated: vi.fn(() => offs[2]),
    });
    const { result, unmount } = renderHook(() => useSubject("u_1", false));
    await waitFor(() => expect(result.current.subject).not.toBeNull());
    rtlAct(() => result.current.send("hello"));
    expect(api.subjectMessage).toHaveBeenCalledWith("u_1", "hello");
    await waitFor(() => expect(result.current.busy).toBe(false));
    rtlAct(() => result.current.retry());
    expect(api.advanceSubject).toHaveBeenCalledWith("u_1");
    rtlAct(() => result.current.stop());
    expect(api.stopSubject).toHaveBeenCalledWith("u_1");
    unmount();
    offs.forEach((off) => expect(off).toHaveBeenCalled());
  });
});
