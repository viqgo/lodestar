import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import type { Action, RunRequest, RunResult } from "../../src/shared/types";
import type { CliAdapter } from "../../src/main/cli/adapter";

export type FakePlan = {
  stdout?: string;
  stderr?: string;
  code?: number;
  hang?: boolean;
  missing?: boolean;
  stdoutChunks?: Buffer[];
  stdinError?: boolean;
};
export type FakeCall = { cmd: string; args: string[]; opts: any; stdin: string; killed: boolean };

/** A stand-in for child_process.spawn. Each spawn uses the next plan (the last one repeats). */
export function fakeSpawn(...plans: FakePlan[]) {
  const calls: FakeCall[] = [];
  const spawn = (cmd: string, args: string[], opts: any) => {
    const plan = plans[Math.min(calls.length, plans.length - 1)] ?? {};
    const call: FakeCall = { cmd, args, opts, stdin: "", killed: false };
    calls.push(call);
    const child: any = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.stdin = new PassThrough();
    child.stdin.on("data", (d: Buffer) => (call.stdin += d.toString()));
    child.kill = () => {
      call.killed = true;
      setImmediate(() => child.emit("close", null));
      return true;
    };
    setImmediate(() => {
      if (plan.missing)
        return child.emit("error", Object.assign(new Error("spawn ENOENT"), { code: "ENOENT" }));
      if (plan.hang) return;
      if (plan.stdinError)
        child.stdin.emit("error", Object.assign(new Error("write EPIPE"), { code: "EPIPE" }));
      if (plan.stdoutChunks) {
        for (const c of plan.stdoutChunks) child.stdout.write(c);
        child.stdout.end();
      } else child.stdout.end(plan.stdout ?? "");
      child.stderr.end(plan.stderr ?? "");
      setImmediate(() => child.emit("close", plan.code ?? 0));
    });
    return child;
  };
  return { spawn: spawn as any, calls };
}

/** Replies in order. An Action is wrapped as a good reply; a string is returned as raw text; a RunResult is returned as is. */
export function fakeAdapter(...replies: (Action | string | RunResult)[]) {
  const prompts: string[] = [];
  const adapter: CliAdapter = {
    id: "codex",
    label: "Codex",
    retries: 1,
    detect: async () => ({ ok: true, version: "0.0.0" }),
    run: async (req: RunRequest): Promise<RunResult> => {
      prompts.push(req.prompt);
      const r = replies[prompts.length - 1];
      if (r === undefined) return { ok: false, kind: "failed", message: "no more fake replies" };
      if (typeof r === "string") return { ok: true, text: r, usage: null };
      if ("ok" in r) return r;
      return {
        ok: true,
        text: JSON.stringify({ action: r }),
        usage: { inputTokens: 1, outputTokens: 1 },
      };
    },
  };
  return { adapter, prompts };
}
