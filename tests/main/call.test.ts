import { describe, it, expect } from "vitest";
import { callModel } from "../../src/main/call";
import { NO_OPTIONS } from "../../src/shared/clis";
import { fakeAdapter } from "../helpers/fakes";

type N = { n: number };

function parse(text: string): { ok: true; value: N } | { ok: false; reason: string } {
  try {
    return { ok: true, value: JSON.parse(text) as N };
  } catch {
    return { ok: false, reason: "not valid JSON" };
  }
}

function req(
  prompt: (retryNote: string | null) => string = () => "p",
  check: (v: N) => string | null = () => null,
) {
  return {
    prompt,
    schema: { type: "object" },
    parse,
    check,
    allowed: "a, b",
    options: NO_OPTIONS,
    timeoutMs: 1000,
    signal: new AbortController().signal,
  };
}

describe("callModel", () => {
  it("callModel returns the parsed value with usage and calls", async () => {
    const { adapter } = fakeAdapter({
      ok: true,
      text: '{"n":3}',
      usage: { inputTokens: 5, outputTokens: 6 },
    });
    const r = await callModel({ adapter }, req());
    expect(r).toEqual({
      ok: true,
      value: { n: 3 },
      usage: { inputTokens: 5, outputTokens: 6 },
      calls: 1,
    });
  });

  it("callModel retries per adapter", async () => {
    const one = fakeAdapter("x", "x", "x");
    one.adapter.retries = 1;
    const r1 = await callModel({ adapter: one.adapter }, req());
    expect(r1).toEqual({
      ok: false,
      error: { kind: "bad_reply", message: "The model gave an unusable reply. Press Retry." },
    });
    expect(one.prompts).toHaveLength(2);
    const two = fakeAdapter("x", "x", "x", "x");
    two.adapter.retries = 2;
    await callModel({ adapter: two.adapter }, req());
    expect(two.prompts).toHaveLength(3);
  });

  it("callModel puts the reason and the allowed text in the retry note", async () => {
    const a = fakeAdapter("x", '{"n":1}');
    const notes: (string | null)[] = [];
    const r = await callModel(
      { adapter: a.adapter },
      req((n) => (notes.push(n), "p")),
    );
    expect(r.ok).toBe(true);
    expect(notes).toEqual([
      null,
      "Your last reply was not usable: not valid JSON. Allowed now: a, b.",
    ]);

    const b = fakeAdapter('{"n":1}', '{"n":2}');
    const notes2: (string | null)[] = [];
    const r2 = await callModel(
      { adapter: b.adapter },
      req(
        (n) => (notes2.push(n), "p"),
        (v) => (v.n === 1 ? "too small" : null),
      ),
    );
    expect(r2).toMatchObject({ ok: true, value: { n: 2 }, calls: 2 });
    expect(notes2).toEqual([null, "Your last reply was not usable: too small. Allowed now: a, b."]);
  });

  it("callModel names the CLI in a failure", async () => {
    const a = fakeAdapter({ ok: false, kind: "failed", message: "boom" });
    a.adapter.label = "Claude Code";
    const r = await callModel({ adapter: a.adapter }, req());
    expect(r).toEqual({ ok: false, error: { kind: "cli", message: "Claude Code failed: boom" } });
    expect(a.prompts).toHaveLength(1);
  });

  it("callModel stops", async () => {
    const a = fakeAdapter({ ok: false, kind: "aborted", message: "x" });
    const r = await callModel({ adapter: a.adapter }, req());
    expect(r).toEqual({ ok: false, error: { kind: "stopped", message: "Stopped." } });
    expect(a.prompts).toHaveLength(1);
  });

  it("callModel passes schema, options, timeout and signal to the adapter", async () => {
    const a = fakeAdapter('{"n":1}');
    const q = req();
    q.options = { readDirs: ["/d"], images: [], webSearch: true, model: "m", effort: null };
    await callModel({ adapter: a.adapter }, q);
    expect(a.requests[0]).toEqual({
      prompt: "p",
      schema: q.schema,
      signal: q.signal,
      timeoutMs: 1000,
      options: q.options,
    });
  });
});
