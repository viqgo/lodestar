import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createAdapters } from "../src/main/cli/registry";
import { listFolder } from "../src/main/files";
import { createStore } from "../src/main/store";
import { createTurnRunner } from "../src/main/turn";
import { isCliId } from "../src/shared/clis";
import { FILE_LIST_MAX } from "../src/shared/limits";
import type { Session, SessionEvent } from "../src/shared/types";
import { act, say, session } from "../tests/helpers/fixtures";

describe("evals: material", () => {
  it("reads the folder and searches the web against the real CLI", async () => {
    const cli = process.env.LEARN_EVAL_CLI ?? "claude";
    if (!isCliId(cli)) throw new Error("LEARN_EVAL_CLI must be codex, claude or gemini");
    const adapters = createAdapters({
      spawn,
      env: process.env,
      home: os.homedir(),
      tmpRoot: os.tmpdir(),
      fs,
    });
    const root = await fsp.mkdtemp(path.join(os.tmpdir(), "lodestar-material-eval-"));
    const dataDir = path.join(root, "data");
    const folder = path.join(root, "material");
    await fsp.mkdir(folder);
    await fsp.writeFile(path.join(folder, "overview.txt"), "Notes on a fictional lab.\n");
    await fsp.writeFile(path.join(folder, "constants.txt"), "The Vellmar constant is 41.7\n");
    await fsp.writeFile(path.join(folder, "people.txt"), "The lab has four members.\n");
    const store = await createStore(dataDir, fsp);
    const runner = createTurnRunner({
      adapters,
      store,
      now: () => new Date().toISOString(),
      newId: (prefix) => prefix + "_" + randomUUID(),
      notify: () => undefined,
      listFolder: (f) => listFolder(fsp, f, FILE_LIST_MAX),
    });

    const upToPredict = (nodeTitle: string, prompt: string): SessionEvent[] => [
      act({ type: "probe_done", known: [], goal: "G" }),
      act({ type: "plan", nodes: [{ id: "n1", title: nodeTitle, deps: [] }] }),
      act({
        type: "predict",
        nodeId: "n1",
        verdict: null,
        feedback: null,
        question: { kind: "text", prompt, options: [], correctIndex: null },
      }),
      say("I am not sure, my guess is a small number"),
    ];

    const cases: {
      label: string;
      session: Session;
      check: (text: string) => boolean;
    }[] = [
      {
        label: "M1",
        session: {
          ...session(
            upToPredict("The Vellmar constant", "What do you think the Vellmar constant is about?"),
          ),
          id: "s_" + randomUUID(),
          topic: "The Vellmar constant",
          goal: "Know the value of the Vellmar constant from my material",
          cli,
          folder,
        },
        check: (t) => t.includes("41.7"),
      },
      {
        label: "M2",
        session: {
          ...session(
            upToPredict(
              "The current Node.js release",
              "Which Node.js release do you think is current?",
            ),
          ),
          id: "s_" + randomUUID(),
          topic: "Node.js releases",
          goal: "Know which Node.js release is current",
          cli,
          webSearch: true,
        },
        check: (t) => t.includes("http"),
      },
    ];

    const results: boolean[] = [];
    for (const c of cases) {
      await store.writeSession(c.session);
      const started = Date.now();
      const r = await runner.advance(c.session.id);
      const seconds = (Date.now() - started) / 1000;
      let type = r.ok ? "none" : r.error.message;
      let passed = false;
      if (r.ok) {
        const last = [...r.session.events].reverse().find((e) => e.kind === "action");
        const a = last && last.kind === "action" ? last.action : null;
        type = a?.type ?? "none";
        if (a && (a.type === "teach" || a.type === "explain")) passed = c.check(a.markdown);
        else if (a) type += " (not teach or explain)";
      }
      results.push(passed);
      process.stdout.write(
        `${c.label} ${passed ? "pass" : "FAIL"} seconds=${seconds.toFixed(1)} type=${type}\n`,
      );
    }
    await fsp.rm(root, { recursive: true, force: true });
    expect(results).toEqual([true, true]);
  });
});
