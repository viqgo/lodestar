import type { CliStatus } from "../../../shared/types";
import { Banner } from "./Banner";

export function CliGate(props: { clis: CliStatus[] | null; onRetry(): void }) {
  if (props.clis === null || props.clis.some((c) => c.installed)) return null;
  return (
    <Banner
      kind="error"
      message="No AI CLI found. Install Codex, Claude Code or Gemini CLI and sign in, then press Retry."
      actionLabel="Retry"
      onAction={props.onRetry}
    />
  );
}
