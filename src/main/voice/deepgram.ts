import { SPEAK_TIMEOUT_MS } from "../../shared/limits";

export type ListenerEvents = {
  transcript(text: string, final: boolean): void;
  utteranceEnd(): void;
  error(message: string): void;
};

export type Listener = { send(chunk: Buffer): void; close(): void };

const safeMessage = (message: string, key: string): string =>
  key !== "" && message.includes(key) ? "the connection failed" : message;

const WRONG_KEY = "the Deepgram key was not accepted";

export function listenUrl(language: string): string {
  return (
    "wss://api.deepgram.com/v1/listen?model=nova-3&language=" +
    encodeURIComponent(language) +
    "&encoding=linear16&sample_rate=16000&channels=1&interim_results=true&smart_format=true&endpointing=300&utterance_end_ms=1200&vad_events=true"
  );
}

export function createListener(
  deps: { WebSocket: typeof import("ws").WebSocket },
  key: string,
  language: string,
  on: ListenerEvents,
): Listener {
  const ws = new deps.WebSocket(listenUrl(language), {
    headers: { Authorization: "Token " + key },
  });
  let done = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  const finish = () => {
    done = true;
    if (timer !== null) clearInterval(timer);
    timer = null;
  };

  ws.on("open", () => {
    if (done) return;
    timer = setInterval(() => ws.send(JSON.stringify({ type: "KeepAlive" })), 5000);
  });

  ws.on("message", (data: unknown) => {
    if (done) return;
    let m: {
      type?: unknown;
      is_final?: unknown;
      channel?: { alternatives?: { transcript?: unknown }[] };
    };
    try {
      m = JSON.parse(String(data));
    } catch {
      return;
    }
    if (m === null || typeof m !== "object") return;
    if (m.type === "Results") {
      const text = m.channel?.alternatives?.[0]?.transcript;
      if (typeof text === "string" && text !== "") on.transcript(text, m.is_final === true);
    } else if (m.type === "UtteranceEnd") {
      on.utteranceEnd();
    }
  });

  ws.on("error", (err: Error) => {
    if (done) return;
    finish();
    on.error(
      /Unexpected server response: 401/.test(err.message)
        ? WRONG_KEY
        : safeMessage(err.message, key),
    );
  });

  ws.on("close", () => {
    if (done) return;
    finish();
    on.error("the connection closed");
  });

  return {
    send(chunk) {
      if (!done && ws.readyState === 1) ws.send(chunk);
    },
    close() {
      if (done) return;
      finish();
      if (ws.readyState === 1) {
        ws.send(JSON.stringify({ type: "CloseStream" }));
        ws.close();
      } else {
        ws.terminate();
      }
    },
  };
}

export async function speak(
  deps: { fetch: typeof fetch },
  key: string,
  voice: string,
  text: string,
): Promise<{ ok: true; audio: Buffer } | { ok: false; message: string }> {
  try {
    const res = await deps.fetch(
      "https://api.deepgram.com/v1/speak?model=" + encodeURIComponent(voice),
      {
        method: "POST",
        headers: { Authorization: "Token " + key, "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
        signal: AbortSignal.timeout(SPEAK_TIMEOUT_MS),
      },
    );
    if (res.status === 401) return { ok: false, message: WRONG_KEY };
    if (!res.ok) return { ok: false, message: "Deepgram answered with status " + res.status };
    return { ok: true, audio: Buffer.from(await res.arrayBuffer()) };
  } catch (e) {
    return { ok: false, message: safeMessage(e instanceof Error ? e.message : String(e), key) };
  }
}
