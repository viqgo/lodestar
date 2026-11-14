import { describe, expect, it } from "vitest";
import {
  OUTLINE_JSON_SCHEMA,
  parseOutline,
  parseReply,
  parseSenior,
  REPLY_JSON_SCHEMA,
  SENIOR_JSON_SCHEMA,
} from "../../src/shared/schema";
import { A, choiceQ, textQ } from "../helpers/fixtures";
import type { Action } from "../../src/shared/types";

const reply = (a: Action) => JSON.stringify({ action: a });

describe("parseReply", () => {
  it("parseReply accepts every action type", () => {
    for (const a of [
      A.probe(),
      A.probeDone(),
      A.plan(),
      A.predict(),
      A.teach(),
      A.explain(),
      A.done(),
    ]) {
      expect(parseReply(reply(a))).toEqual({ ok: true, action: a });
    }
  });

  it("parseReply rejects text that is not JSON", () => {
    expect(parseReply("hello")).toEqual({ ok: false, reason: "not valid JSON" });
  });

  it("parseReply rejects an unknown action type", () => {
    const r = parseReply('{"action":{"type":"dance"}}');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason.startsWith("does not match the schema")).toBe(true);
  });

  it("parseReply rejects a choice question with one option", () => {
    expect(parseReply(reply(A.probe({ ...choiceQ, options: ["a"], correctIndex: 0 }))).ok).toBe(
      false,
    );
  });

  it("parseReply rejects a correctIndex outside the options", () => {
    expect(parseReply(reply(A.probe({ ...choiceQ, correctIndex: 3 }))).ok).toBe(false);
  });

  it("parseReply rejects a text question with options", () => {
    expect(parseReply(reply(A.probe({ ...textQ, options: ["a", "b"] }))).ok).toBe(false);
  });
});

describe("REPLY_JSON_SCHEMA", () => {
  it("REPLY_JSON_SCHEMA is strict everywhere", () => {
    let objects = 0;
    const walk = (node: unknown): void => {
      if (Array.isArray(node)) return node.forEach(walk);
      if (node === null || typeof node !== "object") return;
      const n = node as Record<string, unknown>;
      if (n.type === "object") {
        objects++;
        const props = n.properties as Record<string, unknown>;
        expect(n.additionalProperties).toBe(false);
        expect(n.required).toEqual(Object.keys(props));
        Object.values(props).forEach(walk);
      }
      if (n.items) walk(n.items);
      if (n.anyOf) walk(n.anyOf);
      if (n.properties && n.type !== "object") Object.values(n.properties as object).forEach(walk);
    };
    walk(REPLY_JSON_SCHEMA);
    expect(objects).toBeGreaterThanOrEqual(9);
  });
});

describe("parseReply strictness", () => {
  it("parseReply rejects an extra property", () => {
    expect(parseReply('{"action":{"type":"probe_done","known":[],"goal":"g","extra":1}}').ok).toBe(
      false,
    );
  });

  it("parseReply rejects an empty question prompt", () => {
    expect(parseReply(JSON.stringify({ action: A.probe({ ...choiceQ, prompt: "" }) })).ok).toBe(
      false,
    );
  });
});

describe("the teach action", () => {
  it("parseReply accepts a teach action", () => {
    expect(parseReply(reply(A.teach())).ok).toBe(true);
    const extra = JSON.stringify({ action: { ...A.teach(), extra: 1 } });
    expect(parseReply(extra).ok).toBe(false);
  });

  it("reply JSON schema lists seven variants", () => {
    const variants = (REPLY_JSON_SCHEMA as any).properties.action.anyOf as any[];
    expect(variants.length).toBe(7);
    expect(variants.some((v) => JSON.stringify(v.properties.type.enum) === '["teach"]')).toBe(true);
  });
});

const U = { id: "u1", title: "One", goal: "Goal", files: ["a.txt"] };

describe("subject schemas", () => {
  it("OUTLINE_JSON_SCHEMA requires every unit field", () => {
    const schema = OUTLINE_JSON_SCHEMA as {
      required: string[];
      properties: { units: { items: { required: string[]; additionalProperties: boolean } } };
    };
    expect(schema.required).toEqual(["units"]);
    expect(schema.properties.units.items.required).toEqual(["id", "title", "goal", "files"]);
    expect(schema.properties.units.items.additionalProperties).toBe(false);
  });

  it("parseOutline accepts an outline and refuses bad JSON and wrong shapes", () => {
    expect(parseOutline(JSON.stringify({ units: [U] }))).toEqual({
      ok: true,
      value: { units: [U] },
    });
    expect(parseOutline("nope")).toEqual({ ok: false, reason: "not valid JSON" });
    const bad = parseOutline(JSON.stringify({ units: [{ id: "u1" }] }));
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.reason.startsWith("does not match the schema: ")).toBe(true);
    expect(parseOutline(JSON.stringify({ units: [], extra: 1 })).ok).toBe(false);
  });

  it("SENIOR_JSON_SCHEMA allows the three changes and null", () => {
    const schema = SENIOR_JSON_SCHEMA as {
      required: string[];
      properties: {
        change: { anyOf: { properties?: { kind?: { enum: string[] } }; type?: string }[] };
      };
    };
    expect(schema.required).toEqual(["markdown", "change"]);
    const any = schema.properties.change.anyOf;
    expect(any.map((a) => a.properties?.kind?.enum[0] ?? a.type)).toEqual([
      "add",
      "remove",
      "reorder",
      "null",
    ]);
  });

  it("parseSenior accepts a reply with and without a change", () => {
    const none = { markdown: "hi", change: null };
    expect(parseSenior(JSON.stringify(none))).toEqual({ ok: true, value: none });
    for (const change of [
      { kind: "add", unit: U, afterId: null },
      { kind: "add", unit: U, afterId: "u0" },
      { kind: "remove", unitId: "u1" },
      { kind: "reorder", order: ["u2", "u1"] },
    ]) {
      const value = { markdown: "hi", change };
      expect(parseSenior(JSON.stringify(value))).toEqual({ ok: true, value });
    }
  });

  it("parseSenior refuses an unknown change kind and extra fields", () => {
    const kind = parseSenior(JSON.stringify({ markdown: "x", change: { kind: "rename" } }));
    expect(kind.ok).toBe(false);
    const extra = parseSenior(
      JSON.stringify({ markdown: "x", change: { kind: "remove", unitId: "u1", why: "y" } }),
    );
    expect(extra.ok).toBe(false);
    expect(parseSenior(JSON.stringify({ markdown: "x", change: null, more: 1 })).ok).toBe(false);
    expect(parseSenior("{")).toEqual({ ok: false, reason: "not valid JSON" });
  });
});
