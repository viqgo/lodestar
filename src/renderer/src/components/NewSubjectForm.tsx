import { useId, useRef, useState } from "react";
import { folderNote } from "../../../core/material";
import { defaultCli } from "../../../shared/clis";
import type { CliId, CliStatus, Subject } from "../../../shared/types";
import { TutorPicker } from "./TutorPicker";

function lastSegment(p: string): string {
  const parts = p.split(/[\\/]/).filter((s) => s !== "");
  return parts.length > 0 ? parts[parts.length - 1] : p;
}

export function NewSubjectForm(props: {
  disabled: boolean;
  statuses: CliStatus[];
  lastUsed: CliId | null;
  onCreated(subject: Subject): void;
}) {
  const [picked, setPicked] = useState<CliId | null>(null);
  const cli = picked ?? defaultCli(props.statuses, props.lastUsed);
  const [name, setName] = useState("");
  const [folder, setFolder] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const nameId = useId();
  const busy = useRef(false);

  async function chooseFolder() {
    const chosen = await window.api.pickFolder();
    if (chosen !== null) setFolder(chosen);
  }

  async function submit() {
    if (busy.current || cli === null) return;
    busy.current = true;
    try {
      const result = await window.api.createSubject({ name, folder, cli });
      if (result.ok) props.onCreated(result.subject);
      else setError(result.message);
    } catch {
      setError("Could not save. Check free disk space.");
    } finally {
      busy.current = false;
    }
  }

  return (
    <>
      <h3>New subject</h3>
      <div className="field">
        <label className="label" htmlFor={nameId}>
          Name
        </label>
        <input
          id={nameId}
          value={name}
          disabled={props.disabled}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
        />
        {error !== null && <small>{error}</small>}
      </div>
      <div>
        <span className="label">Material folder</span>
        <div className="row">
          {folder === null ? (
            <button
              type="button"
              className="btn"
              disabled={props.disabled}
              onClick={() => void chooseFolder()}
            >
              Choose folder
            </button>
          ) : (
            <>
              <span>{lastSegment(folder)}</span>
              <button
                type="button"
                className="btn"
                disabled={props.disabled}
                onClick={() => void chooseFolder()}
              >
                Change
              </button>
              <button
                type="button"
                className="btn"
                disabled={props.disabled}
                onClick={() => setFolder(null)}
              >
                Remove
              </button>
            </>
          )}
        </div>
        {folder !== null && cli !== null ? <p className="note">{folderNote(cli)}</p> : null}
      </div>
      <TutorPicker
        statuses={props.statuses}
        value={cli}
        disabled={props.disabled}
        onChange={setPicked}
      />
      <div>
        <button
          type="button"
          className="btn is-primary"
          disabled={props.disabled || cli === null}
          onClick={() => void submit()}
        >
          Create
        </button>
      </div>
    </>
  );
}
