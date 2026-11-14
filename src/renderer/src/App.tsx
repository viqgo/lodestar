import { useEffect, useState } from "react";
import type { CliStatus, SessionSummary, SubjectSummary } from "../../shared/types";
import { CliGate } from "./components/CliGate";
import { KnowledgeScreen } from "./components/KnowledgeScreen";
import { LessonScreen } from "./components/LessonScreen";
import { NewLessonForm } from "./components/NewLessonForm";
import { ProfileScreen } from "./components/ProfileScreen";
import { ReviewScreen } from "./components/ReviewScreen";
import { NewSubjectForm } from "./components/NewSubjectForm";
import { Sidebar } from "./components/Sidebar";
import { SubjectScreen } from "./components/SubjectScreen";

type Screen =
  | { name: "new" }
  | { name: "lesson"; id: string; start: boolean }
  | { name: "newSubject" }
  | { name: "subject"; id: string; start: boolean }
  | { name: "knowledge" }
  | { name: "profile" }
  | { name: "review" };

export function App() {
  const [screen, setScreen] = useState<Screen>({ name: "new" });
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [subjects, setSubjects] = useState<SubjectSummary[]>([]);
  const [clis, setClis] = useState<CliStatus[] | null>(null);
  const [due, setDue] = useState(0);

  const reload = () => {
    window.api.listSessions().then(setSessions);
    window.api.listSubjects().then(setSubjects);
  };

  const reloadDue = () => {
    void window.api
      .dueItems({ subjectId: null, sessionId: null })
      .then((r) => setDue(r.due.length));
  };

  useEffect(() => {
    reloadDue();
  }, [screen.name]);

  useEffect(
    () => () => {
      if (screen.name === "review") void window.api.practiceStop();
    },
    [screen.name],
  );

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
    const offSession = window.api.onSessionUpdated(() => {
      reload();
      reloadDue();
    });
    const offSubject = window.api.onSubjectUpdated(() => reload());
    return () => {
      offSession();
      offSubject();
    };
  }, []);

  const retry = () => setClis(null);
  const disabled = clis === null || !clis.some((c) => c.installed);
  const activeId = screen.name === "lesson" ? screen.id : null;
  const activeSubjectId = screen.name === "subject" ? screen.id : null;

  let content;
  if (screen.name === "knowledge") {
    content = <KnowledgeScreen />;
  } else if (screen.name === "profile") {
    content = <ProfileScreen />;
  } else if (screen.name === "review") {
    content = (
      <ReviewScreen
        statuses={clis ?? []}
        lastUsed={sessions[0]?.cli ?? null}
        sessions={sessions}
        subjects={subjects}
        onChanged={reloadDue}
      />
    );
  } else if (screen.name === "newSubject") {
    content = (
      <div className="content">
        <NewSubjectForm
          disabled={disabled}
          statuses={clis ?? []}
          lastUsed={sessions[0]?.cli ?? null}
          onCreated={(s) => {
            setScreen({ name: "subject", id: s.id, start: true });
            reload();
          }}
        />
      </div>
    );
  } else if (screen.name === "subject") {
    content = (
      <SubjectScreen
        key={screen.id}
        id={screen.id}
        start={screen.start}
        onOpenLesson={(id, start) => {
          setScreen({ name: "lesson", id, start });
          reload();
        }}
      />
    );
  } else if (screen.name === "lesson") {
    content = (
      <LessonScreen
        key={screen.id}
        id={screen.id}
        start={screen.start}
        statuses={clis}
        onRetryDetect={retry}
      />
    );
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
        subjects={subjects}
        activeSubjectId={activeSubjectId}
        onNewSubject={() => setScreen({ name: "newSubject" })}
        onOpenSubject={(id) => setScreen({ name: "subject", id, start: false })}
        onDeleteSubject={async (id) => {
          await window.api.deleteSubject(id);
          const openLesson =
            screen.name === "lesson" ? sessions.find((x) => x.id === screen.id) : undefined;
          if (activeSubjectId === id || openLesson?.subjectId === id) setScreen({ name: "new" });
          reload();
        }}
        onKnowledge={() => setScreen({ name: "knowledge" })}
        onProfile={() => setScreen({ name: "profile" })}
        due={due}
        onReview={() => setScreen({ name: "review" })}
      />
      <div className="main">
        <CliGate clis={clis} onRetry={retry} />
        {content}
      </div>
    </div>
  );
}
