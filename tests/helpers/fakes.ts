import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import type { Action, CliId, RunRequest, RunResult } from "../../src/shared/types";
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
  const requests: RunRequest[] = [];
  const adapter: CliAdapter = {
    id: "codex",
    label: "Codex",
    retries: 1,
    detect: async () => ({ ok: true, version: "0.0.0" }),
    run: async (req: RunRequest): Promise<RunResult> => {
      prompts.push(req.prompt);
      requests.push(req);
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
  return { adapter, prompts, requests };
}

export function fakeAdapters(
  codex: CliAdapter,
  others: Partial<Record<CliId, CliAdapter>> = {},
): Record<CliId, CliAdapter> {
  return { codex, claude: others.claude ?? codex, gemini: others.gemini ?? codex };
}

export function fakeWebSocket() {
  const sockets: FakeSocket[] = [];
  class FakeSocket extends EventEmitter {
    url: string;
    options: unknown;
    readyState = 0;
    sent: (string | Buffer)[] = [];
    closed = false;
    terminated = false;
    constructor(url: string, options?: unknown) {
      super();
      this.url = url;
      this.options = options;
      sockets.push(this);
    }
    send(d: string | Buffer) {
      this.sent.push(d);
    }
    close() {
      this.closed = true;
      this.readyState = 3;
    }
    terminate() {
      this.terminated = true;
      this.readyState = 3;
    }
    open() {
      this.readyState = 1;
      this.emit("open");
    }
    message(m: unknown) {
      this.emit("message", Buffer.from(typeof m === "string" ? m : JSON.stringify(m)));
    }
    fail(text: string) {
      this.emit("error", new Error(text));
    }
    drop() {
      this.readyState = 3;
      this.emit("close", 1006, Buffer.alloc(0));
    }
  }
  return { WebSocket: FakeSocket, sockets };
}
