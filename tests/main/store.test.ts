import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createStore } from "../../src/main/store";
import { newReview } from "../../src/core/review";
import { K, review, session, subject } from "../helpers/fixtures";

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

describe("store deleted lessons", () => {
  it("delete_during_write_does_not_resurrect", async () => {
    const { dir, store } = await mk();
    await store.writeSession(session());
    await store.deleteSession(session().id);
    const more = { ...session(), events: [...session().events, ...session().events.slice(0, 1)] };
    await expect(store.writeSession(more)).resolves.toBeUndefined();
    expect(await store.readSession(session().id)).toBeNull();
    expect(await store.listSessions()).toEqual([]);
    expect(await fsp.readdir(path.join(dir, "sessions"))).toEqual([]);
    const other = { ...session(), id: "s_0000000f-0000-0000-0000-000000000000" };
    await store.writeSession(other);
    expect(await store.readSession(other.id)).toEqual(other);
    const fresh = await createStore(dir, fsp);
    await fresh.writeSession(session());
    expect(await fresh.readSession(session().id)).toEqual(session());
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

describe("store profile", () => {
  it("profile reads empty when no file exists", async () => {
    const { dir, store } = await mk();
    expect(await store.readProfile()).toBe("");
    await fsp.writeFile(path.join(dir, "profile.json"), '{"instructions": 5}', "utf8");
    expect(await store.readProfile()).toBe("");
    await fsp.writeFile(path.join(dir, "profile.json"), "garbage", "utf8");
    expect(await store.readProfile()).toBe("");
  });

  it("profile is saved and read back", async () => {
    const { dir, store } = await mk();
    await store.writeProfile("Be brief.");
    expect(await store.readProfile()).toBe("Be brief.");
    expect((await fsp.readdir(dir)).filter((n) => n.endsWith(".tmp"))).toEqual([]);
  });
});

const SID = "s_00000001-0000-0000-0000-000000000000";

describe("store attachments", () => {
  const source = async (name: string, content = "hello") => {
    const d = await fsp.mkdtemp(path.join(os.tmpdir(), "lh-src-"));
    const p = path.join(d, name);
    await fsp.writeFile(p, content);
    return p;
  };

  it("attach_copies_into_lesson_folder", async () => {
    const { dir, store } = await mk();
    const a = await store.addAttachment(SID, await source("my notes.md"), 0, 10);
    expect(a).toEqual({
      ok: true,
      attachment: { file: "a1-my_notes.md", name: "my notes.md", bytes: 5, kind: "text" },
    });
    const stored = path.join(dir, "attachments", SID, "a1-my_notes.md");
    expect(await fsp.readFile(stored, "utf8")).toBe("hello");
    expect(store.attachmentsDir(SID)).toBe(path.join(dir, "attachments", SID));
    const b = await store.addAttachment(SID, await source("my notes.md"), 1, 10);
    expect(b.ok && b.attachment.file).toBe("a2-my_notes.md");
    await expect(fsp.access(path.join(dir, "attachments", SID, "a2-my_notes.md"))).resolves.toBe(
      undefined,
    );
  });

  it("addAttachment refuses by type, size and count and copies nothing", async () => {
    const { dir, store } = await mk();
    expect(await store.addAttachment(SID, await source("x.exe"), 0, 10)).toEqual({
      ok: false,
      message: "That file type is not supported.",
    });
    const big = await source("big.pdf");
    await fsp.truncate(big, 20 * 1024 * 1024 + 1);
    expect(await store.addAttachment(SID, big, 0, 10)).toEqual({
      ok: false,
      message: "That file is larger than 20 MB.",
    });
    expect(await store.addAttachment(SID, await source("a.txt"), 10, 10)).toEqual({
      ok: false,
      message: "A lesson can hold at most 10 files.",
    });
    await expect(fsp.access(path.join(dir, "attachments", SID))).rejects.toThrow();
  });

  it("addAttachment reports an unreadable file", async () => {
    const { store } = await mk();
    expect(await store.addAttachment(SID, "/no/such/file.txt", 0, 10)).toEqual({
      ok: false,
      message: "That file could not be read.",
    });
  });

  it("delete_lesson_removes_attachments", async () => {
    const { store } = await mk();
    await store.writeSession({ ...session(), id: SID });
    const a = await store.addAttachment(SID, await source("a.txt"), 0, 10);
    expect(a.ok).toBe(true);
    await store.removeAttachment(SID, "a1-a.txt");
    await expect(fsp.access(path.join(store.attachmentsDir(SID), "a1-a.txt"))).rejects.toThrow();
    await store.removeAttachment(SID, "a1-a.txt");
    await store.addAttachment(SID, await source("b.txt"), 0, 10);
    await store.deleteSession(SID);
    await expect(fsp.access(store.attachmentsDir(SID))).rejects.toThrow();
  });

  it("old session files get the new defaults", async () => {
    const { dir, store } = await mk();
    const old: Record<string, unknown> = { ...session(), id: SID };
    delete old.folder;
    delete old.attachments;
    delete old.webSearch;
    await fsp.writeFile(path.join(dir, "sessions", SID + ".json"), JSON.stringify(old), "utf8");
    const want = { folder: null, attachments: [], webSearch: false };
    expect(await store.readSession(SID)).toMatchObject(want);
    expect((await store.listSessions())[0]).toMatchObject(want);
  });

  it("removeAttachment ignores names it did not store", async () => {
    const { dir, store } = await mk();
    const outside = path.join(dir, "attachments", "y");
    await fsp.mkdir(path.join(dir, "attachments"), { recursive: true });
    await fsp.writeFile(path.join(dir, "x"), "keep");
    await fsp.writeFile(outside, "keep");
    await fsp.mkdir(store.attachmentsDir(SID), { recursive: true });
    for (const bad of ["../x", "a1-x/../../y", path.join(dir, "x"), "../../x", "a1-"]) {
      await store.removeAttachment(SID, bad);
    }
    expect(await fsp.readFile(path.join(dir, "x"), "utf8")).toBe("keep");
    expect(await fsp.readFile(outside, "utf8")).toBe("keep");
  });

  it("app_never_writes_into_material_folder_when_attaching", async () => {
    const { store } = await mk();
    const folder = await fsp.mkdtemp(path.join(os.tmpdir(), "lh-mat-"));
    await fsp.writeFile(path.join(folder, "n.txt"), "notes");
    const snap = async () => {
      const names = (await fsp.readdir(folder, { recursive: true })).sort();
      const out: unknown[] = [];
      for (const n of names) {
        const st = await fsp.stat(path.join(folder, n));
        out.push([n, st.mtimeMs, await fsp.readFile(path.join(folder, n), "utf8")]);
      }
      return out;
    };
    const before = await snap();
    await store.writeSession({ ...session(), id: SID });
    const a = await store.addAttachment(SID, path.join(folder, "n.txt"), 0, 10);
    expect(a.ok).toBe(true);
    await store.removeAttachment(SID, "a1-n.txt");
    await store.deleteSession(SID);
    expect(await snap()).toEqual(before);
  });

  it("attachment names with odd characters and long names stay safe", async () => {
    const { store } = await mk();
    const odd = await source("a b..c\nd.txt");
    const r = await store.addAttachment(SID, odd, 0, 10);
    expect(r.ok && r.attachment.file).toBe("a1-a_b..c_d.txt");
    expect(r.ok && r.attachment.name).toBe("a b..c\nd.txt");
    const long = await source("x".repeat(200) + ".pdf");
    const l = await store.addAttachment(SID, long, 1, 10);
    expect(l.ok && l.attachment.file.endsWith(".pdf")).toBe(true);
    expect(l.ok && l.attachment.file.length).toBeLessThanOrEqual(3 + 80);
    const one = await source("same.txt");
    const two = await source("same.txt");
    const a = await store.addAttachment(SID, one, 2, 10);
    const b = await store.addAttachment(SID, two, 3, 10);
    expect(a.ok && a.attachment.file).toBe("a1-same.txt");
    expect(b.ok && b.attachment.file).toBe("a2-same.txt");
  });
});

describe("store subjects", () => {
  const UID = (n: number) => "u_0000000" + n + "-0000-0000-0000-000000000000";
  const SUB = (n: number, updatedAt: string) => ({ ...subject(), id: UID(n), updatedAt });
  const source = async (name: string) => {
    const d = await fsp.mkdtemp(path.join(os.tmpdir(), "lh-src-"));
    const p = path.join(d, name);
    await fsp.writeFile(p, "hello");
    return p;
  };

  it("a subject round-trips", async () => {
    const { dir, store } = await mk();
    await store.writeSubject(subject());
    expect(await store.readSubject(subject().id)).toEqual(subject());
    await expect(
      fsp.access(path.join(dir, "subjects", subject().id + ".json")),
    ).resolves.toBeUndefined();
  });

  it("subjects are listed newest first and unreadable files are skipped", async () => {
    const { dir, store } = await mk();
    await store.writeSubject(SUB(1, "2026-01-01T00:00:00.000Z"));
    await store.writeSubject(SUB(2, "2026-01-03T00:00:00.000Z"));
    await store.writeSubject(SUB(3, "2026-01-02T00:00:00.000Z"));
    await fsp.writeFile(path.join(dir, "subjects", "bad.json"), "{nope", "utf8");
    expect((await store.listSubjects()).map((s) => s.id)).toEqual([UID(2), UID(3), UID(1)]);
    expect(await store.readSubject(UID(9))).toBeNull();
  });

  it("listSubjects skips files that are not subjects", async () => {
    const { dir, store } = await mk();
    await store.writeSubject(SUB(1, "2026-01-01T00:00:00.000Z"));
    const w = (name: string, body: unknown) =>
      fsp.writeFile(path.join(dir, "subjects", name), JSON.stringify(body), "utf8");
    await w("notes.json", SUB(5, "2026-01-05T00:00:00.000Z"));
    await w(UID(6) + ".json", null);
    await w(UID(7) + ".json", { id: UID(7), updatedAt: "2026-01-07T00:00:00.000Z" });
    await w(UID(8) + ".json", { id: 8, updatedAt: "x", events: [] });
    await w(UID(9) + ".json", []);
    expect((await store.listSubjects()).map((s) => s.id)).toEqual([UID(1)]);
  });

  it("readSubject refuses ids that are not subject ids", async () => {
    const { store } = await mk();
    await store.writeSession({ ...session(), id: SID });
    expect(await store.readSubject(SID)).toBeNull();
    expect(await store.readSubject("../x")).toBeNull();
  });

  it("delete_subject_removes_its_lessons_keeps_knowledge (store)", async () => {
    const { dir, store } = await mk();
    const S1 = "s_00000001-0000-0000-0000-000000000000";
    const S2 = "s_00000002-0000-0000-0000-000000000000";
    const S3 = "s_00000003-0000-0000-0000-000000000000";
    await store.writeSubject(subject());
    await store.writeSession({ ...session(), id: S1, subjectId: subject().id, unitId: "u1" });
    await store.writeSession({ ...session(), id: S2, subjectId: subject().id, unitId: "u2" });
    await store.writeSession({ ...session(), id: S3 });
    expect((await store.addAttachment(S1, await source("a.txt"), 0, 10)).ok).toBe(true);
    await store.addKnowledge([
      ki(1, "2026-01-01T00:00:00.000Z"),
      ki(2, "2026-01-02T00:00:00.000Z"),
    ]);
    const knowledgeBefore = await store.readKnowledge();
    const otherBefore = await store.readSession(S3);
    await store.deleteSubject(subject().id);
    expect(await store.readSubject(subject().id)).toBeNull();
    expect(await store.readSession(S1)).toBeNull();
    expect(await store.readSession(S2)).toBeNull();
    await expect(fsp.access(path.join(dir, "attachments", S1))).rejects.toThrow();
    expect(await store.readSession(S3)).toEqual(otherBefore);
    expect(await store.readKnowledge()).toEqual(knowledgeBefore);
    await expect(store.deleteSubject("../x")).resolves.toBeUndefined();
  });

  it("old session files get subjectId and unitId defaults", async () => {
    const { dir, store } = await mk();
    const old: Record<string, unknown> = { ...session(), id: SID };
    delete old.subjectId;
    delete old.unitId;
    await fsp.writeFile(path.join(dir, "sessions", SID + ".json"), JSON.stringify(old), "utf8");
    const want = { subjectId: null, unitId: null };
    expect(await store.readSession(SID)).toMatchObject(want);
    expect((await store.listSessions())[0]).toMatchObject(want);
  });
});

describe("store settings", () => {
  it("settings_file_round_trips", async () => {
    const { dir, store } = await mk();
    const value = { voice: { language: "de", voice: "aura-2-x" } };
    await store.writeSettings(value);
    expect(await store.readSettings()).toEqual(value);
    await expect(fsp.access(path.join(dir, "settings.json"))).resolves.toBeUndefined();
  });

  it("settings are the defaults for a missing or broken file", async () => {
    const { dir, store } = await mk();
    const defaults = { voice: { language: "en", voice: "aura-2-thalia-en" } };
    expect(await store.readSettings()).toEqual(defaults);
    await fsp.writeFile(path.join(dir, "settings.json"), "not json", "utf8");
    expect(await store.readSettings()).toEqual(defaults);
    await fsp.writeFile(path.join(dir, "settings.json"), "[1]", "utf8");
    expect(await store.readSettings()).toEqual(defaults);
  });
});

describe("store reviews", () => {
  it("reviews round-trip and are empty without a file", async () => {
    const { dir, store } = await mk();
    expect(await store.readReviews()).toEqual([]);
    const two = [review(1), review(2, { box: 3 })];
    await store.writeReviews(two);
    expect(await store.readReviews()).toEqual(two);
    await expect(fsp.access(path.join(dir, "reviews.json"))).resolves.toBeUndefined();
  });

  it("readReviews drops what is not a review", async () => {
    const { dir, store } = await mk();
    const file = path.join(dir, "reviews.json");
    await fsp.writeFile(file, "not json", "utf8");
    expect(await store.readReviews()).toEqual([]);
    await fsp.writeFile(file, "{}", "utf8");
    expect(await store.readReviews()).toEqual([]);
    const good = review(1);
    await fsp.writeFile(
      file,
      JSON.stringify([
        good,
        { ...review(2), box: 6 },
        { itemId: "x", box: 1, front: null },
        { ...review(3), front: 3 },
      ]),
      "utf8",
    );
    expect(await store.readReviews()).toEqual([good]);
  });

  it("a review with an unreadable date counts as box 1", async () => {
    const { dir, store } = await mk();
    await fsp.writeFile(
      path.join(dir, "reviews.json"),
      JSON.stringify([review(1), { ...review(2), due: "soon" }]),
      "utf8",
    );
    expect(await store.readReviews()).toEqual([review(1)]);
  });

  it("updateReviews drops reviews of deleted items and serialises with record", async () => {
    const { store } = await mk();
    await store.addKnowledge([K(1), K(2)]);
    await store.writeReviews([...(await store.readReviews()), review(9)]);
    await Promise.all([
      store.updateReviews((rs) => rs.map((r) => (r.itemId === K(1).id ? { ...r, box: 3 } : r))),
      store.updateReviews((rs) => rs.map((r) => (r.itemId === K(2).id ? { ...r, front: "Q" } : r))),
    ]);
    const after = await store.readReviews();
    expect(after.map((r) => r.itemId)).toEqual([K(1).id, K(2).id]);
    expect(after.find((r) => r.itemId === K(1).id)?.box).toBe(3);
    expect(after.find((r) => r.itemId === K(2).id)?.front).toBe("Q");
  });

  it("a new knowledge item gets a review in box one", async () => {
    const { store } = await mk();
    await store.addKnowledge([K(1), K(2)]);
    expect(await store.readReviews()).toEqual([
      newReview(K(1).id, K(1).createdAt),
      newReview(K(2).id, K(2).createdAt),
    ]);
    await store.addKnowledge([K(1)]);
    expect(await store.readReviews()).toHaveLength(2);
    await store.writeReviews([...(await store.readReviews()), review(3, { box: 4 })]);
    await store.addKnowledge([K(3)]);
    expect((await store.readReviews()).find((r) => r.itemId === K(3).id)?.box).toBe(4);
    expect(await store.readReviews()).toHaveLength(3);
  });

  it("delete_item_removes_card_and_schedule", async () => {
    const { dir, store } = await mk();
    await store.addKnowledge([K(1), K(2)]);
    await store.writeReviews([review(1, { front: "Q" }), review(2)]);
    await store.deleteKnowledge(K(1).id);
    expect((await store.readKnowledge()).map((k) => k.id)).toEqual([K(2).id]);
    expect(await store.readReviews()).toEqual([review(2)]);
    const before = [
      await fsp.readFile(path.join(dir, "knowledge.json"), "utf8"),
      await fsp.readFile(path.join(dir, "reviews.json"), "utf8"),
    ];
    await store.deleteKnowledge("k_99999999-0000-0000-0000-000000000000");
    expect([
      await fsp.readFile(path.join(dir, "knowledge.json"), "utf8"),
      await fsp.readFile(path.join(dir, "reviews.json"), "utf8"),
    ]).toEqual(before);
  });
});
