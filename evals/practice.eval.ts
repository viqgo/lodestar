import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createAdapters } from "../src/main/cli/registry";
import { createPractice } from "../src/main/practice";
import { createStore } from "../src/main/store";
import { isCliId } from "../src/shared/clis";

const TEXTS = [
  "The derivative of x squared is 2x.",
  "Water boils at 100 degrees Celsius at sea level.",
  "Binary search halves the remaining range at every step.",
];

describe("evals: practice", () => {
  it("writes fronts, asks and grades against the real CLI", async () => {
    const cli = process.env.LEARN_EVAL_CLI ?? "claude";
    if (!isCliId(cli)) throw new Error("LEARN_EVAL_CLI must be codex, claude or gemini");
    const adapters = createAdapters({
      spawn,
      env: process.env,
      home: os.homedir(),
      tmpRoot: os.tmpdir(),
      fs,
    });
    const root = await fsp.mkdtemp(path.join(os.tmpdir(), "lodestar-practice-eval-"));
    const store = await createStore(path.join(root, "data"), fsp);
    const items = TEXTS.map((text, i) => ({
      id: "k_" + randomUUID(),
      text,
      sessionId: "s_eval",
      nodeId: `n${i + 1}`,
      createdAt: new Date().toISOString(),
    }));
    await store.addKnowledge(items);
    const practice = createPractice({
      adapters,
      store,
      now: () => new Date().toISOString(),
    });
    const ids = items.map((k) => k.id);
    const results: boolean[] = [];
    const report = (label: string, passed: boolean, started: number, detail: string): void => {
      results.push(passed);
      process.stdout.write(
        `${label} ${passed ? "pass" : "FAIL"} seconds=${((Date.now() - started) / 1000).toFixed(1)} ${detail}\n`,
      );
    };

    // P1: fronts
    let started = Date.now();
    const r1 = await practice.fronts(cli, ids);
    let passed = false;
    let detail: string;
    if (r1.ok) {
      const reviews = await store.readReviews();
      const fronts = items.map((k) => reviews.find((r) => r.itemId === k.id)?.front ?? null);
      passed = items.every((k, i) => {
        const front = fronts[i];
        return (
          front !== null &&
          front.trim() !== "" &&
          !front.toLowerCase().includes(k.text.toLowerCase())
        );
      });
      detail = JSON.stringify(fronts);
    } else {
      detail = r1.error.message;
    }
    report("P1", passed, started, detail);

    // P2: practice
    started = Date.now();
    const asked = await practice.ask(cli, ids[0]);
    const graded = await practice.grade(
      cli,
      ids[0],
      {
        kind: "text",
        prompt: "What is the derivative of x squared?",
        options: [],
        correctIndex: null,
      },
      "It is zero, because x squared is a constant.",
    );
    passed = asked.ok && graded.ok && graded.verdict === "fail";
    const askDetail = asked.ok ? `kind=${asked.question.kind}` : asked.error.message;
    const gradeDetail = graded.ok ? `verdict=${graded.verdict}` : graded.error.message;
    report("P2", passed, started, `${askDetail} ${gradeDetail}`);

    await fsp.rm(root, { recursive: true, force: true });
    expect(results.every(Boolean)).toBe(true);
  });
});
