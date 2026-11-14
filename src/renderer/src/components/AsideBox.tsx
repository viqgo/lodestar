import { useState } from "react";
import { CHAT_TEXT_MAX } from "../../../shared/limits";

type Props = { disabled: boolean; onAsk(text: string): void };

export function AsideBox(props: Props) {
  const [text, setText] = useState("");
  const trimmed = text.trim();
  const canAsk = !props.disabled && trimmed !== "" && trimmed.length <= CHAT_TEXT_MAX;

  function submit() {
    if (!canAsk) return;
    props.onAsk(trimmed);
    setText("");
  }

  return (
    <div>
      <div className="field">
        <label className="label" htmlFor="aside-question">
          Ask a side question
        </label>
        <textarea
          id="aside-question"
          value={text}
          disabled={props.disabled}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit();
            }
          }}
        />
      </div>
      <button type="button" className="btn" disabled={!canAsk} onClick={submit}>
        Ask
      </button>
    </div>
  );
}
