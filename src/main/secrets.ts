export function createSecrets(deps: {
  safeStorage: {
    isEncryptionAvailable(): boolean;
    encryptString(s: string): Buffer;
    decryptString(b: Buffer): string;
  };
  fs: typeof import("node:fs/promises");
  file: string;
}): {
  has(): Promise<boolean>;
  get(): Promise<string | null>;
  set(key: string): Promise<{ ok: true } | { ok: false; message: string }>;
  remove(): Promise<void>;
} {
  const get = async (): Promise<string | null> => {
    try {
      const text = deps.safeStorage.decryptString(await deps.fs.readFile(deps.file));
      return text.length > 0 ? text : null;
    } catch {
      return null;
    }
  };
  return {
    get,
    has: async () => (await get()) !== null,
    set: async (key) => {
      const k = key.trim();
      if (k === "" || !/^[\x21-\x7e]+$/.test(k)) return { ok: false, message: "Enter a key." };
      if (!deps.safeStorage.isEncryptionAvailable()) {
        return { ok: false, message: "This Mac cannot store the key safely." };
      }
      try {
        await deps.fs.writeFile(deps.file, deps.safeStorage.encryptString(k), { mode: 0o600 });
        return { ok: true };
      } catch {
        return { ok: false, message: "Could not save. Check free disk space." };
      }
    },
    remove: async () => {
      await deps.fs.rm(deps.file, { force: true });
    },
  };
}

export type Secrets = ReturnType<typeof createSecrets>;
