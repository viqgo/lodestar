import { useEffect, useState } from "react";
import type { CliStatus, SessionSummary } from "../../shared/types";
import { CliGate } from "./components/CliGate";
import { KnowledgeScreen } from "./components/KnowledgeScreen";
import { LessonScreen } from "./components/LessonScreen";
import { NewLessonForm } from "./components/NewLessonForm";
import { ProfileScreen } from "./components/ProfileScreen";
import { Sidebar } from "./components/Sidebar";

type Screen =
  | { name: "new" }
  | { name: "lesson"; id: string; start: boolean }
  | { name: "knowledge" }
  | { name: "profile" };

export function App() {
  const [screen, setScreen] = useState<Screen>({ name: "new" });
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [clis, setClis] = useState<CliStatus[] | null>(null);

  const reload = () => {
    window.api.listSessions().then(setSessions);
  };

  useEffect(() => {
    let live = true;
    if (clis === null) {
      window.api.detectClis().then((r) => {
        if (live) setClis(r);
      });
    }
    return () => {
      live = false;
    };
  }, [clis]);

  useEffect(() => {
    reload();
    return window.api.onSessionUpdated(() => reload());
  }, []);

  const retry = () => setClis(null);
  const disabled = clis === null || !clis.some((c) => c.installed);
  const activeId = screen.name === "lesson" ? screen.id : null;

  let content;
  if (screen.name === "knowledge") {
    content = <KnowledgeScreen />;
  } else if (screen.name === "profile") {
    content = <ProfileScreen />;
  } else if (screen.name === "lesson") {
    content = <LessonScreen key={screen.id} id={screen.id} start={screen.start} />;
  } else {
    content = (
      <div className="content">
        <NewLessonForm
          disabled={disabled}
          statuses={clis ?? []}
          lastUsed={sessions[0]?.cli ?? null}
          onCreated={(s) => {
            setScreen({ name: "lesson", id: s.id, start: true });
            reload();
          }}
        />
      </div>
    );
  }

  return (
    <div className="screen">
      <Sidebar
        sessions={sessions}
        activeId={activeId}
        newDisabled={disabled}
        onNew={() => setScreen({ name: "new" })}
        onOpen={(id) => setScreen({ name: "lesson", id, start: false })}
        onDelete={async (id) => {
          await window.api.deleteSession(id);
          if (activeId === id) setScreen({ name: "new" });
          reload();
        }}
        onKnowledge={() => setScreen({ name: "knowledge" })}
        onProfile={() => setScreen({ name: "profile" })}
      />
      <div className="main">
        <CliGate clis={clis} onRetry={retry} />
        {content}
      </div>
    </div>
  );
}
