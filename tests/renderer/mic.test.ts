// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startMic } from "../../src/renderer/src/lib/mic";

type Msg = { data: Float32Array };
type FakeNode = {
  name: string;
  port: { onmessage: ((e: Msg) => void) | null };
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
};

let rate = 16000;
let contexts: FakeContext[] = [];
let node: FakeNode | null = null;
let source: { connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> };
let addModuleFails = false;
const track = { stop: vi.fn() };

class FakeContext {
  sampleRate = rate;
  options: unknown;
  destination = {};
  audioWorklet = {
    addModule: vi.fn(async () => {
      if (addModuleFails) throw new Error("no");
    }),
  };
  createMediaStreamSource = vi.fn(() => source);
  close = vi.fn(async () => undefined);
  constructor(options: unknown) {
    this.options = options;
    contexts.push(this);
  }
}

class FakeNodeClass {
  constructor(_ctx: unknown, name: string) {
    const n: FakeNode = { name, port: { onmessage: null }, connect: vi.fn(), disconnect: vi.fn() };
    node = n;
    return n as unknown as FakeNodeClass;
  }
}

function install(getUserMedia?: () => Promise<unknown>): void {
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: getUserMedia ?? vi.fn(async () => ({ getTracks: () => [track] })) },
  });
}

function post(values: Float32Array, size = 128): void {
  for (let i = 0; i < values.length; i += size) {
    node!.port.onmessage!({ data: values.slice(i, i + size) });
  }
}

beforeEach(() => {
  rate = 16000;
  contexts = [];
  node = null;
  addModuleFails = false;
  track.stop = vi.fn();
  source = { connect: vi.fn(), disconnect: vi.fn() };
  vi.stubGlobal("AudioContext", FakeContext);
  vi.stubGlobal("AudioWorkletNode", FakeNodeClass);
  install();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("startMic", () => {
  it("mic_refused_message (mic)", async () => {
    install(vi.fn(async () => Promise.reject(new Error("denied"))));
    const r = await startMic(vi.fn());
    expect(r).toEqual({ ok: false });
    expect(contexts).toHaveLength(0);
  });

  it("startMic asks for 16 kHz, loads the worklet and connects the microphone", async () => {
    const r = await startMic(vi.fn());
    expect(r.ok).toBe(true);
    expect(contexts[0].options).toEqual({ sampleRate: 16000 });
    expect(contexts[0].audioWorklet.addModule).toHaveBeenCalledWith("pcm-worklet.js");
    expect(node!.name).toBe("pcm");
    expect(source.connect).toHaveBeenCalledWith(node);
    const text = readFileSync("src/renderer/public/pcm-worklet.js", "utf8");
    expect(text).toContain('registerProcessor("pcm"');
    expect(text).toContain("postMessage");
  });

  it("chunks are 100 ms of 16 kHz Int16", async () => {
    const chunks: ArrayBuffer[] = [];
    await startMic((b) => chunks.push(b));
    post(new Float32Array(1600).fill(0.5));
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBeInstanceOf(ArrayBuffer);
    expect(chunks[0].byteLength).toBe(3200);
    expect(Array.from(new Int16Array(chunks[0])).every((s) => s === 16384)).toBe(true);
    post(new Float32Array(100).fill(0.5));
    expect(chunks).toHaveLength(1);
  });

  it("samples are clamped to the Int16 range", async () => {
    const chunks: ArrayBuffer[] = [];
    await startMic((b) => chunks.push(b));
    post(new Float32Array(1600).fill(2));
    post(new Float32Array(1600).fill(-2));
    expect(new Int16Array(chunks[0])[0]).toBe(32767);
    expect(new Int16Array(chunks[1])[0]).toBe(-32767);
  });

  it("a 48 kHz microphone is resampled to 16 kHz", async () => {
    rate = 48000;
    const chunks: ArrayBuffer[] = [];
    await startMic((b) => chunks.push(b));
    const value = new Float32Array(4800);
    for (let k = 0; k < 4800; k++) value[k] = k / 4800;
    post(value);
    expect(chunks).toHaveLength(1);
    const out = new Int16Array(chunks[0]);
    for (let m = 0; m < 1600; m++) {
      expect(out[m]).toBe(Math.round(Math.fround((3 * m) / 4800) * 32767));
    }
  });

  it("stop releases the microphone and sends nothing more", async () => {
    const onChunk = vi.fn();
    const r = await startMic(onChunk);
    if (!r.ok) throw new Error("expected ok");
    const handler = node!.port.onmessage;
    r.stop();
    expect(track.stop).toHaveBeenCalled();
    expect(contexts[0].close).toHaveBeenCalled();
    expect(source.disconnect).toHaveBeenCalled();
    expect(node!.disconnect).toHaveBeenCalled();
    expect(node!.port.onmessage).toBeNull();
    expect(handler).not.toBeNull();
    node!.port.onmessage?.({ data: new Float32Array(1600).fill(0.5) });
    expect(onChunk).not.toHaveBeenCalled();
  });

  it("a worklet that cannot be loaded releases the microphone", async () => {
    addModuleFails = true;
    const r = await startMic(vi.fn());
    expect(r).toEqual({ ok: false });
    expect(track.stop).toHaveBeenCalled();
    expect(contexts[0].close).toHaveBeenCalled();
  });
});
