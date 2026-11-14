import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  GEMINI_EXCLUDED_TOOLS,
  createGeminiAdapter,
  extractJsonObject,
  geminiErrorMessage,
  geminiPrompt,
} from "../../src/main/cli/gemini";
import { fakeSpawn, type FakePlan } from "../helpers/fakes";

const AUTH_ERROR =
  '{"session_id":"s","error":{"type":"Error","message":"Please set an Auth method","code":41}}';

function make(
  plan: FakePlan,
  env: NodeJS.ProcessEnv = { LEARN_GEMINI_PATH: "/fake/gemini", PATH: "" },
) {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "lh-test-"));
  const f = fakeSpawn(plan);
  const adapter = createGeminiAdapter({
    spawn: f.spawn,
    env,
    home: "/home/x",
    tmpRoot,
    fs,
    detectTimeoutMs: 30,
  });
  return { adapter, f, tmpRoot };
}

const req = (schema: object = { a: 1 }) => ({
  prompt: "PROMPT",
  schema,
  signal: new AbortController().signal,
  timeoutMs: 1000,
});

describe("extractJsonObject", () => {
  it("gemini_reads_fenced_or_plain_json", () => {
    expect(extractJsonObject('{"a":1}')).toBe('{"a":1}');
    expect(extractJsonObject('```json\n{"a":1}\n```')).toBe('{"a":1}');
    expect(extractJsonObject('Here you go: {"a":{"b":2}} thanks')).toBe('{"a":{"b":2}}');
  });

  it("extractJsonObject ignores braces inside strings", () => {
    expect(extractJsonObject('{"a":"} {"}')).toBe('{"a":"} {"}');
    expect(extractJsonObject('{"a":"x\\"}"}')).toBe('{"a":"x\\"}"}');
    expect(extractJsonObject("no json")).toBeNull();
    expect(extractJsonObject('{"a":1')).toBeNull();
  });
});

describe("geminiErrorMessage", () => {
  it("gemini_error_uses_json_message", () => {
    expect(geminiErrorMessage("warn\n" + AUTH_ERROR + "\n")).toBe("Please set an Auth method");
    const long = "x".repeat(300);
    const stderr = JSON.stringify({ error: { message: long } });
    expect(geminiErrorMessage(stderr)).toBe("x".repeat(200));
  });

  it("geminiErrorMessage falls back to the last stderr line", () => {
    expect(geminiErrorMessage("a\nboom\n")).toBe("boom");
  });
});

describe("gemini parsing with extra braces", () => {
  it("geminiErrorMessage skips earlier braces", () => {
    expect(geminiErrorMessage("warn {not json}\n" + AUTH_ERROR + "\n")).toBe(
      "Please set an Auth method",
    );
  });

  it("gemini adapter reads the response when stdout has extra lines", async () => {
    const { adapter } = make({
      stdout: 'Loaded {config}\n{"session_id":"s","response":"{\\"action\\":1}"}\nbye\n',
    });
    expect(await adapter.run(req())).toEqual({ ok: true, text: '{"action":1}', usage: null });
  });
});

describe("geminiPrompt", () => {
  it("gemini_prompt_carries_the_schema", async () => {
    const p = geminiPrompt("P", { type: "object" });
    expect(p.startsWith("P\n# Reply format\n")).toBe(true);
    expect(p.endsWith('{"type":"object"}\n')).toBe(true);
    const { adapter, f } = make({ stdout: '{"response":"{}"}' });
    const r = req({ type: "object" });
    await adapter.run(r);
    expect(f.calls[0].stdin).toBe(geminiPrompt(r.prompt, r.schema));
  });
});

describe("gemini adapter", () => {
  it("gemini_spawn_uses_safe_flags", async () => {
    const { adapter, f } = make({ stdout: '{"response":"{}"}' });
    await adapter.run(req());
    const call = f.calls[0];
    expect(call.args).toEqual(["-p", "", "-o", "json", "--approval-mode", "plan", "--skip-trust"]);
    expect(call.opts.shell).toBe(false);
    expect(call.opts.cwd.endsWith("/work")).toBe(true);
  });

  it("gemini_writes_tool_exclusion_settings", async () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "lh-test-"));
    const f = fakeSpawn({ stdout: '{"response":"{}"}' });
    let seen: unknown = null;
    const spawn = ((cmd: string, args: string[], opts: any) => {
      seen = JSON.parse(fs.readFileSync(path.join(opts.cwd, ".gemini", "settings.json"), "utf8"));
      return f.spawn(cmd, args, opts);
    }) as any;
    const adapter = createGeminiAdapter({
      spawn,
      env: { LEARN_GEMINI_PATH: "/fake/gemini", PATH: "" },
      home: "/home/x",
      tmpRoot,
      fs,
    });
    await adapter.run(req());
    expect(seen).toEqual({ tools: { exclude: GEMINI_EXCLUDED_TOOLS } });
    expect(GEMINI_EXCLUDED_TOOLS).toContain("run_shell_command");
    expect(GEMINI_EXCLUDED_TOOLS).toContain("write_file");
    expect(GEMINI_EXCLUDED_TOOLS).toContain("google_web_search");
  });

  it("gemini adapter returns the JSON object from response", async () => {
    const { adapter } = make({
      stdout: JSON.stringify({ response: '```json\n{"action":1}\n```' }),
    });
    expect(await adapter.run(req())).toEqual({ ok: true, text: '{"action":1}', usage: null });
  });

  it("gemini adapter passes unusable text on and reports no message", async () => {
    expect(
      await make({ stdout: JSON.stringify({ response: "I cannot" }) }).adapter.run(req()),
    ).toEqual({ ok: true, text: "I cannot", usage: null });
    const none = { ok: false, kind: "failed", message: "Gemini returned no message" };
    expect(await make({ stdout: "{}" }).adapter.run(req())).toEqual(none);
    expect(await make({ stdout: "junk" }).adapter.run(req())).toEqual(none);
    expect(await make({ code: 41, stderr: AUTH_ERROR }).adapter.run(req())).toEqual({
      ok: false,
      kind: "failed",
      message: "Please set an Auth method",
    });
  });

  it("gemini adapter has two retries and uses LEARN_GEMINI_PATH", async () => {
    const a = make({ stdout: "0.1.2\n" });
    expect(a.adapter.retries).toBe(2);
    expect(a.adapter.label).toBe("Gemini");
    expect(a.adapter.id).toBe("gemini");
    await a.adapter.detect();
    expect(a.f.calls[0].cmd).toBe("/fake/gemini");
    const b = make({ stdout: '{"response":"{}"}' });
    await b.adapter.run(req());
    expect(b.f.calls[0].cmd).toBe("/fake/gemini");
  });
});
