import { expect, it } from "vitest";
import * as limits from "../../src/shared/limits";

it("limits match the spec", () => {
  expect(limits.MAX_PROBE).toBe(8);
  expect(limits.PLAN_MIN).toBe(2);
  expect(limits.PLAN_MAX).toBe(12);
  expect(limits.MAX_FAILS).toBe(3);
  expect(limits.CALL_TIMEOUT_MS).toBe(180000);
  expect(limits.DETECT_TIMEOUT_MS).toBe(5000);
  expect(limits.KNOWLEDGE_PROMPT_MAX).toBe(200);
  expect(limits.FIELD_MAX).toBe(500);
  expect(limits.ANSWER_TEXT_MAX).toBe(4000);
  expect(limits.OPTIONS_MIN).toBe(2);
  expect(limits.OPTIONS_MAX).toBe(6);
  expect(limits.STDERR_MAX).toBe(200);
});
