import type { DetectResult } from "../../../shared/types";
import { Banner } from "./Banner";

export function CliGate(props: { cli: DetectResult | null; onRetry(): void }) {
  if (props.cli === null || props.cli.ok) return null;
  return (
    <Banner
      kind="error"
      message="Codex CLI not found. Install it and sign in, then press Retry."
      actionLabel="Retry"
      onAction={props.onRetry}
    />
  );
}
