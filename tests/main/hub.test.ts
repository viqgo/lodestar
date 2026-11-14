import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createVoiceHub } from "../../src/main/voice/hub";
import { DEFAULT_SETTINGS } from "../../src/core/settings";
import type { ListenerEvents } from "../../src/main/voice/deepgram";

const KEY = "dg_test_key_123";

type Speak = (
  key: string,
  voice: string,
  text: string,
) => Promise<{ ok: true; audio: Buffer } | { ok: false; message: string }>;

const setup = (key: string | null = KEY) => {
  const secrets = { get: vi.fn(async () => key) };
  const settings = vi.fn(async () => ({
    ...DEFAULT_SETTINGS,
    voice: { language: "de", voice: "aura-2-x" },
  }));
  const listeners: { key: string; language: string; on: ListenerEvents; send: any; close: any }[] =
    [];
  const listen = vi.fn((k: string, language: string, on: ListenerEvents) => {
    const l = { key: k, language, on, send: vi.fn(), close: vi.fn() };
    listeners.push(l);
    return l;
  });
  const speak = vi.fn<Speak>(async () => ({ ok: true, audio: Buffer.from([1]) }));
  const send = vi.fn();
  const hub = createVoiceHub({ secrets, settings, listen, speak, send });
  return { hub, secrets, listen, listeners, speak, send };
};

describe("voice hub", () => {
  it("start is refused without a key", async () => {
    const { hub, listen, send } = setup(null);
    expect(await hub.start("a")).toEqual({
      ok: false,
      message: "Add a Deepgram key in Profile to use voice.",
    });
    expect(listen).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("start opens the listener with the key and the speech language and reports listening", async () => {
    const { hub, listen, send } = setup();
    expect(await hub.start("a")).toEqual({ ok: true });
    expect(listen).toHaveBeenCalledTimes(1);
    expect(listen.mock.calls[0][0]).toBe(KEY);
    expect(listen.mock.calls[0][1]).toBe("de");
    expect(send).toHaveBeenCalledWith("voice:state", "listening");
  });

  it("transcripts and utterance ends are passed to the window", async () => {
    const { hub, listeners, send } = setup();
    await hub.start("a");
    listeners[0].on.transcript("hi", false);
    expect(send).toHaveBeenCalledWith("voice:transcript", "hi", false);
    listeners[0].on.utteranceEnd();
    expect(send).toHaveBeenCalledWith("voice:utterance");
  });

  it("mic_muted_while_speaking", async () => {
    const { hub, listeners, send } = setup();
    await hub.start("a");
    const a = Buffer.from([1]);
    const b = Buffer.from([2]);
    const c = Buffer.from([3]);
    hub.audio(a);
    expect(listeners[0].send).toHaveBeenCalledWith(a);
    await hub.say("Hi.");
    expect(send).toHaveBeenCalledWith("voice:state", "speaking");
    hub.audio(b);
    expect(listeners[0].send).not.toHaveBeenCalledWith(b);
    hub.skip();
    hub.audio(c);
    expect(listeners[0].send).toHaveBeenCalledWith(c);
  });

  it("say speaks each piece in order and sends its audio", async () => {
    const { hub, speak, send } = setup();
    await hub.start("a");
    await hub.say("x".repeat(4500));
    expect(speak).toHaveBeenCalledTimes(3);
    expect(speak.mock.calls.map((c) => [c[0], c[1], c[2].length])).toEqual([
      [KEY, "aura-2-x", 2000],
      [KEY, "aura-2-x", 2000],
      [KEY, "aura-2-x", 500],
    ]);
    expect(send.mock.calls.filter((c) => c[0] === "voice:audio")).toHaveLength(3);
    for (const c of send.mock.calls.filter((c) => c[0] === "voice:audio")) {
      expect(Buffer.isBuffer(c[1])).toBe(true);
    }
    expect(
      send.mock.calls.filter((c) => c[0] === "voice:state" && c[1] === "speaking"),
    ).toHaveLength(1);
  });

  it("skip_stops_speech", async () => {
    const { hub, speak, send } = setup();
    await hub.start("a");
    let release: (v: { ok: true; audio: Buffer }) => void = () => undefined;
    speak.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const done = hub.say("x".repeat(4500));
    await Promise.resolve();
    await Promise.resolve();
    hub.skip();
    expect(send).toHaveBeenCalledWith("voice:state", "listening");
    release({ ok: true, audio: Buffer.from([1]) });
    await done;
    expect(send.mock.calls.filter((c) => c[0] === "voice:audio")).toHaveLength(0);
    expect(speak).toHaveBeenCalledTimes(1);
    await hub.say("Again.");
    expect(speak).toHaveBeenCalledTimes(2);
  });

  it("deepgram_failure_ends_call_lesson_continues (hub)", async () => {
    const { hub, listeners, send, speak } = setup();
    await hub.start("a");
    listeners[0].on.error("the connection closed");
    expect(send).toHaveBeenCalledWith("voice:error", "the connection closed");
    expect(send).toHaveBeenLastCalledWith("voice:state", "off");
    expect(listeners[0].close).toHaveBeenCalled();
    hub.audio(Buffer.from([1]));
    expect(listeners[0].send).not.toHaveBeenCalled();
    send.mockClear();
    listeners[0].on.transcript("late", true);
    expect(send).not.toHaveBeenCalled();

    await hub.start("a");
    speak.mockResolvedValueOnce({ ok: false, message: "Deepgram answered with status 500" });
    send.mockClear();
    await hub.say("x".repeat(4500));
    expect(speak).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith("voice:error", "Deepgram answered with status 500");
    expect(send).toHaveBeenLastCalledWith("voice:state", "off");
    expect(listeners[1].close).toHaveBeenCalled();
    const channels = new Set(send.mock.calls.map((c) => c[0]));
    for (const c of channels) {
      expect([
        "voice:state",
        "voice:transcript",
        "voice:utterance",
        "voice:audio",
        "voice:error",
      ]).toContain(c);
    }
  });

  it("a hung speak does not block the next call's speech", async () => {
    const { hub, speak } = setup();
    await hub.start("a");
    speak.mockImplementationOnce(() => new Promise(() => undefined));
    void hub.say("first.");
    await Promise.resolve();
    await hub.start("b");
    await hub.say("second.");
    expect(speak).toHaveBeenCalledTimes(2);
    expect(speak.mock.calls[1][2]).toBe("second.");
  });

  it("one failing speech link does not silence later speech", async () => {
    const { hub, speak } = setup();
    await hub.start("a");
    speak.mockRejectedValueOnce(new Error("boom"));
    const first = hub.say("first.");
    const second = hub.say("second.");
    await first.catch(() => undefined);
    await second;
    expect(speak).toHaveBeenCalledTimes(2);
    expect(speak.mock.calls[1][2]).toBe("second.");
  });

  it("stop closes the listener and reports off", async () => {
    const { hub, listeners, send } = setup();
    await hub.start("a");
    send.mockClear();
    hub.stop();
    expect(listeners[0].close).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith("voice:state", "off");
    send.mockClear();
    hub.stop();
    expect(send).not.toHaveBeenCalled();
  });

  it("stop for another lesson leaves the call alone", async () => {
    const { hub, listeners, send } = setup();
    await hub.start("a");
    send.mockClear();
    hub.stop("b");
    expect(listeners[0].close).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalledWith("voice:state", "off");
    hub.stop("a");
    expect(listeners[0].close).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith("voice:state", "off");
    await hub.start("a");
    hub.stop();
    expect(listeners[1].close).toHaveBeenCalledTimes(1);
  });

  it("a second start replaces the running call", async () => {
    const { hub, listeners, send } = setup();
    await hub.start("a");
    send.mockClear();
    await hub.start("b");
    expect(listeners[0].close).toHaveBeenCalledTimes(1);
    expect(send.mock.calls).toEqual([
      ["voice:state", "off"],
      ["voice:state", "listening"],
    ]);
    send.mockClear();
    listeners[0].on.transcript("old", true);
    listeners[0].on.utteranceEnd();
    listeners[0].on.error("old failure");
    expect(send).not.toHaveBeenCalled();
    expect(listeners[1].close).not.toHaveBeenCalled();
  });

  it("say, skip and audio do nothing without a call", async () => {
    const { hub, speak, send, listeners } = setup();
    await hub.say("Hi.");
    hub.skip();
    hub.audio(Buffer.from([1]));
    expect(speak).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    expect(listeners).toHaveLength(0);
  });

  it("the key is never sent to the window", async () => {
    const { hub, listeners, send } = setup();
    const results: unknown[] = [];
    results.push(await hub.start("a"));
    await hub.say("Hi.");
    listeners[0].on.error("the connection closed");
    const refused = setup(null);
    results.push(await refused.hub.start("a"));
    expect(JSON.stringify(send.mock.calls)).not.toContain(KEY);
    expect(JSON.stringify(refused.send.mock.calls)).not.toContain(KEY);
    expect(JSON.stringify(results)).not.toContain(KEY);
  });

  it("no_audio_on_disk", () => {
    for (const f of ["src/main/voice/hub.ts", "src/main/voice/deepgram.ts"]) {
      const text = fs.readFileSync(path.join(process.cwd(), f), "utf8");
      expect(/from\s+"(node:)?fs(\/promises)?"/.test(text)).toBe(false);
      expect(/require\(/.test(text)).toBe(false);
      expect(/writeFile|appendFile|createWriteStream/.test(text)).toBe(false);
    }
  });
});
