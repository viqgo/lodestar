import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { deriveState } from "../../src/core/engine";
import type { CliAdapter } from "../../src/main/cli/adapter";
import { createStore } from "../../src/main/store";
import { NO_OPTIONS } from "../../src/shared/clis";
import { CALL_TIMEOUT_MS, CALL_TIMEOUT_TOOLS_MS } from "../../src/shared/limits";
import { createTurnRunner, modelStep, runOptions } from "../../src/main/turn";
import type { RunResult, Session, SessionEvent } from "../../src/shared/types";
import { fakeAdapter, fakeAdapters } from "../helpers/fakes";
import { A, act, pick, session, toCheck, toTeach } from "../helpers/fixtures";

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

  it("runOptions passes images of the material and of the last answer only", () => {
    const s = {
      ...session([answer(["a1-old.png"]), answer(["a2-new.jpg", "a3-doc.pdf"])]),
      attachments: [
        { file: "a1-m.png", name: "m.png", bytes: 1, kind: "image" as const },
        { file: "a2-m.pdf", name: "m.pdf", bytes: 1, kind: "pdf" as const },
      ],
    };
    expect(runOptions(s, DIR, null).images).toEqual([
      "/data/attachments/s1/a1-m.png",
      "/data/attachments/s1/a2-new.jpg",
    ]);
  });
});
