import { folderNote } from "../../../core/material";
import type { CliId } from "../../../shared/types";

type Props = {
  cli: CliId | null;
  folder: string | null;
  attachments: { name: string; key: string }[];
  webSearch: boolean;
  disabled: boolean;
  onPickFolder(): void;
  onRemoveFolder(): void;
  onAttach(): void;
  onRemoveAttachment(key: string): void;
  onWebSearch(on: boolean): void;
};

function lastSegment(p: string): string {
  const parts = p.split(/[\\/]/).filter((s) => s !== "");
  return parts.length > 0 ? parts[parts.length - 1] : p;
}

export function MaterialControls(props: Props) {
  const { cli, folder, attachments, webSearch, disabled } = props;
  return (
    <div>
      <span className="label">Material folder</span>
      <div className="row">
        {folder === null ? (
          <button type="button" className="btn" disabled={disabled} onClick={props.onPickFolder}>
            Choose folder
          </button>
        ) : (
          <>
            <span>{lastSegment(folder)}</span>
            <button type="button" className="btn" disabled={disabled} onClick={props.onPickFolder}>
              Change
            </button>
            <button
              type="button"
              className="btn"
              disabled={disabled}
              onClick={props.onRemoveFolder}
            >
              Remove
            </button>
          </>
        )}
      </div>
      {folder !== null && cli !== null ? <p className="note">{folderNote(cli)}</p> : null}
      <div className="row">
        {attachments.map((a) => (
          <span key={a.key} className="chip">
            {a.name}
            <button
              type="button"
              className="icon-btn"
              aria-label={`Remove ${a.name}`}
              disabled={disabled}
              onClick={() => props.onRemoveAttachment(a.key)}
            >
              ×
            </button>
          </span>
        ))}
        <button type="button" className="btn" disabled={disabled} onClick={props.onAttach}>
          Attach files
        </button>
      </div>
      <label className="switch">
        <input
          type="checkbox"
          checked={webSearch}
          disabled={disabled}
          onChange={(e) => props.onWebSearch(e.target.checked)}
        />
        Web search
      </label>
    </div>
  );
}
