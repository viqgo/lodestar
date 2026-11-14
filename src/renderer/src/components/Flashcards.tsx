import { useState } from "react";
import type { DueItem } from "../../../shared/types";
import { MarkdownView } from "./MarkdownView";

export function Flashcards(props: {
  due: DueItem[];
  onGrade(itemId: string, correct: boolean): void;
}) {
  const [index, setIndex] = useState(0);
  const [shown, setShown] = useState(false);
  const d = props.due[index];
  if (!d) return null;

  const grade = (correct: boolean) => {
    props.onGrade(d.item.id, correct);
    setShown(false);
    setIndex(index + 1);
  };

  return (
    <div className="flashcard">
      <span className="label">
        Flashcard · <span className={"box-" + d.review.box}>box {d.review.box}</span>
      </span>
      <MarkdownView markdown={d.review.front ?? ""} />
      {!shown ? (
        <div className="row">
          <button className="btn is-primary" onClick={() => setShown(true)}>
            Show answer
          </button>
        </div>
      ) : (
        <>
          <MarkdownView markdown={d.item.text} />
          <div className="row">
            <button className="btn" onClick={() => grade(false)}>
              I did not
            </button>
            <button className="btn is-primary" onClick={() => grade(true)}>
              I knew it
            </button>
          </div>
        </>
      )}
    </div>
  );
}
