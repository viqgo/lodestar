import { useEffect, useRef } from "react";

export function ConfirmDialog(props: {
  message: string;
  confirmLabel: string;
  onConfirm(): void;
  onCancel(): void;
}) {
  const { onCancel } = props;
  const confirmRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCancel();
        return;
      }
      if (e.key !== "Tab") return;
      const box = dialogRef.current;
      const buttons = box?.querySelectorAll("button");
      if (!box || !buttons || buttons.length === 0) return;
      const first = buttons[0]!;
      const last = buttons[buttons.length - 1]!;
      const active = document.activeElement;
      const outside = !box.contains(active);
      if (e.shiftKey ? active === first || outside : active === last || outside) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  useEffect(() => {
    confirmRef.current?.focus();
  }, []);

  return (
    <div className="overlay" role="presentation">
      <div className="dialog" role="dialog" aria-modal="true" ref={dialogRef}>
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
