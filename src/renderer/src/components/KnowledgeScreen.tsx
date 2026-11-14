import { useEffect, useState } from "react";
import type { KnowledgeView } from "../../../shared/types";
import { relativeTime } from "../lib/time";

export function KnowledgeScreen() {
  const [items, setItems] = useState<KnowledgeView[] | null>(null);

  const reload = () => {
    window.api.listKnowledge().then(setItems);
  };

  const remove = async (id: string) => {
    await window.api.deleteKnowledge(id);
    reload();
  };

  useEffect(() => {
    reload();
  }, []);

  const nowIso = new Date().toISOString();
  return (
    <div className="content">
      <h3>Knowledge</h3>
      <p className="note">What you have shown you understand. Later lessons start from here.</p>
      {items !== null && items.length === 0 ? (
        <p className="note">
          Nothing here yet. Finish a lesson and what you learned will appear here.
        </p>
      ) : null}
      {items !== null && items.length > 0 ? (
        <div>
          {items.map((item) => (
            <div key={item.id} className="k-row">
              <div>
                {item.text}
                <br />
                <span className="label">
                  {`${item.lessonTopic ?? "Deleted lesson"} · ${relativeTime(item.createdAt, nowIso)}`}
                </span>
              </div>
              <button
                className="icon-btn"
                aria-label="Delete item"
                onClick={() => void remove(item.id)}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
