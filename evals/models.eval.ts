import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../src/core/settings";
import { createAdapters } from "../src/main/cli/registry";
import { createStore } from "../src/main/store";
import { createTurnRunner } from "../src/main/turn";
import type { CliId, Session } from "../src/shared/types";

describe("evals: models", () => {
  it("passes the chosen model and effort to Claude Code and Codex", async () => {
    const outputs: string[] = [];
    const tee = ((...args: Parameters<typeof spawn>) => {
      const child = spawn(...args);
      let text = "";
      child.stdout?.on("data", (d) => {
        text += String(d);
      });
      child.on("close", () => outputs.push(text));
      return child;
    }) as typeof spawn;
    const adapters = createAdapters({
      spawn: tee,
      env: process.env,
      home: os.homedir(),
      tmpRoot: os.tmpdir(),
      fs,
    });
    const root = await fsp.mkdtemp(path.join(os.tmpdir(), "lodestar-models-eval-"));
    const store = await createStore(path.join(root, "data"), fsp);
    const runner = createTurnRunner({
      adapters,
      store,
      now: () => new Date().toISOString(),
      newId: (prefix) => prefix + "_" + randomUUID(),
      notify: () => undefined,
      listFolder: async () => null,
    });
    const lesson = (cli: CliId): Session => ({
      version: 1,
      id: "s_" + randomUUID(),
      topic: "Derivatives",
      goal: "Explain what a derivative measures",
      cli,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      events: [],
      folder: null,
      attachments: [],
      webSearch: false,
      subjectId: null,
      unitId: null,
    });
    const results: boolean[] = [];
    const report = (label: string, passed: boolean, started: number, detail: string): void => {
      results.push(passed);
      process.stdout.write(
        `${label} ${passed ? "pass" : "FAIL"} seconds=${((Date.now() - started) / 1000).toFixed(1)} ${detail}\n`,
      );
    };

    // M1: Claude Code with a model and an effort
    let started = Date.now();
    await store.writeSettings({
      ...DEFAULT_SETTINGS,
      clis: { ...DEFAULT_SETTINGS.clis, claude: { model: "sonnet", effort: "low" } },
    });
    const s1 = lesson("claude");
    await store.writeSession(s1);
    const r1 = await runner.advance(s1.id);
    const stored1 = await store.readSession(s1.id);
    const actions1 = (stored1?.events ?? []).filter((e) => e.kind === "action").length;
    let passed = r1.ok && actions1 === 1;
    let detail: string;
    const raw = outputs[outputs.length - 1] ?? "";
    try {
      const parsed = JSON.parse(raw) as { modelUsage?: Record<string, unknown> };
      const ids = Object.keys(parsed.modelUsage ?? {});
      if (parsed.modelUsage !== undefined) {
        passed = passed && ids.some((id) => id.includes("sonnet"));
        detail = "models=" + JSON.stringify(ids);
      } else {
        const found = raw.match(/claude-sonnet[\w.-]*/);
        passed = passed && found !== null;
        detail = "modelUsage missing, keys=" + JSON.stringify(Object.keys(parsed));
      }
    } catch {
      const found = raw.match(/claude-sonnet[\w.-]*/);
      passed = passed && found !== null;
      detail = "output is not JSON";
    }
    if (!r1.ok) detail += " error=" + r1.error.message;
    report("M1", passed, started, detail);

    // M2: Codex with an effort only
    started = Date.now();
    await store.writeSettings({
      ...DEFAULT_SETTINGS,
      clis: { ...DEFAULT_SETTINGS.clis, codex: { model: "", effort: "low" } },
    });
    const s2 = lesson("codex");
    await store.writeSession(s2);
    const r2 = await runner.advance(s2.id);
    const stored2 = await store.readSession(s2.id);
    const acts = (stored2?.events ?? []).flatMap((e) => (e.kind === "action" ? [e.action] : []));
    report(
      "M2",
      r2.ok && acts.length === 1,
      started,
      r2.ok ? "action=" + String(acts[0]?.type) : r2.error.message,
    );

    await fsp.rm(root, { recursive: true, force: true });
    expect(results.every(Boolean)).toBe(true);
  });
});
