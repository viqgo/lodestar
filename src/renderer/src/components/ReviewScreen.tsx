import { useEffect, useRef, useState } from "react";
import { defaultCli } from "../../../shared/clis";
import type {
  CliId,
  CliStatus,
  DueItem,
  ReviewFilter,
  SessionSummary,
  SubjectSummary,
  TurnError,
} from "../../../shared/types";
import { dateLabel } from "../lib/time";
import { Banner } from "./Banner";
import { Flashcards } from "./Flashcards";
import { PracticeRun } from "./PracticeRun";
import { ThinkingBar } from "./ThinkingBar";
import { TutorPicker } from "./TutorPicker";

type Loaded = { due: DueItem[]; nextDue: string | null };
type Run = { kind: "cards"; cards: DueItem[] } | { kind: "practice"; due: DueItem[]; n: number };

function toFilter(value: string): ReviewFilter {
  if (value.startsWith("u:")) return { subjectId: value.slice(2), sessionId: null };
  if (value.startsWith("s:")) return { subjectId: null, sessionId: value.slice(2) };
  return { subjectId: null, sessionId: null };
}

export function ReviewScreen(props: {
  statuses: CliStatus[];
  lastUsed: CliId | null;
  sessions: SessionSummary[];
  subjects: SubjectSummary[];
  onChanged(): void;
}) {
  const [filter, setFilter] = useState("");
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [picked, setPicked] = useState<CliId | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [ended, setEnded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<TurnError | null>(null);
  const counter = useRef(0);
  const graded = useRef(0);
  const current = useRef(filter);
  current.current = filter;

  const cli = picked ?? defaultCli(props.statuses, props.lastUsed);
  const active = run !== null && !ended;

  async function load(value: string = current.current): Promise<Loaded | null> {
    const r = await window.api.dueItems(toFilter(value));
    if (current.current !== value) return null;
    setLoaded(r);
    return r;
  }

  useEffect(() => {
    void load(filter);
  }, [filter]);

  async function startFlashcards() {
    if (loaded === null || cli === null) return;
    setError(null);
    let list = loaded.due;
    const need = list.filter((d) => d.review.front === null).map((d) => d.item.id);
    if (need.length > 0) {
      setBusy(true);
      try {
        const r = await window.api.practiceFronts(need, cli);
        if (!r.ok) {
          setError(r.error);
          return;
        }
        const next = await load();
        if (next === null) return;
        list = next.due;
      } finally {
        setBusy(false);
      }
    }
    const cards = list.filter((d) => d.review.front !== null);
    if (cards.length === 0) return;
    graded.current = 0;
    setEnded(false);
    setRun({ kind: "cards", cards });
  }

  function grade(itemId: string, correct: boolean) {
    const saved = window.api.recordReview(itemId, correct);
    graded.current += 1;
    if (run !== null && run.kind === "cards" && graded.current === run.cards.length) {
      void Promise.resolve(saved).then(() => {
        setRun(null);
        void load();
        props.onChanged();
      });
    }
  }

  function startPractice() {
    if (loaded === null) return;
    counter.current += 1;
    setEnded(false);
    setRun({ kind: "practice", due: loaded.due, n: counter.current });
  }

  function finished() {
    setEnded(true);
    void load();
    props.onChanged();
  }

  const disabled = loaded === null || loaded.due.length === 0 || cli === null || busy;

  return (
    <div className="content">
      <h3>Review</h3>
      {loaded !== null ? (
        loaded.due.length > 0 ? (
          <p className="note">{`${loaded.due.length} due`}</p>
        ) : (
          <p className="note">
            {loaded.nextDue !== null
              ? `Nothing is due. The next item comes back on ${dateLabel(loaded.nextDue)}.`
              : "Nothing is due."}
          </p>
        )
      ) : null}
      <div className="field">
        <label className="label" htmlFor="review-filter">
          Filter
        </label>
        <select
          id="review-filter"
          value={filter}
          disabled={active}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="">All</option>
          {props.subjects.length > 0 ? (
            <optgroup label="Subjects">
              {props.subjects.map((x) => (
                <option key={x.id} value={"u:" + x.id}>
                  {x.name}
                </option>
              ))}
            </optgroup>
          ) : null}
          {props.sessions.length > 0 ? (
            <optgroup label="Lessons">
              {props.sessions.map((x) => (
                <option key={x.id} value={"s:" + x.id}>
                  {x.topic}
                </option>
              ))}
            </optgroup>
          ) : null}
        </select>
      </div>
      <TutorPicker statuses={props.statuses} value={cli} disabled={active} onChange={setPicked} />
      {run !== null && run.kind === "cards" ? <Flashcards due={run.cards} onGrade={grade} /> : null}
      {run !== null && run.kind === "practice" && cli !== null ? (
        <PracticeRun key={run.n} due={run.due} cli={cli} onEnd={finished} />
      ) : null}
      {!active ? (
        <div className="row">
          <button
            className="btn is-primary"
            disabled={disabled}
            onClick={() => void startFlashcards()}
          >
            Flashcards
          </button>
          <button className="btn" disabled={disabled} onClick={startPractice}>
            Practice
          </button>
        </div>
      ) : null}
      {busy ? <ThinkingBar onStop={() => void window.api.practiceStop()} /> : null}
      {error !== null ? (
        error.kind === "stopped" ? (
          <Banner
            kind="info"
            message="Stopped."
            actionLabel="Retry"
            onAction={() => void startFlashcards()}
          />
        ) : (
          <Banner
            kind="error"
            message={error.message}
            actionLabel="Retry"
            onAction={() => void startFlashcards()}
          />
        )
      ) : null}
    </div>
  );
}
