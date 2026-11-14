import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Answer, Session, TurnResult } from "../../src/shared/types";
import { session } from "../helpers/fixtures";

const ANSWER: Answer = { choiceIndex: 1, text: null, reasoning: null, confidence: null };
const SESSION: Session = session();
const RESULT: TurnResult = { ok: true, session: SESSION };

const expose = vi.fn();
const invoke = vi.fn();
const on = vi.fn();
const removeListener = vi.fn();

const load = async () => {
  await import("../../src/preload/index");
  return expose.mock.calls[0][1];
};

describe("preload", () => {
  beforeEach(() => {
    vi.resetModules();
    expose.mockReset();
    invoke.mockReset();
    on.mockReset();
    removeListener.mockReset();
    invoke.mockResolvedValue("R");
    vi.doMock("electron", () => ({
      contextBridge: { exposeInMainWorld: expose },
      ipcRenderer: { invoke, on, removeListener },
    }));
  });

  it("preload exposes the api under window.api", async () => {
    const api = await load();
    expect(expose).toHaveBeenCalledTimes(1);
    expect(expose.mock.calls[0][0]).toBe("api");
    expect(Object.keys(api).sort()).toEqual(
      [
        "detectCli",
        "listSessions",
        "createSession",
        "getSession",
        "deleteSession",
        "advance",
        "answer",
        "stop",
        "isRunning",
        "listKnowledge",
        "deleteKnowledge",
        "onSessionUpdated",
        "onTurnEnded",
      ].sort(),
    );
  });

  it("each method calls its channel with its arguments", async () => {
    const api = await load();
    const input = { topic: "t", goal: "g" };
    const results = [
      await api.detectCli(),
      await api.listSessions(),
      await api.createSession(input),
      await api.getSession("a"),
      await api.deleteSession("a"),
      await api.advance("a"),
      await api.answer("a", ANSWER),
      await api.stop("a"),
      await api.isRunning("a"),
      await api.listKnowledge(),
      await api.deleteKnowledge("k"),
    ];
    expect(invoke.mock.calls).toEqual([
      ["cli:detect"],
      ["sessions:list"],
      ["sessions:create", input],
      ["sessions:get", "a"],
      ["sessions:delete", "a"],
      ["lesson:advance", "a"],
      ["lesson:answer", "a", ANSWER],
      ["lesson:stop", "a"],
      ["lesson:running", "a"],
      ["knowledge:list"],
      ["knowledge:delete", "k"],
    ]);
    expect(results).toEqual(Array(11).fill("R"));
  });

  it("event subscriptions return an unsubscribe", async () => {
    const api = await load();
    const cb = vi.fn();
    const off = api.onSessionUpdated(cb);
    expect(on.mock.calls[0][0]).toBe("session:updated");
    const handler = on.mock.calls[0][1];
    handler({}, SESSION);
    expect(cb).toHaveBeenCalledWith(SESSION);
    off();
    expect(removeListener).toHaveBeenCalledWith("session:updated", handler);

    const cb2 = vi.fn();
    const off2 = api.onTurnEnded(cb2);
    expect(on.mock.calls[1][0]).toBe("turn:ended");
    const handler2 = on.mock.calls[1][1];
    handler2({}, "id", RESULT);
    expect(cb2).toHaveBeenCalledWith("id", RESULT);
    off2();
    expect(removeListener).toHaveBeenCalledWith("turn:ended", handler2);
  });
});
