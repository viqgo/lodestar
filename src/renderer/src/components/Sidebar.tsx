import { useState } from "react";
import type { SessionSummary } from "../../../shared/types";
import { phaseLabel, relativeTime } from "../lib/time";
import { ConfirmDialog } from "./ConfirmDialog";

export function Sidebar(props: {
  sessions: SessionSummary[];
  activeId: string | null;
  onNew(): void;
  onOpen(id: string): void;
  onDelete(id: string): void;
  onKnowledge(): void;
  newDisabled: boolean;
}) {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const nowIso = new Date().toISOString();
  return (
    <div className="sidebar">
      <button className="btn is-primary" onClick={props.onNew} disabled={props.newDisabled}>
        New lesson
      </button>
      <span className="label">Lessons</span>
      <div className="list">
        {props.sessions.length === 0 ? <span className="note">No lessons yet.</span> : null}
        {props.sessions.map((s) => (
          <div
            key={s.id}
            className={"lesson-row" + (s.id === props.activeId ? " is-active" : "")}
            onClick={() => props.onOpen(s.id)}
          >
            <div>
              <b>{s.topic}</b>
              <small>{`${phaseLabel(s.phase)} · ${relativeTime(s.updatedAt, nowIso)}`}</small>
            </div>
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
        ))}
      </div>
      <button className="btn" onClick={props.onKnowledge}>
        Knowledge
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
    </div>
  );
}
