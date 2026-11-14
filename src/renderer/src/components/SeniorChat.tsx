import { useState } from "react";
import { CHAT_TEXT_MAX } from "../../../shared/limits";
import type { OutlineChange, SubjectState } from "../../../shared/types";
import { MarkdownView } from "./MarkdownView";

type Props = {
  chat: SubjectState["chat"];
  pendingChange: OutlineChange | null;
  busy: boolean;
  onSend(text: string): void;
  onResolve(accept: boolean): void;
};

export function SeniorChat(props: Props) {
  const [text, setText] = useState("");
  const trimmed = text.trim();
  const canSend =
    !props.busy &&
    trimmed !== "" &&
    trimmed.length <= CHAT_TEXT_MAX &&
    text.length <= CHAT_TEXT_MAX;

  function submit() {
    if (!canSend) return;
    props.onSend(trimmed);
    setText("");
  }

  const change = props.pendingChange;

  return (
    <div>
      <div className="chat">
        {props.chat.map((m, i) =>
          m.who === "owner" ? (
            <div className="chat-msg is-owner" key={i}>
              {m.markdown}
            </div>
          ) : (
            <div className="chat-msg is-tutor" key={i}>
              <MarkdownView markdown={m.markdown} />
            </div>
          ),
        )}
      </div>
      {change !== null && (
        <div className="card">
          <span className="label">Proposed change</span>
          {change.kind === "add" && (
            <div>
              <div>{`Add unit: ${change.unit.title}`}</div>
              <p className="note">{change.unit.goal}</p>
            </div>
          )}
          {change.kind === "remove" && <div>{`Remove unit: ${change.unitId}`}</div>}
          {change.kind === "reorder" && <div>{`New order: ${change.order.join(", ")}`}</div>}
          <div className="card-foot">
            <button
              type="button"
              className="btn"
              disabled={props.busy}
              onClick={() => props.onResolve(false)}
            >
              Dismiss
            </button>
            <button
              type="button"
              className="btn is-primary"
              disabled={props.busy}
              onClick={() => props.onResolve(true)}
            >
              Accept
            </button>
          </div>
        </div>
      )}
      <div className="field">
        <label className="label" htmlFor="senior-chat-message">
          Message
        </label>
        <textarea
          id="senior-chat-message"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit();
            }
          }}
        />
      </div>
      <button type="button" className="btn" disabled={!canSend} onClick={submit}>
        Send
      </button>
    </div>
  );
}
