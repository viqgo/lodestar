import { useEffect, useMemo, useRef } from "react";
import { learnedToSave } from "../../../core/engine";
import type { Action } from "../../../shared/types";
import { useLesson } from "../lib/useLesson";
import { buildItems } from "../lib/view";
import { Banner } from "./Banner";
import { ChatItemView } from "./ChatItemView";
import { PlanPanel } from "./PlanPanel";
import { ThinkingBar } from "./ThinkingBar";

type DoneAction = Extract<Action, { type: "lesson_done" }>;

export function LessonScreen(props: { id: string; start: boolean }) {
  const { session, state, busy, error, submit, retry, stop } = useLesson(props.id, props.start);
  const items = useMemo(() => (session ? buildItems(session) : []), [session]);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ behavior: "smooth", block: "end" });
  }, [items.length]);

  let banner: React.ReactNode = null;
  if (error) {
    if (error.kind === "stopped") {
      banner = <Banner kind="info" message="Stopped." actionLabel="Retry" onAction={retry} />;
    } else if (error.kind === "not_found") {
      banner = <Banner kind="error" message={error.message} />;
    } else {
      banner = <Banner kind="error" message={error.message} actionLabel="Retry" onAction={retry} />;
    }
  } else if (
    !busy &&
    session &&
    state &&
    state.awaiting.who === "model" &&
    session.events.length > 0
  ) {
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

  return (
    <>
      <div className="content">
        {session && (
          <>
            <h3>{session.topic}</h3>
            <p className="note">Goal: {session.goal}</p>
          </>
        )}
        {items.map((item) => (
          <ChatItemView
            key={item.key}
            item={item}
            sessionId={props.id}
            disabled={busy}
            onSubmit={submit}
          />
        ))}
        {busy && !isDone && <ThinkingBar onStop={stop} />}
        {banner}
        {finished}
        <div ref={endRef} />
      </div>
      {state?.plan && (
        <PlanPanel plan={state.plan} nodes={state.nodes} currentNodeId={state.currentNodeId} />
      )}
    </>
  );
}
