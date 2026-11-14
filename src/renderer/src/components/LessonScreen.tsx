import { useEffect, useMemo, useRef, useState } from "react";
import { learnedToSave } from "../../../core/engine";
import { CLI_INFO, isCliId } from "../../../shared/clis";
import type { Action, CliId, CliStatus } from "../../../shared/types";
import { useCall } from "../lib/useCall";
import { useLesson } from "../lib/useLesson";
import { buildItems } from "../lib/view";
import { AsideBox } from "./AsideBox";
import { Banner } from "./Banner";
import { CallBar } from "./CallBar";
import { ChatItemView } from "./ChatItemView";
import { ConfirmDialog } from "./ConfirmDialog";
import { MaterialControls } from "./MaterialControls";
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
  const {
    session,
    state,
    busy,
    error,
    asideError,
    ask: askAside,
    submit,
    retry,
    stop,
  } = useLesson(props.id, props.start);
  const call = useCall({ id: props.id, session, state, busy, submit });
  const [hasKey, setHasKey] = useState(false);
  const items = useMemo(() => (session ? buildItems(session) : []), [session]);
  const endRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [ask, setAsk] = useState<CliId | null>(null);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const [materialError, setMaterialError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void window.api.voiceHasKey().then((has) => {
      if (alive) setHasKey(has);
    });
    return () => {
      alive = false;
    };
  }, []);

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

  const retryAction = props.statuses === null ? {} : { actionLabel: "Retry", onAction: retry };

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
      banner = <Banner kind="info" message="Stopped." {...retryAction} />;
    } else if (error.kind === "folder_missing" || error.kind === "not_found") {
      banner = <Banner kind="error" message={error.message} />;
    } else {
      banner = <Banner kind="error" message={error.message} {...retryAction} />;
    }
  } else if (!busy && session && state && state.awaiting.who === "model") {
    banner = <Banner kind="info" message="The last reply did not arrive." {...retryAction} />;
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

  const material = async (
    call: () => Promise<{ ok: true; session: unknown } | { ok: false; message: string }>,
    resume = false,
  ) => {
    try {
      const result = await call();
      setMaterialError(result.ok ? null : result.message);
      if (result.ok && resume && error?.kind === "folder_missing") retry();
    } catch {
      setMaterialError("Could not save. Check free disk space.");
    }
  };

  const pickFolder = async () => {
    try {
      const picked = await window.api.pickFolder();
      if (picked !== null)
        await material(() => window.api.setSessionFolder(props.id, picked), true);
    } catch {
      setMaterialError("Could not save. Check free disk space.");
    }
  };

  const attach = async () => {
    try {
      const picked = await window.api.pickFiles();
      if (picked.length > 0) await material(() => window.api.addAttachments(props.id, picked));
    } catch {
      setMaterialError("Could not save. Check free disk space.");
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
            <MaterialControls
              cli={cli}
              folder={session.folder ?? null}
              attachments={(session.attachments ?? []).map((a) => ({ key: a.file, name: a.name }))}
              webSearch={session.webSearch ?? false}
              disabled={busy || isDone}
              onPickFolder={pickFolder}
              onRemoveFolder={() =>
                material(() => window.api.setSessionFolder(props.id, null), true)
              }
              onAttach={attach}
              onRemoveAttachment={(file) =>
                material(() => window.api.removeAttachment(props.id, file))
              }
              onWebSearch={(on) => material(() => window.api.setSessionWebSearch(props.id, on))}
            />
            {materialError && <small>{materialError}</small>}
            <CallBar
              state={call.state}
              hasKey={hasKey}
              onStart={call.start}
              onSkip={call.skip}
              onStartOver={call.startOver}
              onEnd={call.end}
            />
            {call.error !== null && <Banner kind="error" message={call.error} />}
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
            heard={call.state === "off" ? null : call.heard}
          />
        ))}
        {session && (
          <>
            <AsideBox disabled={busy || blocked} onAsk={askAside} />
            {asideError !== null && <small>{asideError}</small>}
          </>
        )}
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
