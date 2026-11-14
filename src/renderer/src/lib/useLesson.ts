import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { deriveState } from "../../../core/engine";
import type { Answer, LessonState, Session, TurnError, TurnResult } from "../../../shared/types";

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
  asideError: string | null;
  ask(text: string): void;
  submit(a: Answer, attachPaths: string[]): void;
  retry(): void;
  stop(): void;
} {
  const [session, setSession] = useState<Session | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<TurnError | null>(null);
  const [asideError, setAsideError] = useState<string | null>(null);
  const started = useRef<string | null>(null);

  const onReject = useCallback(() => {
    setError(SAVE_ERROR);
    setBusy(false);
  }, []);

  const handleResult = useCallback((result: TurnResult) => {
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
  }, []);

  useEffect(() => {
    let cancelled = false;
    setSession(null);
    setBusy(false);
    setError(null);
    setAsideError(null);
    const offUpdated = window.api.onSessionUpdated((s) => {
      if (s.id === id) setSession(s);
    });
    const offEnded = window.api.onTurnEnded((endedId, result) => {
      if (endedId !== id) return;
      handleResult(result);
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
          window.api.advance(id).then(handleResult, onReject);
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
  }, [id, start, onReject, handleResult]);

  const state = useMemo(() => (session ? deriveState(session.events) : null), [session]);

  const submit = useCallback(
    (a: Answer, attachPaths: string[]) => {
      setError(null);
      setBusy(true);
      window.api.answer(id, a, attachPaths).then(handleResult, onReject);
    },
    [id, onReject, handleResult],
  );

  const retry = useCallback(() => {
    setError(null);
    setBusy(true);
    window.api.advance(id).then(handleResult, onReject);
  }, [id, onReject, handleResult]);

  const ask = useCallback(
    (text: string) => {
      setAsideError(null);
      setBusy(true);
      window.api.aside(id, text).then(
        (result) => {
          if (result.ok) {
            setSession(result.session);
            setBusy(false);
            return;
          }
          if (result.error.kind === "busy") return;
          setAsideError(result.error.message);
          setBusy(false);
        },
        () => {
          setAsideError(SAVE_ERROR.message);
          setBusy(false);
        },
      );
    },
    [id],
  );

  const stop = useCallback(() => {
    void window.api.stop(id);
  }, [id]);

  return { session, state, busy, error, asideError, ask, submit, retry, stop };
}
