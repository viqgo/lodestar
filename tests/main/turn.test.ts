import { describe, expect, it } from "vitest";
import { deriveState } from "../../src/core/engine";
import { modelStep } from "../../src/main/turn";
import type { RunResult, SessionEvent } from "../../src/shared/types";
import { fakeAdapter } from "../helpers/fakes";
import { A, session } from "../helpers/fixtures";

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
