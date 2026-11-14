import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { deriveState } from "../../../core/engine";
import type { Answer, LessonState, Session, TurnError } from "../../../shared/types";

const SAVE_ERROR: TurnError = {
  kind: "cli",
  message: "Could not save. Check free disk space.",
};

export function useLesson(
  id: string,
  start: boolean,
): {
  session: Session | null;
  state: LessonState | null;
  busy: boolean;
  error: TurnError | null;
  submit(a: Answer): void;
  retry(): void;
  stop(): void;
} {
  const [session, setSession] = useState<Session | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<TurnError | null>(null);
  const started = useRef<string | null>(null);

  const onReject = useCallback(() => {
    setError(SAVE_ERROR);
    setBusy(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setSession(null);
    setBusy(false);
    setError(null);
    const offUpdated = window.api.onSessionUpdated((s) => {
      if (s.id === id) setSession(s);
    });
    const offEnded = window.api.onTurnEnded((endedId, result) => {
      if (endedId !== id) return;
      if (result.ok) {
        setSession(result.session);
        setBusy(false);
        setError(null);
        return;
      }
      if (result.error.kind === "busy") return;
      if (result.session) setSession(result.session);
      setError(result.error);
      setBusy(false);
    });
    void (async () => {
      try {
        const [loaded, running] = await Promise.all([
          window.api.getSession(id),
          window.api.isRunning(id),
        ]);
        if (cancelled) return;
        setSession(loaded);
        setBusy(running);
        if (start && loaded && loaded.events.length === 0 && started.current !== id) {
          started.current = id;
          setBusy(true);
          window.api.advance(id).catch(onReject);
        }
      } catch {
        if (!cancelled) onReject();
      }
    })();
    return () => {
      cancelled = true;
      offUpdated();
      offEnded();
    };
  }, [id, start, onReject]);

  const state = useMemo(() => (session ? deriveState(session.events) : null), [session]);

  const submit = useCallback(
    (a: Answer) => {
      setError(null);
      setBusy(true);
      window.api.answer(id, a).catch(onReject);
    },
    [id, onReject],
  );

  const retry = useCallback(() => {
    setError(null);
    setBusy(true);
    window.api.advance(id).catch(onReject);
  }, [id, onReject]);

  const stop = useCallback(() => {
    void window.api.stop(id);
  }, [id]);

  return { session, state, busy, error, submit, retry, stop };
}
