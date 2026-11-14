import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { registerIpc } from "../../src/main/ipc";
import { createStore } from "../../src/main/store";
import type {
  Answer,
  KnowledgeItem,
  Session,
  SubjectResult,
  TurnError,
  TurnResult,
} from "../../src/shared/types";
import { fakeAdapters } from "../helpers/fakes";
import { newReview } from "../../src/core/review";
import {
  A,
  K,
  SE,
  UNITS,
  act,
  choiceQ,
  pick,
  readySubject,
  review,
  session,
  subject,
  textQ,
} from "../helpers/fixtures";

const NOW = "2026-03-03T00:00:00.000Z";
const ID1 = "s_00000001-0000-0000-0000-000000000000";
const ID2 = "s_00000002-0000-0000-0000-000000000000";

const setup = async (
  isRunning = false,
  dialogs = {
    pickFolder: async () => null as string | null,
    pickFiles: async () => [] as string[],
  },
  subjectRunning = false,
) => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "lh-ipc-"));
  const store = await createStore(dir, fsp);
  const handlers = new Map<string, (...a: any[]) => any>();
  const listeners = new Map<string, (...a: any[]) => any>();
  const ipcMain = {
    handle: (c: string, f: (...a: any[]) => any) => {
      handlers.set(c, f);
    },
    on: ((c: string, f: (...a: any[]) => any) => {
      listeners.set(c, f);
    }) as any,
  };
  const voice = {
    start: vi.fn(async (): Promise<{ ok: true } | { ok: false; message: string }> => ({
      ok: true,
    })),
    audio: vi.fn(),
    say: vi.fn(async () => undefined),
    skip: vi.fn(),
    stop: vi.fn(),
  };
  const result: TurnResult = { ok: true, session: session() };
  const turns = {
    advance: vi.fn(async (): Promise<TurnResult> => result),
    stop: vi.fn(),
    isRunning: vi.fn(() => isRunning),
  };
  const subjectResult: SubjectResult = { ok: true, subject: subject() };
  const subjects = {
    outline: vi.fn(async () => subjectResult),
    reply: vi.fn(async () => subjectResult),
    stop: vi.fn(),
    isRunning: vi.fn(() => subjectRunning),
  };
  const practice = {
    fronts: vi.fn(async (): Promise<{ ok: true } | { ok: false; error: TurnError }> => ({
      ok: true,
    })),
    ask: vi.fn(async () => ({ ok: true as const, question: textQ })),
    grade: vi.fn(async () => ({ ok: true as const, verdict: "pass" as const, feedback: "f" })),
    stop: vi.fn(),
  };
  const send = vi.fn();
  const secrets = {
    has: vi.fn(async () => false),
    get: vi.fn(async () => null),
    set: vi.fn(async (): Promise<{ ok: true } | { ok: false; message: string }> => ({ ok: true })),
    remove: vi.fn(async () => undefined),
  };
  const adapter = { detect: vi.fn(async () => ({ ok: true as const, version: "1.2.3" })) };
  let n = 0;
  registerIpc({
    ipcMain,
    adapters: fakeAdapters(adapter as any),
    store,
    turns,
    subjects,
    now: () => NOW,
    newId: (p) => p + "_0000000" + ++n + "-0000-0000-0000-000000000000",
    send,
    dialogs,
    secrets,
    voice,
    practice,
  });
  const call = (channel: string, ...args: unknown[]) => handlers.get(channel)!(null, ...args);
  return {
    store,
    turns,
    subjects,
    send,
    call,
    result,
    dir,
    secrets,
    voice,
    practice,
    emit: (channel: string, ...args: unknown[]) => listeners.get(channel)!(null, ...args),
    channels: () => [...handlers.keys()],
  };
};

const withId = (id: string, updatedAt: string, events: Session["events"]): Session => ({
  ...session(events),
  id,
  updatedAt,
});

describe("ipc", () => {
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
    expect(await call("sessions:create", { topic: "Maths", goal: "Limits" })).toEqual({
      ok: false,
      message: "Choose a tutor.",
    });
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

  it("switch_tutor_refused_if_a_turn_starts_while_reading", async () => {
    const { store, turns, call } = await setup();
    const before = withId(ID1, "2026-01-01T00:00:00.000Z", []);
    await store.writeSession(before);
    turns.isRunning.mockReturnValueOnce(false).mockReturnValueOnce(true);
    expect(await call("sessions:setCli", ID1, "claude")).toEqual({
      ok: false,
      message: "A reply is already on the way.",
    });
    expect((await store.readSession(ID1))?.cli).toBe(before.cli);
  });

  it("sessions:list returns summaries newest first", async () => {
    const { store, call } = await setup();
    await store.writeSession(withId(ID1, "2026-01-01T00:00:00.000Z", []));
    await store.writeSession(withId(ID2, "2026-01-02T00:00:00.000Z", [act(A.probe())]));
    expect(await call("sessions:list")).toEqual([
      {
        id: ID2,
        topic: "T",
        phase: "probe",
        cli: "codex",
        updatedAt: "2026-01-02T00:00:00.000Z",
        subjectId: null,
      },
      {
        id: ID1,
        topic: "T",
        phase: "probe",
        cli: "codex",
        updatedAt: "2026-01-01T00:00:00.000Z",
        subjectId: null,
      },
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
    expect(await call("sessions:create", { topic: "", goal: "g", cli: "codex" })).toEqual({
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
      folder: null,
      attachments: [],
      webSearch: false,
      subjectId: null,
      unitId: null,
    };
    expect(
      await call("sessions:create", { topic: "  Maths ", goal: " Limits ", cli: "codex" }),
    ).toEqual({
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

const makeFiles = async (names: string[], bytes = 5) => {
  const d = await fsp.mkdtemp(path.join(os.tmpdir(), "lh-src-"));
  const out: string[] = [];
  for (const n of names) {
    await fsp.writeFile(path.join(d, n), "x".repeat(bytes));
    out.push(path.join(d, n));
  }
  return out;
};

const REFUSED = "A reply is already on the way.";

describe("ipc material", () => {
  it("folder_chooser_stores_path (ipc)", async () => {
    const { store, send, call } = await setup();
    const r = await call("sessions:create", {
      topic: "Maths",
      goal: "Limits",
      cli: "codex",
      folder: "/notes/a",
      webSearch: false,
      attachPaths: [],
    });
    expect(r.session.folder).toBe("/notes/a");
    const b = await call("sessions:setFolder", r.session.id, "/notes/b");
    expect(b.ok && b.session.folder).toBe("/notes/b");
    expect((await store.readSession(r.session.id))?.folder).toBe("/notes/b");
    expect(send).toHaveBeenCalledWith("session:updated", b.session);
    const c = await call("sessions:setFolder", r.session.id, null);
    expect(c.ok && c.session.folder).toBeNull();
    expect((await store.readSession(r.session.id))?.folder).toBeNull();
  });

  it("web_search_off_by_default", async () => {
    const { store, call } = await setup();
    const r = await call("sessions:create", { topic: "Maths", goal: "Limits", cli: "codex" });
    expect(r.session.webSearch).toBe(false);
    expect(r.session.folder).toBeNull();
    const on = await call("sessions:setWebSearch", r.session.id, true);
    expect(on.ok && on.session.webSearch).toBe(true);
    expect((await store.readSession(r.session.id))?.webSearch).toBe(true);
  });

  it("create copies attachments and refuses a bad one without leaving a lesson", async () => {
    const { store, call, dir } = await setup();
    const [a, b] = await makeFiles(["a.txt", "b.md"]);
    const ok = await call("sessions:create", {
      topic: "Maths",
      goal: "Limits",
      cli: "codex",
      folder: null,
      webSearch: false,
      attachPaths: [a, b],
    });
    expect(ok.session.attachments.map((x: { name: string }) => x.name)).toEqual(["a.txt", "b.md"]);
    expect((await store.readSession(ok.session.id))?.attachments).toHaveLength(2);
    expect(await fsp.readdir(store.attachmentsDir(ok.session.id))).toHaveLength(2);
    const [c] = await makeFiles(["c.txt"]);
    const [bad] = await makeFiles(["bad.exe"]);
    const refused = await call("sessions:create", {
      topic: "Maths",
      goal: "Limits",
      cli: "codex",
      folder: null,
      webSearch: false,
      attachPaths: [c, bad],
    });
    expect(refused).toEqual({ ok: false, message: "That file type is not supported." });
    expect((await store.listSessions()).map((x) => x.id)).toEqual([ok.session.id]);
    expect(await fsp.readdir(path.join(dir, "attachments"))).toEqual([ok.session.id]);
  });

  it("addAttachments stops at the first refusal", async () => {
    const { store, call } = await setup();
    await store.writeSession(session());
    const [a, c] = await makeFiles(["a.txt", "c.txt"]);
    const [bad] = await makeFiles(["bad.exe"]);
    const r = await call("sessions:addAttachments", session().id, [a, bad, c]);
    expect(r).toEqual({ ok: false, message: "That file type is not supported." });
    const stored = (await store.readSession(session().id))!;
    expect(stored.attachments.map((x) => x.name)).toEqual(["a.txt"]);
    expect(await fsp.readdir(store.attachmentsDir(session().id))).toEqual(["a1-a.txt"]);
    const ok = await call("sessions:addAttachments", session().id, [c]);
    expect(ok.ok && ok.session.attachments.map((x: { name: string }) => x.name)).toEqual([
      "a.txt",
      "c.txt",
    ]);
  });

  it("removeAttachment deletes the copy and the entry", async () => {
    const { store, call } = await setup();
    await store.writeSession(session());
    const [a, b] = await makeFiles(["a.txt", "b.txt"]);
    const added = await call("sessions:addAttachments", session().id, [a, b]);
    const file = added.session.attachments[0].file;
    const r = await call("sessions:removeAttachment", session().id, file);
    expect(r.ok && r.session.attachments.map((x: { name: string }) => x.name)).toEqual(["b.txt"]);
    expect((await store.readSession(session().id))?.attachments).toHaveLength(1);
    expect(await fsp.readdir(store.attachmentsDir(session().id))).toEqual(["a1-b.txt"]);
  });

  it("header_controls_disabled_while_running (ipc)", async () => {
    const { store, call } = await setup(true);
    const before = session();
    await store.writeSession(before);
    const id = before.id;
    const refusal = { ok: false, message: REFUSED };
    expect(await call("sessions:setFolder", id, "/x")).toEqual(refusal);
    expect(await call("sessions:setWebSearch", id, true)).toEqual(refusal);
    expect(await call("sessions:addAttachments", id, ["/x.txt"])).toEqual(refusal);
    expect(await call("sessions:removeAttachment", id, "a1-x.txt")).toEqual(refusal);
    expect(await store.readSession(id)).toEqual(before);
  });

  it("setters refuse a deleted lesson", async () => {
    const { call } = await setup();
    const id = "s_99999999-0000-0000-0000-000000000000";
    const gone = { ok: false, message: "This lesson no longer exists." };
    expect(await call("sessions:setFolder", id, "/x")).toEqual(gone);
    expect(await call("sessions:setWebSearch", id, true)).toEqual(gone);
    expect(await call("sessions:addAttachments", id, ["/x.txt"])).toEqual(gone);
    expect(await call("sessions:removeAttachment", id, "a1-x.txt")).toEqual(gone);
  });

  it("answer with files stores their names and copies them", async () => {
    const { store, call, result } = await setup();
    const s = session([act(A.probe())]);
    await store.writeSession(s);
    const [a, b] = await makeFiles(["a.txt", "b.png"]);
    const answer = { choiceIndex: 1, text: null, reasoning: null, confidence: null };
    expect(await call("lesson:answer", s.id, answer, [a, b])).toEqual(result);
    const stored = (await store.readSession(s.id))!;
    expect(stored.events[1]).toEqual({
      kind: "answer",
      at: NOW,
      answer: { ...answer, attachments: ["a1-a.txt", "a1-b.png"] },
    });
    expect((await fsp.readdir(store.attachmentsDir(s.id))).sort()).toEqual([
      "a1-a.txt",
      "a1-b.png",
    ]);
  });

  it("answer refuses a fourth file and copies nothing", async () => {
    const { store, turns, call } = await setup();
    const s = session([act(A.probe())]);
    await store.writeSession(s);
    const files = await makeFiles(["a.txt", "b.txt", "c.txt", "d.txt"]);
    const answer = { choiceIndex: 1, text: null, reasoning: null, confidence: null };
    const r = await call("lesson:answer", s.id, answer, files);
    expect(r.error).toEqual({
      kind: "invalid_answer",
      message: "An answer can hold at most 3 files.",
    });
    expect((await store.readSession(s.id))?.events).toEqual(s.events);
    expect(await fsp.readdir(store.attachmentsDir(s.id)).catch(() => [])).toEqual([]);
    expect(turns.advance).not.toHaveBeenCalled();
  });

  it("ipc removeAttachment only removes this lesson's own copies", async () => {
    const { store, call } = await setup();
    await store.writeSession(session());
    await store.writeSession({ ...session(), id: ID2 });
    const [a, b] = await makeFiles(["a.txt", "b.txt"]);
    await call("sessions:addAttachments", ID2, [b]);
    const mine = await call("sessions:addAttachments", session().id, [a]);
    const trick = "../" + ID2 + "/a1-b.txt";
    expect(await call("sessions:removeAttachment", session().id, trick)).toEqual({
      ok: true,
      session: mine.session,
    });
    const r = await call("sessions:removeAttachment", session().id, "a1-b.txt");
    expect(r).toEqual({ ok: true, session: mine.session });
    expect(await fsp.readdir(store.attachmentsDir(ID2))).toEqual(["a1-b.txt"]);
    expect(await fsp.readdir(store.attachmentsDir(session().id))).toEqual(["a1-a.txt"]);
  });

  it("two answers at once store only one", async () => {
    const { store, call } = await setup();
    const s = session([act(A.probe())]);
    await store.writeSession(s);
    const answer = { choiceIndex: 1, text: null, reasoning: null, confidence: null };
    const [x, y] = await Promise.all([
      call("lesson:answer", s.id, answer),
      call("lesson:answer", s.id, answer),
    ]);
    expect((await store.readSession(s.id))!.events.filter((e) => e.kind === "answer")).toHaveLength(
      1,
    );
    const kinds = [x, y].map((r) => (r.ok === false ? r.error.kind : "ok"));
    expect(kinds.filter((k) => k === "invalid_answer")).toHaveLength(1);
  });

  it("deleting a lesson waits for a write in progress and the lesson stays deleted", async () => {
    const { store, call } = await setup();
    const s = session([act(A.probe())]);
    await store.writeSession(s);
    const answer = { choiceIndex: 1, text: null, reasoning: null, confidence: null };
    await Promise.all([call("lesson:answer", s.id, answer), call("sessions:delete", s.id)]);
    expect(await store.readSession(s.id)).toBeNull();
  });

  it("a switch and an answer at once keep both", async () => {
    const { store, call } = await setup();
    const s = session([act(A.probe())]);
    await store.writeSession(s);
    const answer = { choiceIndex: 1, text: null, reasoning: null, confidence: null };
    await Promise.all([
      call("sessions:setWebSearch", s.id, true),
      call("lesson:answer", s.id, answer),
    ]);
    const stored = (await store.readSession(s.id))!;
    expect(stored.events.filter((e) => e.kind === "answer")).toHaveLength(1);
    expect(stored.webSearch).toBe(true);
  });

  it("a create that fails on its last write leaves nothing", async () => {
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "lh-ipc-"));
    const real = await createStore(dir, fsp);
    let writes = 0;
    const store = {
      ...real,
      writeSession: async (x: Session) => {
        if (++writes === 2) throw new Error("disk full");
        return real.writeSession(x);
      },
    };
    const handlers = new Map<string, (...a: any[]) => any>();
    registerIpc({
      ipcMain: {
        handle: (c: string, f: (...a: any[]) => any) => void handlers.set(c, f),
        on: (() => undefined) as any,
      },
      adapters: fakeAdapters({ detect: vi.fn() } as any),
      store,
      turns: { advance: vi.fn(), stop: vi.fn(), isRunning: vi.fn(() => false) } as any,
      subjects: {
        outline: vi.fn(),
        reply: vi.fn(),
        stop: vi.fn(),
        isRunning: vi.fn(() => false),
      } as any,
      now: () => NOW,
      newId: (p) => p + "_00000001-0000-0000-0000-000000000000",
      send: vi.fn(),
      dialogs: { pickFolder: async () => null, pickFiles: async () => [] },
      secrets: { has: vi.fn(), get: vi.fn(), set: vi.fn(), remove: vi.fn() } as any,
      voice: {
        start: vi.fn(),
        audio: vi.fn(),
        say: vi.fn(),
        skip: vi.fn(),
        stop: vi.fn(),
      } as any,
      practice: { fronts: vi.fn(), ask: vi.fn(), grade: vi.fn(), stop: vi.fn() } as any,
    });
    const [a] = await makeFiles(["a.txt"]);
    const r = await handlers.get("sessions:create")!(null, {
      topic: "Maths",
      goal: "Limits",
      cli: "codex",
      attachPaths: [a],
    });
    expect(r).toEqual({ ok: false, message: "Could not save. Check free disk space." });
    expect(await real.listSessions()).toEqual([]);
    expect(await fsp.readdir(path.join(dir, "attachments"))).toEqual([]);
  });

  it("a folder must be an absolute path", async () => {
    const { store, call } = await setup();
    const s = session();
    await store.writeSession(s);
    const refusal = { ok: false, message: "Choose a folder." };
    for (const folder of ["relative/dir", 42]) {
      expect(
        await call("sessions:create", { topic: "Maths", goal: "Limits", cli: "codex", folder }),
      ).toEqual(refusal);
      expect(await call("sessions:setFolder", s.id, folder)).toEqual(refusal);
    }
    expect(await store.listSessions()).toHaveLength(1);
    expect((await store.readSession(s.id))?.folder).toBeNull();
  });

  it("an answer never keeps attachments from the window", async () => {
    const { store, call } = await setup();
    const s = session([act(A.probe())]);
    await store.writeSession(s);
    const answer = {
      choiceIndex: 1,
      text: null,
      reasoning: null,
      confidence: null,
      attachments: ["../../etc/passwd"],
    };
    await call("lesson:answer", s.id, answer);
    const stored = (await store.readSession(s.id))!;
    const ev = stored.events[1] as { kind: "answer"; answer: Answer };
    expect(ev.answer.attachments).toBeUndefined();
  });

  it("pick channels pass the dialog results through", async () => {
    const { call } = await setup(false, {
      pickFolder: async () => "/picked",
      pickFiles: async () => ["/a.pdf", "/b.png"],
    });
    expect(await call("dialog:pickFolder")).toBe("/picked");
    expect(await call("dialog:pickFiles")).toEqual(["/a.pdf", "/b.png"]);
    const none = await setup();
    expect(await none.call("dialog:pickFolder")).toBeNull();
    expect(await none.call("dialog:pickFiles")).toEqual([]);
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

describe("ipc settings", () => {
  const DEFAULTS = { voice: { language: "en", voice: "aura-2-thalia-en" } };

  it("settings channels read and save", async () => {
    const { call } = await setup();
    expect(await call("settings:get")).toEqual(DEFAULTS);
    const next = { voice: { language: "de", voice: "aura-2-x" } };
    expect(await call("settings:save", next)).toEqual({ ok: true });
    expect(await call("settings:get")).toEqual(next);
  });

  it("settings:save refuses bad values and stores nothing", async () => {
    const { store, call } = await setup();
    expect(await call("settings:save", { voice: { language: "en US", voice: "x" } })).toEqual({
      ok: false,
      message: "Enter a speech language and a voice.",
    });
    expect(await call("settings:get")).toEqual(DEFAULTS);
    store.writeSettings = async () => {
      throw new Error("disk");
    };
    expect(await call("settings:save", DEFAULTS)).toEqual({
      ok: false,
      message: "Could not save. Check free disk space.",
    });
  });
});

const SID = "u_00000001-0000-0000-0000-000000000000";
const SID2 = "u_00000002-0000-0000-0000-000000000000";
const withSubject = (id: string, events: ReturnType<typeof subject>["events"], at = NOW) => ({
  ...subject(events),
  id,
  updatedAt: at,
});
const OTHER = "s_00000099-0000-0000-0000-000000000000";
const RUNNING_TEXT = "A reply is already on the way.";
const OUTLINE_TEXT = "An outline needs 2 to 30 units, each with a title and a goal.";

describe("ipc subjects", () => {
  it("subjects:create stores a trimmed subject", async () => {
    const { store, call, subjects } = await setup();
    const r = await call("subjects:create", {
      name: "  Algebra  ",
      folder: "/course",
      cli: "claude",
    });
    expect(r).toEqual({
      ok: true,
      subject: {
        version: 1,
        id: "u_00000001-0000-0000-0000-000000000000",
        name: "Algebra",
        folder: "/course",
        cli: "claude",
        createdAt: NOW,
        updatedAt: NOW,
        events: [],
      },
    });
    expect(await store.readSubject(r.subject.id)).toEqual(r.subject);
    expect(subjects.outline).not.toHaveBeenCalled();
  });

  it("new_subject_needs_name_and_folder (ipc)", async () => {
    const { store, call } = await setup();
    const text = "Enter a name and choose a folder.";
    const refuse = (message: string) => ({ ok: false, message });
    expect(await call("subjects:create", { name: " ", folder: "/f", cli: "codex" })).toEqual(
      refuse(text),
    );
    expect(
      await call("subjects:create", { name: "x".repeat(101), folder: "/f", cli: "codex" }),
    ).toEqual(refuse(text));
    expect(await call("subjects:create", { name: "A", folder: null, cli: "codex" })).toEqual(
      refuse(text),
    );
    expect(
      await call("subjects:create", { name: "A", folder: "relative/dir", cli: "codex" }),
    ).toEqual(refuse("Choose a folder."));
    expect(await call("subjects:create", { name: "A", folder: "/f", cli: "gpt" })).toEqual(
      refuse("Choose a tutor."),
    );
    expect(await store.listSubjects()).toEqual([]);
  });

  it("subjects:list returns summaries newest first", async () => {
    const { store, call } = await setup();
    await store.writeSubject({
      ...withSubject(SID, []),
      name: "Old",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    await store.writeSubject({
      ...withSubject(SID2, []),
      name: "New",
      updatedAt: "2026-01-02T00:00:00.000Z",
    });
    expect(await call("subjects:list")).toEqual([
      { id: SID2, name: "New", updatedAt: "2026-01-02T00:00:00.000Z" },
      { id: SID, name: "Old", updatedAt: "2026-01-01T00:00:00.000Z" },
    ]);
  });

  it("subject:advance runs the outline first and the reply once a message waits", async () => {
    const { store, call, subjects, send } = await setup();
    await store.writeSubject(withSubject(SID, []));
    const r1 = await call("subject:advance", SID);
    expect(subjects.outline).toHaveBeenCalledTimes(1);
    expect(subjects.reply).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith("subject:ended", SID, r1);
    await store.writeSubject(withSubject(SID2, [...readySubject, SE.message()]));
    const r2 = await call("subject:advance", SID2);
    expect(subjects.reply).toHaveBeenCalledTimes(1);
    expect(subjects.outline).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith("subject:ended", SID2, r2);
  });

  it("subject:accept stores the edited outline", async () => {
    const { store, call, send } = await setup();
    await store.writeSubject(withSubject(SID, [SE.outline()]));
    const r = await call("subject:accept", SID, [
      { id: "u3", title: "  Third  ", goal: " G3 ", files: ["evil.txt"] },
      { id: "u1", title: "First renamed", goal: "Goal one edited", files: [] },
    ]);
    const expected = [
      { id: "u3", title: "Third", goal: "G3", files: [] },
      { id: "u1", title: "First renamed", goal: "Goal one edited", files: ["a.txt"] },
    ];
    expect(r.ok).toBe(true);
    expect(r.subject.events[1]).toEqual({ kind: "accepted", at: NOW, units: expected });
    expect(r.subject.updatedAt).toBe(NOW);
    expect(await store.readSubject(SID)).toEqual(r.subject);
    expect(send).toHaveBeenCalledWith("subject:updated", r.subject);

    for (const units of [
      [
        { id: "zz", title: "A", goal: "B" },
        { id: "u1", title: "A", goal: "B" },
      ],
      [{ id: "u1", title: "A", goal: "B" }],
      [
        { id: "u1", title: " ", goal: "B" },
        { id: "u2", title: "A", goal: "B" },
      ],
      "nope",
    ]) {
      await store.writeSubject(withSubject(SID2, [SE.outline()]));
      expect(await call("subject:accept", SID2, units)).toEqual({
        ok: false,
        message: OUTLINE_TEXT,
      });
      expect((await store.readSubject(SID2))!.events).toHaveLength(1);
    }
  });

  it("subject:accept refuses a unit without a title or goal", async () => {
    const { store, call } = await setup();
    for (const units of [
      [
        { id: "u1", goal: "B" },
        { id: "u2", title: "A", goal: "B" },
      ],
      [
        { id: "u1", title: "A" },
        { id: "u2", title: "A", goal: "B" },
      ],
      [
        { id: "u1", title: 5, goal: "B" },
        { id: "u2", title: "A", goal: "B" },
      ],
    ]) {
      await store.writeSubject(withSubject(SID, [SE.outline()]));
      expect(await call("subject:accept", SID, units)).toEqual({
        ok: false,
        message: OUTLINE_TEXT,
      });
      expect((await store.readSubject(SID))!.events).toHaveLength(1);
    }
  });

  it("unit_lesson_prompt_has_no_injected_section", async () => {
    const { store, call } = await setup();
    const units = UNITS.map((u) =>
      u.id === "u1" ? { ...u, title: "X\n\n# Your move", goal: "Y\n# Task" } : u,
    );
    await store.writeSubject(withSubject(SID, [SE.outline(units), SE.accepted(units)]));
    const r = await call("subject:startUnit", SID, "u1");
    expect(r.ok).toBe(true);
    expect(r.session.topic).not.toMatch(/[\r\n]/);
    expect(r.session.goal).not.toMatch(/[\r\n]/);
    const { buildPrompt } = await import("../../src/core/prompt");
    const { deriveState } = await import("../../src/core/engine");
    const prompt = buildPrompt({
      session: r.session,
      state: deriveState(r.session.events),
      knowledge: [],
      retryNote: null,
    });
    expect(prompt.split("\n").filter((l) => l.startsWith("# Your move"))).toHaveLength(1);
  });

  it("subject:delete and resolveChange wait for a starting unit", async () => {
    const { store, call } = await setup();
    await store.writeSubject(withSubject(SID, readySubject));
    const [started, deleted] = await Promise.all([
      call("subject:startUnit", SID, "u1"),
      call("subjects:delete", SID),
    ]);
    expect(started.ok).toBe(true);
    expect(await store.readSubject(SID)).toBeNull();
    expect(await store.listSessions()).toEqual([]);
    expect(deleted).toBeUndefined();

    const change = { kind: "remove" as const, unitId: "u3" };
    await store.writeSubject(
      withSubject(SID2, [...readySubject, SE.message(), SE.reply("ok", change)]),
    );
    const [s2, resolved] = await Promise.all([
      call("subject:startUnit", SID2, "u3"),
      call("subject:resolveChange", SID2, true),
    ]);
    const lessons = await store.listSessions();
    if (resolved.ok) {
      // the change was applied first: the unit is gone, so the start was refused and no lesson exists
      expect(s2.ok).toBe(false);
      expect(lessons).toHaveLength(0);
    } else {
      expect(resolved.message).toBe("This change no longer fits the outline. Dismiss it.");
      expect(s2.ok).toBe(true);
      expect(lessons).toHaveLength(1);
    }
  });

  it("nothing_starts_before_accept", async () => {
    const { store, call, subjects } = await setup();
    await store.writeSubject(withSubject(SID, []));
    await store.writeSubject(withSubject(SID2, [SE.outline()]));
    for (const id of [SID, SID2]) {
      expect(await call("subject:startUnit", id, "u1")).toEqual({
        ok: false,
        message: "Accept the outline first.",
      });
      const m = await call("subject:message", id, "hello");
      expect(m.ok).toBe(false);
      expect(m.error.kind).toBe("invalid_answer");
      expect(m.error.message).toBe("Accept the outline first.");
      expect((await store.readSubject(id))!.events.length).toBe(id === SID ? 0 : 1);
    }
    expect(await store.listSessions()).toEqual([]);
    expect(subjects.outline).not.toHaveBeenCalled();
    expect(subjects.reply).not.toHaveBeenCalled();
  });

  it("start_unit_creates_prefilled_lesson", async () => {
    const { store, call } = await setup();
    await store.writeSubject({ ...withSubject(SID, readySubject), cli: "claude" });
    const r = await call("subject:startUnit", SID, "u2");
    expect(r.ok).toBe(true);
    expect(r.session).toEqual({
      version: 1,
      id: "s_00000001-0000-0000-0000-000000000000",
      topic: "Unit two",
      goal: "Goal two",
      cli: "claude",
      createdAt: NOW,
      updatedAt: NOW,
      events: [],
      folder: "/course",
      attachments: [],
      webSearch: false,
      subjectId: SID,
      unitId: "u2",
    });
    expect(await store.readSession(r.session.id)).toEqual(r.session);
    const list = await call("sessions:list");
    expect(list[0].subjectId).toBe(SID);
  });

  it("unit_has_one_lesson", async () => {
    const { store, call } = await setup();
    await store.writeSubject(withSubject(SID, readySubject));
    const a = await call("subject:startUnit", SID, "u1");
    const b = await call("subject:startUnit", SID, "u1");
    expect(b.session.id).toBe(a.session.id);
    const [c, d] = await Promise.all([
      call("subject:startUnit", SID, "u2"),
      call("subject:startUnit", SID, "u2"),
    ]);
    expect(c.session.id).toBe(d.session.id);
    expect(await store.listSessions()).toHaveLength(2);
  });

  it("subject:startUnit refuses an unknown unit and a deleted subject", async () => {
    const { store, call } = await setup();
    await store.writeSubject(withSubject(SID, readySubject));
    expect(await call("subject:startUnit", SID, "nope")).toEqual({
      ok: false,
      message: "This unit no longer exists.",
    });
    expect(await call("subject:startUnit", SID2, "u1")).toEqual({
      ok: false,
      message: "This subject no longer exists.",
    });
    expect(await store.listSessions()).toEqual([]);
  });

  it("subject:message stores the message and asks for the reply", async () => {
    const { store, call, subjects, send } = await setup();
    await store.writeSubject(withSubject(SID, readySubject));
    const r = await call("subject:message", SID, "  why?  ");
    expect(r.ok).toBe(true);
    const stored = (await store.readSubject(SID))!;
    expect(stored.events[2]).toEqual({ kind: "message", at: NOW, text: "why?" });
    expect(subjects.reply).toHaveBeenCalledTimes(1);
    const names = send.mock.calls.map((c) => c[0]);
    expect(names).toEqual(["subject:updated", "subject:ended"]);

    const { store: store2, call: call2, subjects: subjects2 } = await setup();
    await store2.writeSubject(withSubject(SID, readySubject));
    for (const text of ["", "   ", "x".repeat(4001)]) {
      const bad = await call2("subject:message", SID, text);
      expect(bad.ok).toBe(false);
      expect(bad.error).toEqual({ kind: "invalid_answer", message: "Write a message." });
    }
    expect((await store2.readSubject(SID))!.events).toHaveLength(2);
    expect(subjects2.reply).not.toHaveBeenCalled();
  });

  it("proposed_change_accept_and_dismiss (ipc)", async () => {
    const { store, call } = await setup();
    const add = {
      kind: "add" as const,
      unit: { id: "u4", title: "Four", goal: "G4", files: [] },
      afterId: null,
    };
    const pending = [...readySubject, SE.message(), SE.reply("ok", add)];
    await store.writeSubject(withSubject(SID, pending));
    await store.writeSubject(withSubject(SID2, pending));
    const a = await call("subject:resolveChange", SID, true);
    expect(a.ok).toBe(true);
    expect(a.subject.events.at(-1)).toEqual({ kind: "change", at: NOW, accepted: true });
    const { deriveSubject } = await import("../../src/core/subject");
    const sa = deriveSubject(a.subject.events);
    expect(sa.units.map((u) => u.id)).toEqual(["u4", "u1", "u2", "u3"]);
    expect(sa.pendingChange).toBeNull();
    const d = await call("subject:resolveChange", SID2, false);
    expect(d.subject.events.at(-1)).toEqual({ kind: "change", at: NOW, accepted: false });
    const sd = deriveSubject(d.subject.events);
    expect(sd.units).toEqual(UNITS);
    expect(sd.pendingChange).toBeNull();
    const again = await call("subject:resolveChange", SID, true);
    expect(again.subject.events).toHaveLength(a.subject.events.length);
  });

  it("resolveChange refuses a removal whose unit was started meanwhile", async () => {
    const { store, call } = await setup();
    const remove = { kind: "remove" as const, unitId: "u1" };
    await store.writeSubject(
      withSubject(SID, [...readySubject, SE.message(), SE.reply("ok", remove)]),
    );
    await call("subject:startUnit", SID, "u1");
    const r = await call("subject:resolveChange", SID, true);
    expect(r).toEqual({
      ok: false,
      message: "This change no longer fits the outline. Dismiss it.",
    });
    expect((await store.readSubject(SID))!.events).toHaveLength(4);
    const d = await call("subject:resolveChange", SID, false);
    expect(d.ok).toBe(true);
    expect(d.subject.events).toHaveLength(5);
  });

  it("subject channels refuse while a subject call runs", async () => {
    const { store, call, subjects } = await setup(false, undefined, true);
    const remove = { kind: "remove" as const, unitId: "u1" };
    await store.writeSubject(withSubject(SID, [SE.outline()]));
    await store.writeSubject(
      withSubject(SID2, [...readySubject, SE.message(), SE.reply("ok", remove)]),
    );
    const busy = { ok: false, message: RUNNING_TEXT };
    expect(await call("subject:accept", SID, UNITS)).toEqual(busy);
    expect(await call("subject:resolveChange", SID2, true)).toEqual(busy);
    const m = await call("subject:message", SID2, "hi");
    expect(m).toEqual({
      ok: false,
      error: { kind: "busy", message: RUNNING_TEXT },
      subject: null,
    });
    expect((await store.readSubject(SID))!.events).toHaveLength(1);
    expect((await store.readSubject(SID2))!.events).toHaveLength(4);
    expect(subjects.reply).not.toHaveBeenCalled();
  });

  it("delete_subject_removes_its_lessons_keeps_knowledge (ipc)", async () => {
    const { store, call, subjects, turns } = await setup();
    await store.writeSubject(withSubject(SID, readySubject));
    const a = await call("subject:startUnit", SID, "u1");
    const b = await call("subject:startUnit", SID, "u2");
    await store.writeSession(withId(OTHER, "2026-01-01T00:00:00.000Z", []));
    const item: KnowledgeItem = {
      id: "k_1",
      text: "kept",
      sessionId: a.session.id,
      nodeId: "n1",
      createdAt: NOW,
    } as KnowledgeItem;
    await store.addKnowledge([item]);
    await call("subjects:delete", SID);
    expect(subjects.stop).toHaveBeenCalledWith(SID);
    expect(turns.stop).toHaveBeenCalledWith(a.session.id);
    expect(turns.stop).toHaveBeenCalledWith(b.session.id);
    expect(await store.readSubject(SID)).toBeNull();
    expect(await store.readSession(a.session.id)).toBeNull();
    expect(await store.readSession(b.session.id)).toBeNull();
    expect(await store.readSession(OTHER)).not.toBeNull();
    expect((await store.readKnowledge()).map((k) => k.id)).toEqual(["k_1"]);
  });

  it("subject:statuses, subject:stop and subject:running pass through", async () => {
    const { store, call, subjects } = await setup();
    await store.writeSubject(withSubject(SID, readySubject));
    await call("subject:startUnit", SID, "u2");
    const statuses = await call("subject:statuses", SID);
    expect(statuses.map((s: { status: string }) => s.status)).toEqual([
      "not_started",
      "in_progress",
      "not_started",
    ]);
    expect(await call("subject:statuses", SID2)).toEqual([]);
    await call("subject:stop", SID);
    expect(subjects.stop).toHaveBeenCalledWith(SID);
    expect(await call("subject:running", SID)).toBe(false);
    expect(subjects.isRunning).toHaveBeenCalledWith(SID);
  });
});

describe("ipc voice key", () => {
  it("key_is_encrypted_and_never_sent_to_window (ipc)", async () => {
    const { call, secrets, send, channels } = await setup();
    secrets.has.mockResolvedValue(true as never);
    const has = await call("voice:hasKey");
    expect(has).toBe(true);
    const set = await call("voice:setKey", "dg_test_key_123");
    expect(secrets.set).toHaveBeenCalledWith("dg_test_key_123");
    expect(set).toEqual({ ok: true });
    const removed = await call("voice:removeKey");
    expect(secrets.remove).toHaveBeenCalled();
    expect(secrets.get).not.toHaveBeenCalled();
    expect(JSON.stringify([has, set, removed])).not.toContain("dg_test_key_123");
    expect(JSON.stringify(send.mock.calls)).not.toContain("dg_test_key_123");
    expect(
      channels()
        .filter((c) => c.toLowerCase().includes("key"))
        .sort(),
    ).toEqual(["voice:hasKey", "voice:removeKey", "voice:setKey"]);
  });

  it("voice:setKey passes a refusal through and refuses what is not text", async () => {
    const { call, secrets } = await setup();
    const refusal = { ok: false as const, message: "This Mac cannot store the key safely." };
    secrets.set.mockResolvedValueOnce(refusal);
    expect(await call("voice:setKey", "k")).toEqual(refusal);
    secrets.set.mockClear();
    expect(await call("voice:setKey", 42)).toEqual({ ok: false, message: "Enter a key." });
    expect(secrets.set).not.toHaveBeenCalled();
  });
});

describe("ipc voice", () => {
  it("voice channels pass through to the hub", async () => {
    const { call, voice } = await setup();
    expect(await call("voice:start", "s_1")).toEqual({ ok: true });
    expect(voice.start).toHaveBeenCalledWith("s_1");
    await call("voice:say", "hello");
    expect(voice.say).toHaveBeenCalledWith("hello");
    voice.say.mockClear();
    await call("voice:say", 42);
    expect(voice.say).not.toHaveBeenCalled();
    expect(await call("voice:skip")).toBeUndefined();
    expect(voice.skip).toHaveBeenCalledTimes(1);
    expect(await call("voice:stop")).toBeUndefined();
    expect(voice.stop).toHaveBeenCalledTimes(1);
  });

  it("voice:start refuses a lesson id that is not text", async () => {
    const { call, voice } = await setup();
    const r = await call("voice:start", 42);
    expect(r).toMatchObject({ ok: false });
    expect(voice.start).not.toHaveBeenCalled();
  });

  it("voice:say and voice:audio and voice:setKey refuse oversized input", async () => {
    const { call, emit, voice, secrets } = await setup();
    await call("voice:say", "x".repeat(4001));
    expect(voice.say).not.toHaveBeenCalled();
    await call("voice:say", "x".repeat(4000));
    expect(voice.say).toHaveBeenCalledTimes(1);
    emit("voice:audio", new Uint8Array(8193));
    emit("voice:audio", new ArrayBuffer(8193));
    expect(voice.audio).not.toHaveBeenCalled();
    emit("voice:audio", new Uint8Array(8192));
    expect(voice.audio).toHaveBeenCalledTimes(1);
    expect(await call("voice:setKey", "k".repeat(201))).toEqual({
      ok: false,
      message: "Enter a key.",
    });
    expect(secrets.set).not.toHaveBeenCalled();
  });

  it("voice:audio forwards binary chunks only", async () => {
    const { emit, voice } = await setup();
    emit("voice:audio", new Uint8Array([1, 2]).buffer);
    emit("voice:audio", new Uint8Array([3, 4]));
    expect(voice.audio).toHaveBeenCalledTimes(2);
    expect(voice.audio.mock.calls[0][0]).toEqual(Buffer.from([1, 2]));
    expect(voice.audio.mock.calls[1][0]).toEqual(Buffer.from([3, 4]));
    voice.audio.mockClear();
    emit("voice:audio", "text");
    emit("voice:audio", null);
    expect(voice.audio).not.toHaveBeenCalled();
  });
});

describe("ipc review", () => {
  const APRIL = "2026-04-01T00:00:00.000Z";
  const BEFORE = "2026-03-01T00:00:00.000Z";
  const all = { subjectId: null, sessionId: null };

  it("review:due lists the due items for the filter with the next date", async () => {
    const { store, call } = await setup();
    await store.writeSession({ ...withId(ID1, BEFORE, []), subjectId: subject().id });
    await store.writeSession(withId(ID2, BEFORE, []));
    const items = [K(1, { sessionId: ID1 }), K(2, { sessionId: ID2 }), K(3, { sessionId: ID2 })];
    await store.addKnowledge(items);
    await store.writeReviews([
      review(1, { due: BEFORE }),
      review(2, { due: BEFORE }),
      review(3, { due: APRIL }),
    ]);
    const ids = async (filter: unknown) =>
      (await call("review:due", filter)).due.map((d: any) => d.item.id);
    const r = await call("review:due", all);
    expect(r.due.map((d: any) => d.item.id).sort()).toEqual([K(1).id, K(2).id].sort());
    expect(r.due.find((d: any) => d.item.id === K(1).id).review).toEqual(
      review(1, { due: BEFORE }),
    );
    expect(r.nextDue).toBe(APRIL);
    const bySubject = await call("review:due", { subjectId: subject().id, sessionId: null });
    expect(bySubject.due.map((d: any) => d.item.id)).toEqual([K(1).id]);
    expect(bySubject.nextDue).toBeNull();
    expect(await ids({ subjectId: null, sessionId: ID2 })).toEqual([K(2).id]);
    expect((await call("review:due", { subjectId: null, sessionId: ID2 })).nextDue).toBe(APRIL);
  });

  it("review:due counts an older item without a review as due and tolerates a missing filter", async () => {
    const { store, call, dir } = await setup();
    await store.writeJsonAtomic(path.join(dir, "knowledge.json"), [K(1)]);
    const r = await call("review:due");
    expect(r.due).toHaveLength(1);
    expect(r.due[0].review).toEqual(newReview(K(1).id, K(1).createdAt));
    expect(await store.readReviews()).toEqual([]);
  });

  it("flashcard_grades_update_box (ipc)", async () => {
    const { store, call } = await setup();
    await store.addKnowledge([K(1)]);
    await store.writeReviews([review(1, { front: "Q" })]);
    await call("review:record", K(1).id, true);
    expect(await store.readReviews()).toEqual([
      review(1, { front: "Q", box: 2, due: "2026-03-06T00:00:00.000Z" }),
    ]);
    await call("review:record", K(1).id, false);
    expect(await store.readReviews()).toEqual([
      review(1, { front: "Q", box: 1, due: "2026-03-04T00:00:00.000Z" }),
    ]);
  });

  it("review:record ignores an unknown item and wrong arguments", async () => {
    const { store, call } = await setup();
    await store.addKnowledge([K(1)]);
    const before = await store.readReviews();
    expect(await call("review:record", "k_99999999-0000-0000-0000-000000000000", true)).toBe(
      undefined,
    );
    expect(await call("review:record", 42, true)).toBe(undefined);
    expect(await call("review:record", K(1).id, "yes")).toBe(undefined);
    expect(await store.readReviews()).toEqual(before);
    const failing = { ...store, writeReviews: vi.fn(async () => Promise.reject(new Error("x"))) };
    const ctx = await setup();
    await ctx.store.addKnowledge([K(1)]);
    const handlers = new Map<string, (...a: any[]) => any>();
    registerIpc({
      ipcMain: {
        handle: (c: string, f: (...a: any[]) => any) => handlers.set(c, f),
        on: vi.fn(),
      } as any,
      adapters: fakeAdapters({ detect: vi.fn() } as any),
      store: { ...ctx.store, writeReviews: failing.writeReviews },
      turns: { advance: vi.fn(), stop: vi.fn(), isRunning: vi.fn() } as any,
      subjects: { outline: vi.fn(), reply: vi.fn(), stop: vi.fn(), isRunning: vi.fn() } as any,
      now: () => NOW,
      newId: (p) => p,
      send: vi.fn(),
      dialogs: { pickFolder: async () => null, pickFiles: async () => [] },
      secrets: ctx.secrets,
      voice: ctx.voice,
      practice: { fronts: vi.fn(), ask: vi.fn(), grade: vi.fn(), stop: vi.fn() } as any,
    });
    expect(await handlers.get("review:record")!(null, K(1).id, true)).toBe(undefined);
    expect(failing.writeReviews).toHaveBeenCalled();
  });

  it("delete_item_removes_card_and_schedule (ipc)", async () => {
    const { store, call } = await setup();
    await store.addKnowledge([K(1), K(2)]);
    await call("knowledge:delete", K(1).id);
    expect((await store.readKnowledge()).map((k) => k.id)).toEqual([K(2).id]);
    expect((await store.readReviews()).map((r) => r.itemId)).toEqual([K(2).id]);
    expect((await call("review:due", all)).due.map((d: any) => d.item.id)).toEqual([K(2).id]);
  });
});

describe("ipc graph", () => {
  it("graph:get builds the graph from the stored data", async () => {
    const { store, call } = await setup();
    await store.writeSession({ ...withId(ID1, NOW, []), topic: "Topic" });
    await store.addKnowledge([K(1, { sessionId: ID1 }), K(2, { sessionId: ID1 })]);
    await call("review:record", K(2).id, true);
    const g = await call("graph:get");
    expect(g.groups).toHaveLength(1);
    expect(g.groups[0].title).toBe("Topic");
    expect(g.groups[0].nodes).toHaveLength(2);
    expect(g.groups[0].nodes.find((n: any) => n.id === K(2).id).box).toBe(2);
    expect(Array.isArray(g.edges)).toBe(true);
  });
});

describe("ipc practice", () => {
  it("practice channels pass their arguments to the service with the tutor first", async () => {
    const { call, practice } = await setup();
    expect(await call("practice:fronts", ["k", 7], "claude")).toEqual({ ok: true });
    expect(practice.fronts).toHaveBeenCalledWith("claude", ["k"]);
    expect(await call("practice:ask", "k", "claude")).toEqual({ ok: true, question: textQ });
    expect(practice.ask).toHaveBeenCalledWith("claude", "k");
    expect(await call("practice:grade", "k", textQ, " words ", "claude")).toEqual({
      ok: true,
      verdict: "pass",
      feedback: "f",
    });
    expect(practice.grade).toHaveBeenCalledWith("claude", "k", textQ, "words");
  });

  it("practice channels refuse an unknown tutor, a bad question and a bad answer", async () => {
    const { call, practice } = await setup();
    const tutor = { ok: false, error: { kind: "invalid_answer", message: "Choose a tutor." } };
    const answer = { ok: false, error: { kind: "invalid_answer", message: "Write an answer." } };
    expect(await call("practice:fronts", ["k"], "gpt")).toEqual(tutor);
    expect(await call("practice:ask", "k", "gpt")).toEqual(tutor);
    expect(await call("practice:grade", "k", textQ, "words", "gpt")).toEqual(tutor);
    expect(await call("practice:grade", "k", choiceQ, "words", "claude")).toEqual(answer);
    expect(await call("practice:grade", "k", {}, "words", "claude")).toEqual(answer);
    expect(await call("practice:grade", "k", textQ, "  ", "claude")).toEqual(answer);
    expect(await call("practice:grade", "k", textQ, "x".repeat(4001), "claude")).toEqual(answer);
    expect(await call("practice:ask", 42, "claude")).toEqual({
      ok: false,
      error: { kind: "not_found", message: "This item no longer exists." },
    });
    expect(practice.fronts).not.toHaveBeenCalled();
    expect(practice.ask).not.toHaveBeenCalled();
    expect(practice.grade).not.toHaveBeenCalled();
  });

  it("practice:stop stops the service", async () => {
    const { call, practice } = await setup();
    expect(await call("practice:stop")).toBe(undefined);
    expect(practice.stop).toHaveBeenCalledTimes(1);
  });
});
