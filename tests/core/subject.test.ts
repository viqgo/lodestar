import { describe, expect, it } from "vitest";
import {
  applyChange,
  checkChange,
  deriveSubject,
  handoverNote,
  renderSubjectSection,
  unitStatuses,
  validateNewSubject,
  validateOutline,
} from "../../src/core/subject";
import type { Unit } from "../../src/shared/types";
import {
  A,
  SE,
  UNITS,
  act,
  cont,
  pick,
  readySubject,
  say,
  session,
  subject,
  toCheck,
  toTeach,
} from "../helpers/fixtures";

const unit = (id: string, extra: Partial<Unit> = {}): Unit => ({
  id,
  title: "T " + id,
  goal: "G " + id,
  files: [],
  ...extra,
});
/** n1 passed; n2 passed, or shaky after three fails; then lesson_done */
const doneEvents = (shaky: boolean) => [
  ...toTeach,
  ...toCheck("n1"),
  pick(1),
  act(A.predict("n2")),
  say(),
  act(A.teach("n2")),
  cont(),
  act(A.explain("n2")),
  ...(shaky ? [pick(0), act(A.explain("n2")), pick(0), act(A.explain("n2")), pick(0)] : [pick(1)]),
  act(A.done()),
];
const many = (n: number): Unit[] => Array.from({ length: n }, (_, i) => unit("u" + i));

describe("subject rules", () => {
  it("new_subject_needs_name_and_folder", () => {
    const text = "Enter a name and choose a folder.";
    expect(validateNewSubject("   ", "/x")).toBe(text);
    expect(validateNewSubject("Name", null)).toBe(text);
    expect(validateNewSubject(" Name ", "/x")).toBeNull();
  });

  it("validateNewSubject allows 100 characters and refuses 101", () => {
    expect(validateNewSubject("a".repeat(100), "/x")).toBeNull();
    expect(validateNewSubject("a".repeat(101), "/x")).toBe("Enter a name and choose a folder.");
  });

  it("outline_rejects_bad_sizes_and_duplicate_ids", () => {
    expect(validateOutline(many(1), [])).toEqual({
      ok: false,
      reason: "outline must have 2 to 30 units",
    });
    expect(validateOutline(many(31), [])).toEqual({
      ok: false,
      reason: "outline must have 2 to 30 units",
    });
    expect(validateOutline([unit("a"), unit("a")], [])).toEqual({
      ok: false,
      reason: "duplicate unit id: a",
    });
    expect(validateOutline(many(30), [])).toEqual({ ok: true, units: many(30) });
  });

  it("validateOutline rejects empty fields, bad ids and over-long titles or goals", () => {
    const empty = "empty id, title or goal";
    expect(validateOutline([unit("a", { title: "  " }), unit("b")], [])).toEqual({
      ok: false,
      reason: empty,
    });
    expect(validateOutline([unit("a", { goal: "" }), unit("b")], [])).toEqual({
      ok: false,
      reason: empty,
    });
    expect(validateOutline([unit(" "), unit("b")], [])).toEqual({ ok: false, reason: empty });
    expect(validateOutline([unit("A"), unit("b")], [])).toEqual({
      ok: false,
      reason: "invalid unit id: A",
    });
    expect(validateOutline([unit("-a"), unit("b")], [])).toEqual({
      ok: false,
      reason: "invalid unit id: -a",
    });
    const tooLong = "title or goal too long";
    expect(
      validateOutline([unit("a", { title: "t".repeat(200), goal: "g".repeat(500) }), unit("b")], [])
        .ok,
    ).toBe(true);
    expect(validateOutline([unit("a", { title: "t".repeat(201) }), unit("b")], [])).toEqual({
      ok: false,
      reason: tooLong,
    });
    expect(validateOutline([unit("a", { goal: "g".repeat(501) }), unit("b")], [])).toEqual({
      ok: false,
      reason: tooLong,
    });
  });

  it("outline_drops_unknown_files", () => {
    const units = [unit("a", { files: ["x.txt", "gone.txt"] }), unit("b", { files: ["y.txt"] })];
    expect(validateOutline(units, ["x.txt", "y.txt"])).toEqual({
      ok: true,
      units: [unit("a", { files: ["x.txt"] }), unit("b", { files: ["y.txt"] })],
    });
  });

  it("deriveSubject moves through outline, review and ready", () => {
    expect(deriveSubject([]).phase).toBe("outline");
    expect(deriveSubject([SE.outline()])).toMatchObject({ phase: "review", units: UNITS });
    expect(deriveSubject(readySubject)).toMatchObject({
      phase: "ready",
      units: UNITS,
      awaitingReply: false,
      pendingChange: null,
    });
  });

  it("deriveSubject collects chat, pending change and notes", () => {
    const change = { kind: "remove", unitId: "u3" } as const;
    const state = deriveSubject([...readySubject, SE.message("hello"), SE.note("u1", "s1")]);
    expect(state.awaitingReply).toBe(true);
    expect(state.chat).toEqual([{ who: "owner", markdown: "hello" }]);
    expect(state.notes).toHaveLength(1);
    const replied = deriveSubject([...readySubject, SE.message("hello"), SE.reply("ok", change)]);
    expect(replied.awaitingReply).toBe(false);
    expect(replied.pendingChange).toEqual(change);
    expect(replied.chat).toEqual([
      { who: "owner", markdown: "hello" },
      { who: "tutor", markdown: "ok" },
    ]);
    const second = deriveSubject([
      ...readySubject,
      SE.message("a"),
      SE.reply("r1", change),
      SE.message("b"),
      SE.reply("r2", null),
    ]);
    expect(second.pendingChange).toBeNull();
    const twice = deriveSubject([...readySubject, SE.message("a"), SE.message("b")]);
    expect(twice.awaitingReply).toBe(true);
  });

  it("deriveSubject applies an accepted change and ignores a dismissed one", () => {
    const change = { kind: "remove", unitId: "u3" } as const;
    const base = [...readySubject, SE.message(), SE.reply("ok", change)];
    expect(deriveSubject([...base, SE.change(true)]).units.map((u) => u.id)).toEqual(["u1", "u2"]);
    const dismissed = deriveSubject([...base, SE.change(false)]);
    expect(dismissed.units).toEqual(UNITS);
    expect(dismissed.pendingChange).toBeNull();
  });

  it("deriveSubject throws on an impossible event", () => {
    expect(() => deriveSubject([SE.accepted()])).toThrow("corrupt subject at event 0");
    expect(() => deriveSubject([...readySubject, SE.reply()])).toThrow(
      "corrupt subject at event 2",
    );
    expect(() => deriveSubject([...readySubject, SE.change(true)])).toThrow(
      "corrupt subject at event 2",
    );
    expect(() => deriveSubject([SE.outline(), SE.outline()])).toThrow("corrupt subject at event 1");
  });

  it("cannot_remove_started_unit", () => {
    const remove = { kind: "remove", unitId: "u1" } as const;
    expect(checkChange(UNITS, ["u1"], remove)).toBe("unit already started: u1");
    expect(checkChange(UNITS, [], remove)).toBeNull();
    expect(checkChange(UNITS.slice(0, 2), [], remove)).toBe("outline must have 2 to 30 units");
    expect(checkChange(UNITS, [], { kind: "remove", unitId: "zz" })).toBe("unknown unit: zz");
  });

  it("checkChange accepts and refuses add and reorder", () => {
    expect(checkChange(UNITS, [], null)).toBeNull();
    const fresh = unit("u4");
    expect(checkChange(UNITS, [], { kind: "add", unit: fresh, afterId: null })).toBeNull();
    expect(checkChange(UNITS, [], { kind: "add", unit: fresh, afterId: "u2" })).toBeNull();
    expect(checkChange(UNITS, [], { kind: "add", unit: unit("u1"), afterId: null })).toBe(
      "duplicate unit id: u1",
    );
    expect(checkChange(UNITS, [], { kind: "add", unit: fresh, afterId: "zz" })).toBe(
      "unknown unit: zz",
    );
    expect(checkChange(UNITS, [], { kind: "add", unit: unit("U4"), afterId: null })).toBe(
      "invalid unit id: U4",
    );
    expect(checkChange(many(30), [], { kind: "add", unit: unit("x"), afterId: null })).toBe(
      "outline must have 2 to 30 units",
    );
    expect(checkChange(UNITS, [], { kind: "reorder", order: ["u3", "u1", "u2"] })).toBeNull();
    const bad = "reorder must list every unit id exactly once";
    expect(checkChange(UNITS, [], { kind: "reorder", order: ["u1", "u2"] })).toBe(bad);
    expect(checkChange(UNITS, [], { kind: "reorder", order: ["u1", "u1", "u2"] })).toBe(bad);
    expect(checkChange(UNITS, [], { kind: "reorder", order: ["u1", "u2", "zz"] })).toBe(bad);
  });

  it("applyChange adds, removes and reorders", () => {
    const fresh = unit("u4");
    const ids = (u: Unit[]) => u.map((x) => x.id);
    expect(ids(applyChange(UNITS, { kind: "add", unit: fresh, afterId: null }))).toEqual([
      "u4",
      "u1",
      "u2",
      "u3",
    ]);
    expect(ids(applyChange(UNITS, { kind: "add", unit: fresh, afterId: "u2" }))).toEqual([
      "u1",
      "u2",
      "u4",
      "u3",
    ]);
    expect(ids(applyChange(UNITS, { kind: "remove", unitId: "u2" }))).toEqual(["u1", "u3"]);
    expect(ids(applyChange(UNITS, { kind: "reorder", order: ["u3", "u1", "u2"] }))).toEqual([
      "u3",
      "u1",
      "u2",
    ]);
  });

  it("unit_statuses_follow_their_lessons", () => {
    const probing = { ...session([act(A.probe())]), id: "s1", unitId: "u1" };
    const done = (id: string, unitId: string, shaky: boolean) => ({
      ...session(doneEvents(shaky)),
      id,
      unitId,
    });
    const corrupt = { ...session([say()]), id: "bad", unitId: "u3" };
    const sessions = [probing, done("s2", "u2", false), done("s3", "u3", true), corrupt];
    expect(unitStatuses(UNITS, [probing])).toEqual([
      { unitId: "u1", sessionId: "s1", status: "in_progress", shaky: 0 },
      { unitId: "u2", sessionId: null, status: "not_started", shaky: 0 },
      { unitId: "u3", sessionId: null, status: "not_started", shaky: 0 },
    ]);
    expect(unitStatuses(UNITS, sessions)).toEqual([
      { unitId: "u1", sessionId: "s1", status: "in_progress", shaky: 0 },
      { unitId: "u2", sessionId: "s2", status: "done", shaky: 0 },
      { unitId: "u3", sessionId: "s3", status: "done", shaky: 1 },
    ]);
  });

  it("finished_unit_writes_handover_note (content)", () => {
    const s = { ...session(doneEvents(true)), id: "s9", unitId: "u2" };
    expect(handoverNote(s)).toEqual({
      unitId: "u2",
      sessionId: "s9",
      summary: "s",
      learned: ["t1"],
      shaky: ["Two"],
    });
  });
});

describe("renderSubjectSection", () => {
  const noteOf = (unitId: string, summary: string, learned: string[], shaky: string[]) =>
    ({ kind: "note", at: "t", note: { unitId, sessionId: "s", summary, learned, shaky } }) as const;

  it("renderSubjectSection marks the current unit and lists its files", () => {
    const state = deriveSubject(readySubject);
    expect(renderSubjectSection(subject(readySubject), state, "u1")).toBe(
      [
        "# Subject",
        "Name: Course",
        "1. u1 - Unit one (this lesson)",
        "2. u2 - Unit two",
        "3. u3 - Unit three",
        "",
        "# Files for this unit",
        "- a.txt",
        "",
        "# Earlier units",
        "(none yet)",
      ].join("\n"),
    );
    const none = renderSubjectSection(subject(readySubject), state, "u3");
    expect(none).toContain("# Files for this unit\n(none listed)\n");
    expect(renderSubjectSection(subject(readySubject), state, "zz")).toContain(
      "# Files for this unit\n(none listed)\n",
    );
  });

  it("renderSubjectSection lists the notes of the other units only", () => {
    const events = [
      ...readySubject,
      noteOf("u1", "Did one.", ["a", "b"], ["c"]),
      noteOf("u2", "Did two.", ["d"], []),
    ];
    const text = renderSubjectSection(subject(events), deriveSubject(events), "u2");
    expect(text.split("# Earlier units\n")[1]).toBe("u1: Did one. Learned: a; b. Shaky: c.");
    expect(text).not.toContain("Did two.");
  });
});
