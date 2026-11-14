import { describe, expect, it, vi } from "vitest";
import { createListener, listenUrl, speak } from "../../src/main/voice/deepgram";
import { fakeWebSocket } from "../helpers/fakes";

const KEY = "dg_test_key_123";
const STACK_URL =
  "wss://api.deepgram.com/v1/listen?model=nova-3&language=en&encoding=linear16&sample_rate=16000&channels=1&interim_results=true&smart_format=true&endpointing=300&utterance_end_ms=1200&vad_events=true";

function setup(language = "en") {
  const fake = fakeWebSocket();
  const on = { transcript: vi.fn(), utteranceEnd: vi.fn(), error: vi.fn() };
  const listener = createListener({ WebSocket: fake.WebSocket as any }, KEY, language, on);
  return { fake, on, listener, ws: fake.sockets[0] };
}

const results = (transcript: string, extra: object = {}) => ({
  type: "Results",
  channel: { alternatives: [{ transcript }] },
  ...extra,
});

describe("deepgram", () => {
  it("listen_url_and_header_are_exact", () => {
    expect(listenUrl("en")).toBe(STACK_URL);
    const { fake, ws } = setup();
    expect(fake.sockets).toHaveLength(1);
    expect(ws.url).toBe(STACK_URL);
    expect(ws.options).toEqual({ headers: { Authorization: "Token dg_test_key_123" } });
  });

  it("listenUrl encodes what it is given", () => {
    expect(listenUrl("en&x=1")).toContain("language=en%26x%3D1");
  });

  it("listener passes interim and final transcripts on", () => {
    const { on, ws } = setup();
    ws.open();
    ws.message(results("the der", { is_final: false }));
    ws.message(results("the derivative", { is_final: true }));
    ws.message(results("", { is_final: true }));
    expect(on.transcript).toHaveBeenCalledTimes(2);
    expect(on.transcript).toHaveBeenNthCalledWith(1, "the der", false);
    expect(on.transcript).toHaveBeenNthCalledWith(2, "the derivative", true);
  });

  it("listener reports the end of an utterance only on UtteranceEnd", () => {
    const { on, ws } = setup();
    ws.open();
    ws.message(results("hello", { speech_final: true }));
    expect(on.utteranceEnd).not.toHaveBeenCalled();
    ws.message({ type: "UtteranceEnd" });
    expect(on.utteranceEnd).toHaveBeenCalledTimes(1);
  });

  it("listener ignores messages it cannot read", () => {
    const { on, ws } = setup();
    ws.open();
    expect(() => {
      ws.message("not json");
      ws.message({ type: "Metadata" });
      ws.message({ type: "SpeechStarted" });
      ws.message({ type: "Results" });
    }).not.toThrow();
    expect(on.transcript).not.toHaveBeenCalled();
    expect(on.utteranceEnd).not.toHaveBeenCalled();
    expect(on.error).not.toHaveBeenCalled();
  });

  it("listener sends audio only while the socket is open", () => {
    const { listener, ws } = setup();
    const chunk = Buffer.from([1, 2, 3]);
    listener.send(chunk);
    expect(ws.sent).toEqual([]);
    ws.open();
    listener.send(chunk);
    expect(ws.sent).toEqual([chunk]);
    expect(ws.sent[0]).toBe(chunk);
    listener.close();
    const count = ws.sent.length;
    listener.send(chunk);
    expect(ws.sent).toHaveLength(count);
  });

  it("listener sends KeepAlive every 5 seconds and stops after close", () => {
    vi.useFakeTimers();
    try {
      const { listener, ws } = setup();
      ws.open();
      vi.advanceTimersByTime(10_000);
      expect(ws.sent).toEqual(['{"type":"KeepAlive"}', '{"type":"KeepAlive"}']);
      listener.close();
      const count = ws.sent.length;
      vi.advanceTimersByTime(10_000);
      expect(ws.sent).toHaveLength(count);
    } finally {
      vi.useRealTimers();
    }
  });

  it("close sends CloseStream and silences later events", () => {
    const { on, listener, ws } = setup();
    ws.open();
    listener.close();
    expect(ws.sent[ws.sent.length - 1]).toBe('{"type":"CloseStream"}');
    expect(ws.closed).toBe(true);
    ws.message(results("late", { is_final: true }));
    ws.message({ type: "UtteranceEnd" });
    ws.fail("boom");
    ws.drop();
    expect(on.transcript).not.toHaveBeenCalled();
    expect(on.utteranceEnd).not.toHaveBeenCalled();
    expect(on.error).not.toHaveBeenCalled();

    const other = setup();
    other.listener.close();
    expect(other.ws.terminated).toBe(true);
    expect(other.ws.closed).toBe(false);
    expect(other.ws.sent).toEqual([]);
  });

  it("wrong_key_message", async () => {
    const { on, ws } = setup();
    ws.fail("Unexpected server response: 401");
    expect(on.error).toHaveBeenCalledWith("the Deepgram key was not accepted");
    const fetch = vi.fn(async () => new Response("no", { status: 401 }));
    const r = await speak({ fetch: fetch as any }, KEY, "aura-2-thalia-en", "Hello.");
    expect(r).toEqual({ ok: false, message: "the Deepgram key was not accepted" });
  });

  it("listener reports a failure once and never names the key", () => {
    const { on, ws } = setup();
    ws.fail("socket hang up");
    ws.fail("again");
    ws.drop();
    expect(on.error).toHaveBeenCalledTimes(1);
    expect(on.error).toHaveBeenCalledWith("socket hang up");

    const b = setup();
    b.ws.drop();
    expect(b.on.error).toHaveBeenCalledTimes(1);
    expect(b.on.error).toHaveBeenCalledWith("the connection closed");
    for (const call of [...on.error.mock.calls, ...b.on.error.mock.calls]) {
      expect(String(call[0])).not.toContain(KEY);
    }
  });

  it("speak never returns the key in an error text", async () => {
    const f = vi.fn(async () => {
      throw new Error("request to https://x failed, Token " + KEY);
    });
    const r = await speak({ fetch: f as any }, KEY, "v", "t");
    expect(r).toEqual({ ok: false, message: "the connection failed" });
    expect(JSON.stringify(r)).not.toContain(KEY);
  });

  it("a listener error never carries the key", () => {
    const { on, ws } = setup();
    ws.fail("bad header Token " + KEY);
    expect(on.error).toHaveBeenCalledWith("the connection failed");
    expect(JSON.stringify(on.error.mock.calls)).not.toContain(KEY);
  });

  it("speak request carries a timeout signal", async () => {
    const fetch = vi.fn(async () => new Response(new Uint8Array([1])));
    await speak({ fetch: fetch as any }, KEY, "v", "t");
    const init = (fetch.mock.calls as any)[0][1];
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("speak_request_is_exact", async () => {
    const fetch = vi.fn(async () => new Response(new Uint8Array([1, 2, 3])));
    const r = await speak({ fetch: fetch as any }, KEY, "aura-2-thalia-en", "Hello.");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith("https://api.deepgram.com/v1/speak?model=aura-2-thalia-en", {
      method: "POST",
      headers: { Authorization: "Token dg_test_key_123", "Content-Type": "application/json" },
      body: '{"text":"Hello."}',
      signal: expect.any(AbortSignal),
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect([...r.audio]).toEqual([1, 2, 3]);

    const f500 = vi.fn(async () => new Response("x", { status: 500 }));
    expect(await speak({ fetch: f500 as any }, KEY, "v", "t")).toEqual({
      ok: false,
      message: "Deepgram answered with status 500",
    });
    const off = vi.fn(async () => {
      throw new Error("offline");
    });
    expect(await speak({ fetch: off as any }, KEY, "v", "t")).toEqual({
      ok: false,
      message: "offline",
    });
  });
});
