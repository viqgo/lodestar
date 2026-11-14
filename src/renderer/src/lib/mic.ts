export async function startMic(
  onChunk: (pcm: ArrayBuffer) => void,
): Promise<{ ok: true; stop(): void } | { ok: false }> {
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    return { ok: false };
  }
  let ctx: AudioContext | undefined;
  try {
    ctx = new AudioContext({ sampleRate: 16000 });
    await ctx.audioWorklet.addModule("pcm-worklet.js");
    const source = ctx.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(ctx, "pcm");
    const context = ctx;
    const step = context.sampleRate / 16000;
    let carry = new Float32Array(0);
    let pos = 0;
    let out = new Int16Array(1600);
    let n = 0;
    const block = (input: Float32Array): void => {
      const buf = new Float32Array(carry.length + input.length);
      buf.set(carry, 0);
      buf.set(input, carry.length);
      while (Math.ceil(pos) < buf.length) {
        const i = Math.floor(pos);
        const j = Math.ceil(pos);
        const s = buf[i] + (buf[j] - buf[i]) * (pos - i);
        out[n++] = Math.round(Math.max(-1, Math.min(1, s)) * 32767);
        if (n === 1600) {
          onChunk(out.buffer as ArrayBuffer);
          out = new Int16Array(1600);
          n = 0;
        }
        pos += step;
      }
      const keep = Math.min(Math.floor(pos), buf.length);
      carry = buf.slice(keep);
      pos -= keep;
    };
    node.port.onmessage = (e: MessageEvent) => block(e.data as Float32Array);
    source.connect(node);
    node.connect(context.destination);
    return {
      ok: true,
      stop(): void {
        node.port.onmessage = null;
        source.disconnect();
        node.disconnect();
        for (const t of stream.getTracks()) t.stop();
        void context.close();
      },
    };
  } catch {
    for (const t of stream.getTracks()) t.stop();
    void ctx?.close();
    return { ok: false };
  }
}
