import { chunkSpeech } from "../../core/voice";
import { SPEAK_CHUNK_MAX } from "../../shared/limits";
import type { Settings } from "../../shared/types";
import type { Listener, ListenerEvents } from "./deepgram";
import type { Secrets } from "../secrets";

type Call = {
  lessonId: string;
  key: string;
  voice: string;
  listener: Listener;
  speaking: boolean;
  round: number;
  queue: Promise<void>;
};

export function createVoiceHub(deps: {
  secrets: Pick<Secrets, "get">;
  settings(): Promise<Settings>;
  listen: (key: string, language: string, on: ListenerEvents) => Listener;
  speak: (
    key: string,
    voice: string,
    text: string,
  ) => Promise<{ ok: true; audio: Buffer } | { ok: false; message: string }>;
  send(channel: string, ...args: unknown[]): void;
}): {
  start(lessonId: string): Promise<{ ok: true } | { ok: false; message: string }>;
  audio(chunk: Buffer): void;
  say(text: string): Promise<void>;
  skip(): void;
  stop(lessonId?: string): void;
} {
  let call: Call | null = null;
  const stop = (lessonId?: string): void => {
    if (call === null || (lessonId !== undefined && call.lessonId !== lessonId)) return;
    const c = call;
    call = null;
    c.listener.close();
    deps.send("voice:state", "off");
  };

  const fail = (message: string): void => {
    deps.send("voice:error", message);
    stop();
  };

  const start = async (
    lessonId: string,
  ): Promise<{ ok: true } | { ok: false; message: string }> => {
    const key = await deps.secrets.get();
    if (key === null) return { ok: false, message: "Add a Deepgram key in Profile to use voice." };
    const settings = await deps.settings();
    if (call !== null) stop();
    const c: Call = {
      lessonId,
      key,
      voice: settings.voice.voice,
      listener: deps.listen(key, settings.voice.language, {
        transcript: (text, final) => {
          if (call === c) deps.send("voice:transcript", text, final);
        },
        utteranceEnd: () => {
          if (call === c) deps.send("voice:utterance");
        },
        error: (message) => {
          if (call === c) fail(message);
        },
      }),
      speaking: false,
      round: 0,
      queue: Promise.resolve(),
    };
    call = c;
    deps.send("voice:state", "listening");
    return { ok: true };
  };

  const audio = (chunk: Buffer): void => {
    if (call !== null && !call.speaking) call.listener.send(chunk);
  };

  const say = (text: string): Promise<void> => {
    if (call === null) return Promise.resolve();
    const c = call;
    if (!c.speaking) {
      c.speaking = true;
      deps.send("voice:state", "speaking");
    }
    const round = c.round;
    c.queue = c.queue
      .catch(() => undefined)
      .then(async () => {
        for (const piece of chunkSpeech(text, SPEAK_CHUNK_MAX)) {
          if (call !== c || c.round !== round) return;
          const r = await deps.speak(c.key, c.voice, piece);
          if (call !== c || c.round !== round) return;
          if (!r.ok) {
            fail(r.message);
            return;
          }
          deps.send("voice:audio", r.audio);
        }
      });
    return c.queue;
  };

  const skip = (): void => {
    if (call === null || !call.speaking) return;
    call.round++;
    call.speaking = false;
    deps.send("voice:state", "listening");
  };

  return { start, audio, say, skip, stop };
}

export type VoiceHub = ReturnType<typeof createVoiceHub>;
