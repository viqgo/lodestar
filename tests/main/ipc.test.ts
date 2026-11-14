import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { registerIpc } from "../../src/main/ipc";
import { createStore } from "../../src/main/store";
import type { Answer, KnowledgeItem, Session, TurnResult } from "../../src/shared/types";
import { fakeAdapters } from "../helpers/fakes";
import { A, act, pick, session } from "../helpers/fixtures";

const NOW = "2026-03-03T00:00:00.000Z";
const ID1 = "s_00000001-0000-0000-0000-000000000000";
const ID2 = "s_00000002-0000-0000-0000-000000000000";

const setup = async (
  isRunning = false,
  dialogs = {
    pickFolder: async () => null as string | null,
    pickFiles: async () => [] as string[],
  },
) => {
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
    dialogs,
  });
  const call = (channel: string, ...args: unknown[]) => handlers.get(channel)!(null, ...args);
  return { store, turns, send, call, result, dir };
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
      ipcMain: { handle: (c: string, f: (...a: any[]) => any) => void handlers.set(c, f) },
      adapters: fakeAdapters({ detect: vi.fn() } as any),
      store,
      turns: { advance: vi.fn(), stop: vi.fn(), isRunning: vi.fn(() => false) } as any,
      now: () => NOW,
      newId: (p) => p + "_00000001-0000-0000-0000-000000000000",
      send: vi.fn(),
      dialogs: { pickFolder: async () => null, pickFiles: async () => [] },
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
