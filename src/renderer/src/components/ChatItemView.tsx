import type { Answer } from "../../../shared/types";
import type { ChatItem } from "../lib/view";
import { MarkdownView } from "./MarkdownView";
import { QuestionCard } from "./QuestionCard";

type Props = {
  item: ChatItem;
  sessionId: string;
  disabled: boolean;
  onSubmit(a: Answer): void;
};

export function ChatItemView({ item, sessionId, disabled, onSubmit }: Props) {
  switch (item.kind) {
    case "text":
      return (
        <div className="reading">
          <MarkdownView markdown={item.markdown} />
        </div>
      );
    case "probe_summary":
      return (
        <div className="summary">
          <span className="label">What you already know</span>
          <ul>
            {item.known.map((k) => (
              <li key={k}>{k}</li>
            ))}
          </ul>
          <span className="label">Your goal</span>
          <p>{item.goal}</p>
        </div>
      );
    case "plan_notice":
      return <p className="note">{`Your path: ${item.count} steps`}</p>;
    case "question":
      return (
        <QuestionCard
          seed={`${sessionId}:${item.eventIndex}`}
          purpose={item.purpose}
          question={item.question}
          answer={item.answer}
          grade={item.grade}
          disabled={disabled}
          onSubmit={onSubmit}
        />
      );
  }
}
