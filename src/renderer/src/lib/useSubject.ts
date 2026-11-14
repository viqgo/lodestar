import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { deriveSubject } from "../../../core/subject";
import type {
  Subject,
  SubjectResult,
  SubjectState,
  TurnError,
  UnitStatus,
} from "../../../shared/types";

const SAVE_ERROR: TurnError = {
  kind: "cli",
  message: "Could not save. Check free disk space.",
};

export function useSubject(
  id: string,
  start: boolean,
): {
  subject: Subject | null;
  state: SubjectState | null;
  statuses: UnitStatus[];
  busy: boolean;
  error: TurnError | null;
  send(text: string): void;
  retry(): void;
  stop(): void;
} {
  const [subject, setSubject] = useState<Subject | null>(null);
  const [statuses, setStatuses] = useState<UnitStatus[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<TurnError | null>(null);
  const started = useRef<string | null>(null);

  const onReject = useCallback(() => {
    setError(SAVE_ERROR);
    setBusy(false);
  }, []);

  const handleResult = useCallback((result: SubjectResult) => {
    if (result.ok) {
      setSubject(result.subject);
      setBusy(false);
      setError(null);
      return;
    }
    if (result.error.kind === "busy") return;
    if (result.subject) setSubject(result.subject);
    setError(result.error);
    setBusy(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setSubject(null);
    setStatuses([]);
    setBusy(false);
    setError(null);
    const reloadStatuses = () => {
      window.api.subjectStatuses(id).then(
        (list) => {
          if (!cancelled) setStatuses(list);
        },
        () => undefined,
      );
    };
    const offUpdated = window.api.onSubjectUpdated((s) => {
      if (s.id !== id) return;
      setSubject(s);
      reloadStatuses();
    });
    const offEnded = window.api.onSubjectEnded((endedId, result) => {
      if (endedId !== id) return;
      handleResult(result);
    });
    const offSession = window.api.onSessionUpdated((s) => {
      if (s.subjectId === id) reloadStatuses();
    });
    void (async () => {
      try {
        const [loaded, running, list] = await Promise.all([
          window.api.getSubject(id),
          window.api.isSubjectRunning(id),
          window.api.subjectStatuses(id),
        ]);
        if (cancelled) return;
        setSubject(loaded);
        setBusy(running);
        setStatuses(list);
        if (start && loaded && loaded.events.length === 0 && started.current !== id) {
          started.current = id;
          setBusy(true);
          window.api.advanceSubject(id).then(handleResult, onReject);
        }
      } catch {
        if (!cancelled) onReject();
      }
    })();
    return () => {
      cancelled = true;
      offUpdated();
      offEnded();
      offSession();
    };
  }, [id, start, onReject, handleResult]);

  const state = useMemo(() => (subject ? deriveSubject(subject.events) : null), [subject]);

  const send = useCallback(
    (text: string) => {
      setError(null);
      setBusy(true);
      window.api.subjectMessage(id, text).then(handleResult, onReject);
    },
    [id, onReject, handleResult],
  );

  const retry = useCallback(() => {
    setError(null);
    setBusy(true);
    window.api.advanceSubject(id).then(handleResult, onReject);
  }, [id, onReject, handleResult]);

  const stop = useCallback(() => {
    void window.api.stopSubject(id);
  }, [id]);

  return { subject, state, statuses, busy, error, send, retry, stop };
}
