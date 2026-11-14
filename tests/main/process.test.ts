import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  detectVersion,
  failureResult,
  findCommand,
  runProcess,
  type ProcessDeps,
  type ProcessSpec,
} from "../../src/main/cli/process";
import { fakeSpawn, type FakePlan } from "../helpers/fakes";

function make(plan: FakePlan, env: NodeJS.ProcessEnv = { PATH: "" }, fsDep: typeof fs = fs) {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "lh-test-"));
  const f = fakeSpawn(plan);
  const deps: ProcessDeps = {
    spawn: f.spawn,
    env,
    home: "/home/x",
    tmpRoot,
    fs: fsDep,
    detectTimeoutMs: 20,
  };
  return { deps, f, tmpRoot };
}

const spec = (over: Partial<ProcessSpec> = {}): ProcessSpec => ({
  command: "/fake/x",
  args: () => ["go"],
  stdin: "PROMPT",
  signal: new AbortController().signal,
  timeoutMs: 1000,
  ...over,
});
const empty = (dir: string) => fs.readdirSync(dir).length === 0;

describe("findCommand", () => {
  it("path_overrides_are_used", () => {
    const { deps } = make({}, { X_PATH: "/fake/x", PATH: "" });
    expect(findCommand(deps, "x", "X_PATH")).toBe("/fake/x");

    const found = make({}, { PATH: "" }, {
      ...fs,
      existsSync: (p: string) => p === "/opt/homebrew/bin/x",
    } as typeof fs);
    expect(findCommand(found.deps, "x", "X_PATH")).toBe("/opt/homebrew/bin/x");

    const none = make({}, { PATH: "" }, { ...fs, existsSync: () => false } as typeof fs);
    expect(findCommand(none.deps, "x", "X_PATH")).toBeNull();
  });
});

describe("detectVersion", () => {
  it("detectVersion returns the version", async () => {
    const { deps, f } = make({ stdout: "tool 1.2.3\n" });
    expect(await detectVersion(deps, "/fake/x")).toEqual({ ok: true, version: "1.2.3" });
    expect(f.calls[0].args).toEqual(["--version"]);
  });

  it("detectVersion fails on a missing command, a non-zero exit and a timeout", async () => {
    expect(await detectVersion(make({}).deps, null)).toEqual({ ok: false });
    expect(await detectVersion(make({ missing: true }).deps, "/fake/x")).toEqual({ ok: false });
    expect(await detectVersion(make({ code: 1 }).deps, "/fake/x")).toEqual({ ok: false });
    expect(await detectVersion(make({ hang: true }).deps, "/fake/x")).toEqual({ ok: false });
  });
});

describe("detectVersion environment", () => {
  it("detectVersion runs with the extended PATH and a neutral folder", async () => {
    const { deps, f, tmpRoot } = make({ stdout: "tool 1.2.3\n" }, { PATH: "/bin" });
    await detectVersion(deps, "/fake/x");
    const opts = f.calls[0].opts;
    expect(opts.env.PATH.startsWith("/bin:")).toBe(true);
    expect(opts.env.PATH).toContain("/opt/homebrew/bin");
    expect(opts.cwd).toBe(tmpRoot);
    expect(opts.shell).toBe(false);
  });
});

describe("runProcess cleanup", () => {
  it("runProcess resolves even when cleanup fails", async () => {
    const failing = {
      ...fs,
      rmSync: () => {
        throw new Error("EBUSY");
      },
    } as typeof fs;
    const { deps } = make({ stdout: "x" }, { PATH: "" }, failing);
    const r = await runProcess(deps, spec());
    expect(r.kind).toBe("exit");
  });

  it("runProcess cleans up when preparing fails", async () => {
    const { deps, f, tmpRoot } = make({});
    const r = await runProcess(
      deps,
      spec({
        prepare: () => {
          throw new Error("nope");
        },
      }),
    );
    expect(r).toEqual({
      kind: "exit",
      code: 1,
      stdout: "",
      stderr: "could not prepare the working folder",
    });
    expect(f.calls.length).toBe(0);
    expect(empty(tmpRoot)).toBe(true);
  });

  it("temp dir is removed after a failed exit and a spawn error", async () => {
    const a = make({ code: 1, stderr: "x" });
    await runProcess(a.deps, spec());
    expect(empty(a.tmpRoot)).toBe(true);
    const b = make({ missing: true });
    await runProcess(b.deps, spec());
    expect(empty(b.tmpRoot)).toBe(true);
  });
});

describe("runProcess", () => {
  it("runProcess runs without a shell in a new empty folder", async () => {
    const { deps, f, tmpRoot } = make({});
    let wasEmpty = false;
    await runProcess(
      deps,
      spec({
        args: (d) => {
          wasEmpty = empty(d.work);
          return [];
        },
      }),
    );
    const opts = f.calls[0].opts;
    expect(opts.shell).toBe(false);
    expect(opts.cwd.endsWith("/work")).toBe(true);
    expect(opts.cwd.startsWith(tmpRoot)).toBe(true);
    expect(wasEmpty).toBe(true);
  });

  it("runProcess calls prepare before spawning and passes dirs to args", async () => {
    const { deps, f } = make({});
    const order: string[] = [];
    await runProcess(
      deps,
      spec({
        prepare: (d) => {
          order.push("prepare");
          fs.writeFileSync(path.join(d.root, "x.txt"), "hi");
        },
        args: (d) => {
          order.push("args");
          return ["--file", path.join(d.root, "x.txt")];
        },
      }),
    );
    expect(order).toEqual(["prepare", "args"]);
    expect(f.calls[0].args[0]).toBe("--file");
    expect(f.calls[0].args[1].endsWith("/x.txt")).toBe(true);
  });

  it("runProcess writes stdin and returns stdout, stderr and the exit code", async () => {
    const { deps, f } = make({ stdout: "out", stderr: "err", code: 3 });
    expect(await runProcess(deps, spec())).toEqual({
      kind: "exit",
      code: 3,
      stdout: "out",
      stderr: "err",
    });
    expect(f.calls[0].stdin).toBe("PROMPT");
  });

  it("temp_dir_removed_for_every_cli", async () => {
    const a = make({ stdout: "ok" });
    await runProcess(a.deps, spec());
    expect(a.f.calls.length).toBe(1);
    expect(empty(a.tmpRoot)).toBe(true);

    const b = make({ hang: true });
    const ctl = new AbortController();
    const p = runProcess(b.deps, spec({ signal: ctl.signal }));
    setTimeout(() => ctl.abort(), 10);
    await p;
    expect(b.f.calls.length).toBe(1);
    expect(empty(b.tmpRoot)).toBe(true);

    const c = make({ hang: true });
    await runProcess(c.deps, spec({ timeoutMs: 20 }));
    expect(c.f.calls.length).toBe(1);
    expect(empty(c.tmpRoot)).toBe(true);
  });

  it("timeout_and_stop_work_for_every_cli", async () => {
    const a = make({});
    expect(await runProcess(a.deps, spec({ command: null }))).toEqual({ kind: "missing" });
    expect(a.f.calls.length).toBe(0);

    const b = make({ missing: true });
    expect(await runProcess(b.deps, spec())).toEqual({ kind: "missing" });

    const c = make({});
    const done = new AbortController();
    done.abort();
    expect(await runProcess(c.deps, spec({ signal: done.signal }))).toEqual({ kind: "aborted" });
    expect(c.f.calls.length).toBe(0);
    expect(empty(c.tmpRoot)).toBe(true);

    const d = make({ hang: true });
    const ctl = new AbortController();
    const p = runProcess(d.deps, spec({ signal: ctl.signal }));
    setTimeout(() => ctl.abort(), 10);
    expect(await p).toEqual({ kind: "aborted" });
    expect(d.f.calls[0].killed).toBe(true);

    const e = make({ hang: true });
    expect(await runProcess(e.deps, spec({ timeoutMs: 20 }))).toEqual({ kind: "timeout" });
    expect(e.f.calls[0].killed).toBe(true);
  });

  it("runProcess drops the named env variables and extends PATH", async () => {
    const { deps, f } = make({}, { A: "1", B: "2", PATH: "/bin" });
    await runProcess(deps, spec({ dropEnv: ["A"] }));
    const env = f.calls[0].opts.env;
    expect(env.A).toBeUndefined();
    expect(env.B).toBe("2");
    expect(env.PATH.startsWith("/bin:")).toBe(true);
    expect(env.PATH).toContain("/opt/homebrew/bin");
  });
});

describe("finder PATH", () => {
  it("finder_path_finds_homebrew_clis", async () => {
    const finderPath = "/usr/bin:/bin:/usr/sbin:/sbin";
    for (const p of [
      "/opt/homebrew/bin/claude",
      "/usr/local/bin/claude",
      "/home/x/.local/bin/claude",
      "/home/x/.npm-global/bin/claude",
    ]) {
      const fsDep = { ...fs, existsSync: (q: string) => q === p } as typeof fs;
      const { deps, f } = make({ stdout: "2.1.322 (Claude Code)\n" }, { PATH: finderPath }, fsDep);
      expect(findCommand(deps, "claude", "LEARN_CLAUDE_PATH")).toBe(p);
      expect(await detectVersion(deps, p)).toEqual({ ok: true, version: "2.1.322" });
      expect(f.calls[0].cmd).toBe(p);
      expect(f.calls[0].opts.env.PATH).toBe(
        "/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin:/usr/local/bin:/home/x/.local/bin:/home/x/.npm-global/bin",
      );
    }
  });
});

describe("failureResult", () => {
  it("failureResult maps the three kinds", () => {
    expect(failureResult({ kind: "missing" }, "Claude Code", 180000)).toEqual({
      ok: false,
      kind: "failed",
      message: "Claude Code CLI not found",
    });
    expect(failureResult({ kind: "aborted" }, "Claude Code", 180000)).toEqual({
      ok: false,
      kind: "aborted",
      message: "stopped",
    });
    expect(failureResult({ kind: "timeout" }, "Claude Code", 180000)).toEqual({
      ok: false,
      kind: "timeout",
      message: "no reply after 180 seconds",
    });
  });
});
