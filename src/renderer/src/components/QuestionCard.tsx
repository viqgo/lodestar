import { useId, useState } from "react";
import type { KeyboardEvent } from "react";
import type { Answer, Confidence, Question, Verdict } from "../../../shared/types";
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
  onSubmit(a: Answer): void;
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
}: Props) {
  const [picked, setPicked] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [reasoning, setReasoning] = useState("");
  const [confidence, setConfidence] = useState<Confidence | null>(null);
  const textId = useId();
  const reasoningId = useId();

  const answered = answer !== null;
  const locked = disabled || answered;
  const isChoice = question.kind === "choice";
  const canSubmit = isChoice ? picked !== null : text.trim() !== "";
  const selected = answered ? answer.choiceIndex : picked;

  function submit() {
    const r = reasoning.trim();
    onSubmit({
      choiceIndex: isChoice ? picked : null,
      text: isChoice ? null : text.trim(),
      reasoning: r === "" ? null : r,
      confidence,
    });
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
        <div role="radiogroup">
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
        <p>{answer.text}</p>
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
            disabled={locked}
          />
        </div>
      )}
      {!answered && (
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
