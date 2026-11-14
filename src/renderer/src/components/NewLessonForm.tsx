import { useId, useRef, useState } from "react";
import { defaultCli } from "../../../shared/clis";
import type { CliId, CliStatus, Session } from "../../../shared/types";
import { TutorPicker } from "./TutorPicker";

export function NewLessonForm(props: {
  disabled: boolean;
  statuses: CliStatus[];
  lastUsed: CliId | null;
  onCreated(session: Session): void;
}) {
  const [picked, setPicked] = useState<CliId | null>(null);
  const cli = picked ?? defaultCli(props.statuses, props.lastUsed);
  const [topic, setTopic] = useState("");
  const [goal, setGoal] = useState("");
  const [error, setError] = useState<string | null>(null);
  const topicId = useId();
  const goalId = useId();
  const goalRef = useRef<HTMLTextAreaElement>(null);

  const busy = useRef(false);

  async function submit() {
    if (busy.current || cli === null) return;
    busy.current = true;
    try {
      const result = await window.api.createSession({
        topic,
        goal,
        cli,
        folder: null,
        webSearch: false,
        attachPaths: [],
      });
      if (result.ok) props.onCreated(result.session);
      else setError(result.message);
    } catch {
      setError("Could not save. Check free disk space.");
    } finally {
      busy.current = false;
    }
  }

  return (
    <>
      <h3>What do you want to learn?</h3>
      <div className="field">
        <label className="label" htmlFor={topicId}>
          Topic
        </label>
        <input
          id={topicId}
          placeholder="e.g. Derivatives"
          value={topic}
          disabled={props.disabled}
          onChange={(e) => {
            setTopic(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              goalRef.current?.focus();
            }
          }}
        />
      </div>
      <div className="field">
        <label className="label" htmlFor={goalId}>
          Goal
        </label>
        <textarea
          id={goalId}
          ref={goalRef}
          placeholder="e.g. Understand why the derivative is the slope of the tangent line"
          value={goal}
          disabled={props.disabled}
          onChange={(e) => {
            setGoal(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void submit();
            }
          }}
        />
        {error !== null && <small>{error}</small>}
      </div>
      <TutorPicker
        statuses={props.statuses}
        value={cli}
        disabled={props.disabled}
        onChange={setPicked}
      />
      <div>
        <button
          className="btn is-primary"
          disabled={props.disabled || cli === null}
          onClick={() => void submit()}
        >
          Start
        </button>
      </div>
    </>
  );
}
