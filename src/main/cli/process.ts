import path from "node:path";
import { DETECT_TIMEOUT_MS, STDERR_MAX } from "../../shared/limits";
import type { DetectResult, RunResult } from "../../shared/types";
import { extraPathDirs, resolveCommand } from "./adapter";

export type ProcessDeps = {
  spawn: typeof import("node:child_process").spawn;
  env: NodeJS.ProcessEnv;
  home: string;
  tmpRoot: string;
  fs: typeof import("node:fs");
  detectTimeoutMs?: number;
};
export type Dirs = { root: string; work: string };
export type ProcessResult =
  | { kind: "exit"; code: number | null; stdout: string; stderr: string }
  | { kind: "missing" }
  | { kind: "aborted" }
  | { kind: "timeout" };
export type ProcessSpec = {
  command: string | null;
  args(dirs: Dirs): string[];
  stdin: string;
  signal: AbortSignal;
  timeoutMs: number;
  prepare?(dirs: Dirs): void;
  dropEnv?: string[];
};

export function findCommand(deps: ProcessDeps, name: string, envVar: string): string | null {
  const fromEnv = deps.env[envVar];
  if (fromEnv) return fromEnv;
  return resolveCommand(name, deps.env.PATH ?? "", extraPathDirs(deps.home), deps.fs.existsSync);
}

export function lastStderrLine(stderr: string): string {
  const found = stderr.split("\n").filter((l) => l.trim() !== "");
  if (found.length === 0) return "exited with an error";
  return found[found.length - 1].trim().slice(0, STDERR_MAX);
}

function childEnv(deps: ProcessDeps, drop: string[] = []): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...deps.env,
    PATH: [deps.env.PATH ?? "", ...extraPathDirs(deps.home)].filter(Boolean).join(":"),
  };
  for (const name of drop) delete env[name];
  return env;
}

export function detectVersion(deps: ProcessDeps, command: string | null): Promise<DetectResult> {
  if (!command) return Promise.resolve({ ok: false });
  return new Promise((resolve) => {
    let done = false;
    let stdout = "";
    const child = deps.spawn(command, ["--version"], {
      shell: false,
      cwd: deps.tmpRoot,
      env: childEnv(deps),
    });
    const finish = (result: DetectResult) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish({ ok: false });
    }, deps.detectTimeoutMs ?? DETECT_TIMEOUT_MS);
    child.stdout?.on("data", (d: Buffer) => (stdout += d.toString()));
    child.on("error", () => finish({ ok: false }));
    child.on("close", (code) => {
      const match = /\d+\.\d+\.\d+/.exec(stdout);
      finish(code === 0 && match ? { ok: true, version: match[0] } : { ok: false });
    });
  });
}

export function runProcess(deps: ProcessDeps, spec: ProcessSpec): Promise<ProcessResult> {
  if (!spec.command) return Promise.resolve({ kind: "missing" });
  if (spec.signal.aborted) return Promise.resolve({ kind: "aborted" });
  const command = spec.command;
  let root = "";
  let work = "";
  const removeRoot = () => {
    if (root === "") return;
    try {
      deps.fs.rmSync(root, { recursive: true, force: true });
    } catch {
      /* leave it */
    }
  };
  let dirs: Dirs;
  try {
    root = deps.fs.mkdtempSync(path.join(deps.tmpRoot, "lh-"));
    work = path.join(root, "work");
    dirs = { root, work };
    deps.fs.mkdirSync(work);
    spec.prepare?.(dirs);
  } catch {
    removeRoot();
    return Promise.resolve({
      kind: "exit",
      code: 1,
      stdout: "",
      stderr: "could not prepare the working folder",
    });
  }
  const env = childEnv(deps, spec.dropEnv);
  return new Promise((resolve) => {
    let settled = false;
    let stdout = "";
    let stderr = "";
    const child = deps.spawn(command, spec.args(dirs), {
      cwd: work,
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
      env,
    });
    child.stdin?.on("error", () => {});
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    const onAbort = () => {
      child.kill("SIGKILL");
      finish({ kind: "aborted" });
    };
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish({ kind: "timeout" });
    }, spec.timeoutMs);
    const finish = (result: ProcessResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      spec.signal.removeEventListener("abort", onAbort);
      resolve(result);
      removeRoot();
    };
    spec.signal.addEventListener("abort", onAbort);
    child.stdout?.on("data", (d: string) => (stdout += d));
    child.stderr?.on("data", (d: string) => (stderr += d));
    child.on("error", () => finish({ kind: "missing" }));
    child.on("close", (code) => finish({ kind: "exit", code, stdout, stderr }));
    child.stdin?.end(spec.stdin);
  });
}

export function failureResult(
  r: Exclude<ProcessResult, { kind: "exit" }>,
  label: string,
  timeoutMs: number,
): RunResult {
  if (r.kind === "missing") return { ok: false, kind: "failed", message: label + " CLI not found" };
  if (r.kind === "aborted") return { ok: false, kind: "aborted", message: "stopped" };
  return { ok: false, kind: "timeout", message: "no reply after " + timeoutMs / 1000 + " seconds" };
}
