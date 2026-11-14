import type { CliId, DetectResult, RunRequest, RunResult } from "../../shared/types";

export interface CliAdapter {
  id: CliId;
  label: string;
  retries: number;
  detect(): Promise<DetectResult>;
  run(req: RunRequest): Promise<RunResult>;
}

export function extraPathDirs(home: string): string[] {
  return ["/opt/homebrew/bin", "/usr/local/bin", `${home}/.local/bin`, `${home}/.npm-global/bin`];
}

export function resolveCommand(
  name: string,
  pathEnv: string,
  extraDirs: string[],
  exists: (p: string) => boolean,
): string | null {
  const dirs = [...pathEnv.split(":").filter((d) => d !== ""), ...extraDirs];
  for (const dir of dirs) {
    const candidate = dir + "/" + name;
    if (exists(candidate)) return candidate;
  }
  return null;
}
