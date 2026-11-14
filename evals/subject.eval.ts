import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { deriveSubject } from "../src/core/subject";
import { createAdapters } from "../src/main/cli/registry";
import { listFolder } from "../src/main/files";
import { createStore } from "../src/main/store";
import { createSubjectRunner } from "../src/main/subjectTurn";
import { isCliId } from "../src/shared/clis";
import { FILE_LIST_MAX } from "../src/shared/limits";
import type { Unit } from "../src/shared/types";
import { A, SE, act, pick, session, subject, toCheck, toTeach } from "../tests/helpers/fixtures";

const FILES: Record<string, string> = {
  "photosynthesis.txt":
    "Photosynthesis is how plants make food. Plants take in light from the sun through their leaves. " +
    "They absorb water from the soil through their roots. They also take in carbon dioxide from the air. " +
    "Using the light, they turn water and carbon dioxide into glucose and release oxygen.\n",
  "french-revolution.txt":
    "The French Revolution began in 1789. In May the king called the Estates General to deal with a money crisis. " +
    "In June the third estate declared itself a National Assembly. " +
    "On 14 July 1789 a crowd stormed the Bastille in Paris. " +
    "In August the Assembly published the Declaration of the Rights of Man and of the Citizen.\n",
  "binary-search.txt":
    "Binary search finds a value in a sorted list. It looks at the middle item of the list first. " +
    "If the middle item is the target, the search is done. " +
    "If the target is smaller, the search continues in the lower half, otherwise in the upper half. " +
    "Each step halves the part of the list that is left.\n",
};

describe("evals: subject", () => {
  it("outlines a folder and advises on the next unit against the real CLI", async () => {
    const cli = process.env.LEARN_EVAL_CLI ?? "claude";
    if (!isCliId(cli)) throw new Error("LEARN_EVAL_CLI must be codex, claude or gemini");
    const adapters = createAdapters({
      spawn,
      env: process.env,
      home: os.homedir(),
      tmpRoot: os.tmpdir(),
      fs,
    });
    const root = await fsp.mkdtemp(path.join(os.tmpdir(), "lodestar-subject-eval-"));
    const dataDir = path.join(root, "data");
    const folder = path.join(root, "material");
    await fsp.mkdir(folder);
    for (const [name, text] of Object.entries(FILES)) {
      await fsp.writeFile(path.join(folder, name), text);
    }
    const store = await createStore(dataDir, fsp);
    const runner = createSubjectRunner({
      adapters,
      store,
      listFolder: (f) => listFolder(fsp, f, FILE_LIST_MAX),
      now: () => new Date().toISOString(),
      notify: () => undefined,
    });
    const results: boolean[] = [];
    const report = (label: string, passed: boolean, started: number, detail: string): void => {
      results.push(passed);
      process.stdout.write(
        `${label} ${passed ? "pass" : "FAIL"} seconds=${((Date.now() - started) / 1000).toFixed(1)} ${detail}\n`,
      );
    };

    // S1: outline
    const s1 = "u_" + randomUUID();
    await store.writeSubject({ ...subject(), id: s1, cli, folder });
    let started = Date.now();
    const r1 = await runner.outline(s1);
    let passed = false;
    let detail: string;
    if (r1.ok) {
      const units = deriveSubject(r1.subject.events).units;
      const names = Object.keys(FILES);
      passed =
        units.length >= 3 &&
        names.every((n) =>
          units.some(
            (u) => u.files.includes(n) && names.every((o) => o === n || !u.files.includes(o)),
          ),
        );
      detail = `units=${units.length}`;
    } else {
      detail = r1.error.message;
    }
    report("S1", passed, started, detail);

    // S2: senior chat
    const units: Unit[] = [
      {
        id: "photosynthesis",
        title: "Photosynthesis",
        goal: "Explain how plants make glucose from light, water and carbon dioxide.",
        files: ["photosynthesis.txt"],
      },
      {
        id: "french-revolution",
        title: "The French Revolution",
        goal: "Describe the main events of 1789 in France.",
        files: ["french-revolution.txt"],
      },
      {
        id: "binary-search",
        title: "Binary search",
        goal: "Find a value in a sorted list by halving the range.",
        files: ["binary-search.txt"],
      },
    ];
    const s2 = "u_" + randomUUID();
    const lessonId = "s_" + randomUUID();
    await store.writeSubject({
      ...subject([SE.outline(units), SE.accepted(units)]),
      id: s2,
      cli,
      folder,
    });
    await store.writeSession({
      ...session([...toTeach, ...toCheck("n1"), pick(1), ...toCheck("n2"), pick(1), act(A.done())]),
      id: lessonId,
      subjectId: s2,
      unitId: "photosynthesis",
      folder,
    });
    const at = new Date().toISOString();
    const current = await store.readSubject(s2);
    if (current === null) throw new Error("subject vanished");
    await store.writeSubject({
      ...current,
      events: [
        ...current.events,
        SE.note("photosynthesis", lessonId),
        { kind: "message", at, text: "what should I do next?" },
      ],
    });
    started = Date.now();
    const r2 = await runner.reply(s2);
    passed = false;
    let detail2: string;
    if (r2.ok) {
      const last = [...r2.subject.events].reverse().find((e) => e.kind === "reply");
      const text = last && last.kind === "reply" ? last.markdown.toLowerCase() : "";
      passed = ["french revolution", "french-revolution", "binary search", "binary-search"].some(
        (w) => text.includes(w),
      );
      detail2 = `chars=${text.length}`;
    } else {
      detail2 = r2.error.message;
    }
    report("S2", passed, started, detail2);

    await fsp.rm(root, { recursive: true, force: true });
    expect(results).toEqual([true, true]);
  });
});
