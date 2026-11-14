export function ThinkingBar(props: { onStop(): void }) {
  return (
    <div className="thinking">
      <span>Thinking…</span>
      <button className="btn" onClick={props.onStop}>
        Stop
      </button>
    </div>
  );
}
