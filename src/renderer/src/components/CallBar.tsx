import type { CallState } from "../../../shared/types";

type Props = {
  state: CallState;
  hasKey: boolean;
  onStart(): void;
  onSkip(): void;
  onStartOver(): void;
  onEnd(): void;
};

export function CallBar({ state, hasKey, onStart, onSkip, onStartOver, onEnd }: Props) {
  if (state === "off") {
    return (
      <div className="row">
        <button className="btn" disabled={!hasKey} onClick={onStart}>
          Start call
        </button>
        {!hasKey && <span className="note">Add a Deepgram key in Profile to use voice.</span>}
      </div>
    );
  }
  return (
    <div className="row">
      <span className="note">{`On call · ${state}`}</span>
      <button className="btn" onClick={onSkip}>
        Skip
      </button>
      <button className="btn" onClick={onStartOver}>
        Start over
      </button>
      <button className="btn is-danger" onClick={onEnd}>
        End call
      </button>
    </div>
  );
}
