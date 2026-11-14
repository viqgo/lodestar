import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { registerIpc } from "../../src/main/ipc";
import { createStore } from "../../src/main/store";
import type { KnowledgeItem, Session, TurnResult } from "../../src/shared/types";
import { fakeAdapters } from "../helpers/fakes";
import { A, act, pick, session } from "../helpers/fixtures";

const NOW = "2026-03-03T00:00:00.000Z";
const ID1 = "s_00000001-0000-0000-0000-000000000000";
const ID2 = "s_00000002-0000-0000-0000-000000000000";

const setup = async (isRunning = false) => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "lh-ipc-"));
  const store = await createStore(dir, fsp);
  const handlers = new Map<string, (...a: any[]) => any>();
  const ipcMain = {
    handle: (c: string, f: (...a: any[]) => any) => {
      handlers.set(c, f);
    },
  };
  const result: TurnResult = { ok: true, session: session() };
  const turns = {
    advance: vi.fn(async (): Promise<TurnResult> => result),
    stop: vi.fn(),
    isRunning: vi.fn(() => isRunning),
  };
  const send = vi.fn();
  const adapter = { detect: vi.fn(async () => ({ ok: true as const, version: "1.2.3" })) };
  let n = 0;
  registerIpc({
    ipcMain,
    adapters: fakeAdapters(adapter as any),
    store,
    turns,
    now: () => NOW,
    newId: (p) => p + "_0000000" + ++n + "-0000-0000-0000-000000000000",
    send,
  });
  const call = (channel: string, ...args: unknown[]) => handlers.get(channel)!(null, ...args);
  return { store, turns, send, call, result };
};

const withId = (id: string, updatedAt: string, events: Session["events"]): Session => ({
  ...session(events),
  id,
  updatedAt,
});

describe("ipc", () => {
  it("cli:detect passes the adapter result through", async () => {
    const { call } = await setup();
    expect(await call("cli:detect")).toEqual({ ok: true, version: "1.2.3" });
  });

  it("clis:detect returns a status per CLI", async () => {
    const { call } = await setup();
    expect(await call("clis:detect")).toEqual([
      { id: "codex", installed: true, version: "1.2.3" },
      { id: "claude", installed: true, version: "1.2.3" },
      { id: "gemini", installed: true, version: "1.2.3" },
    ]);
  });

  it("sessions:create stores the chosen CLI", async () => {
    const { store, call } = await setup();
    const r = await call("sessions:create", { topic: "Maths", goal: "Limits", cli: "claude" });
    expect(r.ok).toBe(true);
    expect(r.session.cli).toBe("claude");
    expect((await store.readSession(r.session.id))?.cli).toBe("claude");
    const d = await call("sessions:create", { topic: "Maths", goal: "Limits" });
    expect(d.session.cli).toBe("codex");
  });

  it("sessions:create refuses an unknown CLI", async () => {
    const { store, call } = await setup();
    expect(await call("sessions:create", { topic: "Maths", goal: "Limits", cli: "gpt" })).toEqual({
      ok: false,
      message: "Choose a tutor.",
    });
    expect(await store.listSessions()).toEqual([]);
  });

  it("sessions:list carries the CLI", async () => {
    const { store, call } = await setup();
    await store.writeSession({ ...withId(ID1, "2026-01-01T00:00:00.000Z", []), cli: "gemini" });
    const list = await call("sessions:list");
    expect(list[0].cli).toBe("gemini");
  });

  it("switch_tutor_asks_then_stores (ipc part)", async () => {
    const { store, turns, send, call } = await setup();
    await store.writeSession(withId(ID1, "2026-01-01T00:00:00.000Z", []));
    const r = await call("sessions:setCli", ID1, "claude");
    expect(r.ok).toBe(true);
    expect(r.session.cli).toBe("claude");
    expect(r.session.updatedAt).toBe(NOW);
    expect(await store.readSession(ID1)).toEqual(r.session);
    expect(send).toHaveBeenCalledWith("session:updated", r.session);
    expect(turns.advance).not.toHaveBeenCalled();
    expect(await call("sessions:setCli", ID1, "gpt")).toEqual({
      ok: false,
      message: "Choose a tutor.",
    });
    expect(
      await call("sessions:setCli", "s_99999999-0000-0000-0000-000000000000", "claude"),
    ).toEqual({
      ok: false,
      message: "This lesson no longer exists.",
    });
  });

  it("switch_tutor_refused_while_running", async () => {
    const { store, call } = await setup(true);
    const before = withId(ID1, "2026-01-01T00:00:00.000Z", []);
    await store.writeSession(before);
    expect(await call("sessions:setCli", ID1, "claude")).toEqual({
      ok: false,
      message: "A reply is already on the way.",
    });
    expect(await store.readSession(ID1)).toEqual(before);
  });

  it("sessions:list returns summaries newest first", async () => {
    const { store, call } = await setup();
    await store.writeSession(withId(ID1, "2026-01-01T00:00:00.000Z", []));
    await store.writeSession(withId(ID2, "2026-01-02T00:00:00.000Z", [act(A.probe())]));
    expect(await call("sessions:list")).toEqual([
      { id: ID2, topic: "T", phase: "probe", cli: "codex", updatedAt: "2026-01-02T00:00:00.000Z" },
      { id: ID1, topic: "T", phase: "probe", cli: "codex", updatedAt: "2026-01-01T00:00:00.000Z" },
    ]);
  });

  it("sessions:list leaves out a lesson that cannot be read", async () => {
    const { store, call } = await setup();
    await store.writeSession(withId(ID1, "2026-01-01T00:00:00.000Z", []));
    await store.writeSession(withId(ID2, "2026-01-02T00:00:00.000Z", [pick(1)]));
    const list = await call("sessions:list");
    expect(list.map((s: { id: string }) => s.id)).toEqual([ID1]);
  });

  it("sessions:create rejects bad input", async () => {
    const { store, call } = await setup();
    expect(await call("sessions:create", { topic: "", goal: "g" })).toEqual({
      ok: false,
      message: "Enter a topic and a goal.",
    });
    expect(await store.listSessions()).toEqual([]);
  });

  it("sessions:create stores a trimmed lesson", async () => {
    const { store, call } = await setup();
    const expected = {
      version: 1,
      id: "s_00000001-0000-0000-0000-000000000000",
      topic: "Maths",
      goal: "Limits",
      cli: "codex",
      createdAt: NOW,
      updatedAt: NOW,
      events: [],
    };
    expect(await call("sessions:create", { topic: "  Maths ", goal: " Limits " })).toEqual({
      ok: true,
      session: expected,
    });
    expect(await store.readSession(expected.id)).toEqual(expected);
  });

  it("sessions:get returns a lesson or null", async () => {
    const { store, call } = await setup();
    await store.writeSession(session());
    expect(await call("sessions:get", session().id)).toEqual(session());
    expect(await call("sessions:get", "s_99999999-0000-0000-0000-000000000000")).toBeNull();
  });

  it("sessions:delete stops the turn and removes the lesson", async () => {
    const { store, turns, call } = await setup();
    await store.writeSession(session());
    await call("sessions:delete", session().id);
    expect(turns.stop).toHaveBeenCalledWith(session().id);
    expect(await store.readSession(session().id)).toBeNull();
  });

  it("lesson:advance runs the turn and announces the result", async () => {
    const { turns, send, call, result } = await setup();
    expect(await call("lesson:advance", ID1)).toEqual(result);
    expect(turns.advance).toHaveBeenCalledWith(ID1);
    expect(send).toHaveBeenCalledWith("turn:ended", ID1, result);
  });

  it("lesson:answer refuses while a turn runs", async () => {
    const { turns, call } = await setup(true);
    expect(await call("lesson:answer", ID1, {})).toEqual({
      ok: false,
      error: { kind: "busy", message: "A reply is already on the way." },
      session: null,
    });
    expect(turns.advance).not.toHaveBeenCalled();
  });

  it("lesson:answer reports a missing lesson", async () => {
    const { call } = await setup();
    expect(await call("lesson:answer", "s_99999999-0000-0000-0000-000000000000", {})).toEqual({
      ok: false,
      error: { kind: "not_found", message: "This lesson no longer exists." },
      session: null,
    });
  });

  it("lesson:answer rejects an invalid answer", async () => {
    const { store, turns, call } = await setup();
    const s = session([act(A.probe())]);
    await store.writeSession(s);
    const r = await call("lesson:answer", s.id, {
      choiceIndex: null,
      text: null,
      reasoning: null,
      confidence: null,
    });
    expect(r.error).toEqual({ kind: "invalid_answer", message: "Pick an option." });
    expect((await store.readSession(s.id))?.events).toEqual(s.events);
    expect(turns.advance).not.toHaveBeenCalled();
  });

  it("lesson:answer saves the answer, announces it, then advances", async () => {
    const { store, turns, send, call, result } = await setup();
    const s = session([act(A.probe())]);
    await store.writeSession(s);
    const answer = { choiceIndex: 1, text: null, reasoning: "r", confidence: "sure" as const };
    const r = await call("lesson:answer", s.id, answer);
    const stored = (await store.readSession(s.id))!;
    expect(stored.events).toHaveLength(2);
    expect(stored.events[1]).toEqual({ kind: "answer", at: NOW, answer });
    expect(send.mock.calls[0]).toEqual(["session:updated", stored]);
    expect(turns.advance).toHaveBeenCalledTimes(1);
    expect(turns.advance).toHaveBeenCalledWith(s.id);
    expect(r).toEqual(result);
    expect(send.mock.calls[1]).toEqual(["turn:ended", s.id, result]);
  });

  it("lesson:stop and lesson:running pass through", async () => {
    const { turns, call } = await setup(true);
    expect(await call("lesson:running", ID1)).toBe(true);
    await call("lesson:stop", ID1);
    expect(turns.stop).toHaveBeenCalledWith(ID1);
  });

  it("knowledge:list names the source lesson", async () => {
    const { store, call } = await setup();
    await store.writeSession(session());
    const ki = (n: number, sessionId: string, createdAt: string): KnowledgeItem => ({
      id: "k_0000000" + n + "-0000-0000-0000-000000000000",
      text: "t" + n,
      sessionId,
      nodeId: "n1",
      createdAt,
    });
    const a = ki(1, session().id, "2026-01-01T00:00:00.000Z");
    const b = ki(2, ID2, "2026-01-02T00:00:00.000Z");
    await store.addKnowledge([a, b]);
    expect(await call("knowledge:list")).toEqual([
      { ...b, lessonTopic: null },
      { ...a, lessonTopic: "T" },
    ]);
  });

  it("knowledge:delete removes the item", async () => {
    const { store, call } = await setup();
    const k: KnowledgeItem = {
      id: "k_00000001-0000-0000-0000-000000000000",
      text: "t",
      sessionId: ID1,
      nodeId: "n1",
      createdAt: NOW,
    };
    await store.addKnowledge([k]);
    await call("knowledge:delete", k.id);
    expect(await store.readKnowledge()).toEqual([]);
  });
});

describe("ipc profile", () => {
  it("profile channels read and save", async () => {
    const { store, call } = await setup();
    await store.writeProfile("Be long.");
    expect(await call("profile:get")).toBe("Be long.");
    expect(await call("profile:save", "Be brief.")).toEqual({ ok: true });
    expect(await call("profile:get")).toBe("Be brief.");
  });

  it("profile save refuses text over 2000 characters", async () => {
    const { store, call } = await setup();
    await store.writeProfile("Be brief.");
    expect(await call("profile:save", "x".repeat(2001))).toEqual({
      ok: false,
      message: "Keep it under 2000 characters.",
    });
    expect(await store.readProfile()).toBe("Be brief.");
  });
});
