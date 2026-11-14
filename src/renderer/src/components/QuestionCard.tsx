import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import type { Answer, Confidence, Question, Verdict } from "../../../shared/types";
import { displayName } from "../../../core/material";
import { ANSWER_TEXT_MAX, ATTACH_PER_ANSWER } from "../../../shared/limits";
import { shuffledOrder } from "../lib/shuffle";
import { MarkdownView } from "./MarkdownView";

type Purpose = "probe" | "predict" | "check";

type Props = {
  seed: string;
  purpose: Purpose;
  question: Question;
  answer: Answer | null;
  grade: Verdict | null;
  disabled: boolean;
  onSubmit(a: Answer, attachPaths: string[]): void;
  heard?: string | null;
  practice?: boolean;
};

const LABEL: Record<Purpose, string> = { probe: "Probe", predict: "Predict", check: "Check" };
const CONFIDENCE: { value: Confidence; label: string }[] = [
  { value: "sure", label: "Sure" },
  { value: "unsure", label: "Unsure" },
  { value: "guessing", label: "Guessing" },
];

export function QuestionCard({
  seed,
  purpose,
  question,
  answer,
  grade,
  disabled,
  onSubmit,
  heard,
  practice,
}: Props) {
  const [picked, setPicked] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [reasoning, setReasoning] = useState("");
  const [confidence, setConfidence] = useState<Confidence | null>(null);
  const [files, setFiles] = useState<string[]>([]);
  const [fileNote, setFileNote] = useState<string | null>(null);
  const textId = useId();
  const reasoningId = useId();

  const answered = answer !== null;
  const locked = disabled || answered;
  const isChoice = question.kind === "choice";
  const canSubmit = isChoice ? picked !== null : text.trim() !== "" || files.length > 0;
  const prevHeard = useRef("");
  useEffect(() => {
    const before = prevHeard.current;
    prevHeard.current = heard ?? "";
    if (
      heard !== null &&
      heard !== undefined &&
      !isChoice &&
      !answered &&
      (heard !== "" || before !== "")
    )
      setText(heard.slice(0, ANSWER_TEXT_MAX));
  }, [heard, isChoice, answered]);
  const selected = answered ? answer.choiceIndex : picked;

  function submit() {
    const r = reasoning.trim();
    onSubmit(
      {
        choiceIndex: isChoice ? picked : null,
        text: isChoice ? null : text.trim(),
        reasoning: r === "" ? null : r,
        confidence,
      },
      isChoice ? [] : files,
    );
  }

  async function attach() {
    const chosen = await window.api.pickFiles();
    const next = [...files];
    let over = false;
    for (const f of chosen) {
      if (next.includes(f)) continue;
      if (next.length >= ATTACH_PER_ANSWER) {
        over = true;
        break;
      }
      next.push(f);
    }
    setFiles(next);
    setFileNote(over ? "An answer can hold at most 3 files." : null);
  }

  function onKeyDown(event: KeyboardEvent) {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      if (canSubmit && !disabled && !answered) submit();
    }
  }

  function optionClass(i: number): string {
    let c = "option";
    if (selected === i) {
      c += " is-selected";
      if (answered && grade !== null) c += grade === "pass" ? " is-correct" : " is-wrong";
    }
    return c;
  }

  return (
    <div className="card" onKeyDown={onKeyDown}>
      <span className="label">{LABEL[purpose]}</span>
      <div className="prompt">
        <MarkdownView markdown={question.prompt} />
      </div>
      {isChoice ? (
        <div role="radiogroup" className="options">
          {shuffledOrder(seed, question.options.length).map((i) => (
            <label key={i} className={optionClass(i)}>
              <input
                type="radio"
                name={seed}
                checked={selected === i}
                onChange={() => setPicked(i)}
                disabled={locked}
              />
              <i />
              <MarkdownView markdown={question.options[i]!} />
            </label>
          ))}
        </div>
      ) : answered ? (
        <>
          <p>{answer.text}</p>
          {(answer.attachments ?? []).length > 0 && (
            <div className="row">
              {(answer.attachments ?? []).map((f) => (
                <span key={f} className="chip">
                  {displayName(f)}
                </span>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="field">
          <label className="label" htmlFor={textId}>
            Your answer
          </label>
          <textarea
            id={textId}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={
              purpose === "predict" ? "Take a guess. This is not graded." : "Type your answer"
            }
            maxLength={ANSWER_TEXT_MAX}
            disabled={locked}
          />
          {!practice && (
            <div className="row">
              {files.map((f) => {
                const name = f.split(/[\\/]/).pop() ?? f;
                return (
                  <span key={f} className="chip">
                    {name}
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={`Remove ${name}`}
                      disabled={locked}
                      onClick={() => {
                        setFiles(files.filter((x) => x !== f));
                        setFileNote(null);
                      }}
                    >
                      ×
                    </button>
                  </span>
                );
              })}
              <button type="button" className="btn" disabled={locked} onClick={() => void attach()}>
                Attach
              </button>
            </div>
          )}
          {!practice && fileNote !== null && <small>{fileNote}</small>}
        </div>
      )}
      {!answered && !practice && (
        <div className="field">
          <label className="label" htmlFor={reasoningId}>
            Your thinking (optional)
          </label>
          <textarea
            id={reasoningId}
            value={reasoning}
            onChange={(e) => setReasoning(e.target.value)}
            placeholder="Why do you think so?"
            disabled={locked}
          />
        </div>
      )}
      <div className="card-foot">
        {answered ? (
          grade !== null ? (
            <span className={grade === "pass" ? "grade is-pass" : "grade is-fail"}>
              {grade === "pass" ? "Correct" : "Not yet"}
            </span>
          ) : answer.confidence !== null ? (
            <span className="label">
              {CONFIDENCE.find((c) => c.value === answer.confidence)!.label}
            </span>
          ) : (
            <span />
          )
        ) : purpose === "probe" ? (
          <div className="segments">
            {CONFIDENCE.map((c) => (
              <button
                key={c.value}
                type="button"
                className={confidence === c.value ? "segment is-selected" : "segment"}
                onClick={() => setConfidence(confidence === c.value ? null : c.value)}
                disabled={locked}
              >
                {c.label}
              </button>
            ))}
          </div>
        ) : (
          <span />
        )}
        {answered ? (
          <span />
        ) : (
          <button
            type="button"
            className="btn is-primary"
            disabled={!canSubmit || disabled}
            onClick={submit}
          >
            Submit
          </button>
        )}
      </div>
    </div>
  );
}
