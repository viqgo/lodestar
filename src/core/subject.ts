import { UNITS_MAX, UNITS_MIN } from "../shared/limits";
import type {
  HandoverNote,
  OutlineChange,
  Session,
  SessionEvent,
  SubjectEvent,
  SubjectState,
  Unit,
  UnitStatus,
} from "../shared/types";
import { deriveState, learnedToSave } from "./engine";

const UNIT_ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
const SIZE_REASON = "outline must have 2 to 30 units";

export function validateNewSubject(name: string, folder: string | null): string | null {
  const length = name.trim().length;
  return length >= 1 && length <= 100 && folder !== null
    ? null
    : "Enter a name and choose a folder.";
}

export function validateOutline(
  units: Unit[],
  known: string[],
): { ok: true; units: Unit[] } | { ok: false; reason: string } {
  if (units.length < UNITS_MIN || units.length > UNITS_MAX) {
    return { ok: false, reason: SIZE_REASON };
  }
  if (units.some((u) => [u.id, u.title, u.goal].some((x) => x.trim().length === 0))) {
    return { ok: false, reason: "empty id, title or goal" };
  }
  if (units.some((u) => u.title.length > 200 || u.goal.length > 500)) {
    return { ok: false, reason: "title or goal too long" };
  }
  const seen = new Set<string>();
  for (const u of units) {
    if (!UNIT_ID.test(u.id)) return { ok: false, reason: "invalid unit id: " + u.id };
    if (seen.has(u.id)) return { ok: false, reason: "duplicate unit id: " + u.id };
    seen.add(u.id);
  }
  const files = new Set(known);
  return {
    ok: true,
    units: units.map((u) => ({ ...u, files: u.files.filter((f) => files.has(f)) })),
  };
}

export function applyChange(units: Unit[], change: OutlineChange): Unit[] {
  if (change.kind === "add") {
    if (change.afterId === null) return [change.unit, ...units];
    const at = units.findIndex((u) => u.id === change.afterId);
    return [...units.slice(0, at + 1), change.unit, ...units.slice(at + 1)];
  }
  if (change.kind === "remove") return units.filter((u) => u.id !== change.unitId);
  return change.order.flatMap((id) => units.filter((u) => u.id === id));
}

export function checkChange(
  units: Unit[],
  started: string[],
  change: OutlineChange | null,
): string | null {
  if (change === null) return null;
  const has = (id: string) => units.some((u) => u.id === id);
  if (change.kind === "add") {
    if (has(change.unit.id)) return "duplicate unit id: " + change.unit.id;
    if (change.afterId !== null && !has(change.afterId)) return "unknown unit: " + change.afterId;
    const next = applyChange(units, change);
    const result = validateOutline(
      next,
      next.flatMap((u) => u.files),
    );
    return result.ok ? null : result.reason;
  }
  if (change.kind === "remove") {
    if (!has(change.unitId)) return "unknown unit: " + change.unitId;
    if (started.includes(change.unitId)) return "unit already started: " + change.unitId;
    return units.length - 1 < UNITS_MIN ? SIZE_REASON : null;
  }
  const order = [...change.order].sort();
  const ids = units.map((u) => u.id).sort();
  return order.length === ids.length && order.every((id, i) => id === ids[i])
    ? null
    : "reorder must list every unit id exactly once";
}

export function deriveSubject(events: SubjectEvent[]): SubjectState {
  const state: SubjectState = {
    phase: "outline",
    units: [],
    notes: [],
    chat: [],
    pendingChange: null,
    awaitingReply: false,
  };
  events.forEach((event, i) => {
    const corrupt = () => new Error("corrupt subject at event " + i);
    switch (event.kind) {
      case "outline":
        if (state.phase !== "outline") throw corrupt();
        state.units = event.units;
        state.phase = "review";
        break;
      case "accepted":
        if (state.phase !== "review") throw corrupt();
        state.units = event.units;
        state.phase = "ready";
        break;
      case "message":
        if (state.phase !== "ready") throw corrupt();
        state.chat.push({ who: "owner", markdown: event.text });
        state.awaitingReply = true;
        break;
      case "reply":
        if (state.phase !== "ready" || !state.awaitingReply) throw corrupt();
        state.chat.push({ who: "tutor", markdown: event.markdown });
        state.pendingChange = event.change;
        state.awaitingReply = false;
        break;
      case "change":
        if (state.phase !== "ready" || state.pendingChange === null) throw corrupt();
        if (event.accepted) state.units = applyChange(state.units, state.pendingChange);
        state.pendingChange = null;
        break;
      case "note":
        if (state.phase !== "ready") throw corrupt();
        state.notes.push(event.note);
        break;
    }
  });
  return state;
}

export function unitStatuses(
  units: Unit[],
  sessions: { id: string; unitId: string | null; events: SessionEvent[] }[],
): UnitStatus[] {
  return units.map((unit) => {
    for (const s of sessions) {
      if (s.unitId !== unit.id) continue;
      try {
        const state = deriveState(s.events);
        return {
          unitId: unit.id,
          sessionId: s.id,
          status: state.phase === "done" ? "done" : "in_progress",
          shaky: Object.values(state.nodes).filter((n) => n.status === "shaky").length,
        };
      } catch {
        continue;
      }
    }
    return { unitId: unit.id, sessionId: null, status: "not_started", shaky: 0 };
  });
}

export function handoverNote(session: Session): HandoverNote {
  const state = deriveState(session.events);
  let done: Extract<
    Extract<SessionEvent, { kind: "action" }>["action"],
    { type: "lesson_done" }
  > | null = null;
  for (const e of session.events) {
    if (e.kind === "action" && e.action.type === "lesson_done") done = e.action;
  }
  return {
    unitId: session.unitId ?? "",
    sessionId: session.id,
    summary: done === null ? "" : done.summary,
    learned: done === null ? [] : learnedToSave(state, done).map((i) => i.text),
    shaky: (state.plan ?? [])
      .filter((n) => state.nodes[n.id]?.status === "shaky")
      .map((n) => n.title),
  };
}
