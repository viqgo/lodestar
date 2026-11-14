import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { listFolder } from "../../src/main/files";

const tmp = () => fsp.mkdtemp(path.join(os.tmpdir(), "lh-files-"));

describe("listFolder", () => {
  it("file_list_skips_hidden_and_caps_at_200", async () => {
    const dir = await tmp();
    await fsp.mkdir(path.join(dir, ".git"));
    await fsp.writeFile(path.join(dir, ".git", "config"), "x");
    await fsp.writeFile(path.join(dir, ".hidden"), "x");
    await fsp.mkdir(path.join(dir, "node_modules"));
    await fsp.writeFile(path.join(dir, "node_modules", "m.js"), "x");
    await fsp.mkdir(path.join(dir, "docs"));
    for (let i = 0; i < 205; i++) {
      await fsp.writeFile(path.join(dir, "docs", "f" + String(i).padStart(3, "0") + ".txt"), "x");
    }
    const out = await listFolder(fsp, dir, 200);
    expect(out).not.toBeNull();
    expect(out!.files).toHaveLength(200);
    expect(out!.more).toBe(5);
    expect(out!.files.some((f) => /^\.|node_modules|\.git/.test(f.path))).toBe(false);
  });

  it("listFolder sorts by path and reports sizes", async () => {
    const dir = await tmp();
    await fsp.mkdir(path.join(dir, "b"));
    await fsp.writeFile(path.join(dir, "b", "z.txt"), "12345");
    await fsp.writeFile(path.join(dir, "b.txt"), "123");
    await fsp.writeFile(path.join(dir, "a.txt"), "1");
    await fsp.symlink(path.join(dir, "a.txt"), path.join(dir, "link.txt"));
    const out = await listFolder(fsp, dir, 200);
    expect(out).toEqual({
      files: [
        { path: "a.txt", bytes: 1 },
        { path: "b.txt", bytes: 3 },
        { path: "b/z.txt", bytes: 5 },
      ],
      more: 0,
    });
  });

  it("listFolder is null for a missing folder or a file", async () => {
    const dir = await tmp();
    await fsp.writeFile(path.join(dir, "f.txt"), "x");
    expect(await listFolder(fsp, path.join(dir, "nope"), 200)).toBeNull();
    expect(await listFolder(fsp, path.join(dir, "f.txt"), 200)).toBeNull();
  });

  it("app_never_writes_into_material_folder", async () => {
    const dir = await tmp();
    await fsp.mkdir(path.join(dir, "sub"));
    await fsp.writeFile(path.join(dir, "a.txt"), "x");
    await fsp.writeFile(path.join(dir, "sub", "b.txt"), "y");
    const snap = async () => {
      const names = (await fsp.readdir(dir, { recursive: true })).sort();
      const times: number[] = [];
      for (const n of names) times.push((await fsp.stat(path.join(dir, n))).mtimeMs);
      return { names, times };
    };
    const before = await snap();
    await listFolder(fsp, dir, 200);
    expect(await snap()).toEqual(before);
  });

  it("listFolder reports an unreadable root as missing", async () => {
    const dir = await tmp();
    const fake = {
      ...fsp,
      readdir: async () => {
        throw new Error("EACCES");
      },
    } as unknown as typeof fsp;
    expect(await listFolder(fake, dir, 200)).toBeNull();
  });

  it("listFolder stops walking at 5000 files", async () => {
    const dir = await tmp();
    let calls = 0;
    const fake = {
      ...fsp,
      readdir: async () => {
        calls++;
        return Array.from({ length: 6000 }, (_, i) => ({
          name: "f" + i + ".txt",
          isSymbolicLink: () => false,
          isDirectory: () => false,
          isFile: () => true,
        }));
      },
      stat: async (p: string) => (p === dir ? await fsp.stat(dir) : { size: 1 }),
    } as unknown as typeof fsp;
    const out = await listFolder(fake, dir, 200);
    expect(calls).toBe(1);
    expect(out!.files.length).toBeLessThanOrEqual(200);
    expect(out!.files.length + out!.more).toBe(5000);
  });

  it("listFolder stops walking after 5000 folders", async () => {
    const dir = await tmp();
    let calls = 0;
    const fake = {
      ...fsp,
      readdir: async (p: string) => {
        calls++;
        if (p !== dir) return [];
        return Array.from({ length: 6000 }, (_, i) => ({
          name: "d" + i,
          isSymbolicLink: () => false,
          isDirectory: () => true,
          isFile: () => false,
        }));
      },
    } as unknown as typeof fsp;
    expect(await listFolder(fake, dir, 200)).toEqual({ files: [], more: 0 });
    expect(calls).toBeLessThanOrEqual(5000);
  });
});
