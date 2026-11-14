import { describe, expect, it } from "vitest";
import { dueItems, newReview, nextDue, nextReview } from "../../src/core/review";
import type { Review, ReviewFilter } from "../../src/shared/types";
import { K, review } from "../helpers/fixtures";

const NOW = "2026-03-01T00:00:00.000Z";
const days = (n: number) => new Date(Date.parse(NOW) + n * 86_400_000).toISOString();
const all: ReviewFilter = { subjectId: null, sessionId: null };

describe("review schedule", () => {
  it("new_item_is_box_one_due_now", () => {
    expect(newReview("k", NOW)).toEqual({ itemId: "k", box: 1, due: NOW, front: null });
    expect(dueItems([K(1)], [newReview(K(1).id, NOW)], NOW, all, [])).toHaveLength(1);
  });

  it("correct_moves_up_and_sets_due", () => {
    const expected: [Review["box"], Review["box"], number][] = [
      [1, 2, 3],
      [2, 3, 7],
      [3, 4, 14],
      [4, 5, 30],
    ];
    for (const [from, to, n] of expected) {
      const r = nextReview(review(1, { box: from }), true, NOW);
      expect(r.box).toBe(to);
      expect(r.due).toBe(days(n));
    }
  });

  it("wrong_resets_to_box_one_tomorrow", () => {
    for (const from of [1, 3, 5] as const) {
      const r = nextReview(review(1, { box: from }), false, NOW);
      expect(r.box).toBe(1);
      expect(r.due).toBe(days(1));
    }
  });

  it("box_five_stays_at_five", () => {
    const r = nextReview(review(1, { box: 5 }), true, NOW);
    expect(r.box).toBe(5);
    expect(r.due).toBe(days(30));
  });

  it("nextReview keeps the front and the item", () => {
    for (const ok of [true, false]) {
      const r = nextReview(review(1, { front: "Q" }), ok, NOW);
      expect(r.front).toBe("Q");
      expect(r.itemId).toBe(K(1).id);
    }
  });

  it("review_counts_due_with_filter", () => {
    const items = [
      K(1, { sessionId: "s1" }),
      K(2, { sessionId: "s2" }),
      K(3, { sessionId: "s3" }),
      K(4, { sessionId: "gone" }),
    ];
    const sessions = [
      { id: "s1", subjectId: "u1" },
      { id: "s2", subjectId: "u1" },
      { id: "s3", subjectId: null },
    ];
    const reviews = [
      review(1, { due: NOW }),
      review(2, { due: days(1) }),
      review(3, { due: NOW }),
      review(4, { due: NOW }),
    ];
    const ids = (f: ReviewFilter) =>
      dueItems(items, reviews, NOW, f, sessions).map((d) => d.item.id);
    expect(ids(all)).toEqual([K(1).id, K(3).id, K(4).id]);
    expect(ids({ subjectId: "u1", sessionId: null })).toEqual([K(1).id]);
    expect(ids({ subjectId: null, sessionId: "s3" })).toEqual([K(3).id]);
    expect(ids({ subjectId: "u1", sessionId: "s3" })).toEqual([K(3).id]);
    expect(ids({ subjectId: "nobody", sessionId: null })).toEqual([]);
  });

  it("dueItems counts an item without a review as box one, due since it was created", () => {
    const list = dueItems([K(1)], [], NOW, all, []);
    expect(list).toHaveLength(1);
    expect(list[0]!.review).toEqual(newReview(K(1).id, K(1).createdAt));
    expect(dueItems([K(1, { createdAt: days(1) })], [], NOW, all, [])).toEqual([]);
  });

  it("dueItems lists the oldest due first", () => {
    const items = [K(1), K(2), K(3), K(4)];
    const reviews = [
      review(1, { due: days(-1) }),
      review(2, { due: days(-3) }),
      review(3, { due: days(-2) }),
      review(4, { due: NOW }),
    ];
    const out = dueItems(items, reviews, NOW, all, []).map((d) => d.item.id);
    expect(out).toEqual([K(2).id, K(3).id, K(1).id, K(4).id]);
  });

  it("nothing_due_names_next_date (the date)", () => {
    expect(nextDue([])).toBeNull();
    expect(
      nextDue([
        review(1, { due: days(5) }),
        review(2, { due: days(2) }),
        review(3, { due: days(9) }),
      ]),
    ).toBe(days(2));
  });
});
