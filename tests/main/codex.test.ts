import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createCodexAdapter, lastStderrLine, parseCodexEvents } from "../../src/main/cli/codex";
import { fakeSpawn, type FakePlan } from "../helpers/fakes";

const lines = (text: string) => [
  '{"type":"thread.started","thread_id":"01a1"}',
  '{"type":"turn.started"}',
  JSON.stringify({ type: "item.completed", item: { id: "item_0", type: "agent_message", text } }),
  '{"type":"turn.completed","usage":{"input_tokens":17302,"cached_input_tokens":0,"output_tokens":20}}',
];
const SAMPLE = lines("REPLY").join("\n");

describe("parseCodexEvents", () => {
  it("parseCodexEvents returns the agent message and usage", () => {
    expect(parseCodexEvents(SAMPLE)).toEqual({
      text: "REPLY",
      usage: { inputTokens: 17302, outputTokens: 20 },
    });
  });

  it("parseCodexEvents keeps the last agent message and skips junk lines", () => {
    const l = lines("REPLY");
    const second = JSON.stringify({
      type: "item.completed",
      item: { id: "item_1", type: "agent_message", text: "LAST" },
    });
    const stdout = ["not json", l[0], l[1], l[2], second, l[3]].join("\n");
    expect(parseCodexEvents(stdout).text).toBe("LAST");
  });

  it("parseCodexEvents returns nulls when there is no message", () => {
    expect(parseCodexEvents('{"type":"turn.started"}')).toEqual({ text: null, usage: null });
  });
});

describe("lastStderrLine", () => {
  it("lastStderrLine returns the last non-empty line", () => {
    expect(lastStderrLine("a\nboom  \n\n")).toBe("boom");
  });

  it("cli_error_shows_last_stderr_line", () => {
    expect(lastStderrLine("x".repeat(300))).toHaveLength(200);
  });

  it("lastStderrLine has a default for empty stderr", () => {
    expect(lastStderrLine("")).toBe("exited with an error");
  });
});

function make(
  plan: FakePlan,
  env: NodeJS.ProcessEnv = { LEARN_CODEX_PATH: "/fake/codex", PATH: "" },
  fsDep: typeof fs = fs,
) {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "lh-test-"));
  const f = fakeSpawn(plan);
  const adapter = createCodexAdapter({
    spawn: f.spawn,
    env,
    home: "/home/x",
    tmpRoot,
    fs: fsDep,
    detectTimeoutMs: 30,
  });
  return { adapter, f, tmpRoot };
}

describe("detect", () => {
  it("detect returns the version", async () => {
    const { adapter, f } = make({ stdout: "codex-cli 0.167.0\n" });
    expect(await adapter.detect()).toEqual({ ok: true, version: "0.167.0" });
    expect(f.calls[0].cmd).toBe("/fake/codex");
    expect(f.calls[0].args).toEqual(["--version"]);
    expect(f.calls[0].opts.shell).toBe(false);
  });

  it("detect_reports_missing_cli", async () => {
    const { adapter } = make({ missing: true });
    expect(await adapter.detect()).toEqual({ ok: false });
  });

  it("detect fails on a non-zero exit", async () => {
    const { adapter } = make({ code: 1 });
    expect(await adapter.detect()).toEqual({ ok: false });
  });

  it("detect_times_out_after_5s", async () => {
    const { adapter, f } = make({ hang: true });
    expect(await adapter.detect()).toEqual({ ok: false });
    expect(f.calls[0].killed).toBe(true);
  });

  it("detect fails when no command can be found", async () => {
    const { adapter, f } = make({}, { PATH: "/nowhere" }, {
      ...fs,
      existsSync: () => false,
    } as typeof fs);
    expect(await adapter.detect()).toEqual({ ok: false });
    expect(f.calls.length).toBe(0);
  });
});
