import { useRef, useState } from "react";
import { useSubject } from "../lib/useSubject";
import type { UnitStatus } from "../../../shared/types";
import { Banner } from "./Banner";
import { OutlineReview } from "./OutlineReview";
import { SeniorChat } from "./SeniorChat";
import { ThinkingBar } from "./ThinkingBar";

const SAVE_ERROR = "Could not save. Check free disk space.";

function lastSegment(p: string): string {
  const parts = p.split(/[\\/]/).filter((s) => s !== "");
  return parts.length > 0 ? parts[parts.length - 1] : p;
}

function statusText(s: UnitStatus | undefined): string {
  if (!s || s.status === "not_started") return "not started";
  if (s.status === "in_progress") return "in progress";
  return s.shaky > 0 ? `done, ${s.shaky} shaky` : "done";
}

export function SubjectScreen(props: {
  id: string;
  start: boolean;
  onOpenLesson(id: string, start: boolean): void;
}) {
  const { id } = props;
  const { subject, state, statuses, busy, error, send, retry, stop } = useSubject(id, props.start);
  const [message, setMessage] = useState<string | null>(null);
  const starting = useRef(false);

  async function guarded(
    call: () => Promise<{ ok: true } | { ok: false; message: string }>,
  ): Promise<boolean> {
    try {
      const result = await call();
      if (result.ok) {
        setMessage(null);
        return true;
      }
      setMessage(result.message);
    } catch {
      setMessage(SAVE_ERROR);
    }
    return false;
  }

  async function changeFolder() {
    let picked: string | null;
    try {
      picked = await window.api.pickFolder();
    } catch {
      setMessage(SAVE_ERROR);
      return;
    }
    if (picked === null) return;
    const folder = picked;
    const stored = await guarded(() => window.api.setSubjectFolder(id, folder));
    if (stored && error?.kind === "folder_missing") retry();
  }

  async function startUnit(unitId: string) {
    if (starting.current) return;
    starting.current = true;
    try {
      const result = await window.api.startUnit(id, unitId);
      if (result.ok) {
        setMessage(null);
        props.onOpenLesson(result.session.id, true);
      } else {
        setMessage(result.message);
      }
    } catch {
      setMessage(SAVE_ERROR);
    } finally {
      starting.current = false;
    }
  }

  let banner: React.ReactNode = null;
  if (error) {
    if (error.kind === "stopped") {
      banner = <Banner kind="info" message="Stopped." actionLabel="Retry" onAction={retry} />;
    } else if (error.kind === "not_found" || error.kind === "invalid_answer") {
      banner = <Banner kind="error" message={error.message} />;
    } else {
      banner = <Banner kind="error" message={error.message} actionLabel="Retry" onAction={retry} />;
    }
  } else if (!busy && state && (state.phase === "outline" || state.awaitingReply)) {
    banner = (
      <Banner
        kind="info"
        message="The last reply did not arrive."
        actionLabel="Retry"
        onAction={retry}
      />
    );
  }

  return (
    <div className="content">
      {subject && state && (
        <>
          <h3>{subject.name}</h3>
          <div className="row">
            <span className="note">{`Material folder: ${lastSegment(subject.folder)}`}</span>
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => void changeFolder()}
            >
              Change
            </button>
          </div>
          {state.phase === "review" && (
            <OutlineReview
              units={state.units}
              onAccept={(units) => void guarded(() => window.api.acceptOutline(id, units))}
            />
          )}
          {state.phase === "ready" && (
            <>
              <div>
                {state.units.map((unit, i) => {
                  const status = statuses.find((s) => s.unitId === unit.id);
                  return (
                    <div className="unit-row" key={unit.id}>
                      <b>{i + 1}</b>
                      <div>
                        {unit.title}
                        <br />
                        <span className="note">{unit.goal}</span>
                      </div>
                      <span className="label">{statusText(status)}</span>
                      {!status || status.status === "not_started" ? (
                        <button
                          type="button"
                          className="btn is-primary"
                          onClick={() => void startUnit(unit.id)}
                        >
                          Start
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn"
                          onClick={() => props.onOpenLesson(status.sessionId ?? "", false)}
                        >
                          Open
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              <span className="label">Senior tutor</span>
              <SeniorChat
                chat={state.chat}
                pendingChange={state.pendingChange}
                busy={busy}
                onSend={send}
                onResolve={(accept) => void guarded(() => window.api.resolveChange(id, accept))}
              />
            </>
          )}
          {message !== null && <small>{message}</small>}
        </>
      )}
      {busy && <ThinkingBar onStop={stop} />}
      {banner}
    </div>
  );
}
