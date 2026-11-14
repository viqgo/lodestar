import { useEffect, useRef, useState } from "react";
import type { Answer, CliId, DueItem, Question, TurnError, Verdict } from "../../../shared/types";
import { PRACTICE_MAX } from "../../../shared/limits";
import { Banner } from "./Banner";
import { MarkdownView } from "./MarkdownView";
import { QuestionCard } from "./QuestionCard";
import { ThinkingBar } from "./ThinkingBar";

type Step = "ask" | "answer" | "grade" | "graded" | "done";

const SAVE_ERROR: TurnError = { kind: "cli", message: "Could not save. Check free disk space." };

export function PracticeRun(props: { due: DueItem[]; cli: CliId; onEnd?(): void }) {
  const items = useRef(props.due.slice(0, PRACTICE_MAX)).current;
  const [index, setIndex] = useState(0);
  const [step, setStep] = useState<Step>(items.length === 0 ? "done" : "ask");
  const [question, setQuestion] = useState<Question | null>(null);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [grade, setGrade] = useState<Verdict | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<TurnError | null>(null);
  const [correct, setCorrect] = useState(0);
  const asked = useRef(-1);
  const ended = useRef(false);

  async function ask() {
    setError(null);
    try {
      const r = await window.api.practiceAsk(items[index]!.item.id, props.cli);
      if (r.ok) {
        setQuestion(r.question);
        setStep("answer");
      } else setError(r.error);
    } catch {
      setError(SAVE_ERROR);
    }
  }

  useEffect(() => {
    if (step !== "ask" || asked.current === index) return;
    asked.current = index;
    void ask();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, step]);

  useEffect(() => {
    if (step === "done" && items.length === 0 && !ended.current) {
      ended.current = true;
      props.onEnd?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  function finish(ok: boolean, text: string | null) {
    setGrade(ok ? "pass" : "fail");
    setFeedback(text);
    if (ok) setCorrect(correct + 1);
    void window.api.recordReview(items[index]!.item.id, ok);
    setStep("graded");
  }

  async function gradeNow(text: string) {
    setError(null);
    try {
      const r = await window.api.practiceGrade(items[index]!.item.id, question!, text, props.cli);
      if (r.ok) finish(r.verdict === "pass", r.feedback);
      else setError(r.error);
    } catch {
      setError(SAVE_ERROR);
    }
  }

  function submit(a: Answer) {
    setAnswer(a);
    if (question!.kind === "choice") {
      finish(a.choiceIndex === question!.correctIndex, null);
    } else {
      setStep("grade");
      void gradeNow(a.text ?? "");
    }
  }

  function next() {
    if (index === items.length - 1) {
      setStep("done");
      props.onEnd?.();
      return;
    }
    setIndex(index + 1);
    setQuestion(null);
    setAnswer(null);
    setGrade(null);
    setFeedback(null);
    setStep("ask");
  }

  function retry() {
    if (step === "ask") void ask();
    else if (step === "grade") void gradeNow(answer?.text ?? "");
  }

  if (step === "done") {
    return (
      <p>
        {correct} of {items.length} correct.
      </p>
    );
  }

  return (
    <div>
      {question !== null && step !== "ask" && (
        <QuestionCard
          key={index}
          seed={"practice:" + items[index]!.item.id + ":" + index}
          purpose="check"
          question={question}
          answer={answer}
          grade={grade}
          disabled={step !== "answer"}
          onSubmit={submit}
          practice
        />
      )}
      {step === "graded" && (
        <>
          {feedback !== null && (
            <div className="reading">
              <MarkdownView markdown={feedback} />
            </div>
          )}
          <div className="row">
            <button className="btn is-primary" onClick={next}>
              Continue
            </button>
          </div>
        </>
      )}
      {(step === "ask" || step === "grade") && error === null && (
        <ThinkingBar onStop={() => void window.api.practiceStop()} />
      )}
      {error !== null &&
        (error.kind === "stopped" ? (
          <Banner kind="info" message="Stopped." actionLabel="Retry" onAction={retry} />
        ) : (
          <Banner kind="error" message={error.message} actionLabel="Retry" onAction={retry} />
        ))}
    </div>
  );
}
