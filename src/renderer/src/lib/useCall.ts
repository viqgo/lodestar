import { useEffect, useRef, useState } from "react";
import { matchChoice, speechText, spokenQuestion, voiceCommand } from "../../../core/voice";
import { ANSWER_TEXT_MAX } from "../../../shared/limits";
import type { Answer, CallState, LessonState, Question, Session } from "../../../shared/types";
import { startMic } from "./mic";
import { shuffledOrder } from "./shuffle";

type CallLesson = {
  id: string;
  session: Session | null;
  state: LessonState | null;
  busy: boolean;
  blocked?: boolean;
  submit(a: Answer, attachPaths: string[]): void;
};

const MIC_REFUSED =
  "Microphone access was refused. Allow it in System Settings, then start the call again.";

export function useCall(lesson: CallLesson): {
  state: CallState;
  heard: string;
  error: string | null;
  start(): void;
  end(): void;
  skip(): void;
  startOver(): void;
} {
  const [on, setOn] = useState(false);
  const [hub, setHub] = useState<"listening" | "speaking">("listening");
  const [heard, setHeard] = useState("");
  const [error, setError] = useState<string | null>(null);

  const lessonRef = useRef(lesson);
  lessonRef.current = lesson;
  const onRef = useRef(false);
  const speakingRef = useRef(false);
  const micRef = useRef<{ stop(): void } | null>(null);
  const finalsRef = useRef<string[]>([]);
  const interimRef = useRef("");
  const spokenUpToRef = useRef(0);
  const queueRef = useRef<string[]>([]);
  const currentRef = useRef<HTMLAudioElement | null>(null);
  const currentUrlRef = useRef<string | null>(null);
  const openRef = useRef(0);
  const epochRef = useRef(0);
  const startingRef = useRef(false);
  const unmountedRef = useRef(false);

  const heardNow = (): string =>
    [...finalsRef.current, interimRef.current].filter((s) => s !== "").join(" ");
  const clearHeard = (): void => {
    finalsRef.current = [];
    interimRef.current = "";
    setHeard("");
  };
  const seedOf = (eventIndex: number): string => lessonRef.current.id + ":" + eventIndex;
  const shown = (q: Question, eventIndex: number): Question =>
    q.kind === "text"
      ? q
      : {
          ...q,
          options: shuffledOrder(seedOf(eventIndex), q.options.length).map((k) => q.options[k]!),
        };

  const stopPlayback = (): void => {
    const c = currentRef.current;
    if (c) {
      c.pause();
      c.onended = null;
      c.onerror = null;
    }
    if (currentUrlRef.current !== null) URL.revokeObjectURL(currentUrlRef.current);
    currentUrlRef.current = null;
    for (const url of queueRef.current) URL.revokeObjectURL(url);
    queueRef.current = [];
    currentRef.current = null;
  };
  const playbackDone = (): void => {
    if (
      onRef.current &&
      speakingRef.current &&
      openRef.current === 0 &&
      currentRef.current === null &&
      queueRef.current.length === 0
    ) {
      void window.api.voiceSkip();
    }
  };
  const playNext = (): void => {
    if (currentRef.current !== null) return;
    const url = queueRef.current.shift();
    if (url === undefined) {
      playbackDone();
      return;
    }
    const a = new Audio(url);
    currentRef.current = a;
    currentUrlRef.current = url;
    let ended = false;
    const finished = (): void => {
      if (ended || currentRef.current !== a) return;
      ended = true;
      URL.revokeObjectURL(url);
      currentUrlRef.current = null;
      currentRef.current = null;
      playNext();
    };
    a.onended = a.onerror = finished;
    a.play().catch(finished);
  };
  const say = (text: string): void => {
    if (text === "") return;
    openRef.current++;
    const done = (): void => {
      openRef.current--;
      playbackDone();
    };
    window.api.voiceSpeak(text).then(done, done);
  };
  const closeCall = (): void => {
    micRef.current?.stop();
    micRef.current = null;
    stopPlayback();
    openRef.current = 0;
    clearHeard();
    onRef.current = false;
    speakingRef.current = false;
    setOn(false);
    epochRef.current++;
  };

  const start = (): void => {
    if (onRef.current || startingRef.current) return;
    startingRef.current = true;
    void (async () => {
      try {
        setError(null);
        const mine = ++epochRef.current;
        let r: Awaited<ReturnType<typeof window.api.voiceStart>>;
        try {
          r = await window.api.voiceStart(lessonRef.current.id);
        } catch {
          setError("Voice stopped: could not start the call.");
          return;
        }
        if (!r.ok) {
          setError(r.message);
          return;
        }
        const m = await startMic((pcm) => window.api.voiceAudio(pcm));
        if (!m.ok) {
          void window.api.voiceStop(lessonRef.current.id);
          setError(MIC_REFUSED);
          return;
        }
        if (epochRef.current !== mine) {
          m.stop();
          if (unmountedRef.current) void window.api.voiceStop(lessonRef.current.id);
          return;
        }
        micRef.current = m;
        spokenUpToRef.current = (lessonRef.current.session?.events.length ?? 0) - 1;
        onRef.current = true;
        speakingRef.current = false;
        setOn(true);
        setHub("listening");
      } finally {
        startingRef.current = false;
      }
    })();
  };
  const end = (): void => {
    if (!onRef.current) return;
    void window.api.voiceStop(lessonRef.current.id);
    closeCall();
  };
  const skip = (): void => {
    if (!onRef.current) return;
    stopPlayback();
    speakingRef.current = false;
    void window.api.voiceSkip();
  };
  const startOver = (): void => clearHeard();

  useEffect(() => {
    unmountedRef.current = false;
    const offs = [
      window.api.onVoiceState((s) => {
        if (!onRef.current) return;
        if (s === "off") closeCall();
        else if (s === "listening" || s === "speaking") {
          setHub(s);
          speakingRef.current = s === "speaking";
          if (s === "speaking") clearHeard();
        }
      }),
      window.api.onVoiceTranscript((text, final) => {
        const l = lessonRef.current;
        if (!onRef.current || speakingRef.current || l.busy || l.blocked) return;
        if (l.state?.awaiting.who !== "learner") return;
        if (final) {
          finalsRef.current.push(text);
          interimRef.current = "";
        } else {
          interimRef.current = text;
        }
        setHeard(heardNow());
      }),
      window.api.onVoiceUtterance(() => {
        if (!onRef.current) return;
        const spoken = heardNow().trim();
        clearHeard();
        const l = lessonRef.current;
        if (spoken === "" || l.busy || l.blocked || !l.state) return;
        const a = l.state.awaiting;
        if (a.who !== "learner") return;
        const none: Answer = { choiceIndex: null, text: null, reasoning: null, confidence: null };
        if (a.purpose === "read") {
          const cmd = voiceCommand(spoken);
          if (cmd === "continue") l.submit(none, []);
          else if (cmd === "read") {
            const ev = l.session?.events[a.eventIndex];
            if (ev?.kind === "action" && ev.action.type === "teach") {
              say(speechText(ev.action.markdown));
            }
          }
        } else if (a.question.kind === "choice") {
          const options = a.question.options;
          const order = shuffledOrder(seedOf(a.eventIndex), options.length);
          const m = matchChoice(
            spoken,
            order.map((k) => options[k]!),
          );
          if (m === null) say("I did not catch which option. Say the letter.");
          else l.submit({ ...none, choiceIndex: order[m]! }, []);
        } else {
          l.submit({ ...none, text: spoken.slice(0, ANSWER_TEXT_MAX) }, []);
        }
      }),
      window.api.onVoiceAudio((bytes) => {
        if (!onRef.current || !speakingRef.current) return;
        queueRef.current.push(
          URL.createObjectURL(new Blob([bytes as BlobPart], { type: "audio/mpeg" })),
        );
        playNext();
      }),
      window.api.onVoiceError((message) => {
        setError("Voice stopped: " + message + ".");
        closeCall();
      }),
    ];
    return () => {
      for (const off of offs) off();
      unmountedRef.current = true;
      if (onRef.current || startingRef.current) {
        void window.api.voiceStop(lessonRef.current.id);
        closeCall();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const events = lesson.session?.events;
    if (!onRef.current || !events) return;
    const parts: string[] = [];
    for (let i = spokenUpToRef.current + 1; i < events.length; i++) {
      const ev = events[i]!;
      if (ev.kind !== "action") continue;
      const action = ev.action;
      if ("feedback" in action && action.feedback) parts.push(action.feedback);
      if (action.type === "probe" || action.type === "predict") {
        parts.push(spokenQuestion(shown(action.question, i)));
      } else if (action.type === "explain") {
        parts.push(spokenQuestion(shown(action.check, i)));
      }
    }
    if (events.length - 1 > spokenUpToRef.current) spokenUpToRef.current = events.length - 1;
    say(speechText(parts.join("\n\n")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson.session]);

  useEffect(() => {
    if (!on || hub !== "speaking") return;
    const onKey = (event: KeyboardEvent): void => {
      const t = event.target;
      if (
        t instanceof HTMLInputElement ||
        t instanceof HTMLTextAreaElement ||
        t instanceof HTMLSelectElement
      ) {
        return;
      }
      if (event.code === "Space") {
        event.preventDefault();
        skip();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, hub]);

  const state: CallState = !on
    ? "off"
    : hub === "speaking"
      ? "speaking"
      : lesson.busy
        ? "thinking"
        : "listening";
  return { state, heard, error, start, end, skip, startOver };
}
