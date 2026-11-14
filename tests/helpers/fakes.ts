import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";

export type FakePlan = {
  stdout?: string;
  stderr?: string;
  code?: number;
  hang?: boolean;
  missing?: boolean;
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
      child.stdout.end(plan.stdout ?? "");
      child.stderr.end(plan.stderr ?? "");
      setImmediate(() => child.emit("close", plan.code ?? 0));
    });
    return child;
  };
  return { spawn: spawn as any, calls };
}
