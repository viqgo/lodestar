import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../../src/core/settings";
import { NO_OPTIONS } from "../../src/shared/clis";
import { CALL_TIMEOUT_MS } from "../../src/shared/limits";
import { ASK_JSON_SCHEMA, FRONTS_JSON_SCHEMA, GRADE_JSON_SCHEMA } from "../../src/shared/schema";
import type { CliAdapter } from "../../src/main/cli/adapter";
import { createPractice } from "../../src/main/practice";
import { createStore } from "../../src/main/store";
import type { RunRequest, RunResult } from "../../src/shared/types";
import { fakeAdapter, fakeAdapters } from "../helpers/fakes";
import { K, choiceQ, textQ } from "../helpers/fixtures";

const NOW = "2026-03-03T00:00:00.000Z";
const BAD = { kind: "bad_reply", message: "The model gave an unusable reply. Press Retry." };
const frontsReply = (ids: string[]) =>
  JSON.stringify({ fronts: ids.map((id) => ({ itemId: id, front: "Q " + id })) });
const ids = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => K(from + i).id);

const setup = async (n: number, ...replies: Parameters<typeof fakeAdapter>) => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "lh-practice-"));
  const store = await createStore(dir, fsp);
  await store.addKnowledge(Array.from({ length: n }, (_, i) => K(i + 1)));
  const f = fakeAdapter(...replies);
  const practice = createPractice({ adapters: fakeAdapters(f.adapter), store, now: () => NOW });
  return { dir, store, practice, ...f };
};

describe("practice service", () => {
  it("fronts_written_once_in_batches_of_20", async () => {
    const f = await setup(
      45,
      frontsReply(ids(1, 20)),
      frontsReply(ids(21, 40)),
      frontsReply(ids(41, 45)),
    );
    expect(await f.practice.fronts("codex", ids(1, 45))).toEqual({ ok: true });
    expect(f.prompts).toHaveLength(3);
    const listed = f.prompts.map((p) => p.split("\n").filter((l) => /^k_\d{8}-/.test(l)).length);
    expect(listed).toEqual([20, 20, 5]);
    const reviews = await f.store.readReviews();
    expect(reviews).toHaveLength(45);
    for (const r of reviews) {
      expect(r.front).toBe("Q " + r.itemId);
      expect(r.box).toBe(1);
    }
    expect(await f.practice.fronts("codex", ids(1, 45))).toEqual({ ok: true });
    expect(f.prompts).toHaveLength(3);
  });

  it("fronts and record never lose each other's change", async () => {
    const f = await setup(2, frontsReply([K(1).id, K(2).id]));
    let stale: Awaited<ReturnType<typeof f.store.readReviews>> | null = null;
    const store = {
      ...f.store,
      readReviews: async () => {
        if (stale !== null) return stale;
        stale = await f.store.readReviews();
        await f.store.updateReviews((rs) =>
          rs.map((r) => (r.itemId === K(1).id ? { ...r, box: 4 } : r)),
        );
        return stale;
      },
    };
    const practice = createPractice({
      adapters: fakeAdapters(f.adapter),
      store,
      now: () => NOW,
    });
    expect(await practice.fronts("codex", [K(1).id, K(2).id])).toEqual({ ok: true });
    const after = await f.store.readReviews();
    expect(after.find((r) => r.itemId === K(1).id)).toMatchObject({
      box: 4,
      front: expect.any(String),
    });
    expect(after.find((r) => r.itemId === K(2).id)?.front).toBe("Q " + K(2).id);
  });

  it("fronts skips items that have a front, unknown ids and repeats", async () => {
    const f = await setup(3, frontsReply([K(1).id, K(3).id]));
    const reviews = await f.store.readReviews();
    await f.store.writeReviews(
      reviews.map((r) => (r.itemId === K(2).id ? { ...r, front: "old" } : r)),
    );
    const r = await f.practice.fronts("codex", [K(1).id, K(1).id, "k_nope", K(2).id, K(3).id]);
    expect(r).toEqual({ ok: true });
    expect(f.prompts).toHaveLength(1);
    expect(f.prompts[0]).toContain(K(1).id + ": t1");
    expect(f.prompts[0]).toContain(K(3).id + ": t3");
    expect(f.prompts[0]).not.toContain(K(2).id);
    const after = await f.store.readReviews();
    expect(after.find((x) => x.itemId === K(2).id)!.front).toBe("old");
    expect(await f.practice.fronts("codex", [K(1).id, K(2).id, K(3).id])).toEqual({ ok: true });
    expect(f.prompts).toHaveLength(1);
  });

  it("practice_bad_reply_retries (fronts)", async () => {
    const f = await setup(2, frontsReply([K(1).id]), frontsReply([K(1).id, K(2).id]));
    expect(await f.practice.fronts("codex", [K(1).id, K(2).id])).toEqual({ ok: true });
    expect(f.prompts[1]).toMatch(
      /Your last reply was not usable: return exactly one front per item\. Allowed now: one front per item\.\n$/,
    );
    const blank = JSON.stringify({ fronts: [{ itemId: K(1).id, front: "  " }] });
    const g = await setup(1, blank, "garbage");
    expect(await g.practice.fronts("codex", [K(1).id])).toEqual({ ok: false, error: BAD });
    expect(g.prompts[1]).toContain(
      "Your last reply was not usable: empty front: " +
        K(1).id +
        ". Allowed now: one front per item.",
    );
    expect((await g.store.readReviews())[0]!.front).toBeNull();
    const h = await setup(1, "garbage", "garbage");
    expect(await h.practice.fronts("codex", [K(1).id])).toEqual({ ok: false, error: BAD });
    expect((await h.store.readReviews())[0]!.front).toBeNull();
  });

  it("fronts keeps the batches written before a failure", async () => {
    const f = await setup(25, frontsReply(ids(1, 20)), {
      ok: false,
      kind: "failed",
      message: "boom",
    });
    expect(await f.practice.fronts("codex", ids(1, 25))).toEqual({
      ok: false,
      error: { kind: "cli", message: "Codex failed: boom" },
    });
    const reviews = await f.store.readReviews();
    expect(reviews.filter((r) => r.front !== null)).toHaveLength(20);
    expect(reviews.filter((r) => r.front === null)).toHaveLength(5);
  });

  it("ask returns a question that passed the check", async () => {
    const f = await setup(1, JSON.stringify({ question: choiceQ }));
    const before = await fsp.readFile(path.join(f.dir, "reviews.json"), "utf8");
    expect(await f.practice.ask("codex", K(1).id)).toEqual({ ok: true, question: choiceQ });
    expect(f.prompts[0]).toContain("Fact: t1");
    expect(await fsp.readFile(path.join(f.dir, "reviews.json"), "utf8")).toBe(before);
  });

  it("practice_bad_reply_retries", async () => {
    const noIndex = JSON.stringify({ question: { ...choiceQ, correctIndex: null } });
    const f = await setup(1, noIndex, JSON.stringify({ question: choiceQ }));
    expect(await f.practice.ask("codex", K(1).id)).toEqual({ ok: true, question: choiceQ });
    expect(f.prompts).toHaveLength(2);
    expect(f.prompts[1]).toMatch(
      /Your last reply was not usable: check needs a correctIndex\. Allowed now: a question\.\n$/,
    );
    const g = await setup(1, "garbage", "garbage");
    expect(await g.practice.ask("codex", K(1).id)).toEqual({ ok: false, error: BAD });
  });

  it("practice_text_graded_by_tutor (service)", async () => {
    const f = await setup(1, JSON.stringify({ verdict: "fail", feedback: "Not quite." }));
    const before = await fsp.readFile(path.join(f.dir, "reviews.json"), "utf8");
    expect(await f.practice.grade("codex", K(1).id, textQ, "my answer")).toEqual({
      ok: true,
      verdict: "fail",
      feedback: "Not quite.",
    });
    expect(f.prompts[0]).toContain("Fact: t1");
    expect(f.prompts[0]).toContain('Question: "Say"');
    expect(f.prompts[0]).toContain('Answer: "my answer"');
    expect(await fsp.readFile(path.join(f.dir, "reviews.json"), "utf8")).toBe(before);
    const g = await setup(
      1,
      JSON.stringify({ verdict: "pass", feedback: " " }),
      JSON.stringify({ verdict: "pass", feedback: "Yes." }),
    );
    expect(await g.practice.grade("codex", K(1).id, textQ, "a")).toEqual({
      ok: true,
      verdict: "pass",
      feedback: "Yes.",
    });
    expect(g.prompts[1]).toContain("feedback is empty");
    expect(g.prompts[1]).toContain("Allowed now: a verdict and feedback.");
  });

  it("practice calls get no tools and 180 seconds", async () => {
    const f = await setup(
      1,
      frontsReply([K(1).id]),
      JSON.stringify({ question: choiceQ }),
      JSON.stringify({ verdict: "pass", feedback: "ok" }),
    );
    await f.practice.fronts("codex", [K(1).id]);
    await f.practice.ask("codex", K(1).id);
    await f.practice.grade("codex", K(1).id, textQ, "a");
    expect(f.requests.map((r) => r.schema)).toEqual([
      FRONTS_JSON_SCHEMA,
      ASK_JSON_SCHEMA,
      GRADE_JSON_SCHEMA,
    ]);
    for (const r of f.requests) {
      expect(r.options).toEqual(NO_OPTIONS);
      expect(r.timeoutMs).toBe(CALL_TIMEOUT_MS);
    }
  });

  it("practice calls carry the model and effort", async () => {
    const f = await setup(
      1,
      frontsReply([K(1).id]),
      JSON.stringify({ question: choiceQ }),
      JSON.stringify({ verdict: "pass", feedback: "ok" }),
      frontsReply([K(1).id]),
      JSON.stringify({ question: choiceQ }),
      JSON.stringify({ verdict: "pass", feedback: "ok" }),
    );
    await f.store.writeSettings({
      ...DEFAULT_SETTINGS,
      clis: { ...DEFAULT_SETTINGS.clis, claude: { model: "sonnet", effort: "low" } },
    });
    await f.practice.fronts("claude", [K(1).id]);
    await f.practice.ask("claude", K(1).id);
    await f.practice.grade("claude", K(1).id, textQ, "a");
    expect(f.requests).toHaveLength(3);
    for (const r of f.requests) {
      expect(r.options).toEqual({ ...NO_OPTIONS, model: "sonnet", effort: "low" });
    }
    await f.store.updateReviews(() => []);
    await f.practice.fronts("codex", [K(1).id]);
    await f.practice.ask("codex", K(1).id);
    await f.practice.grade("codex", K(1).id, textQ, "a");
    expect(f.requests).toHaveLength(6);
    for (const r of f.requests.slice(3)) expect(r.options).toEqual(NO_OPTIONS);
  });

  it("practice is one call at a time and can be stopped", async () => {
    const requests: RunRequest[] = [];
    const adapter: CliAdapter = {
      id: "codex",
      label: "Codex",
      retries: 1,
      detect: async () => ({ ok: true, version: "0.0.0" }),
      run: (req: RunRequest): Promise<RunResult> => {
        requests.push(req);
        return new Promise((resolve) => {
          const done = (): void => resolve({ ok: false, kind: "aborted", message: "" });
          if (req.signal.aborted) done();
          else req.signal.addEventListener("abort", done);
        });
      },
    };
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "lh-practice-"));
    const store = await createStore(dir, fsp);
    await store.addKnowledge([K(1)]);
    const practice = createPractice({ adapters: fakeAdapters(adapter), store, now: () => NOW });
    const first = practice.ask("codex", K(1).id);
    await new Promise((r) => setTimeout(r, 20));
    const busy = { ok: false, error: { kind: "busy", message: "A reply is already on the way." } };
    expect(await practice.ask("codex", K(1).id)).toEqual(busy);
    expect(await practice.grade("codex", K(1).id, textQ, "a")).toEqual(busy);
    expect(await practice.fronts("codex", [K(1).id])).toEqual(busy);
    expect(requests).toHaveLength(1);
    practice.stop();
    expect(await first).toEqual({ ok: false, error: { kind: "stopped", message: "Stopped." } });
    const next = practice.ask("codex", K(1).id);
    await new Promise((r) => setTimeout(r, 20));
    expect(requests).toHaveLength(2);
    practice.stop();
    await next;
  });

  it("practice names the tutor in a failure and reports a missing item", async () => {
    const f = await setup(1);
    const claude: CliAdapter = {
      id: "claude",
      label: "Claude Code",
      retries: 1,
      detect: async () => ({ ok: true, version: "0.0.0" }),
      run: async () => ({ ok: false, kind: "failed", message: "boom" }),
    };
    const practice = createPractice({
      adapters: fakeAdapters(f.adapter, { claude }),
      store: f.store,
      now: () => NOW,
    });
    expect(await practice.ask("claude", K(1).id)).toEqual({
      ok: false,
      error: { kind: "cli", message: "Claude Code failed: boom" },
    });
    const gone = {
      ok: false,
      error: { kind: "not_found", message: "This item no longer exists." },
    };
    expect(await f.practice.ask("codex", "k_nope")).toEqual(gone);
    expect(await f.practice.grade("codex", "k_nope", textQ, "a")).toEqual(gone);
    expect(f.prompts).toHaveLength(0);
  });
});
