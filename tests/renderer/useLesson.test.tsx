// @vitest-environment jsdom
import "../helpers/dom";
import { act as rtlAct, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Answer, Session, SessionEvent } from "../../src/shared/types";
import { useLesson } from "../../src/renderer/src/lib/useLesson";
import { A, act, pick, session } from "../helpers/fixtures";
import { installApi } from "../helpers/dom";

const S = (events: SessionEvent[]): Session => ({ ...session(events), id: "s_1" });
const ANSWER: Answer = { choiceIndex: 1, text: null, reasoning: null, confidence: null };

describe("useLesson", () => {
  it("useLesson loads the lesson and derives its state", async () => {
    const s = S([act(A.probe())]);
    installApi({ getSession: async () => s });
    const { result } = renderHook(() => useLesson("s_1", false));
    await waitFor(() => expect(result.current.session).toEqual(s));
    expect(result.current.state?.awaiting.who).toBe("learner");
  });

  it("useLesson starts an empty lesson once", async () => {
    const { api } = installApi({ getSession: async () => S([]) });
    const { result } = renderHook(() => useLesson("s_1", true));
    await waitFor(() => expect(result.current.session).not.toBeNull());
    await waitFor(() => expect(api.advance).toHaveBeenCalledTimes(1));
    expect(api.advance).toHaveBeenCalledWith("s_1");
  });

  it("resume_does_not_send_anything_automatically", async () => {
    const { api } = installApi({ getSession: async () => S([act(A.probe()), pick(1)]) });
    const { result } = renderHook(() => useLesson("s_1", false));
    await waitFor(() => expect(result.current.session).not.toBeNull());
    expect(api.advance).not.toHaveBeenCalled();
    expect(api.answer).not.toHaveBeenCalled();
  });

  it("useLesson shows a running turn as busy", async () => {
    installApi({ getSession: async () => S([act(A.probe())]), isRunning: async () => true });
    const { result } = renderHook(() => useLesson("s_1", false));
    await waitFor(() => expect(result.current.busy).toBe(true));
  });

  it("useLesson follows updates for its own lesson only", async () => {
    const first = S([act(A.probe())]);
    const { emitUpdated } = installApi({ getSession: async () => first });
    const { result } = renderHook(() => useLesson("s_1", false));
    await waitFor(() => expect(result.current.session).toEqual(first));
    const next = S([act(A.probe()), pick(1)]);
    rtlAct(() => emitUpdated(next));
    expect(result.current.session).toEqual(next);
    rtlAct(() => emitUpdated({ ...S([]), id: "s_2" }));
    expect(result.current.session).toEqual(next);
  });

  it("useLesson reports a failed turn and ignores busy", async () => {
    const s = S([act(A.probe())]);
    const { emitEnded } = installApi({ getSession: async () => s });
    const { result } = renderHook(() => useLesson("s_1", false));
    await waitFor(() => expect(result.current.session).toEqual(s));
    rtlAct(() =>
      emitEnded("s_1", {
        ok: false,
        error: { kind: "cli", message: "Codex failed: x" },
        session: s,
      }),
    );
    expect(result.current.error?.message).toBe("Codex failed: x");
    expect(result.current.busy).toBe(false);
    rtlAct(() =>
      emitEnded("s_1", {
        ok: false,
        error: { kind: "busy", message: "A reply is already on the way." },
        session: s,
      }),
    );
    expect(result.current.error?.message).toBe("Codex failed: x");
  });

  it("useLesson submit sends the answer and waits for the turn", async () => {
    const s = S([act(A.probe())]);
    const s2 = S([act(A.probe()), pick(1)]);
    const { api, emitEnded } = installApi({
      getSession: async () => s,
      answer: vi.fn(() => new Promise(() => {})),
    });
    const { result } = renderHook(() => useLesson("s_1", false));
    await waitFor(() => expect(result.current.session).toEqual(s));
    rtlAct(() => result.current.submit(ANSWER, []));
    expect(api.answer).toHaveBeenCalledWith("s_1", ANSWER, []);
    expect(result.current.busy).toBe(true);
    rtlAct(() => emitEnded("s_1", { ok: true, session: s2 }));
    expect(result.current.busy).toBe(false);
    expect(result.current.session).toEqual(s2);
    expect(result.current.error).toBeNull();
  });

  it("useLesson unsubscribes on unmount", async () => {
    const { listenerCounts } = installApi({ getSession: async () => S([]) });
    const { unmount } = renderHook(() => useLesson("s_1", false));
    expect(listenerCounts()).toEqual({ updated: 1, ended: 1 });
    unmount();
    expect(listenerCounts()).toEqual({ updated: 0, ended: 0 });
  });

  it("useLesson clears busy when an answer is refused", async () => {
    const s = S([act(A.probe())]);
    installApi({
      getSession: async () => s,
      answer: vi.fn(async () => ({
        ok: false,
        error: { kind: "invalid_answer", message: "Write an answer." },
        session: s,
      })),
    });
    const { result } = renderHook(() => useLesson("s_1", false));
    await waitFor(() => expect(result.current.session).toEqual(s));
    rtlAct(() => result.current.submit(ANSWER, []));
    await waitFor(() => expect(result.current.busy).toBe(false));
    expect(result.current.error?.message).toBe("Write an answer.");
  });

  it("submit passes the attached paths to the api", async () => {
    const s = S([act(A.probe())]);
    const { api } = installApi({
      getSession: async () => s,
      answer: vi.fn(() => new Promise(() => {})),
    });
    const { result } = renderHook(() => useLesson("s_1", false));
    await waitFor(() => expect(result.current.session).toEqual(s));
    rtlAct(() => result.current.submit(ANSWER, ["/tmp/a.pdf", "/tmp/b.txt"]));
    expect(api.answer).toHaveBeenCalledWith("s_1", ANSWER, ["/tmp/a.pdf", "/tmp/b.txt"]);
  });
});
