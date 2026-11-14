import { describe, expect, it } from "vitest";
import { parseReply, REPLY_JSON_SCHEMA } from "../../src/shared/schema";
import { A, choiceQ, textQ } from "../helpers/fixtures";
import type { Action } from "../../src/shared/types";

const reply = (a: Action) => JSON.stringify({ action: a });

describe("parseReply", () => {
  it("parseReply accepts every action type", () => {
    for (const a of [A.probe(), A.probeDone(), A.plan(), A.predict(), A.explain(), A.done()]) {
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
