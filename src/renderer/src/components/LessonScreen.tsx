import { useEffect, useMemo, useRef, useState } from "react";
import { learnedToSave } from "../../../core/engine";
import { CLI_INFO, isCliId } from "../../../shared/clis";
import type { Action, CliId, CliStatus } from "../../../shared/types";
import { useLesson } from "../lib/useLesson";
import { buildItems } from "../lib/view";
import { Banner } from "./Banner";
import { ChatItemView } from "./ChatItemView";
import { ConfirmDialog } from "./ConfirmDialog";
import { PlanPanel } from "./PlanPanel";
import { ThinkingBar } from "./ThinkingBar";
import { TutorPicker } from "./TutorPicker";

type DoneAction = Extract<Action, { type: "lesson_done" }>;

export function LessonScreen(props: {
  id: string;
  start: boolean;
  statuses: CliStatus[] | null;
  onRetryDetect(): void;
}) {
  const { session, state, busy, error, submit, retry, stop } = useLesson(props.id, props.start);
  const items = useMemo(() => (session ? buildItems(session) : []), [session]);
  const endRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [ask, setAsk] = useState<CliId | null>(null);
  const [switchError, setSwitchError] = useState<string | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ behavior: "smooth", block: "end" });
  }, [items.length, busy, error]);

  const cli: CliId = session !== null && isCliId(session.cli) ? session.cli : "codex";
  const missing =
    session !== null &&
    props.statuses !== null &&
    !props.statuses.some((s) => s.id === cli && s.installed);
  const blocked = session !== null && (props.statuses === null || missing);
  const switching = useRef(false);

  let banner: React.ReactNode = null;
  if (session && missing) {
    banner = (
      <Banner
        kind="error"
        message={CLI_INFO[cli].label + " not found. Install it and sign in, then press Retry."}
        actionLabel="Retry"
        onAction={props.onRetryDetect}
      />
    );
  } else if (error) {
    if (error.kind === "stopped") {
      banner = <Banner kind="info" message="Stopped." actionLabel="Retry" onAction={retry} />;
    } else if (error.kind === "not_found") {
      banner = <Banner kind="error" message={error.message} />;
    } else {
      banner = <Banner kind="error" message={error.message} actionLabel="Retry" onAction={retry} />;
    }
  } else if (!busy && session && state && state.awaiting.who === "model") {
    banner = (
      <Banner
        kind="info"
        message="The last reply did not arrive."
        actionLabel="Retry"
        onAction={retry}
      />
    );
  }

  let finished: React.ReactNode = null;
  if (session && state && state.phase === "done") {
    let done: DoneAction | null = null;
    for (const event of session.events) {
      if (event.kind === "action" && event.action.type === "lesson_done") done = event.action;
    }
    const n = done ? learnedToSave(state, done).length : 0;
    const m = Object.values(state.nodes).filter((node) => node.status === "shaky").length;
    const shaky =
      m === 0 ? "" : m === 1 ? " 1 step is still shaky." : ` ${m} steps are still shaky.`;
    finished = (
      <div className="summary">
        <span className="label">Lesson complete</span>
        <p className="note">{`${n} items added to your knowledge list.${shaky}`}</p>
      </div>
    );
  }

  const isDone = finished !== null;

  const confirmSwitch = async () => {
    if (ask === null || switching.current) return;
    switching.current = true;
    try {
      const result = await window.api.setSessionCli(props.id, ask);
      if (result.ok) {
        setSwitchError(null);
        setAsk(null);
        setOpen(false);
      } else {
        setSwitchError(result.message);
        setAsk(null);
      }
    } catch {
      setSwitchError("Could not save. Check free disk space.");
      setAsk(null);
    } finally {
      switching.current = false;
    }
  };

  return (
    <>
      <div className="content">
        {session && (
          <>
            <h3>{session.topic}</h3>
            <p className="note">Goal: {session.goal}</p>
            <div className="row">
              <span className="note">Tutor: {CLI_INFO[cli].label}</span>
              {!isDone && (
                <button
                  className="btn"
                  disabled={busy || props.statuses === null}
                  onClick={() => setOpen(!open)}
                >
                  Change tutor
                </button>
              )}
            </div>
            {switchError && <small>{switchError}</small>}
            {open && (
              <TutorPicker
                statuses={props.statuses ?? []}
                value={cli}
                disabled={busy}
                onChange={(next) => (next === cli ? setOpen(false) : setAsk(next))}
              />
            )}
          </>
        )}
        {items.map((item) => (
          <ChatItemView
            key={item.key}
            item={item}
            sessionId={props.id}
            disabled={busy || blocked}
            onSubmit={submit}
          />
        ))}
        {busy && !isDone && <ThinkingBar onStop={stop} />}
        {banner}
        {finished}
        <div ref={endRef} />
        {ask !== null && (
          <ConfirmDialog
            message={
              "Switch this lesson to " +
              CLI_INFO[ask].label +
              "? It will read the whole lesson so far and continue from there."
            }
            confirmLabel="Switch"
            onConfirm={confirmSwitch}
            onCancel={() => setAsk(null)}
          />
        )}
      </div>
      {state?.plan && (
        <PlanPanel plan={state.plan} nodes={state.nodes} currentNodeId={state.currentNodeId} />
      )}
    </>
  );
}
