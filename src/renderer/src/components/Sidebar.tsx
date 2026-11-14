import { Fragment, useEffect, useState } from "react";
import { TIME_TICK_MS } from "../../../shared/limits";
import type { SessionSummary, SubjectSummary } from "../../../shared/types";
import { phaseLabel, relativeTime } from "../lib/time";
import { ConfirmDialog } from "./ConfirmDialog";

export function Sidebar(props: {
  sessions: SessionSummary[];
  activeId: string | null;
  onNew(): void;
  onOpen(id: string): void;
  onDelete(id: string): void;
  onKnowledge(): void;
  onGraph(): void;
  onProfile(): void;
  due: number;
  onReview(): void;
  newDisabled: boolean;
  subjects: SubjectSummary[];
  activeSubjectId: string | null;
  onNewSubject(): void;
  onOpenSubject(id: string): void;
  onDeleteSubject(id: string): void;
}) {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [confirmSubjectId, setConfirmSubjectId] = useState<string | null>(null);
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), TIME_TICK_MS);
    return () => clearInterval(timer);
  }, []);
  const nowIso = new Date().toISOString();
  const subjectIds = new Set(props.subjects.map((x) => x.id));
  const free = props.sessions.filter((s) => s.subjectId === null || !subjectIds.has(s.subjectId));
  const lessonRow = (s: SessionSummary, unit: boolean) => (
    <div
      key={s.id}
      className={
        "lesson-row" + (unit ? " is-unit" : "") + (s.id === props.activeId ? " is-active" : "")
      }
    >
      <button type="button" className="row-main" onClick={() => props.onOpen(s.id)}>
        <b>{s.topic}</b>
        <small>{`${phaseLabel(s.phase)} · ${relativeTime(s.updatedAt, nowIso)}`}</small>
      </button>
      <button
        className="icon-btn"
        aria-label="Delete lesson"
        onClick={(e) => {
          e.stopPropagation();
          setConfirmId(s.id);
        }}
      >
        ×
      </button>
    </div>
  );
  return (
    <div className="sidebar">
      <button className="btn is-primary" onClick={props.onNew} disabled={props.newDisabled}>
        New lesson
      </button>
      <button className="btn" onClick={props.onNewSubject} disabled={props.newDisabled}>
        New subject
      </button>
      <span className="label">Subjects</span>
      <div className="list">
        {props.subjects.map((subject) => (
          <Fragment key={subject.id}>
            <div
              className={"lesson-row" + (subject.id === props.activeSubjectId ? " is-active" : "")}
            >
              <button
                type="button"
                className="row-main"
                onClick={() => props.onOpenSubject(subject.id)}
              >
                <b>{subject.name}</b>
                <small>{relativeTime(subject.updatedAt, nowIso)}</small>
              </button>
              <button
                className="icon-btn"
                aria-label="Delete subject"
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmSubjectId(subject.id);
                }}
              >
                ×
              </button>
            </div>
            {props.sessions
              .filter((s) => s.subjectId === subject.id)
              .map((s) => lessonRow(s, true))}
          </Fragment>
        ))}
      </div>
      <span className="label">Lessons</span>
      <div className="list">
        {free.length === 0 ? <span className="note">No lessons yet.</span> : null}
        {free.map((s) => lessonRow(s, false))}
      </div>
      <button className="btn" onClick={props.onReview}>
        {props.due > 0 ? `Review · ${props.due}` : "Review"}
      </button>
      <button className="btn" onClick={props.onGraph}>
        Graph
      </button>
      <button className="btn" onClick={props.onKnowledge}>
        Knowledge
      </button>
      <button className="btn" onClick={props.onProfile}>
        Profile
      </button>
      {confirmId !== null ? (
        <ConfirmDialog
          message="Delete this lesson? This cannot be undone."
          confirmLabel="Delete"
          onConfirm={() => {
            props.onDelete(confirmId);
            setConfirmId(null);
          }}
          onCancel={() => setConfirmId(null)}
        />
      ) : null}
      {confirmSubjectId !== null ? (
        <ConfirmDialog
          message={`Delete this subject and its ${
            props.sessions.filter((s) => s.subjectId === confirmSubjectId).length
          } lessons? This cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={() => {
            props.onDeleteSubject(confirmSubjectId);
            setConfirmSubjectId(null);
          }}
          onCancel={() => setConfirmSubjectId(null)}
        />
      ) : null}
    </div>
  );
}
