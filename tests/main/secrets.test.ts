import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createSecrets } from "../../src/main/secrets";

const KEY = "dg_test_key_123";

const fakeSafeStorage = (available = true) => ({
  isEncryptionAvailable: () => available,
  encryptString: (s: string) => Buffer.from(Buffer.from(s, "utf8").map((b) => b ^ 0x5a)),
  decryptString: (b: Buffer) => {
    if (b.length === 0) throw new Error("empty");
    return Buffer.from(b.map((x) => x ^ 0x5a)).toString("utf8");
  },
});

const setup = async (safeStorage = fakeSafeStorage()) => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "lh-secrets-"));
  const file = path.join(dir, "deepgram.key");
  return { file, secrets: createSecrets({ safeStorage, fs: fsp, file }) };
};

describe("secrets", () => {
  it("key_is_encrypted_and_never_sent_to_window (file)", async () => {
    const { file, secrets } = await setup();
    expect(await secrets.set(KEY)).toEqual({ ok: true });
    const bytes = await fsp.readFile(file);
    expect(bytes.toString("latin1")).not.toContain(KEY);
    expect(bytes.toString("utf8")).not.toContain(KEY);
    expect(await secrets.get()).toBe(KEY);
    expect(await secrets.has()).toBe(true);
  });

  it("secrets report no key when the file is missing or cannot be decrypted", async () => {
    const { file, secrets } = await setup();
    expect(await secrets.has()).toBe(false);
    expect(await secrets.get()).toBeNull();
    await fsp.writeFile(file, "x");
    const broken = createSecrets({
      safeStorage: {
        ...fakeSafeStorage(),
        decryptString: () => {
          throw new Error("cannot decrypt");
        },
      },
      fs: fsp,
      file,
    });
    expect(await broken.has()).toBe(false);
    expect(await broken.get()).toBeNull();
  });

  it("secrets refuse when the Mac cannot encrypt", async () => {
    const { file, secrets } = await setup(fakeSafeStorage(false));
    expect(await secrets.set(KEY)).toEqual({
      ok: false,
      message: "This Mac cannot store the key safely.",
    });
    await expect(fsp.access(file)).rejects.toThrow();
  });

  it("secrets refuse a blank key and trim a good one", async () => {
    const { secrets } = await setup();
    expect(await secrets.set("  ")).toEqual({ ok: false, message: "Enter a key." });
    expect(await secrets.set(" k1 ")).toEqual({ ok: true });
    expect(await secrets.get()).toBe("k1");
  });

  it("secrets refuse a key with a line break or space inside", async () => {
    const { secrets } = await setup();
    expect(await secrets.set("ab cd")).toEqual({ ok: false, message: "Enter a key." });
    expect(await secrets.set("ab\ncd")).toEqual({ ok: false, message: "Enter a key." });
    expect(await secrets.get()).toBeNull();
  });

  it("remove deletes the key file and tolerates a missing one", async () => {
    const { file, secrets } = await setup();
    await secrets.set(KEY);
    await secrets.remove();
    await expect(fsp.access(file)).rejects.toThrow();
    await expect(secrets.remove()).resolves.toBeUndefined();
  });
});
