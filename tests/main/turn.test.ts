import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { deriveState } from "../../src/core/engine";
import type { CliAdapter } from "../../src/main/cli/adapter";
import { createStore } from "../../src/main/store";
import { ASIDE_JSON_SCHEMA } from "../../src/shared/schema";
import { DEFAULT_SETTINGS } from "../../src/core/settings";
import { NO_OPTIONS } from "../../src/shared/clis";
import {
  CALL_TIMEOUT_MS,
  CALL_TIMEOUT_TOOLS_MS,
  METHOD_MAX,
  PROFILE_MAX,
} from "../../src/shared/limits";
import { createTurnRunner, modelStep, runOptions } from "../../src/main/turn";
import type { RunResult, Session, SessionEvent, TurnResult } from "../../src/shared/types";
import { fakeAdapter, fakeAdapters } from "../helpers/fakes";
import {
  A,
  SE,
  act,
  pick,
  readySubject,
  session,
  subject,
  toCheck,
  toPlan,
  toTeach,
} from "../helpers/fixtures";

const step = async (events: SessionEvent[], ...replies: Parameters<typeof fakeAdapter>) => {
  const f = fakeAdapter(...replies);
  const s = session(events);
  const result = await modelStep(
    {
      adapter: f.adapter,
      knowledge: [],
      profile: "",
      options: NO_OPTIONS,
      timeoutMs: CALL_TIMEOUT_MS,
    },
    s,
    deriveState(events),
    new AbortController().signal,
  );
  return { f, result };
};

describe("modelStep", () => {
  it("modelStep returns a valid action", async () => {
    const { result } = await step([], A.probe());
    expect(result).toEqual({
      ok: true,
      action: A.probe(),
      usage: { inputTokens: 1, outputTokens: 1 },
      calls: 1,
    });
  });

  it("a bad reply is retried once with a note", async () => {
    const { f, result } = await step([], "garbage", A.probe());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.calls).toBe(2);
    expect(
      f.prompts[1]!.trimEnd().endsWith(
        "Your last reply was not usable: not valid JSON. Allowed now: probe, probe_done.",
      ),
    ).toBe(true);
  });

  it("bad_reply_retries_once_then_errors", async () => {
    const { f, result } = await step([], "garbage", "garbage", A.probe());
    expect(result).toEqual({
      ok: false,
      error: { kind: "bad_reply", message: "The model gave an unusable reply. Press Retry." },
    });
    expect(f.prompts.length).toBe(2);
  });

  it("an action that is not allowed counts as a bad reply", async () => {
    const { f, result } = await step([], A.plan(), A.probe());
    expect(result.ok).toBe(true);
    expect(f.prompts[1]).toContain("Your last reply was not usable: plan is not allowed now.");
  });

  it("a CLI failure is returned at once", async () => {
    const failure: RunResult = { ok: false, kind: "failed", message: "boom" };
    const { f, result } = await step([], failure);
    expect(result).toEqual({ ok: false, error: { kind: "cli", message: "Codex failed: boom" } });
    expect(f.prompts.length).toBe(1);
  });
});

const ID = session().id;
const NOW = "2026-02-02T00:00:00.000Z";

const setup = async (events: SessionEvent[], ...replies: Parameters<typeof fakeAdapter>) => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "lh-turn-"));
  const store = await createStore(dir, fsp);
  await store.writeSession(session(events));
  const f = fakeAdapter(...replies);
  const notified: Session[] = [];
  let n = 0;
  const runner = createTurnRunner({
    adapters: fakeAdapters(f.adapter),
    store,
    now: () => NOW,
    newId: (p) => p + "_0000000" + ++n + "-0000-0000-0000-000000000000",
    listFolder: async () => ({ files: [], more: 0 }),
    notify: (s) => notified.push(s),
  });
  return { dir, store, f, notified, runner };
};

const slowAdapter = (run: CliAdapter["run"]): CliAdapter => ({
  id: "codex",
  label: "Codex",
  retries: 1,
  detect: async () => ({ ok: true, version: "0.0.0" }),
  run,
});

const withAdapter = async (adapter: CliAdapter) => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "lh-turn-"));
  const store = await createStore(dir, fsp);
  await store.writeSession(session([]));
  const runner = createTurnRunner({
    adapters: fakeAdapters(adapter),
    store,
    now: () => NOW,
    newId: (p) => p + "_00000001-0000-0000-0000-000000000000",
    listFolder: async () => ({ files: [], more: 0 }),
    notify: () => {},
  });
  return { runner };
};

const doneEvents = (): SessionEvent[] => [
  ...toTeach,
  ...toCheck("n1"),
  pick(1),
  ...toCheck("n2"),
  pick(0),
  act(A.explain("n2")),
  pick(0),
  act(A.explain("n2")),
  pick(0),
];

const setupFailing = async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "lh-turn-"));
  const real = await createStore(dir, fsp);
  await real.writeSession(session(doneEvents()));
  let failed = false;
  const store: typeof real = {
    ...real,
    addKnowledge: async (items) => {
      if (!failed) {
        failed = true;
        throw new Error("disk");
      }
      return real.addKnowledge(items);
    },
  };
  const f = fakeAdapter(A.done(), A.done());
  let n = 0;
  const runner = createTurnRunner({
    adapters: fakeAdapters(f.adapter),
    store,
    now: () => NOW,
    newId: (p) => p + "_0000000" + ++n + "-0000-0000-0000-000000000000",
    listFolder: async () => ({ files: [], more: 0 }),
    notify: () => {},
  });
  return { store: real, runner };
};

describe("createTurnRunner", () => {
  it("advance keeps going until the learner must answer", async () => {
    const { store, f, notified, runner } = await setup(
      [act(A.probe()), pick(1)],
      A.probeDone(),
      A.plan(),
      A.predict("n1"),
    );
    const result = await runner.advance(ID);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.session.events.length).toBe(5);
    expect(notified.length).toBe(3);
    const stored = await store.readSession(ID);
    expect(stored?.events.length).toBe(5);
    expect(stored?.updatedAt).toBe(NOW);
    expect(f.prompts.length).toBe(3);
  });

  it("failed_call_leaves_session_unchanged", async () => {
    const { dir, runner } = await setup([], { ok: false, kind: "failed", message: "boom" });
    const file = path.join(dir, "sessions", ID + ".json");
    const before = await fsp.readFile(file, "utf8");
    const result = await runner.advance(ID);
    const after = await fsp.readFile(file, "utf8");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("cli");
      expect(result.session).toEqual(session([]));
    }
    expect(after).toBe(before);
  });

  it("second_call_refused_while_running", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let calls = 0;
    let reached!: () => void;
    const reachedP = new Promise<void>((r) => (reached = r));
    const { runner } = await withAdapter(
      slowAdapter(async () => {
        reached();
        calls++;
        await gate;
        return { ok: false, kind: "failed", message: "x" };
      }),
    );
    const first = runner.advance(ID);
    const second = await runner.advance(ID);
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.error).toEqual({ kind: "busy", message: "A reply is already on the way." });
    }
    await reachedP;
    expect(calls).toBe(1);
    release();
    await first;
  });

  it("stop ends the running call", async () => {
    let reached!: () => void;
    const reachedP = new Promise<void>((r) => (reached = r));
    const { runner } = await withAdapter(
      slowAdapter(
        (req) =>
          new Promise<RunResult>((resolve) => {
            reached();
            req.signal.addEventListener("abort", () =>
              resolve({ ok: false, kind: "aborted", message: "stopped" }),
            );
          }),
      ),
    );
    const pending = runner.advance(ID);
    await reachedP;
    expect(runner.isRunning(ID)).toBe(true);
    runner.stop(ID);
    const result = await pending;
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toEqual({ kind: "stopped", message: "Stopped." });
    expect(runner.isRunning(ID)).toBe(false);
  });

  it("advance reports a missing lesson", async () => {
    const { runner } = await setup([]);
    expect(await runner.advance("s_99999999-0000-0000-0000-000000000000")).toEqual({
      ok: false,
      error: { kind: "not_found", message: "This lesson no longer exists." },
      session: null,
    });
  });

  it("lesson_done adds knowledge for passed nodes only", async () => {
    const { store, runner } = await setup(
      [
        ...toTeach,
        ...toCheck("n1"),
        pick(1),
        ...toCheck("n2"),
        pick(0),
        act(A.explain("n2")),
        pick(0),
        act(A.explain("n2")),
        pick(0),
      ],
      A.done(),
    );
    await runner.advance(ID);
    expect(await store.readKnowledge()).toEqual([
      {
        id: "k_00000001-0000-0000-0000-000000000000",
        text: "t1",
        sessionId: ID,
        nodeId: "n1",
        createdAt: NOW,
      },
    ]);
  });

  it("a failed knowledge save does not finish the lesson", async () => {
    const { store, runner } = await setupFailing();
    await expect(runner.advance(ID)).rejects.toThrow("disk");
    const stored = await store.readSession(ID);
    expect(deriveState(stored!.events).phase).toBe("teach");
    const second = await runner.advance(ID);
    expect(second.ok).toBe(true);
    const after = await store.readSession(ID);
    expect(deriveState(after!.events).phase).toBe("done");
    const k = await store.readKnowledge();
    expect(k).toHaveLength(1);
    expect(k[0]!.text).toBe("t1");
  });
});

describe("turn profile", () => {
  it("turn passes the saved profile to the prompt", async () => {
    const { store, f, runner } = await setup([], A.probe(), A.probe());
    await store.writeProfile("Be brief.");
    await runner.advance(ID);
    expect(f.prompts[0]).toContain("Be brief.");
    await store.writeProfile("Be long.");
    await store.writeSession(session([]));
    await runner.advance(ID);
    expect(f.prompts[1]).toContain("Be long.");
    expect(f.prompts[1]).not.toContain("Be brief.");
  });
});

describe("turn method", () => {
  it("the saved method text reaches every lesson call", async () => {
    const { store, f, runner } = await setup([], A.probe(), A.probe());
    await store.writeSettings({ ...DEFAULT_SETTINGS, method: "Ask two questions, then teach." });
    await runner.advance(ID);
    expect(f.prompts[0]).toContain("Ask two questions, then teach.");
    expect(f.prompts[0]).not.toContain("Probe. Find precisely");
    await store.writeSettings(DEFAULT_SETTINGS);
    await store.writeSession(session([]));
    await runner.advance(ID);
    expect(f.prompts[1]).toContain("Probe. Find precisely");

    const side = await setup([act(A.probe())], JSON.stringify({ markdown: "because" }));
    await side.store.writeSettings({
      ...DEFAULT_SETTINGS,
      method: "Ask two questions, then teach.",
    });
    await side.runner.aside(ID, "why");
    expect(side.f.prompts[0]).toContain("Ask two questions, then teach.");
  });
});

describe("turn model and effort", () => {
  const claudeSettings = {
    ...DEFAULT_SETTINGS,
    clis: { ...DEFAULT_SETTINGS.clis, claude: { model: "sonnet", effort: "medium" } },
  };

  it("a lesson call carries the model and effort of its tutor", async () => {
    const f = fakeAdapter(A.probe(), A.probe());
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "lh-turn-"));
    const store = await createStore(dir, fsp);
    await store.writeSession({ ...session([]), cli: "claude" });
    const runner = createTurnRunner({
      adapters: fakeAdapters(f.adapter),
      store,
      now: () => NOW,
      newId: (p) => p + "_00000001-0000-0000-0000-000000000000",
      listFolder: async () => ({ files: [], more: 0 }),
      notify: () => {},
    });
    await store.writeSettings(claudeSettings);
    await runner.advance(ID);
    expect(f.requests[0]!.options).toMatchObject({ model: "sonnet", effort: "medium" });
    await store.writeSettings(DEFAULT_SETTINGS);
    await store.writeSession({ ...session([]), cli: "claude" });
    await runner.advance(ID);
    expect(f.requests[1]!.options).toMatchObject({ model: null, effort: null });
  });

  it("a side question carries the model and effort", async () => {
    const side = await setup([act(A.probe())], JSON.stringify({ markdown: "because" }));
    await side.store.writeSettings({
      ...DEFAULT_SETTINGS,
      clis: { ...DEFAULT_SETTINGS.clis, codex: { model: "gpt-x", effort: "high" } },
    });
    await side.runner.aside(ID, "why");
    expect(side.f.requests[0]!.options).toMatchObject({ model: "gpt-x", effort: "high" });
  });
});

describe("turn per-lesson cli", () => {
  const withCli = async (cli: string, adapters: ReturnType<typeof fakeAdapters>) => {
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "lh-turn-"));
    const store = await createStore(dir, fsp);
    await store.writeSession({ ...session([]), cli } as any);
    return createTurnRunner({
      adapters,
      store,
      now: () => NOW,
      newId: (p) => p + "_00000001-0000-0000-0000-000000000000",
      listFolder: async () => ({ files: [], more: 0 }),
      notify: () => {},
    });
  };

  it("lesson_keeps_its_cli", async () => {
    const codexFake = fakeAdapter(A.probe());
    const claudeFake = fakeAdapter(A.probe());
    const runner = await withCli(
      "claude",
      fakeAdapters(codexFake.adapter, { claude: claudeFake.adapter }),
    );
    await runner.advance(ID);
    expect(claudeFake.prompts).toHaveLength(1);
    expect(codexFake.prompts).toHaveLength(0);
  });

  it("old_lessons_stay_on_codex", async () => {
    for (const cli of ["codex", "mystery"]) {
      const codexFake = fakeAdapter(A.probe());
      const claudeFake = fakeAdapter(A.probe());
      const runner = await withCli(
        cli,
        fakeAdapters(codexFake.adapter, { claude: claudeFake.adapter }),
      );
      await runner.advance(ID);
      expect(codexFake.prompts).toHaveLength(1);
      expect(claudeFake.prompts).toHaveLength(0);
    }
  });

  it("gemini_gets_two_retries_others_one", async () => {
    const run = async (retries: number, ...replies: string[]) => {
      const f = fakeAdapter(...replies);
      const result = await modelStep(
        {
          adapter: { ...f.adapter, retries },
          knowledge: [],
          profile: "",
          options: NO_OPTIONS,
          timeoutMs: CALL_TIMEOUT_MS,
        },
        session([]),
        deriveState([]),
        new AbortController().signal,
      );
      return { f, result };
    };
    const good = JSON.stringify({ action: A.probe() });
    const three = await run(2, "x", "x", "x");
    expect(three.f.prompts).toHaveLength(3);
    expect(three.result).toMatchObject({ ok: false, error: { kind: "bad_reply" } });
    const ok = await run(2, "x", "x", good);
    expect(ok.result).toMatchObject({ ok: true, calls: 3 });
    const one = await run(1, "x", "x");
    expect(one.f.prompts).toHaveLength(2);
    expect(one.result).toMatchObject({ ok: false, error: { kind: "bad_reply" } });
  });

  it("a failed call names the CLI", async () => {
    const f = fakeAdapter({ ok: false, kind: "failed", message: "boom" });
    const result = await modelStep(
      {
        adapter: { ...f.adapter, label: "Claude Code" },
        knowledge: [],
        profile: "",
        options: NO_OPTIONS,
        timeoutMs: CALL_TIMEOUT_MS,
      },
      session([]),
      deriveState([]),
      new AbortController().signal,
    );
    expect(result).toEqual({
      ok: false,
      error: { kind: "cli", message: "Claude Code failed: boom" },
    });
  });
});

describe("turn material", () => {
  const FOLDER = "/tmp/lh-material";
  const setupMaterial = async (
    patch: Partial<Session>,
    listing: { files: { path: string; bytes: number }[]; more: number } | null,
    ...replies: Parameters<typeof fakeAdapter>
  ) => {
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "lh-turn-"));
    const store = await createStore(dir, fsp);
    const base = { ...session([]), ...patch };
    await store.writeSession(base);
    const f = fakeAdapter(...replies);
    const runner = createTurnRunner({
      adapters: fakeAdapters(f.adapter),
      store,
      now: () => NOW,
      newId: (p) => p + "_00000001-0000-0000-0000-000000000000",
      notify: () => {},
      listFolder: async () => listing,
    });
    return { dir, store, f, runner, base };
  };
  const att = (file: string, kind: "pdf" | "image" | "text") => ({
    file,
    name: file.replace(/^a\d+-/, ""),
    bytes: 1,
    kind,
  });

  it("missing_folder_blocks_call_with_banner", async () => {
    const { store, f, runner, base } = await setupMaterial({ folder: FOLDER }, null, A.probe());
    const result = await runner.advance(ID);
    expect(result).toEqual({
      ok: false,
      error: {
        kind: "folder_missing",
        message: "The material folder was not found. Choose it again or remove it.",
      },
      session: base,
    });
    expect(f.prompts).toHaveLength(0);
    expect(await store.readSession(ID)).toEqual(base);
  });

  it("turn puts the material section in the prompt", async () => {
    const { f, runner } = await setupMaterial(
      { folder: FOLDER, attachments: [att("a1-notes.txt", "text")] },
      { files: [{ path: "ch1.md", bytes: 12 }], more: 0 },
      A.probe(),
    );
    await runner.advance(ID);
    expect(f.prompts[0]).toContain(
      "# Material\nFolder: " + FOLDER + "\nFiles in the folder:\n- ch1.md (12 bytes)",
    );
    expect(f.prompts[0]).toContain("Attached files:\n- notes.txt: ");
    expect(f.prompts[0]).toContain("a1-notes.txt");
  });

  it("turn passes read dirs, images and web search to the adapter", async () => {
    const { store, f, runner } = await setupMaterial(
      { folder: FOLDER, webSearch: true, attachments: [att("a1-pic.png", "image")] },
      { files: [], more: 0 },
      A.probe(),
    );
    await runner.advance(ID);
    const dirA = store.attachmentsDir(ID);
    expect(f.requests[0]!.options).toEqual({
      readDirs: [FOLDER, dirA],
      images: [path.join(dirA, "a1-pic.png")],
      webSearch: true,
      model: null,
      effort: null,
    });
  });

  it("tools_calls_get_300_seconds", async () => {
    const withTools = await setupMaterial({ webSearch: true }, null, A.probe());
    await withTools.runner.advance(ID);
    expect(withTools.f.requests[0]!.timeoutMs).toBe(CALL_TIMEOUT_TOOLS_MS);
    const folder = await setupMaterial({ folder: FOLDER }, { files: [], more: 0 }, A.probe());
    await folder.runner.advance(ID);
    expect(folder.f.requests[0]!.timeoutMs).toBe(300_000);
    const plain = await setupMaterial({}, null, A.probe());
    await plain.runner.advance(ID);
    expect(plain.f.requests[0]!.timeoutMs).toBe(180_000);
  });
});

describe("runOptions", () => {
  const DIR = "/data/attachments/s1";
  const answer = (attachments?: string[]): SessionEvent => ({
    kind: "answer",
    at: NOW,
    answer: { choiceIndex: null, text: "x", reasoning: null, confidence: null, attachments },
  });

  it("runOptions adds the attachments dir only when something is attached", () => {
    expect(runOptions(session([]), DIR, null).readDirs).toEqual([]);
    expect(runOptions({ ...session([]), folder: "/m" }, DIR, null).readDirs).toEqual(["/m"]);
    const withMaterial = {
      ...session([]),
      attachments: [{ file: "a1-x.pdf", name: "x.pdf", bytes: 1, kind: "pdf" as const }],
    };
    expect(runOptions(withMaterial, DIR, null).readDirs).toEqual([DIR]);
    expect(runOptions(session([answer(["a1-y.txt"])]), DIR, null).readDirs).toEqual([DIR]);
    expect(runOptions(session([answer([])]), DIR, null).readDirs).toEqual([]);
  });

  it("runOptions takes images from the latest answer that has files", () => {
    const s = {
      ...session([answer(["a1-old.png"]), answer(["a2-new.jpg", "a3-doc.pdf"]), answer([])]),
      attachments: [
        { file: "a1-m.png", name: "m.png", bytes: 1, kind: "image" as const },
        { file: "a2-m.pdf", name: "m.pdf", bytes: 1, kind: "pdf" as const },
      ],
    };
    expect(runOptions(s, DIR, null).images).toEqual([
      "/data/attachments/s1/a1-m.png",
      "/data/attachments/s1/a2-new.jpg",
    ]);
    const t = session([answer(["a1-pic.png"]), answer([])]);
    expect(runOptions(t, DIR, null).images).toEqual(["/data/attachments/s1/a1-pic.png"]);
  });
});

const setupUnit = async (
  events: SessionEvent[],
  subjectEvents: ReturnType<typeof subject>["events"] | null,
  ...replies: Parameters<typeof fakeAdapter>
) => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "lh-turn-"));
  const store = await createStore(dir, fsp);
  await store.writeSession({ ...session(events), subjectId: subject().id, unitId: "u1" });
  if (subjectEvents !== null) await store.writeSubject(subject(subjectEvents));
  const f = fakeAdapter(...replies);
  const runner = createTurnRunner({
    adapters: fakeAdapters(f.adapter),
    store,
    now: () => NOW,
    newId: (p) => p + "_00000001-0000-0000-0000-000000000000",
    listFolder: async () => ({ files: [], more: 0 }),
    notify: () => {},
  });
  return { store, f, runner };
};

describe("units in the lesson turn", () => {
  it("unit_prompt_carries_subject_files_and_earlier_units (turn)", async () => {
    const { f, runner } = await setupUnit(
      [],
      [...readySubject, SE.note("u2", "s_other")],
      A.probe(),
    );
    await runner.advance(ID);
    const prompt = f.prompts[0]!;
    expect(prompt).toContain("# Subject");
    expect(prompt).toContain("u1 - Unit one (this lesson)");
    expect(prompt).toContain("# Files for this unit");
    expect(prompt).toContain("- a.txt");
    expect(prompt).toContain("# Earlier units");
    expect(prompt).toContain("u2: s Learned: t1. Shaky: nothing.");
  });

  it("a lesson without a subject has no subject section", async () => {
    const { f, runner } = await setup([], A.probe());
    await runner.advance(ID);
    expect(f.prompts[0]).not.toContain("# Subject");
    expect(f.prompts[0]).not.toContain("# Earlier units");
  });

  it("finished_unit_writes_handover_note", async () => {
    const { store, f, runner } = await setupUnit(doneEvents(), readySubject, A.done());
    await runner.advance(ID);
    const stored = await store.readSubject(subject().id);
    const last = stored!.events[stored!.events.length - 1];
    expect(last).toEqual({
      kind: "note",
      at: NOW,
      note: { unitId: "u1", sessionId: ID, summary: "s", learned: ["t1"], shaky: ["Two"] },
    });
    expect(stored!.updatedAt).toBe(NOW);
    expect(f.prompts.length).toBe(1);
  });

  it("the handover note is added through the store's queue", async () => {
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "lh-turn-"));
    const real = await createStore(dir, fsp);
    await real.writeSession({ ...session(doneEvents()), subjectId: subject().id, unitId: "u1" });
    await real.writeSubject(subject(readySubject));
    const writeSubject = vi.fn(real.writeSubject);
    const appendSubjectEvent = vi.fn(real.appendSubjectEvent);
    const store = { ...real, writeSubject, appendSubjectEvent };
    const make = () =>
      createTurnRunner({
        adapters: fakeAdapters(fakeAdapter(A.done(), A.done()).adapter),
        store,
        now: () => NOW,
        newId: (p) => p + "_00000001-0000-0000-0000-000000000000",
        listFolder: async () => ({ files: [], more: 0 }),
        notify: () => {},
      });
    await make().advance(ID);
    expect(writeSubject).not.toHaveBeenCalled();
    expect(appendSubjectEvent).toHaveBeenCalledTimes(1);
    const stored = await real.readSubject(subject().id);
    expect(stored!.events.at(-1)).toMatchObject({ kind: "note", note: { sessionId: ID } });
    await make().advance(ID);
    const again = await real.readSubject(subject().id);
    expect(again!.events.filter((e) => e.kind === "note").length).toBe(1);
  });

  it("a handover note is written once per lesson", async () => {
    const { store, runner } = await setupUnit(
      doneEvents(),
      [...readySubject, SE.note("u1", ID)],
      A.done(),
    );
    await runner.advance(ID);
    const stored = await store.readSubject(subject().id);
    expect(stored!.events.filter((e) => e.kind === "note").length).toBe(1);
  });

  it("a corrupt subject does not stop a unit lesson turn", async () => {
    const { f, runner } = await setupUnit([], [SE.accepted()], A.probe());
    const result = await runner.advance(ID);
    expect(result.ok).toBe(true);
    expect(f.prompts[0]).not.toContain("# Subject");
  });

  it("a unit lesson whose subject is gone still runs", async () => {
    const { store, f, runner } = await setupUnit(doneEvents(), null, A.done());
    const result = await runner.advance(ID);
    expect(result.ok).toBe(true);
    expect(f.prompts[0]).not.toContain("# Subject");
    const stored = await store.readSession(ID);
    expect(stored!.events.some((e) => e.kind === "action" && e.action.type === "lesson_done")).toBe(
      true,
    );
  });
});

describe("turn aside", () => {
  const ASIDE_REPLY = JSON.stringify({ markdown: "because" });
  const SIDE_END =
    '# Your move\nThe learner asks a side question. Answer it in plain markdown, in a few sentences, without advancing the lesson and without asking a question back.\nSide question: "why"\n';
  const FOLDER = "/tmp/lh-material";

  const setupMaterial = async (
    patch: Partial<Session>,
    listing: { files: { path: string; bytes: number }[]; more: number } | null,
    ...replies: Parameters<typeof fakeAdapter>
  ) => {
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "lh-turn-"));
    const store = await createStore(dir, fsp);
    const base = { ...session([]), ...patch };
    await store.writeSession(base);
    const f = fakeAdapter(...replies);
    const runner = createTurnRunner({
      adapters: fakeAdapters(f.adapter),
      store,
      now: () => NOW,
      newId: (p) => p + "_00000001-0000-0000-0000-000000000000",
      notify: () => {},
      listFolder: async () => listing,
    });
    return { dir, store, f, runner, base };
  };

  it("aside_is_saved_and_shown (turn)", async () => {
    const { store, f, notified, runner } = await setup([act(A.probe())], ASIDE_REPLY);
    const result = await runner.aside(ID, "why");
    expect(result.ok).toBe(true);
    const stored = (await store.readSession(ID))!;
    expect(stored.events.at(-1)).toEqual({
      kind: "aside",
      at: NOW,
      question: "why",
      markdown: "because",
      usage: null,
    });
    expect(deriveState(stored.events).awaiting).toMatchObject({
      who: "learner",
      purpose: "probe",
    });
    if (result.ok) expect(result.session).toEqual(stored);
    expect(notified).toHaveLength(1);
    expect(f.requests).toHaveLength(1);
    expect(f.requests[0]!.schema).toBe(ASIDE_JSON_SCHEMA);
    expect(f.prompts[0]!.endsWith(SIDE_END)).toBe(true);
  });

  it("aside_refused_while_running", async () => {
    const BUSY = { kind: "busy", message: "A reply is already on the way." };
    const hold = async (events: SessionEvent[]) => {
      let release: () => void = () => {};
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      let reached!: () => void;
      const reachedP = new Promise<void>((r) => (reached = r));
      let calls = 0;
      const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "lh-turn-"));
      const store = await createStore(dir, fsp);
      await store.writeSession(session(events));
      const runner = createTurnRunner({
        adapters: fakeAdapters(
          slowAdapter(async () => {
            calls++;
            reached();
            await gate;
            return { ok: true, text: ASIDE_REPLY, usage: null };
          }),
        ),
        store,
        now: () => NOW,
        newId: (p) => p + "_00000001-0000-0000-0000-000000000000",
        listFolder: async () => ({ files: [], more: 0 }),
        notify: () => {},
      });
      return { runner, release, reachedP, calls: () => calls };
    };
    const a = await hold([]);
    const first = a.runner.advance(ID);
    await a.reachedP;
    const refused = (await a.runner.aside(ID, "why")) as Extract<TurnResult, { ok: false }>;
    expect(refused.ok).toBe(false);
    expect(refused.error).toEqual(BUSY);
    expect(a.calls()).toBe(1);
    a.release();
    await first;

    const b = await hold([act(A.probe())]);
    const side = b.runner.aside(ID, "why");
    await b.reachedP;
    expect(b.runner.isRunning(ID)).toBe(true);
    const adv = (await b.runner.advance(ID)) as Extract<TurnResult, { ok: false }>;
    const again = (await b.runner.aside(ID, "why")) as Extract<TurnResult, { ok: false }>;
    expect(adv.error).toEqual(BUSY);
    expect(again.error).toEqual(BUSY);
    expect(b.calls()).toBe(1);
    b.release();
    await side;
    expect(b.runner.isRunning(ID)).toBe(false);
  });

  it("a failed aside stores nothing", async () => {
    const events = [act(A.probe())];
    const bad = await setup(events, "garbage", "garbage");
    const r1 = await bad.runner.aside(ID, "why");
    expect(r1).toEqual({
      ok: false,
      error: { kind: "bad_reply", message: "The model gave an unusable reply. Press Retry." },
      session: session(events),
    });
    expect(
      bad.f.prompts[1]!.trimEnd().endsWith(
        "Your last reply was not usable: not valid JSON. Allowed now: an answer in markdown.",
      ),
    ).toBe(true);
    expect(await bad.store.readSession(ID)).toEqual(session(events));
    expect(bad.notified).toEqual([]);

    const boom = await setup(events, { ok: false, kind: "failed", message: "boom" });
    const r2 = await boom.runner.aside(ID, "why");
    expect(r2).toMatchObject({
      ok: false,
      error: { kind: "cli", message: "Codex failed: boom" },
    });
    expect(await boom.store.readSession(ID)).toEqual(session(events));
    expect(boom.notified).toEqual([]);

    const blank = await setup(events, '{"markdown":"  "}', '{"markdown":"  "}');
    const r3 = await blank.runner.aside(ID, "why");
    expect(r3).toMatchObject({ ok: false, error: { kind: "bad_reply" } });
    expect(await blank.store.readSession(ID)).toEqual(session(events));
    expect(blank.notified).toEqual([]);

    const gone = await setup(events, ASIDE_REPLY);
    expect(await gone.runner.aside("nope", "why")).toEqual({
      ok: false,
      error: { kind: "not_found", message: "This lesson no longer exists." },
      session: null,
    });
  });

  it("an aside uses the lesson's material, options and time limit", async () => {
    const m = await setupMaterial(
      { folder: FOLDER, webSearch: true },
      { files: [], more: 0 },
      ASIDE_REPLY,
    );
    await m.runner.aside(ID, "why");
    expect(m.f.requests[0]!.options!.readDirs).toEqual([FOLDER]);
    expect(m.f.requests[0]!.options!.webSearch).toBe(true);
    expect(m.f.requests[0]!.timeoutMs).toBe(300_000);
    expect(m.f.prompts[0]).toContain("# Material");
    expect(m.f.prompts[0]).toContain("# Web search");

    const missing = await setupMaterial({ folder: FOLDER }, null, ASIDE_REPLY);
    const r = await missing.runner.aside(ID, "why");
    expect(r).toEqual({
      ok: false,
      error: {
        kind: "folder_missing",
        message: "The material folder was not found. Choose it again or remove it.",
      },
      session: missing.base,
    });
    expect(missing.f.prompts).toHaveLength(0);

    const plain = await setupMaterial({}, null, ASIDE_REPLY);
    await plain.runner.aside(ID, "why");
    expect(plain.f.requests[0]!.options).toEqual(NO_OPTIONS);
    expect(plain.f.requests[0]!.timeoutMs).toBe(180_000);
  });

  it("an aside does not advance a lesson that waits for the model", async () => {
    const { store, f, runner } = await setup(toPlan, ASIDE_REPLY, A.plan());
    const r = await runner.aside(ID, "why");
    expect(r.ok).toBe(true);
    const after = (await store.readSession(ID))!;
    expect(after.events).toHaveLength(toPlan.length + 1);
    expect(after.events.at(-1)!.kind).toBe("aside");
    expect(f.requests).toHaveLength(1);
    await runner.advance(ID);
    const done = (await store.readSession(ID))!;
    expect(done.events.at(-1)).toMatchObject({ kind: "action", action: A.plan() });
    expect(f.prompts[1]).toContain("ASIDE: ");
  });
});

describe("turn gate L fixes", () => {
  it("an over-long stored method or instructions text is cut", async () => {
    const { store, f, runner } = await setup([], A.probe());
    await store.writeSettings({
      ...DEFAULT_SETTINGS,
      method: "m".repeat(METHOD_MAX) + "ZZZ",
      instructions: "i".repeat(PROFILE_MAX) + "QQQ",
    });
    expect(await store.readProfile()).toBe("i".repeat(PROFILE_MAX));
    await runner.advance(ID);
    expect(f.prompts[0]).toContain("m".repeat(METHOD_MAX));
    expect(f.prompts[0]).not.toContain("ZZZ");
    expect(f.prompts[0]).not.toContain("QQQ");
  });

  it("a hand-edited model with a dash is dropped in the lesson call", async () => {
    const f = fakeAdapter(A.probe());
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "lh-turn-"));
    const store = await createStore(dir, fsp);
    await store.writeSession({ ...session([]), cli: "claude" });
    const runner = createTurnRunner({
      adapters: fakeAdapters(f.adapter),
      store,
      now: () => NOW,
      newId: (p) => p + "_00000001-0000-0000-0000-000000000000",
      listFolder: async () => ({ files: [], more: 0 }),
      notify: () => {},
    });
    await store.writeSettings({
      ...DEFAULT_SETTINGS,
      clis: { ...DEFAULT_SETTINGS.clis, claude: { model: "--yolo", effort: "medium" } },
    });
    await runner.advance(ID);
    expect(f.requests[0]!.options!.model).toBeNull();
    expect(f.requests[0]!.options!.effort).toBe("medium");
  });
});
