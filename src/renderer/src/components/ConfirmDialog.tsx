import { useEffect, useRef } from "react";

export function ConfirmDialog(props: {
  message: string;
  confirmLabel: string;
  onConfirm(): void;
  onCancel(): void;
}) {
  const { onCancel } = props;
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  useEffect(() => {
    confirmRef.current?.focus();
  }, []);

  return (
    <div className="overlay" role="presentation">
      <div className="dialog" role="dialog" aria-modal="true">
        <p style={{ margin: 0 }}>{props.message}</p>
        <div className="actions">
          <button className="btn" onClick={props.onCancel}>
            Cancel
          </button>
          <button className="btn is-danger" ref={confirmRef} onClick={props.onConfirm}>
            {props.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
