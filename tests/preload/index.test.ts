import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Answer, Session, TurnResult } from "../../src/shared/types";
import { UNITS, session, subject } from "../helpers/fixtures";

const QUESTION = { kind: "text" as const, prompt: "Say", options: [], correctIndex: null };
const FILTER = { subjectId: null, sessionId: null };
const ANSWER: Answer = { choiceIndex: 1, text: null, reasoning: null, confidence: null };
const SETTINGS = { voice: { language: "en", voice: "aura-2-thalia-en" } };
const SESSION: Session = session();
const RESULT: TurnResult = { ok: true, session: SESSION };

const expose = vi.fn();
const invoke = vi.fn();
const on = vi.fn();
const removeListener = vi.fn();
const send = vi.fn();

const load = async () => {
  await import("../../src/preload/index");
  return expose.mock.calls[0][1];
};

describe("preload", () => {
  beforeEach(() => {
    vi.resetModules();
    expose.mockReset();
    invoke.mockReset();
    on.mockReset();
    removeListener.mockReset();
    send.mockReset();
    invoke.mockResolvedValue("R");
    vi.doMock("electron", () => ({
      contextBridge: { exposeInMainWorld: expose },
      ipcRenderer: { invoke, on, removeListener, send },
    }));
  });

  it("preload exposes the api under window.api", async () => {
    const api = await load();
    expect(expose).toHaveBeenCalledTimes(1);
    expect(expose.mock.calls[0][0]).toBe("api");
    expect(Object.keys(api).sort()).toEqual(
      [
        "detectClis",
        "setSessionCli",
        "pickFolder",
        "pickFiles",
        "setSessionFolder",
        "setSessionWebSearch",
        "addAttachments",
        "removeAttachment",
        "listSessions",
        "createSession",
        "getSession",
        "deleteSession",
        "advance",
        "answer",
        "stop",
        "isRunning",
        "listKnowledge",
        "deleteKnowledge",
        "dueItems",
        "recordReview",
        "getProfile",
        "saveProfile",
        "getSettings",
        "saveSettings",
        "voiceHasKey",
        "voiceSetKey",
        "voiceRemoveKey",
        "voiceStart",
        "voiceAudio",
        "voiceSpeak",
        "voiceSkip",
        "voiceStop",
        "practiceFronts",
        "practiceAsk",
        "practiceGrade",
        "practiceStop",
        "getGraph",
        "aside",
        "onVoiceState",
        "onVoiceTranscript",
        "onVoiceUtterance",
        "onVoiceAudio",
        "onVoiceError",
        "onSessionUpdated",
        "onTurnEnded",
        "onAsideEnded",
        "listSubjects",
        "createSubject",
        "getSubject",
        "deleteSubject",
        "setSubjectFolder",
        "advanceSubject",
        "acceptOutline",
        "subjectMessage",
        "resolveChange",
        "startUnit",
        "stopSubject",
        "isSubjectRunning",
        "subjectStatuses",
        "onSubjectUpdated",
        "onSubjectEnded",
      ].sort(),
    );
  });

  it("each method calls its channel with its arguments", async () => {
    const api = await load();
    const input = {
      topic: "t",
      goal: "g",
      cli: "codex" as const,
      folder: null,
      webSearch: false,
      attachPaths: [],
    };
    const subjectInput = { name: "n", folder: "/f", cli: "codex" as const };
    const results = [
      await api.detectClis(),
      await api.listSessions(),
      await api.createSession(input),
      await api.getSession("a"),
      await api.deleteSession("a"),
      await api.advance("a"),
      await api.answer("a", ANSWER, ["/x.pdf"]),
      await api.stop("a"),
      await api.isRunning("a"),
      await api.listKnowledge(),
      await api.deleteKnowledge("k"),
      await api.getProfile(),
      await api.saveProfile("p"),
      await api.setSessionCli("a", "claude"),
      await api.pickFolder(),
      await api.pickFiles(),
      await api.setSessionFolder("a", "/f"),
      await api.setSessionWebSearch("a", true),
      await api.addAttachments("a", ["/x.pdf"]),
      await api.removeAttachment("a", "a1-x.pdf"),
      await api.listSubjects(),
      await api.createSubject(subjectInput),
      await api.getSubject("u"),
      await api.deleteSubject("u"),
      await api.advanceSubject("u"),
      await api.acceptOutline("u", UNITS),
      await api.subjectMessage("u", "hi"),
      await api.resolveChange("u", true),
      await api.startUnit("u", "u1"),
      await api.stopSubject("u"),
      await api.isSubjectRunning("u"),
      await api.subjectStatuses("u"),
      await api.getSettings(),
      await api.saveSettings(SETTINGS),
      await api.voiceHasKey(),
      await api.voiceSetKey("k"),
      await api.voiceRemoveKey(),
      await api.voiceStart("a"),
      await api.voiceSpeak("hi"),
      await api.voiceSkip(),
      await api.voiceStop("a"),
      await api.dueItems(FILTER),
      await api.recordReview("k", true),
      await api.practiceFronts(["k"], "claude"),
      await api.practiceAsk("k", "claude"),
      await api.practiceGrade("k", QUESTION, "words", "claude"),
      await api.practiceStop(),
      await api.getGraph(),
      await api.aside("a", "why"),
      await api.setSubjectFolder("u", "/f"),
    ];
    expect(invoke.mock.calls).toEqual([
      ["clis:detect"],
      ["sessions:list"],
      ["sessions:create", input],
      ["sessions:get", "a"],
      ["sessions:delete", "a"],
      ["lesson:advance", "a"],
      ["lesson:answer", "a", ANSWER, ["/x.pdf"]],
      ["lesson:stop", "a"],
      ["lesson:running", "a"],
      ["knowledge:list"],
      ["knowledge:delete", "k"],
      ["profile:get"],
      ["profile:save", "p"],
      ["sessions:setCli", "a", "claude"],
      ["dialog:pickFolder"],
      ["dialog:pickFiles"],
      ["sessions:setFolder", "a", "/f"],
      ["sessions:setWebSearch", "a", true],
      ["sessions:addAttachments", "a", ["/x.pdf"]],
      ["sessions:removeAttachment", "a", "a1-x.pdf"],
      ["subjects:list"],
      ["subjects:create", subjectInput],
      ["subjects:get", "u"],
      ["subjects:delete", "u"],
      ["subject:advance", "u"],
      ["subject:accept", "u", UNITS],
      ["subject:message", "u", "hi"],
      ["subject:resolveChange", "u", true],
      ["subject:startUnit", "u", "u1"],
      ["subject:stop", "u"],
      ["subject:running", "u"],
      ["subject:statuses", "u"],
      ["settings:get"],
      ["settings:save", SETTINGS],
      ["voice:hasKey"],
      ["voice:setKey", "k"],
      ["voice:removeKey"],
      ["voice:start", "a"],
      ["voice:say", "hi"],
      ["voice:skip"],
      ["voice:stop", "a"],
      ["review:due", FILTER],
      ["review:record", "k", true],
      ["practice:fronts", ["k"], "claude"],
      ["practice:ask", "k", "claude"],
      ["practice:grade", "k", QUESTION, "words", "claude"],
      ["practice:stop"],
      ["graph:get"],
      ["lesson:aside", "a", "why"],
      ["subjects:setFolder", "u", "/f"],
    ]);
    expect(results).toEqual(Array(50).fill("R"));
  });

  it("event subscriptions return an unsubscribe", async () => {
    const api = await load();
    const cb = vi.fn();
    const off = api.onSessionUpdated(cb);
    expect(on.mock.calls[0][0]).toBe("session:updated");
    const handler = on.mock.calls[0][1];
    handler({}, SESSION);
    expect(cb).toHaveBeenCalledWith(SESSION);
    off();
    expect(removeListener).toHaveBeenCalledWith("session:updated", handler);

    const cb2 = vi.fn();
    const off2 = api.onTurnEnded(cb2);
    expect(on.mock.calls[1][0]).toBe("turn:ended");
    const handler2 = on.mock.calls[1][1];
    handler2({}, "id", RESULT);
    expect(cb2).toHaveBeenCalledWith("id", RESULT);
    off2();
    expect(removeListener).toHaveBeenCalledWith("turn:ended", handler2);
  });

  it("preload forwards the subject events", async () => {
    const api = await load();
    const cb = vi.fn();
    const off = api.onSubjectUpdated(cb);
    expect(on.mock.calls[0][0]).toBe("subject:updated");
    const handler = on.mock.calls[0][1];
    handler({}, subject());
    expect(cb).toHaveBeenCalledWith(subject());
    off();
    expect(removeListener).toHaveBeenCalledWith("subject:updated", handler);

    const cb2 = vi.fn();
    const off2 = api.onSubjectEnded(cb2);
    expect(on.mock.calls[1][0]).toBe("subject:ended");
    const handler2 = on.mock.calls[1][1];
    const r = { ok: true, subject: subject() };
    handler2({}, "u", r);
    expect(cb2).toHaveBeenCalledWith("u", r);
    off2();
    expect(removeListener).toHaveBeenCalledWith("subject:ended", handler2);
  });

  it("preload forwards the voice events and sends audio one way", async () => {
    const api = await load();
    const subs: [string, string, unknown[]][] = [
      ["onVoiceState", "voice:state", ["listening"]],
      ["onVoiceTranscript", "voice:transcript", ["hi", true]],
      ["onVoiceUtterance", "voice:utterance", []],
      ["onVoiceAudio", "voice:audio", [new Uint8Array([1])]],
      ["onVoiceError", "voice:error", ["boom"]],
    ];
    for (const [name, channel, args] of subs) {
      on.mockClear();
      removeListener.mockClear();
      const cb = vi.fn();
      const off = api[name](cb);
      expect(on.mock.calls[0][0]).toBe(channel);
      const handler = on.mock.calls[0][1];
      handler({}, ...args);
      expect(cb).toHaveBeenCalledWith(...args);
      off();
      expect(removeListener).toHaveBeenCalledWith(channel, handler);
    }
    invoke.mockClear();
    const buf = new ArrayBuffer(4);
    api.voiceAudio(buf);
    expect(send).toHaveBeenCalledWith("voice:audio", buf);
    expect(invoke).not.toHaveBeenCalled();
  });
});
