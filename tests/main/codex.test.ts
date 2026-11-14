import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createClaudeAdapter } from "../../src/main/cli/claude";
import { createCodexAdapter, lastStderrLine, parseCodexEvents } from "../../src/main/cli/codex";
import {
  GEMINI_EXCLUDED_TOOLS,
  createGeminiAdapter,
  geminiExcluded,
} from "../../src/main/cli/gemini";
import { DEFAULT_SETTINGS } from "../../src/core/settings";
import { runOptions } from "../../src/main/turn";
import { NO_OPTIONS } from "../../src/shared/clis";
import type { RunOptions } from "../../src/shared/types";
import { fakeSpawn, type FakePlan } from "../helpers/fakes";
import { session } from "../helpers/fixtures";

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

describe("adapter identity", () => {
  it("codex adapter has a label and one retry", () => {
    const { adapter } = make({});
    expect(adapter.id).toBe("codex");
    expect(adapter.label).toBe("Codex");
    expect(adapter.retries).toBe(1);
  });
});

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

const req = (over: Record<string, unknown> = {}) => ({
  prompt: "PROMPT",
  schema: { a: 1 },
  signal: new AbortController().signal,
  timeoutMs: 1000,
  ...over,
});
const OK = SAMPLE;
const empty = (dir: string) => fs.readdirSync(dir).length === 0;

describe("run", () => {
  it("run survives a write error on stdin", async () => {
    const { adapter } = make({ stdinError: true, code: 1, stderr: "not signed in\n" });
    expect(await adapter.run(req())).toEqual({
      ok: false,
      kind: "failed",
      message: "not signed in",
    });
  });

  it("run decodes characters split across output chunks", async () => {
    const full = Buffer.from(
      JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "café ✓" } }) +
        "\n",
    );
    const cut = full.indexOf(0xc3) + 1;
    const { adapter } = make({ stdoutChunks: [full.subarray(0, cut), full.subarray(cut)] });
    expect(await adapter.run(req())).toEqual({ ok: true, text: "café ✓", usage: null });
  });

  it("codex_spawn_uses_safe_flags", async () => {
    const { adapter, f } = make({ stdout: OK });
    await adapter.run(req());
    const call = f.calls[0];
    expect(call.cmd).toBe("/fake/codex");
    expect(call.args.slice(0, 3)).toEqual(["exec", "--json", "--output-schema"]);
    expect(call.args[3].endsWith("schema.json")).toBe(true);
    expect(call.args.slice(4)).toEqual([
      "--ephemeral",
      "--sandbox",
      "read-only",
      "--skip-git-repo-check",
      "-",
    ]);
    expect(call.opts.shell).toBe(false);
    expect(call.opts.cwd.endsWith("/work")).toBe(true);
    expect(call.opts.env.PATH).toContain("/opt/homebrew/bin");
  });

  it("codex_folder_keeps_read_only_flags", async () => {
    const plain = make({ stdout: OK });
    await plain.adapter.run(req());
    const withDir = make({ stdout: OK });
    await withDir.adapter.run({ ...req(), options: { ...NO_OPTIONS, readDirs: ["/m"] } });
    const args = withDir.f.calls[0].args;
    expect(args).toContain("--sandbox");
    expect(args[args.indexOf("--sandbox") + 1]).toBe("read-only");
    expect(args).not.toContain("--add-dir");
    expect(args.filter((x) => !x.endsWith("schema.json"))).toEqual(
      plain.f.calls[0].args.filter((x) => !x.endsWith("schema.json")),
    );
  });

  it("codex_gets_images_by_flag", async () => {
    const { adapter, f } = make({ stdout: OK });
    await adapter.run({ ...req(), options: { ...NO_OPTIONS, images: ["/a.png", "/b.jpg"] } });
    expect(f.calls[0].args.slice(-5)).toEqual(["-i", "/a.png", "-i", "/b.jpg", "-"]);
  });

  it("web_search_flags_per_cli (codex)", async () => {
    const { adapter, f } = make({ stdout: OK });
    await adapter.run({ ...req(), options: { ...NO_OPTIONS, webSearch: true } });
    expect(f.calls[0].args.slice(0, 2)).toEqual(["--search", "exec"]);
  });

  it("model and effort become flags for each cli", async () => {
    const o: RunOptions = { ...NO_OPTIONS, model: "m1", effort: "high" };
    const codex = make({ stdout: OK });
    await codex.adapter.run({ ...req(), options: o });
    const a = codex.f.calls[0].args;
    expect(a.slice(a.indexOf("--skip-git-repo-check") + 1)).toEqual([
      "-m",
      "m1",
      "-c",
      "model_reasoning_effort=high",
      "-",
    ]);
    const claude = fakeSpawn({ stdout: "{}" });
    await createClaudeAdapter({
      spawn: claude.spawn,
      env: { LEARN_CLAUDE_PATH: "/fake/claude", PATH: "" },
      home: "/home/x",
      tmpRoot: fs.mkdtempSync(path.join(os.tmpdir(), "lh-test-")),
      fs,
    }).run({ ...req(), options: o });
    expect(claude.calls[0].args.slice(-4)).toEqual(["--model", "m1", "--effort", "high"]);
    const gemini = fakeSpawn({ stdout: "{}" });
    await createGeminiAdapter({
      spawn: gemini.spawn,
      env: { LEARN_GEMINI_PATH: "/fake/gemini", PATH: "" },
      home: "/home/x",
      tmpRoot: fs.mkdtempSync(path.join(os.tmpdir(), "lh-test-")),
      fs,
    }).run({ ...req(), options: o });
    expect(gemini.calls[0].args.slice(-2)).toEqual(["-m", "m1"]);
  });

  it("no_cli_ever_gets_write_tools", async () => {
    for (const readDirs of [[], ["/m"]]) {
      for (const webSearch of [false, true]) {
        const options: RunOptions = { ...NO_OPTIONS, readDirs, webSearch };
        const codex = make({ stdout: OK });
        await codex.adapter.run({ ...req(), options });
        expect(codex.f.calls[0].args).toContain("read-only");
        expect(codex.f.calls[0].args).not.toContain("--add-dir");
        const claude = fakeSpawn({ stdout: "{}" });
        await createClaudeAdapter({
          spawn: claude.spawn,
          env: { LEARN_CLAUDE_PATH: "/fake/claude", PATH: "" },
          home: "/home/x",
          tmpRoot: fs.mkdtempSync(path.join(os.tmpdir(), "lh-test-")),
          fs,
        }).run({ ...req(), options });
        const args = claude.calls[0].args;
        const tools = args[args.indexOf("--tools") + 1];
        for (const bad of ["Write", "Edit", "Bash", "NotebookEdit", "WebFetch"]) {
          expect(tools).not.toContain(bad);
        }
        const ex = geminiExcluded(options);
        for (const t of ["run_shell_command", "write_file", "replace"]) {
          expect(ex).toContain(t);
        }
        expect(GEMINI_EXCLUDED_TOOLS).toContain("run_shell_command");
      }
    }
  });

  it("run returns the message and usage", async () => {
    const { adapter } = make({ stdout: OK });
    expect(await adapter.run(req())).toEqual({
      ok: true,
      text: "REPLY",
      usage: { inputTokens: 17302, outputTokens: 20 },
    });
  });

  it("run writes the prompt to stdin", async () => {
    const { adapter, f } = make({ stdout: OK });
    await adapter.run(req());
    expect(f.calls[0].stdin).toBe("PROMPT");
  });

  it("run reports a non-zero exit with the last stderr line", async () => {
    const { adapter } = make({ code: 1, stderr: "warn\nstream disconnected\n" });
    expect(await adapter.run(req())).toEqual({
      ok: false,
      kind: "failed",
      message: "stream disconnected",
    });
  });

  it("run reports an exit with no message", async () => {
    const { adapter } = make({ stdout: '{"type":"turn.started"}' });
    expect(await adapter.run(req())).toEqual({
      ok: false,
      kind: "failed",
      message: "Codex returned no message",
    });
  });

  it("cli_timeout_after_180s", async () => {
    const { adapter, f } = make({ hang: true });
    const result = await adapter.run(req({ timeoutMs: 30 }));
    expect(result).toMatchObject({ ok: false, kind: "timeout" });
    expect(result.ok === false && result.message).toBe("no reply after 0.03 seconds");
    expect(f.calls[0].killed).toBe(true);
  });

  it("stop_kills_process_and_restores", async () => {
    const { adapter, f } = make({ hang: true });
    const c = new AbortController();
    const p = adapter.run(req({ signal: c.signal }));
    setTimeout(() => c.abort(), 10);
    expect(await p).toEqual({ ok: false, kind: "aborted", message: "stopped" });
    expect(f.calls[0].killed).toBe(true);
  });

  it("temp_dir_removed_after_call", async () => {
    const a = make({ stdout: OK });
    await a.adapter.run(req());
    expect(a.f.calls.length).toBe(1);
    expect(empty(a.tmpRoot)).toBe(true);

    const b = make({ code: 1, stderr: "boom" });
    await b.adapter.run(req());
    expect(b.f.calls.length).toBe(1);
    expect(empty(b.tmpRoot)).toBe(true);

    const c = make({ hang: true });
    const ctl = new AbortController();
    const p = c.adapter.run(req({ signal: ctl.signal }));
    setTimeout(() => ctl.abort(), 10);
    await p;
    expect(c.f.calls.length).toBe(1);
    expect(empty(c.tmpRoot)).toBe(true);
  });
});

describe("tool safety", () => {
  it("no_cli_ever_gets_write_tools_for_any_options", async () => {
    const bad = ["Write", "Edit", "Bash", "NotebookEdit", "WebFetch"];
    for (const readDirs of [[], ["/m"]]) {
      for (const webSearch of [false, true]) {
        for (const images of [[], ["/i.png"]]) {
          for (const model of [null, "m1"]) {
            for (const effort of [null, "high"]) {
              const o: RunOptions = { readDirs, webSearch, images, model, effort };
              const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "lh-test-"));
              const run = async (create: typeof createCodexAdapter, id: string, stdout: string) => {
                const f = fakeSpawn({ stdout });
                const adapter = create({
                  spawn: f.spawn,
                  env: { ["LEARN_" + id + "_PATH"]: "/fake/" + id, PATH: "" },
                  home: "/home/x",
                  tmpRoot,
                  fs,
                  detectTimeoutMs: 30,
                });
                await adapter.run({ ...req(), options: o });
                return f.calls[0].args as string[];
              };
              const codex = await run(createCodexAdapter, "CODEX", OK);
              expect(codex[codex.indexOf("--sandbox") + 1]).toBe("read-only");
              expect(codex).not.toContain("danger-full-access");
              expect(codex).not.toContain("--full-auto");
              const claude = await run(createClaudeAdapter, "CLAUDE", "{}");
              for (const flag of ["--tools", "--allowed-tools"]) {
                const at = claude.indexOf(flag);
                const list = at === -1 ? [] : claude[at + 1].split(",");
                for (const b of bad) expect(list).not.toContain(b);
              }
              const gemini = await run(createGeminiAdapter, "GEMINI", "{}");
              const am = gemini.indexOf("--approval-mode");
              expect(am).not.toBe(-1);
              expect(gemini[am + 1]).toBe("plan");
              for (const t of ["run_shell_command", "write_file", "replace"]) {
                expect(geminiExcluded(o)).toContain(t);
              }
            }
          }
        }
      }
    }
  });
});

describe("settings to cli flags", () => {
  const adaptersFor = () => {
    const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "lh-test-"));
    const claude = fakeSpawn({ stdout: "{}" });
    const gemini = fakeSpawn({ stdout: "{}" });
    return {
      claude,
      gemini,
      claudeAdapter: createClaudeAdapter({
        spawn: claude.spawn,
        env: { LEARN_CLAUDE_PATH: "/fake/claude", PATH: "" },
        home: "/home/x",
        tmpRoot: tmp(),
        fs,
      }),
      geminiAdapter: createGeminiAdapter({
        spawn: gemini.spawn,
        env: { LEARN_GEMINI_PATH: "/fake/gemini", PATH: "" },
        home: "/home/x",
        tmpRoot: tmp(),
        fs,
      }),
    };
  };

  it("model_and_effort_become_codex_flags", async () => {
    const o = runOptions(session(), "/att", {
      ...DEFAULT_SETTINGS,
      clis: {
        ...DEFAULT_SETTINGS.clis,
        codex: { model: "gpt-x", effort: "low" },
        claude: { model: "sonnet", effort: "max" },
      },
    });
    expect(o.model).toBe("gpt-x");
    expect(o.effort).toBe("low");
    const codex = make({ stdout: OK });
    await codex.adapter.run({ ...req(), options: o });
    const a = codex.f.calls[0].args;
    expect(a.slice(a.indexOf("--skip-git-repo-check") + 1)).toEqual([
      "-m",
      "gpt-x",
      "-c",
      "model_reasoning_effort=low",
      "-",
    ]);
  });

  it("blank_settings_add_no_flags", async () => {
    for (const cli of ["codex", "claude", "gemini"] as const) {
      const blank = runOptions({ ...session(), cli }, "/att", DEFAULT_SETTINGS);
      const none = runOptions({ ...session(), cli }, "/att", null);
      for (const o of [blank, none]) {
        expect(o.model).toBeNull();
        expect(o.effort).toBeNull();
      }
      const codex = make({ stdout: OK });
      const x = adaptersFor();
      await codex.adapter.run({ ...req(), options: blank });
      await x.claudeAdapter.run({ ...req(), options: blank });
      await x.geminiAdapter.run({ ...req(), options: blank });
      for (const args of [codex.f.calls[0].args, x.claude.calls[0].args, x.gemini.calls[0].args]) {
        for (const flag of ["-m", "--model", "--effort", "-c"]) expect(args).not.toContain(flag);
        expect(args.some((v: string) => v.startsWith("model_reasoning_effort"))).toBe(false);
      }
    }
  });
});
