// @vitest-environment jsdom
import "../helpers/dom";
import { act as rtlAct, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { deriveState } from "../../src/core/engine";
import { startMic } from "../../src/renderer/src/lib/mic";
import { shuffledOrder } from "../../src/renderer/src/lib/shuffle";
import { useCall } from "../../src/renderer/src/lib/useCall";
import type { Action, SessionEvent } from "../../src/shared/types";
import { A, act, choiceQ, cont, session, textQ, toRead, toTeach } from "../helpers/fixtures";
import { installApi } from "../helpers/dom";

vi.mock("../../src/renderer/src/lib/mic", () => ({ startMic: vi.fn() }));

type Props = Parameters<typeof useCall>[0];

const micStop = vi.fn();
let onChunk: (pcm: ArrayBuffer) => void = () => undefined;
let n = 0;

class FakeAudio {
  static instances: FakeAudio[] = [];
  url: string;
  play = vi.fn(async () => undefined);
  pause = vi.fn();
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(url: string) {
    this.url = url;
    FakeAudio.instances.push(this);
  }
}

beforeEach(() => {
  micStop.mockReset();
  n = 0;
  FakeAudio.instances = [];
  vi.stubGlobal("Audio", FakeAudio);
  URL.createObjectURL = vi.fn(() => "blob:" + ++n);
  URL.revokeObjectURL = vi.fn();
  vi.mocked(startMic).mockReset();
  vi.mocked(startMic).mockImplementation(async (cb) => {
    onChunk = cb;
    return { ok: true, stop: micStop };
  });
});

const lessonOf = (events: SessionEvent[], busy = false): Props => ({
  id: session().id,
  session: session(events),
  state: deriveState(events),
  busy,
  submit: vi.fn(),
});

const setup = (
  events: SessionEvent[],
  busy = false,
  over: Parameters<typeof installApi>[0] = {},
) => {
  const h = installApi({ voiceStart: vi.fn(async () => ({ ok: true })), ...over });
  const initial = lessonOf(events, busy);
  const hook = renderHook((p: Props) => useCall(p), { initialProps: initial });
  return { ...h, ...hook, initial };
};

async function started(events: SessionEvent[], busy = false) {
  const s = setup(events, busy);
  await rtlAct(async () => {
    s.result.current.start();
  });
  await waitFor(() => expect(s.result.current.state).not.toBe("off"));
  return s;
}

const probeText = [act(A.probe(textQ))];
const probeChoice = [act(A.probe())];

describe("useCall", () => {
  it("call_states_follow_events", async () => {
    const s = setup(probeText);
    expect(s.result.current.state).toBe("off");
    await rtlAct(async () => {
      s.result.current.start();
    });
    await waitFor(() => expect(s.result.current.state).toBe("listening"));
    rtlAct(() => s.emitVoiceState("speaking"));
    expect(s.result.current.state).toBe("speaking");
    rtlAct(() => s.emitVoiceState("listening"));
    s.rerender({ ...s.initial, busy: true });
    expect(s.result.current.state).toBe("thinking");
    rtlAct(() => s.result.current.end());
    expect(s.result.current.state).toBe("off");
    expect(s.api.voiceStop).toHaveBeenCalledTimes(1);
  });

  it("start opens the call, then the microphone, and sends its chunks", async () => {
    const s = await started(probeText);
    expect(s.api.voiceStart).toHaveBeenCalledWith(session().id);
    expect(vi.mocked(s.api.voiceStart).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(startMic).mock.invocationCallOrder[0]!,
    );
    const chunk = new ArrayBuffer(4);
    onChunk(chunk);
    expect(s.api.voiceAudio).toHaveBeenCalledWith(chunk);
  });

  it("a refused start shows its message", async () => {
    const s = setup(probeText, false, {
      voiceStart: vi.fn(async () => ({
        ok: false,
        message: "Add a Deepgram key in Profile to use voice.",
      })),
    });
    await rtlAct(async () => {
      s.result.current.start();
    });
    await waitFor(() =>
      expect(s.result.current.error).toBe("Add a Deepgram key in Profile to use voice."),
    );
    expect(startMic).not.toHaveBeenCalled();
    expect(s.result.current.state).toBe("off");
  });

  it("mic_refused_message (call)", async () => {
    vi.mocked(startMic).mockImplementation(async () => ({ ok: false }));
    const s = setup(probeText);
    await rtlAct(async () => {
      s.result.current.start();
    });
    await waitFor(() =>
      expect(s.result.current.error).toBe(
        "Microphone access was refused. Allow it in System Settings, then start the call again.",
      ),
    );
    expect(s.api.voiceStop).toHaveBeenCalled();
    expect(s.result.current.state).toBe("off");
  });

  it("interim_text_fills_answer_box", async () => {
    const s = await started(probeText);
    rtlAct(() => s.emitVoiceTranscript("the der", false));
    expect(s.result.current.heard).toBe("the der");
    rtlAct(() => s.emitVoiceTranscript("the derivative", true));
    rtlAct(() => s.emitVoiceTranscript("is", false));
    expect(s.result.current.heard).toBe("the derivative is");

    const b = await started(probeText, true);
    rtlAct(() => b.emitVoiceTranscript("hello", false));
    expect(b.result.current.heard).toBe("");
  });

  it("utterance_end_submits_non_empty_answer", async () => {
    const s = await started(probeText);
    rtlAct(() => s.emitVoiceTranscript("the derivative", true));
    rtlAct(() => s.emitVoiceTranscript("is the slope", true));
    rtlAct(() => s.emitVoiceUtterance());
    expect(s.initial.submit).toHaveBeenCalledTimes(1);
    expect(s.initial.submit).toHaveBeenCalledWith(
      { choiceIndex: null, text: "the derivative is the slope", reasoning: null, confidence: null },
      [],
    );
    expect(s.result.current.heard).toBe("");
    rtlAct(() => s.emitVoiceUtterance());
    expect(s.initial.submit).toHaveBeenCalledTimes(1);
  });

  it("voice_answers_have_no_confidence", async () => {
    const t = await started(probeText);
    rtlAct(() => t.emitVoiceTranscript("an answer", true));
    rtlAct(() => t.emitVoiceUtterance());
    const c = await started(probeChoice);
    rtlAct(() => c.emitVoiceTranscript("option a", true));
    rtlAct(() => c.emitVoiceUtterance());
    for (const s of [t, c]) {
      const a = vi.mocked(s.initial.submit).mock.calls[0]![0];
      expect(a.confidence).toBeNull();
      expect(a.reasoning).toBeNull();
    }
  });

  it("start_over_clears", async () => {
    const s = await started(probeText);
    rtlAct(() => s.emitVoiceTranscript("something", true));
    expect(s.result.current.heard).not.toBe("");
    rtlAct(() => s.result.current.startOver());
    expect(s.result.current.heard).toBe("");
    rtlAct(() => s.emitVoiceUtterance());
    expect(s.initial.submit).not.toHaveBeenCalled();
  });

  it("a spoken choice is matched in the order on screen", async () => {
    const order = shuffledOrder(session().id + ":0", 3);
    const s = await started(probeChoice);
    rtlAct(() => s.emitVoiceTranscript("option a", true));
    rtlAct(() => s.emitVoiceUtterance());
    expect(s.initial.submit).toHaveBeenCalledWith(
      { choiceIndex: order[0], text: null, reasoning: null, confidence: null },
      [],
    );
    const b = await started(probeChoice);
    rtlAct(() => b.emitVoiceTranscript("the third one", true));
    rtlAct(() => b.emitVoiceUtterance());
    expect(b.initial.submit).toHaveBeenCalledWith(
      { choiceIndex: order[2], text: null, reasoning: null, confidence: null },
      [],
    );
  });

  it("unmatched_choice_asks_again", async () => {
    const s = await started(probeChoice);
    rtlAct(() => s.emitVoiceTranscript("maybe", true));
    rtlAct(() => s.emitVoiceUtterance());
    expect(s.api.voiceSpeak).toHaveBeenCalledWith("I did not catch which option. Say the letter.");
    expect(s.initial.submit).not.toHaveBeenCalled();
    expect(s.result.current.heard).toBe("");
  });

  it("reading_needs_read_it", async () => {
    const s = await started(toTeach);
    s.rerender(lessonOf([...toTeach, ...toRead()]));
    expect(s.api.voiceSpeak).not.toHaveBeenCalledWith("reading");
    const lesson = lessonOf([...toTeach, ...toRead()]);
    s.rerender(lesson);
    rtlAct(() => s.emitVoiceTranscript("read it", true));
    rtlAct(() => s.emitVoiceUtterance());
    expect(s.api.voiceSpeak).toHaveBeenCalledWith("reading");
    expect(lesson.submit).not.toHaveBeenCalled();
  });

  it("continue_by_voice", async () => {
    const events = [...toTeach, ...toRead()];
    const s = await started(events);
    rtlAct(() => s.emitVoiceTranscript("continue", true));
    rtlAct(() => s.emitVoiceUtterance());
    const none = { choiceIndex: null, text: null, reasoning: null, confidence: null };
    expect(s.initial.submit).toHaveBeenCalledWith(none, []);

    const b = await started(events);
    rtlAct(() => b.emitVoiceTranscript("Next.", true));
    rtlAct(() => b.emitVoiceUtterance());
    expect(b.initial.submit).toHaveBeenCalledWith(none, []);

    const c = await started(events);
    rtlAct(() => c.emitVoiceTranscript("what", true));
    rtlAct(() => c.emitVoiceUtterance());
    expect(c.initial.submit).not.toHaveBeenCalled();
  });

  it("new feedback and questions are read aloud", async () => {
    const before = [...toTeach, ...toRead(), cont()];
    const s = await started(before);
    const explain = act({
      ...(A.explain() as Extract<Action, { type: "explain" }>),
      feedback: "**Good.**",
    });
    const after = [...before, explain];
    s.rerender(lessonOf(after));
    const order = shuffledOrder(session().id + ":" + (after.length - 1), 3);
    const [x, y, z] = order.map((k) => choiceQ.options[k]);
    expect(s.api.voiceSpeak).toHaveBeenCalledTimes(1);
    expect(s.api.voiceSpeak).toHaveBeenCalledWith(
      `Good.\n\nPick\nOption A: ${x}\nOption B: ${y}\nOption C: ${z}`,
    );
  });

  it("nothing on screen is read when the call starts", async () => {
    const s = await started(probeChoice);
    expect(s.api.voiceSpeak).not.toHaveBeenCalled();
  });

  it("tutor audio is played one piece after the other", async () => {
    const s = await started(probeText);
    rtlAct(() => s.emitVoiceAudio(new Uint8Array([1])));
    rtlAct(() => s.emitVoiceAudio(new Uint8Array([1])));
    expect(FakeAudio.instances).toHaveLength(1);
    expect(FakeAudio.instances[0]!.play).toHaveBeenCalled();
    rtlAct(() => FakeAudio.instances[0]!.onended!());
    expect(FakeAudio.instances).toHaveLength(2);
    expect(FakeAudio.instances[1]!.play).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:1");
  });

  it("the hub is told when playback has finished", async () => {
    const s = await started(probeChoice);
    rtlAct(() => s.emitVoiceTranscript("maybe", true));
    rtlAct(() => s.emitVoiceUtterance());
    await rtlAct(async () => undefined);
    expect(s.api.voiceSpeak).toHaveBeenCalledTimes(1);
    rtlAct(() => s.emitVoiceState("speaking"));
    rtlAct(() => s.emitVoiceAudio(new Uint8Array([1])));
    rtlAct(() => FakeAudio.instances[0]!.onended!());
    expect(s.api.voiceSkip).toHaveBeenCalledTimes(1);

    let release: () => void = () => undefined;
    const pending = new Promise<void>((r) => (release = r));
    const b = await started(probeChoice);
    vi.mocked(b.api.voiceSpeak).mockImplementation(() => pending);
    rtlAct(() => b.emitVoiceTranscript("maybe", true));
    rtlAct(() => b.emitVoiceUtterance());
    rtlAct(() => b.emitVoiceState("speaking"));
    rtlAct(() => b.emitVoiceAudio(new Uint8Array([1])));
    const audio = FakeAudio.instances[FakeAudio.instances.length - 1]!;
    rtlAct(() => audio.onended!());
    expect(b.api.voiceSkip).not.toHaveBeenCalled();
    await rtlAct(async () => release());
    expect(b.api.voiceSkip).toHaveBeenCalledTimes(1);
  });

  it("skip stops the audio and tells the hub", async () => {
    const s = await started(probeText);
    rtlAct(() => s.emitVoiceAudio(new Uint8Array([1])));
    rtlAct(() => s.emitVoiceAudio(new Uint8Array([1])));
    rtlAct(() => s.result.current.skip());
    expect(FakeAudio.instances[0]!.pause).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:2");
    expect(s.api.voiceSkip).toHaveBeenCalledTimes(1);
    rtlAct(() => FakeAudio.instances[0]!.onended?.());
    expect(FakeAudio.instances).toHaveLength(1);
  });

  it("Space skips while the tutor speaks but not while typing", async () => {
    const s = await started(probeText);
    const press = (target: Element) =>
      rtlAct(() => {
        target.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", bubbles: true }));
      });
    press(document.body);
    expect(s.api.voiceSkip).not.toHaveBeenCalled();
    rtlAct(() => s.emitVoiceState("speaking"));
    const area = document.createElement("textarea");
    document.body.appendChild(area);
    press(area);
    expect(s.api.voiceSkip).not.toHaveBeenCalled();
    press(document.body);
    expect(s.api.voiceSkip).toHaveBeenCalledTimes(1);
    area.remove();
  });

  it("deepgram_failure_ends_call_lesson_continues (call)", async () => {
    const s = await started(probeText);
    rtlAct(() => s.emitVoiceError("the connection closed"));
    expect(s.result.current.error).toBe("Voice stopped: the connection closed.");
    expect(s.result.current.state).toBe("off");
    expect(micStop).toHaveBeenCalled();
    expect(s.initial.submit).not.toHaveBeenCalled();
  });

  it("call_ends_when_lesson_closes", async () => {
    const s = await started(probeText);
    s.unmount();
    expect(s.api.voiceStop).toHaveBeenCalled();
    expect(micStop).toHaveBeenCalled();

    const b = setup(probeText);
    b.unmount();
    expect(b.api.voiceStop).not.toHaveBeenCalled();
  });
});
