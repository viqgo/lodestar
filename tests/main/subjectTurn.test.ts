import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createStore } from "../../src/main/store";
import { createSubjectRunner } from "../../src/main/subjectTurn";
import type { CliAdapter } from "../../src/main/cli/adapter";
import type { Subject, SubjectEvent } from "../../src/shared/types";
import { fakeAdapter, fakeAdapters } from "../helpers/fakes";
import { SE, readySubject, session, subject } from "../helpers/fixtures";

const NOW = "2026-03-03T00:00:00.000Z";
const FILES = {
  files: [
    { path: "a.txt", bytes: 1 },
    { path: "b.txt", bytes: 2 },
  ],
  more: 0,
};
const unitsJson = (units: unknown[]) => JSON.stringify({ units });
const seniorJson = (markdown: string, change: unknown = null) =>
  JSON.stringify({ markdown, change });
const asking: SubjectEvent[] = [...readySubject, SE.message("hi")];

const setupWith = async (
  adapter: CliAdapter,
  events: SubjectEvent[],
  listing: typeof FILES | null = FILES,
) => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "lh-subj-"));
  const store = await createStore(dir, fsp);
  await store.writeSubject(subject(events));
  const notified: Subject[] = [];
  const runner = createSubjectRunner({
    adapters: fakeAdapters(adapter),
    store,
    listFolder: async () => listing,
    now: () => NOW,
    notify: (s) => notified.push(s),
  });
  return { store, runner, notified, id: subject().id };
};

const setup = async (
  events: SubjectEvent[],
  replies: Parameters<typeof fakeAdapter>,
  listing: typeof FILES | null = FILES,
) => {
  const f = fakeAdapter(...replies);
  return { f, ...(await setupWith(f.adapter, events, listing)) };
};

const GOOD = [
  { id: "u1", title: "One", goal: "G1", files: ["a.txt", "zzz.txt"] },
  { id: "u2", title: "Two", goal: "G2", files: ["b.txt"] },
];

describe("createSubjectRunner", () => {
  it("outline flow stores the validated outline", async () => {
    const { runner, store, notified, id } = await setup([], [unitsJson(GOOD)]);
    const r = await runner.outline(id);
    expect(r.ok).toBe(true);
    const stored = (await store.readSubject(id))!;
    expect(stored.events).toHaveLength(1);
    expect(stored.events[0]).toEqual({
      kind: "outline",
      at: NOW,
      units: [
        { id: "u1", title: "One", goal: "G1", files: ["a.txt"] },
        { id: "u2", title: "Two", goal: "G2", files: ["b.txt"] },
      ],
      usage: null,
    });
    expect(stored.updatedAt).toBe(NOW);
    expect(notified).toHaveLength(1);
    if (r.ok) expect(r.subject).toEqual(stored);
  });

  it("outline retries a bad outline with the reason", async () => {
    const one = unitsJson([GOOD[0]]);
    const a = await setup([], [one, unitsJson(GOOD)]);
    expect((await a.runner.outline(a.id)).ok).toBe(true);
    expect(
      a.f.prompts[1]!.trimEnd().endsWith(
        "Your last reply was not usable: outline must have 2 to 30 units. Allowed now: an outline.",
      ),
    ).toBe(true);
    const b = await setup([], [one, one]);
    const r = await b.runner.outline(b.id);
    expect(r).toMatchObject({
      ok: false,
      error: { kind: "bad_reply", message: "The model gave an unusable reply. Press Retry." },
    });
    expect((await b.store.readSubject(b.id))!.events).toEqual([]);
  });

  it("outline does nothing unless the subject waits for one", async () => {
    const { runner, f, id } = await setup([SE.outline()], []);
    const r = await runner.outline(id);
    expect(r.ok).toBe(true);
    expect(f.prompts).toHaveLength(0);
  });

  it("reply stores the answer without a change", async () => {
    const { runner, store, id, notified } = await setup(asking, [seniorJson("Answer")]);
    const r = await runner.reply(id);
    expect(r.ok).toBe(true);
    const stored = (await store.readSubject(id))!;
    expect(stored.events.at(-1)).toEqual({
      kind: "reply",
      at: NOW,
      markdown: "Answer",
      change: null,
      usage: null,
    });
    expect(notified).toHaveLength(1);
  });

  it("reply stores a proposed change", async () => {
    const change = { kind: "remove", unitId: "u3" };
    const { runner, store, id } = await setup(asking, [seniorJson("Drop it", change)]);
    await runner.reply(id);
    const stored = (await store.readSubject(id))!;
    expect(stored.events.at(-1)).toMatchObject({ kind: "reply", change });
    const { deriveSubject } = await import("../../src/core/subject");
    expect(deriveSubject(stored.events).pendingChange).toEqual(change);
  });

  it("reply refuses a change that removes a started unit", async () => {
    const change = { kind: "remove", unitId: "u1" };
    const { runner, store, id, f } = await setup(asking, [
      seniorJson("x", change),
      seniorJson("y", change),
    ]);
    await store.writeSession({ ...session([]), subjectId: id, unitId: "u1" });
    const r = await runner.reply(id);
    expect(r).toMatchObject({ ok: false, error: { kind: "bad_reply" } });
    expect((await store.readSubject(id))!.events).toEqual(asking);
    expect(f.prompts[1]).toContain("Your last reply was not usable: unit already started: u1.");
  });

  it("senior prompt gets the outline, statuses, notes and chat", async () => {
    const events = [...asking.slice(0, 2), SE.note("u2", "s_other"), asking[2]!];
    const { runner, store, id, f } = await setup(events, [seniorJson("ok")]);
    await store.writeSession({ ...session([]), subjectId: id, unitId: "u1" });
    await runner.reply(id);
    const prompt = f.prompts[0]!;
    expect(prompt).toContain("1. u1 - Unit one: in progress");
    expect(prompt).toContain("u2: s Learned: t1. Shaky: nothing.");
    expect(prompt).toContain("LEARNER: hi");
  });

  it("missing folder blocks the subject call", async () => {
    const o = await setup([], [], null);
    const r1 = await o.runner.outline(o.id);
    expect(r1).toMatchObject({
      ok: false,
      error: {
        kind: "folder_missing",
        message: "The material folder was not found. Choose it again or remove it.",
      },
    });
    expect(o.f.prompts).toHaveLength(0);
    expect((await o.store.readSubject(o.id))!.events).toEqual([]);
    const p = await setup(asking, [], null);
    const r2 = await p.runner.reply(p.id);
    expect(r2).toMatchObject({ ok: false, error: { kind: "folder_missing" } });
    expect(p.f.prompts).toHaveLength(0);
    expect((await p.store.readSubject(p.id))!.events).toEqual(asking);
  });

  it("subject calls may read the folder only and get 300 seconds", async () => {
    const o = await setup([], [unitsJson(GOOD)]);
    await o.runner.outline(o.id);
    const p = await setup(asking, [seniorJson("ok")]);
    await p.runner.reply(p.id);
    for (const req of [o.f.requests[0]!, p.f.requests[0]!]) {
      expect(req.options).toEqual({
        readDirs: ["/course"],
        images: [],
        webSearch: false,
        model: null,
        effort: null,
      });
      expect(req.timeoutMs).toBe(300000);
    }
  });

  it("subject_call_is_single_and_stoppable", async () => {
    let runs = 0;
    const adapter: CliAdapter = {
      ...fakeAdapter().adapter,
      run: (req) => {
        runs++;
        return new Promise((resolve) =>
          req.signal.addEventListener("abort", () =>
            resolve({ ok: false, kind: "aborted", message: "aborted" }),
          ),
        );
      },
    };
    const { runner, store, id } = await setupWith(adapter, []);
    const first = runner.outline(id);
    await new Promise((r) => setTimeout(r, 20));
    expect(runner.isRunning(id)).toBe(true);
    const busy = {
      ok: false,
      error: { kind: "busy", message: "A reply is already on the way." },
      subject: null,
    };
    expect(await runner.outline(id)).toEqual(busy);
    expect(await runner.reply(id)).toEqual(busy);
    expect(runs).toBe(1);
    runner.stop(id);
    const r = await first;
    expect(r).toMatchObject({ ok: false, error: { kind: "stopped", message: "Stopped." } });
    expect(runner.isRunning(id)).toBe(false);
    expect((await store.readSubject(id))!.events).toEqual([]);
  });

  it("a note written during a call is kept", async () => {
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "lh-subj-"));
    const store = await createStore(dir, fsp);
    await store.writeSubject(subject(asking));
    const adapter: CliAdapter = {
      ...fakeAdapter().adapter,
      run: async () => {
        const s = (await store.readSubject(subject().id))!;
        await store.writeSubject({ ...s, events: [...s.events, SE.note("u1", "s_x")] });
        return { ok: true, text: seniorJson("done"), usage: null };
      },
    };
    const runner = createSubjectRunner({
      adapters: fakeAdapters(adapter),
      store,
      listFolder: async () => FILES,
      now: () => NOW,
      notify: () => {},
    });
    const r = await runner.reply(subject().id);
    expect(r.ok).toBe(true);
    const kinds = (await store.readSubject(subject().id))!.events.map((e) => e.kind);
    expect(kinds.at(-2)).toBe("note");
    expect(kinds.at(-1)).toBe("reply");
  });
});
