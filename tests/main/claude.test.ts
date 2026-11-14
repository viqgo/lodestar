import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createCodexAdapter } from "../../src/main/cli/codex";
import { createGeminiAdapter } from "../../src/main/cli/gemini";
import { createClaudeAdapter, parseClaudeResult } from "../../src/main/cli/claude";
import { DEFAULT_SETTINGS } from "../../src/core/settings";
import { runOptions } from "../../src/main/turn";
import { NO_OPTIONS } from "../../src/shared/clis";
import { fakeSpawn, type FakePlan } from "../helpers/fakes";
import { session } from "../helpers/fixtures";

const SAMPLE = JSON.stringify({
  type: "result",
  is_error: false,
  result: '{"action":{"type":"probe"}}',
  structured_output: { action: { type: "probe" } },
  usage: {
    input_tokens: 2,
    cache_creation_input_tokens: 7317,
    cache_read_input_tokens: 0,
    output_tokens: 207,
  },
});

function make(
  plan: FakePlan,
  env: NodeJS.ProcessEnv = { LEARN_CLAUDE_PATH: "/fake/claude", PATH: "" },
) {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "lh-test-"));
  const f = fakeSpawn(plan);
  const adapter = createClaudeAdapter({
    spawn: f.spawn,
    env,
    home: "/home/x",
    tmpRoot,
    fs,
    detectTimeoutMs: 30,
  });
  return { adapter, f };
}

const req = (schema: object = { a: 1 }) => ({
  prompt: "PROMPT",
  schema,
  signal: new AbortController().signal,
  timeoutMs: 1000,
});

describe("parseClaudeResult", () => {
  it("claude_reads_structured_output", () => {
    expect(parseClaudeResult(SAMPLE)).toEqual({
      text: JSON.stringify({ action: { type: "probe" } }),
      usage: { inputTokens: 7319, outputTokens: 207 },
      error: null,
    });
  });

  it("parseClaudeResult falls back to result", () => {
    const out = JSON.stringify({ is_error: false, result: "plain text" });
    expect(parseClaudeResult(out).text).toBe("plain text");
  });

  it("parseClaudeResult reports unreadable output and is_error", () => {
    expect(parseClaudeResult("not json").error).toBe("unreadable output");
    expect(parseClaudeResult('{"is_error":true,"result":"Credit balance is too low"}').error).toBe(
      "Credit balance is too low",
    );
  });
});

describe("claude adapter", () => {
  it("claude_spawn_uses_safe_flags", async () => {
    const { adapter, f } = make({ stdout: SAMPLE });
    const schema = { a: 1 };
    await adapter.run(req(schema));
    const call = f.calls[0];
    expect(call.args).toEqual([
      "-p",
      "--output-format",
      "json",
      "--json-schema",
      JSON.stringify(schema),
      "--tools",
      "",
      "--setting-sources",
      "",
      "--strict-mcp-config",
      "--no-session-persistence",
      "--disable-slash-commands",
    ]);
    expect(call.opts.shell).toBe(false);
    expect(call.stdin).toBe("PROMPT");
    expect(call.opts.cwd.endsWith("/work")).toBe(true);
  });

  it("claude_folder_adds_read_tools_and_dir", async () => {
    const { adapter, f } = make({ stdout: SAMPLE });
    await adapter.run({ ...req(), options: { ...NO_OPTIONS, readDirs: ["/m", "/att"] } });
    const a = f.calls[0].args;
    expect(a[a.indexOf("--tools") + 1]).toBe("Read,Glob,Grep");
    const i = a.indexOf("--disable-slash-commands");
    expect(a.slice(i + 1)).toEqual(["--add-dir", "/m", "--add-dir", "/att"]);
  });

  it("claude_allowed_tools_never_include_read_tools", async () => {
    for (const readDirs of [[], ["/m"]]) {
      for (const webSearch of [false, true]) {
        const { adapter, f } = make({ stdout: SAMPLE });
        await adapter.run({ ...req(), options: { ...NO_OPTIONS, readDirs, webSearch } });
        const a = f.calls[0].args;
        const at = a.indexOf("--allowed-tools");
        if (at !== -1) expect(a[at + 1]).toBe("WebSearch");
        expect(at === -1).toBe(!webSearch);
        const tools = a[a.indexOf("--tools") + 1].split(",").filter((t: string) => t !== "");
        expect(tools.includes("Read")).toBe(readDirs.length > 0);
      }
    }
  });

  it("web_search_flags_per_cli (claude)", async () => {
    const { adapter, f } = make({ stdout: SAMPLE });
    await adapter.run({ ...req(), options: { ...NO_OPTIONS, webSearch: true } });
    const a = f.calls[0].args;
    expect(a[a.indexOf("--tools") + 1]).toBe("WebSearch");
    expect(a.slice(a.indexOf("--disable-slash-commands") + 1)).toEqual([
      "--allowed-tools",
      "WebSearch",
    ]);
  });

  it("claude adapter drops the Claude Code env markers", async () => {
    const { adapter, f } = make(
      { stdout: SAMPLE },
      { LEARN_CLAUDE_PATH: "/fake/claude", PATH: "", CLAUDECODE: "1" },
    );
    await adapter.run(req());
    expect("CLAUDECODE" in f.calls[0].opts.env).toBe(false);
  });

  it("claude_error_names_the_cli", async () => {
    expect(make({}).adapter.label).toBe("Claude Code");
    expect(await make({ code: 1, stderr: "boom\n" }).adapter.run(req())).toEqual({
      ok: false,
      kind: "failed",
      message: "boom",
    });
    expect(
      await make({ code: 1, stdout: '{"is_error":true,"result":"Not logged in"}' }).adapter.run(
        req(),
      ),
    ).toEqual({ ok: false, kind: "failed", message: "Not logged in" });
    expect(await make({ missing: true }).adapter.run(req())).toEqual({
      ok: false,
      kind: "failed",
      message: "Claude Code CLI not found",
    });
  });

  it("claude adapter reports no message", async () => {
    const { adapter } = make({ code: 0, stdout: '{"is_error":false}' });
    expect(await adapter.run(req())).toEqual({
      ok: false,
      kind: "failed",
      message: "Claude Code returned no message",
    });
  });

  it("claude adapter uses LEARN_CLAUDE_PATH", async () => {
    const { adapter, f } = make({ stdout: "claude 2.1.0\n" });
    await adapter.detect();
    expect(f.calls[0].cmd).toBe("/fake/claude");
    const b = make({ stdout: SAMPLE });
    await b.adapter.run(req());
    expect(b.f.calls[0].cmd).toBe("/fake/claude");
    expect(b.adapter.retries).toBe(1);
  });
});

describe("env markers", () => {
  it("claude adapter drops both Claude Code env markers and the others keep them", async () => {
    const env: NodeJS.ProcessEnv = {
      LEARN_CLAUDE_PATH: "/fake/claude",
      LEARN_CODEX_PATH: "/fake/codex",
      LEARN_GEMINI_PATH: "/fake/gemini",
      PATH: "",
      CLAUDECODE: "1",
      CLAUDE_CODE_ENTRYPOINT: "cli",
    };
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "lh-test-"));
    const build = (create: typeof createClaudeAdapter, plan: FakePlan) => {
      const f = fakeSpawn(plan);
      const adapter = create({ spawn: f.spawn, env, home: "/home/x", tmpRoot, fs });
      return { adapter, f };
    };
    const c = build(createClaudeAdapter, { stdout: SAMPLE });
    await c.adapter.run(req());
    expect(c.f.calls[0].opts.env.CLAUDECODE).toBeUndefined();
    expect(c.f.calls[0].opts.env.CLAUDE_CODE_ENTRYPOINT).toBeUndefined();
    for (const create of [createCodexAdapter, createGeminiAdapter]) {
      const o = build(create, {});
      await o.adapter.run(req());
      expect(o.f.calls[0].opts.env.CLAUDECODE).toBe("1");
      expect(o.f.calls[0].opts.env.CLAUDE_CODE_ENTRYPOINT).toBe("cli");
    }
  });
});

describe("settings to claude flags", () => {
  it("model_and_effort_become_claude_flags", async () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      clis: {
        ...DEFAULT_SETTINGS.clis,
        claude: { model: "sonnet", effort: "medium" },
        codex: { model: "gpt-x", effort: "low" },
      },
    };
    const o = runOptions({ ...session(), cli: "claude" }, "/att", settings);
    expect(o.model).toBe("sonnet");
    expect(o.effort).toBe("medium");
    const { adapter, f } = make({ stdout: SAMPLE });
    await adapter.run({ ...req(), options: o });
    const a = f.calls[0].args;
    expect(a.slice(-4)).toEqual(["--model", "sonnet", "--effort", "medium"]);
    expect(a[a.indexOf("--tools") + 1]).toBe("");
  });
});
