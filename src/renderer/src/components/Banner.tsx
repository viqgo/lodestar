export function Banner(props: {
  kind: "error" | "info";
  message: string;
  actionLabel?: string;
  onAction?(): void;
}) {
  return (
    <div className={"banner is-" + props.kind} role={props.kind === "error" ? "alert" : "status"}>
      <span>{props.message}</span>
      {props.actionLabel && props.onAction ? (
        <button className="btn" onClick={props.onAction}>
          {props.actionLabel}
        </button>
      ) : null}
    </div>
  );
}
