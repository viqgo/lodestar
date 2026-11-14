import path from "node:path";
import type { FileEntry } from "../shared/types";

export async function listFolder(
  fs: typeof import("node:fs/promises"),
  folder: string,
  max: number,
): Promise<{ files: FileEntry[]; more: number } | null> {
  try {
    if (!(await fs.stat(folder)).isDirectory()) return null;
  } catch {
    return null;
  }
  const all: FileEntry[] = [];
  const walk = async (dir: string, rel: string): Promise<void> => {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith(".") || e.isSymbolicLink()) continue;
      const childRel = rel === "" ? e.name : rel + "/" + e.name;
      if (e.isDirectory()) {
        if (e.name === "node_modules") continue;
        await walk(path.join(dir, e.name), childRel);
      } else if (e.isFile()) {
        try {
          all.push({ path: childRel, bytes: (await fs.stat(path.join(dir, e.name))).size });
        } catch {
          // skip unreadable entries
        }
      }
    }
  };
  await walk(folder, "");
  all.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { files: all.slice(0, max), more: Math.max(0, all.length - max) };
}
