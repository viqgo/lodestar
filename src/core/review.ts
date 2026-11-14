import { BOX_DAYS } from "../shared/limits";
import type { DueItem, KnowledgeItem, Review, ReviewFilter } from "../shared/types";

const DAY = 86_400_000;

export function newReview(itemId: string, now: string): Review {
  return { itemId, box: 1, due: now, front: null };
}

export function nextReview(review: Review, correct: boolean, now: string): Review {
  const box = (correct ? Math.min(5, review.box + 1) : 1) as Review["box"];
  return {
    ...review,
    box,
    due: new Date(Date.parse(now) + BOX_DAYS[box - 1]! * DAY).toISOString(),
  };
}

export function dueItems(
  items: KnowledgeItem[],
  reviews: Review[],
  now: string,
  filter: ReviewFilter,
  sessions: { id: string; subjectId: string | null }[],
): DueItem[] {
  const matches = (item: KnowledgeItem): boolean => {
    if (filter.sessionId !== null) return item.sessionId === filter.sessionId;
    if (filter.subjectId !== null) {
      return sessions.some((s) => s.id === item.sessionId && s.subjectId === filter.subjectId);
    }
    return true;
  };
  const at = Date.parse(now);
  return items
    .filter(matches)
    .map((item) => ({
      item,
      review: reviews.find((r) => r.itemId === item.id) ?? newReview(item.id, item.createdAt),
    }))
    .filter((d) => !(Date.parse(d.review.due) > at))
    .sort((a, b) => Date.parse(a.review.due) - Date.parse(b.review.due));
}

export function nextDue(reviews: Review[]): string | null {
  let best: Review | null = null;
  for (const r of reviews) {
    if (best === null || Date.parse(r.due) < Date.parse(best.due)) best = r;
  }
  return best === null ? null : best.due;
}
