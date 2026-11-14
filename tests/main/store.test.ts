import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createStore } from "../../src/main/store";
import { session } from "../helpers/fixtures";

const mk = async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "lh-store-"));
  return { dir, store: await createStore(dir, fsp) };
};

const withId = (n: number, updatedAt: string) => ({
  ...session(),
  id: "s_0000000" + n + "-0000-0000-0000-000000000000",
  updatedAt,
});

const writeThree = async (store: Awaited<ReturnType<typeof mk>>["store"]) => {
  await store.writeSession(withId(1, "2026-01-01T00:00:00.000Z"));
  await store.writeSession(withId(2, "2026-01-03T00:00:00.000Z"));
  await store.writeSession(withId(3, "2026-01-02T00:00:00.000Z"));
};

describe("store sessions", () => {
  it("a session round-trips", async () => {
    const { dir, store } = await mk();
    await store.writeSession(session());
    expect(await store.readSession(session().id)).toEqual(session());
    await expect(
      fsp.access(path.join(dir, "sessions", session().id + ".json")),
    ).resolves.toBeUndefined();
  });

  it("save_is_atomic", async () => {
    const { dir, store } = await mk();
    await store.writeSession(session());
    const failing = await createStore(dir, {
      ...fsp,
      rename: async () => {
        throw new Error("disk");
      },
    });
    await expect(failing.writeSession({ ...session(), topic: "NEW" })).rejects.toThrow();
    expect((await store.readSession(session().id))?.topic).toBe("T");
  });

  it("sessions_listed_newest_first", async () => {
    const { store } = await mk();
    await writeThree(store);
    const ids = (await store.listSessions()).map((s) => s.id);
    expect(ids.map((id) => id.charAt(9))).toEqual(["2", "3", "1"]);
  });

  it("unparsable files are skipped", async () => {
    const { dir, store } = await mk();
    await writeThree(store);
    await fsp.writeFile(path.join(dir, "sessions", "s_broken.json"), "nope", "utf8");
    expect(await store.listSessions()).toHaveLength(3);
  });

  it("readSession returns null for a bad or missing id", async () => {
    const { store } = await mk();
    expect(await store.readSession("../etc/passwd")).toBeNull();
    expect(await store.readSession("s_00000009-0000-0000-0000-000000000000")).toBeNull();
  });

  it("deleteSession removes the file and tolerates a missing one", async () => {
    const { store } = await mk();
    await store.writeSession(session());
    await store.deleteSession(session().id);
    expect(await store.readSession(session().id)).toBeNull();
    await expect(store.deleteSession(session().id)).resolves.toBeUndefined();
  });
});

const ki = (n: number, createdAt: string) => ({
  id: "k_0000000" + n + "-0000-0000-0000-000000000000",
  text: "t" + n,
  sessionId: "s",
  nodeId: "n1",
  createdAt,
});

describe("store knowledge", () => {
  it("knowledge is empty when the file is missing", async () => {
    const { store } = await mk();
    expect(await store.readKnowledge()).toEqual([]);
  });

  it("knowledge_listed_newest_first", async () => {
    const { store } = await mk();
    await store.addKnowledge([ki(1, "2026-01-01T00:00:00.000Z")]);
    await store.addKnowledge([ki(2, "2026-01-02T00:00:00.000Z")]);
    expect((await store.readKnowledge()).map((k) => k.text)).toEqual(["t2", "t1"]);
  });

  it("concurrent knowledge writes keep every item", async () => {
    const { store } = await mk();
    await Promise.all([
      store.addKnowledge([ki(1, "2026-01-01T00:00:00.000Z")]),
      store.addKnowledge([ki(2, "2026-01-02T00:00:00.000Z")]),
      store.addKnowledge([ki(3, "2026-01-03T00:00:00.000Z")]),
    ]);
    expect(await store.readKnowledge()).toHaveLength(3);
  });

  it("adding the same knowledge item twice stores it once", async () => {
    const { store } = await mk();
    const a = ki(1, "2026-01-01T00:00:00.000Z");
    const b = {
      ...ki(1, "2026-01-02T00:00:00.000Z"),
      id: "k_00000009-0000-0000-0000-000000000000",
    };
    await store.addKnowledge([a]);
    await store.addKnowledge([b]);
    const all = await store.readKnowledge();
    expect(all).toHaveLength(1);
    expect(all[0]!.id).toBe(a.id);
  });

  it("knowledge_item_deleted", async () => {
    const { dir, store } = await mk();
    await store.addKnowledge([ki(1, "2026-01-01T00:00:00.000Z")]);
    await store.addKnowledge([ki(2, "2026-01-02T00:00:00.000Z")]);
    await store.deleteKnowledge(ki(1, "").id);
    expect((await store.readKnowledge()).map((k) => k.text)).toEqual(["t2"]);
    const onDisk = JSON.parse(await fsp.readFile(path.join(dir, "knowledge.json"), "utf8"));
    expect(onDisk).toHaveLength(1);
  });

  it("deleting an unknown id changes nothing", async () => {
    const { store } = await mk();
    await store.addKnowledge([ki(1, "2026-01-01T00:00:00.000Z")]);
    await expect(
      store.deleteKnowledge("k_99999999-0000-0000-0000-000000000000"),
    ).resolves.toBeUndefined();
    expect((await store.readKnowledge()).map((k) => k.text)).toEqual(["t1"]);
  });
});
