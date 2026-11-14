import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { deriveState } from "../../src/core/engine";
import type { CliAdapter } from "../../src/main/cli/adapter";
import { createStore } from "../../src/main/store";
import { createTurnRunner, modelStep } from "../../src/main/turn";
import type { RunResult, Session, SessionEvent } from "../../src/shared/types";
import { fakeAdapter } from "../helpers/fakes";
import { A, act, pick, session, toCheck, toTeach } from "../helpers/fixtures";

const step = async (events: SessionEvent[], ...replies: Parameters<typeof fakeAdapter>) => {
  const f = fakeAdapter(...replies);
  const s = session(events);
  const result = await modelStep(
    { adapter: f.adapter, knowledge: [] },
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
    adapter: f.adapter,
    store,
    now: () => NOW,
    newId: (p) => p + "_0000000" + ++n + "-0000-0000-0000-000000000000",
    notify: (s) => notified.push(s),
  });
  return { dir, store, f, notified, runner };
};

const slowAdapter = (run: CliAdapter["run"]): CliAdapter => ({
  id: "codex",
  detect: async () => ({ ok: true, version: "0.0.0" }),
  run,
});

const withAdapter = async (adapter: CliAdapter) => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "lh-turn-"));
  const store = await createStore(dir, fsp);
  await store.writeSession(session([]));
  const runner = createTurnRunner({
    adapter,
    store,
    now: () => NOW,
    newId: (p) => p + "_00000001-0000-0000-0000-000000000000",
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
    adapter: f.adapter,
    store,
    now: () => NOW,
    newId: (p) => p + "_0000000" + ++n + "-0000-0000-0000-000000000000",
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
