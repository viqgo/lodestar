import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import { describe, expect, it } from "vitest";
import { deriveState } from "../src/core/engine";
import { createCodexAdapter } from "../src/main/cli/codex";
import { modelStep } from "../src/main/turn";
import type { Action, Question, SessionEvent } from "../src/shared/types";
import { act, ans, pick, say, session } from "../tests/helpers/fixtures";

describe("evals", () => {
  it("the loop holds together against real Codex", async () => {
    const adapter = createCodexAdapter({
      spawn,
      env: process.env,
      home: os.homedir(),
      tmpRoot: os.tmpdir(),
      fs,
    });

    const base = {
      ...session(),
      topic: "Derivatives",
      goal: "Understand why the derivative is the slope of the tangent line",
    };
    const q1: Question = {
      kind: "choice",
      prompt: "What does the slope of a straight line measure?",
      options: ["How steep it is", "How long it is", "The area under it"],
      correctIndex: 0,
    };
    const probeRound = [
      act({ type: "probe", question: q1 }),
      ans({ choiceIndex: 0, confidence: "sure" }),
    ];
    const done = act({ type: "probe_done", known: ["Slope is rise over run"], goal: base.goal });
    const plan = act({
      type: "plan",
      nodes: [
        { id: "avg-rate", title: "Average rate of change between two points", deps: [] },
        { id: "limit", title: "Letting the two points move together", deps: ["avg-rate"] },
      ],
    });
    const predict = (id: string) =>
      act({
        type: "predict",
        nodeId: id,
        verdict: null,
        feedback: null,
        question: {
          kind: "text",
          prompt: "What do you expect happens to the slope as the points get closer?",
          options: [],
          correctIndex: null,
        },
      });
    const check: Question = {
      kind: "choice",
      prompt: "From x=1 to x=3, f goes from 2 to 8. Average rate of change?",
      options: ["6", "3", "4"],
      correctIndex: 1,
    };
    const explain = (id: string) =>
      act({
        type: "explain",
        nodeId: id,
        verdict: null,
        feedback: null,
        markdown: "The slope between two points is the change in f divided by the change in x.",
        check,
      });
    const node = (id: string, choice: number) => [
      predict(id),
      say("It settles on one value"),
      explain(id),
      pick(choice),
    ];

    const cases: {
      n: number;
      events: SessionEvent[];
      type: string;
      extra: (a: Action) => boolean;
    }[] = [
      { n: 1, events: [], type: "probe", extra: () => true },
      {
        n: 2,
        events: Array.from({ length: 8 }, () => probeRound).flat(),
        type: "probe_done",
        extra: (a) => a.type === "probe_done" && a.known.length >= 1,
      },
      { n: 3, events: [...probeRound, done], type: "plan", extra: () => true },
      {
        n: 4,
        events: [...probeRound, done, plan],
        type: "predict",
        extra: (a) => a.type === "predict" && a.nodeId === "avg-rate",
      },
      {
        n: 5,
        events: [...probeRound, done, plan, predict("avg-rate"), say("It settles on one value")],
        type: "explain",
        extra: (a) => a.type === "explain" && a.nodeId === "avg-rate",
      },
      {
        n: 6,
        events: [...probeRound, done, plan, ...node("avg-rate", 0)],
        type: "explain",
        extra: (a) => a.type === "explain" && a.nodeId === "avg-rate",
      },
      {
        n: 7,
        events: [...probeRound, done, plan, ...node("avg-rate", 1), ...node("limit", 1)],
        type: "lesson_done",
        extra: (a) => a.type === "lesson_done" && a.learned.length >= 1,
      },
    ];

    let firstTry = 0;
    let withRetry = 0;
    let slow = false;
    let e1Tokens: number | null = null;
    for (const c of cases) {
      const s = { ...base, events: c.events };
      const started = Date.now();
      const r = await modelStep(
        { adapter, knowledge: [] },
        s,
        deriveState(c.events),
        new AbortController().signal,
      );
      const seconds = (Date.now() - started) / 1000;
      const passed = r.ok && r.action.type === c.type && c.extra(r.action);
      const calls = r.ok ? r.calls : 0;
      const tokens = r.ok && r.usage ? r.usage.inputTokens : null;
      if (c.n === 1) e1Tokens = tokens;
      if (passed) {
        withRetry++;
        if (calls === 1) firstTry++;
        if (seconds >= 60) slow = true;
      }
      const what = r.ok ? r.action.type : r.error.message;
      process.stdout.write(
        `E${c.n} ${passed ? "pass" : "FAIL"} calls=${calls} seconds=${seconds.toFixed(1)} inputTokens=${tokens ?? "?"} type=${what}\n`,
      );
    }
    process.stdout.write(`EVAL SCORE first-try ${firstTry}/7, with-retry ${withRetry}/7\n`);

    expect(firstTry).toBeGreaterThanOrEqual(6);
    expect(withRetry).toBe(7);
    expect(slow).toBe(false);
    if (e1Tokens !== null) expect(e1Tokens).toBeLessThan(30000);
  });
});
