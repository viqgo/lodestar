import { buildAskPrompt, buildFrontsPrompt, buildGradePrompt } from "../core/practicePrompt";
import { newReview } from "../core/review";
import { NO_OPTIONS } from "../shared/clis";
import { CALL_TIMEOUT_MS, CARD_BATCH } from "../shared/limits";
import {
  ASK_JSON_SCHEMA,
  FRONTS_JSON_SCHEMA,
  GRADE_JSON_SCHEMA,
  parseAsk,
  parseFronts,
  parseGrade,
} from "../shared/schema";
import type { CliId, KnowledgeItem, Question, TurnError, Verdict } from "../shared/types";
import type { CliAdapter } from "./cli/adapter";
import { callModel } from "./call";
import type { Store } from "./store";

const BUSY: TurnError = { kind: "busy", message: "A reply is already on the way." };
const GONE: TurnError = { kind: "not_found", message: "This item no longer exists." };

export function createPractice(deps: {
  adapters: Record<CliId, CliAdapter>;
  store: Store;
  now: () => string;
}): {
  fronts(cli: CliId, itemIds: string[]): Promise<{ ok: true } | { ok: false; error: TurnError }>;
  ask(
    cli: CliId,
    itemId: string,
  ): Promise<{ ok: true; question: Question } | { ok: false; error: TurnError }>;
  grade(
    cli: CliId,
    itemId: string,
    question: Question,
    answer: string,
  ): Promise<{ ok: true; verdict: Verdict; feedback: string } | { ok: false; error: TurnError }>;
  stop(): void;
} {
  let running: AbortController | null = null;

  const fronts = async (
    cli: CliId,
    itemIds: string[],
  ): Promise<{ ok: true } | { ok: false; error: TurnError }> => {
    if (running !== null) return { ok: false, error: BUSY };
    const controller = new AbortController();
    running = controller;
    try {
      const adapter = deps.adapters[cli] ?? deps.adapters.codex;
      const profile = await deps.store.readProfile();
      const knowledge = await deps.store.readKnowledge();
      const reviews = await deps.store.readReviews();
      const need: KnowledgeItem[] = [];
      for (const id of new Set(itemIds)) {
        const item = knowledge.find((k) => k.id === id);
        if (item === undefined) continue;
        const review = reviews.find((r) => r.itemId === id);
        if (review === undefined || review.front === null) need.push(item);
      }
      for (let at = 0; at < need.length; at += CARD_BATCH) {
        const batch = need.slice(at, at + CARD_BATCH);
        if (controller.signal.aborted) {
          return { ok: false, error: { kind: "stopped", message: "Stopped." } };
        }
        const result = await callModel(
          { adapter },
          {
            prompt: (retryNote) => buildFrontsPrompt(batch, retryNote, profile),
            schema: FRONTS_JSON_SCHEMA,
            parse: parseFronts,
            check: (v) => {
              const got = v.fronts.map((f) => f.itemId);
              const want = batch.map((b) => b.id);
              if (got.length !== want.length || !want.every((id) => got.includes(id))) {
                return "return exactly one front per item";
              }
              const blank = v.fronts.find((f) => f.front.trim() === "");
              return blank === undefined ? null : "empty front: " + blank.itemId;
            },
            allowed: "one front per item",
            options: NO_OPTIONS,
            timeoutMs: CALL_TIMEOUT_MS,
            signal: controller.signal,
          },
        );
        if (!result.ok) return { ok: false, error: result.error };
        await deps.store.updateReviews((reviews) => {
          const current = [...reviews];
          for (const front of result.value.fronts) {
            const item = batch.find((b) => b.id === front.itemId)!;
            const index = current.findIndex((r) => r.itemId === item.id);
            const next = {
              ...(index >= 0 ? current[index]! : newReview(item.id, item.createdAt)),
              front: front.front.trim(),
            };
            if (index >= 0) current[index] = next;
            else current.push(next);
          }
          return current;
        });
      }
      return { ok: true };
    } finally {
      running = null;
    }
  };

  const ask = async (
    cli: CliId,
    itemId: string,
  ): Promise<{ ok: true; question: Question } | { ok: false; error: TurnError }> => {
    if (running !== null) return { ok: false, error: BUSY };
    const controller = new AbortController();
    running = controller;
    try {
      const adapter = deps.adapters[cli] ?? deps.adapters.codex;
      const profile = await deps.store.readProfile();
      const item = (await deps.store.readKnowledge()).find((k) => k.id === itemId);
      if (item === undefined) return { ok: false, error: GONE };
      const result = await callModel(
        { adapter },
        {
          prompt: (retryNote) => buildAskPrompt(item, retryNote, profile),
          schema: ASK_JSON_SCHEMA,
          parse: parseAsk,
          check: (v) =>
            v.question.kind === "choice" && v.question.correctIndex === null
              ? "check needs a correctIndex"
              : null,
          allowed: "a question",
          options: NO_OPTIONS,
          timeoutMs: CALL_TIMEOUT_MS,
          signal: controller.signal,
        },
      );
      if (!result.ok) return { ok: false, error: result.error };
      return { ok: true, question: result.value.question };
    } finally {
      running = null;
    }
  };

  const grade = async (
    cli: CliId,
    itemId: string,
    question: Question,
    answer: string,
  ): Promise<
    { ok: true; verdict: Verdict; feedback: string } | { ok: false; error: TurnError }
  > => {
    if (running !== null) return { ok: false, error: BUSY };
    const controller = new AbortController();
    running = controller;
    try {
      const adapter = deps.adapters[cli] ?? deps.adapters.codex;
      const profile = await deps.store.readProfile();
      const item = (await deps.store.readKnowledge()).find((k) => k.id === itemId);
      if (item === undefined) return { ok: false, error: GONE };
      const result = await callModel(
        { adapter },
        {
          prompt: (retryNote) => buildGradePrompt(item, question, answer, retryNote, profile),
          schema: GRADE_JSON_SCHEMA,
          parse: parseGrade,
          check: (v) => (v.feedback.trim() === "" ? "feedback is empty" : null),
          allowed: "a verdict and feedback",
          options: NO_OPTIONS,
          timeoutMs: CALL_TIMEOUT_MS,
          signal: controller.signal,
        },
      );
      if (!result.ok) return { ok: false, error: result.error };
      return { ok: true, verdict: result.value.verdict, feedback: result.value.feedback };
    } finally {
      running = null;
    }
  };

  return {
    fronts,
    ask,
    grade,
    stop: () => {
      running?.abort();
    },
  };
}

export type Practice = ReturnType<typeof createPractice>;
