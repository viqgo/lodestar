import { z } from "zod";
import { OPTIONS_MAX, OPTIONS_MIN } from "./limits";
import type { Action } from "./types";

const QuestionSchema = z
  .strictObject({
    kind: z.enum(["choice", "text"]),
    prompt: z.string().min(1),
    options: z.array(z.string()),
    correctIndex: z.number().int().nullable(),
  })
  .superRefine((q, ctx) => {
    if (q.kind === "choice") {
      if (q.options.length < OPTIONS_MIN || q.options.length > OPTIONS_MAX) {
        ctx.addIssue({
          code: "custom",
          path: ["options"],
          message: `must have ${OPTIONS_MIN} to ${OPTIONS_MAX} options`,
        });
      }
      if (q.correctIndex !== null && (q.correctIndex < 0 || q.correctIndex >= q.options.length)) {
        ctx.addIssue({
          code: "custom",
          path: ["correctIndex"],
          message: "must be null or an index into options",
        });
      }
    } else {
      if (q.options.length !== 0) {
        ctx.addIssue({
          code: "custom",
          path: ["options"],
          message: "must be empty for a text question",
        });
      }
      if (q.correctIndex !== null) {
        ctx.addIssue({
          code: "custom",
          path: ["correctIndex"],
          message: "must be null for a text question",
        });
      }
    }
  });

const VerdictSchema = z.enum(["pass", "fail"]).nullable();
const NodeSchema = z.strictObject({
  id: z.string().min(1),
  title: z.string().min(1),
  deps: z.array(z.string()),
});

const ActionSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("probe"), question: QuestionSchema }),
  z.strictObject({ type: z.literal("probe_done"), known: z.array(z.string()), goal: z.string() }),
  z.strictObject({ type: z.literal("plan"), nodes: z.array(NodeSchema) }),
  z.strictObject({
    type: z.literal("predict"),
    nodeId: z.string(),
    verdict: VerdictSchema,
    feedback: z.string().nullable(),
    question: QuestionSchema,
  }),
  z.strictObject({
    type: z.literal("explain"),
    nodeId: z.string(),
    verdict: VerdictSchema,
    feedback: z.string().nullable(),
    markdown: z.string(),
    check: QuestionSchema,
  }),
  z.strictObject({
    type: z.literal("lesson_done"),
    verdict: VerdictSchema,
    feedback: z.string().nullable(),
    summary: z.string(),
    learned: z.array(z.strictObject({ nodeId: z.string(), text: z.string() })),
  }),
]);

export const ReplySchema = z.strictObject({ action: ActionSchema });

const obj = (properties: Record<string, object>) => ({
  type: "object",
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
});
const str = { type: "string" };
const nullableStr = { type: ["string", "null"] };
const strList = { type: "array", items: str };
const lit = (value: string) => ({ type: "string", enum: [value] });
const verdict = { type: ["string", "null"], enum: ["pass", "fail", null] };
const question = obj({
  kind: { type: "string", enum: ["choice", "text"] },
  prompt: str,
  options: strList,
  correctIndex: { type: ["integer", "null"] },
});
const node = obj({ id: str, title: str, deps: strList });
const learned = obj({ nodeId: str, text: str });
export const REPLY_JSON_SCHEMA: object = obj({
  action: {
    anyOf: [
      obj({ type: lit("probe"), question }),
      obj({ type: lit("probe_done"), known: strList, goal: str }),
      obj({ type: lit("plan"), nodes: { type: "array", items: node } }),
      obj({ type: lit("predict"), nodeId: str, verdict, feedback: nullableStr, question }),
      obj({
        type: lit("explain"),
        nodeId: str,
        verdict,
        feedback: nullableStr,
        markdown: str,
        check: question,
      }),
      obj({
        type: lit("lesson_done"),
        verdict,
        feedback: nullableStr,
        summary: str,
        learned: { type: "array", items: learned },
      }),
    ],
  },
});

export function parseReply(
  text: string,
): { ok: true; action: Action } | { ok: false; reason: string } {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, reason: "not valid JSON" };
  }
  const result = ReplySchema.safeParse(json);
  if (!result.success) {
    const issue = result.error.issues[0];
    return {
      ok: false,
      reason: "does not match the schema: " + issue.path.join(".") + " " + issue.message,
    };
  }
  return { ok: true, action: result.data.action };
}
