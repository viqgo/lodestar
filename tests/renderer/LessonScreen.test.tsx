// @vitest-environment jsdom
import "../helpers/dom";
import { act as rtlAct, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LessonScreen } from "../../src/renderer/src/components/LessonScreen";
import type { CliStatus, Session, SessionEvent } from "../../src/shared/types";
import { installApi } from "../helpers/dom";
import {
  A,
  act,
  asideEv,
  pick,
  session,
  textQ,
  toCheck,
  toPlan,
  toTeach,
} from "../helpers/fixtures";
import { startMic } from "../../src/renderer/src/lib/mic";
import { mergeSettings } from "../../src/core/settings";

vi.mock("../../src/renderer/src/components/PlanPanel", () => ({
  PlanPanel: () => <div data-testid="plan" />,
}));

vi.mock("../../src/renderer/src/lib/mic", () => ({
  startMic: vi.fn(async () => ({ ok: true, stop: vi.fn() })),
}));

const S = (events: SessionEvent[]) => session(events);
const ID = session().id;
const ALL: CliStatus[] = [
  { id: "codex", installed: true, version: "1" },
  { id: "claude", installed: true, version: "1" },
  { id: "gemini", installed: true, version: "1" },
];

describe("LessonScreen", () => {
  it("resume_shows_pending_question", async () => {
    installApi({ getSession: vi.fn(async () => S([act(A.probe())])) });
    render(<LessonScreen id={ID} start={false} statuses={ALL} onRetryDetect={() => {}} />);
    expect(await screen.findByText("T")).toBeInTheDocument();
    expect(screen.getByText("Goal: G")).toBeInTheDocument();
    expect(await screen.findByText("Pick")).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole("radio")[0]);
    expect(screen.getByRole("button", { name: "Submit" })).toBeEnabled();
  });

  it("LessonScreen starts a new lesson", async () => {
    const { api } = installApi({ getSession: vi.fn(async () => S([])) });
    render(<LessonScreen id={ID} start={true} statuses={ALL} onRetryDetect={() => {}} />);
    await screen.findByText("Thinking…");
    expect(api.advance).toHaveBeenCalledTimes(1);
  });

  it("LessonScreen shows thinking and disables the card", async () => {
    installApi({
      getSession: vi.fn(async () => S([act(A.probe())])),
      isRunning: vi.fn(async () => true),
    });
    render(<LessonScreen id={ID} start={false} statuses={ALL} onRetryDetect={() => {}} />);
    expect(await screen.findByText("Thinking…")).toBeInTheDocument();
    for (const radio of screen.getAllByRole("radio")) expect(radio).toBeDisabled();
  });

  it("LessonScreen Stop stops the turn", async () => {
    const { api } = installApi({
      getSession: vi.fn(async () => S([act(A.probe())])),
      isRunning: vi.fn(async () => true),
    });
    render(<LessonScreen id={ID} start={false} statuses={ALL} onRetryDetect={() => {}} />);
    await userEvent.click(await screen.findByRole("button", { name: "Stop" }));
    expect(api.stop).toHaveBeenCalledWith(ID);
  });

  it("LessonScreen shows a failed call and retries", async () => {
    const { api, emitEnded } = installApi({
      getSession: vi.fn(async () => S([act(A.probe()), pick(1)])),
    });
    render(<LessonScreen id={ID} start={false} statuses={ALL} onRetryDetect={() => {}} />);
    await screen.findByText("T");
    rtlAct(() =>
      emitEnded(ID, {
        ok: false,
        error: { kind: "cli", message: "Codex failed: boom" },
        session: null,
      }),
    );
    expect(await screen.findByText("Codex failed: boom")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(api.advance).toHaveBeenCalledTimes(1);
  });

  it("LessonScreen shows Stopped with Retry", async () => {
    const { emitEnded } = installApi({
      getSession: vi.fn(async () => S([act(A.probe()), pick(1)])),
    });
    render(<LessonScreen id={ID} start={false} statuses={ALL} onRetryDetect={() => {}} />);
    await screen.findByText("T");
    rtlAct(() =>
      emitEnded(ID, { ok: false, error: { kind: "stopped", message: "Stopped." }, session: null }),
    );
    expect(await screen.findByText("Stopped.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("LessonScreen shows a missing lesson without Retry", async () => {
    const { emitEnded } = installApi({ getSession: vi.fn(async () => null) });
    render(<LessonScreen id={ID} start={false} statuses={ALL} onRetryDetect={() => {}} />);
    await rtlAct(async () => {
      await Promise.resolve();
    });
    rtlAct(() =>
      emitEnded(ID, {
        ok: false,
        error: { kind: "not_found", message: "This lesson no longer exists." },
        session: null,
      }),
    );
    expect(await screen.findByText("This lesson no longer exists.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  });

  it("resume_offers_retry_for_interrupted_call", async () => {
    const { api } = installApi({
      getSession: vi.fn(async () => S([act(A.probe()), pick(1)])),
    });
    render(<LessonScreen id={ID} start={false} statuses={ALL} onRetryDetect={() => {}} />);
    expect(await screen.findByText("The last reply did not arrive.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(api.advance).not.toHaveBeenCalled();
  });

  it("LessonScreen shows the map only once there is a plan", async () => {
    installApi({ getSession: vi.fn(async () => S(toPlan)) });
    const first = render(
      <LessonScreen id={ID} start={false} statuses={ALL} onRetryDetect={() => {}} />,
    );
    await screen.findByText("T");
    expect(screen.queryByTestId("plan")).not.toBeInTheDocument();
    first.unmount();
    installApi({ getSession: vi.fn(async () => S(toTeach)) });
    render(<LessonScreen id={ID} start={false} statuses={ALL} onRetryDetect={() => {}} />);
    expect(await screen.findByTestId("plan")).toBeInTheDocument();
  });

  it("a finished lesson shows what was saved", async () => {
    const events = [
      ...toTeach,
      ...toCheck("n1"),
      pick(1),
      ...toCheck("n2"),
      pick(0),
      act(A.explain("n2")),
      pick(0),
      act(A.explain("n2")),
      pick(0),
      act(A.done()),
    ];
    installApi({ getSession: vi.fn(async () => S(events)) });
    render(<LessonScreen id={ID} start={false} statuses={ALL} onRetryDetect={() => {}} />);
    expect(await screen.findByText("Lesson complete")).toBeInTheDocument();
    expect(screen.getByText(/1 items added to your knowledge list\./)).toBeInTheDocument();
    expect(screen.getByText(/1 step is still shaky\./)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Submit" })).not.toBeInTheDocument();
  });

  it("reopening a lesson with no events offers Retry", async () => {
    const { api } = installApi({ getSession: vi.fn(async () => S([])) });
    render(<LessonScreen id={ID} start={false} statuses={ALL} onRetryDetect={() => {}} />);
    expect(await screen.findByText("The last reply did not arrive.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(api.advance).not.toHaveBeenCalled();
  });
  it("lesson_header_names_the_tutor", async () => {
    installApi({
      getSession: vi.fn(async () => ({ ...S([act(A.probe())]), cli: "claude" as const })),
    });
    render(<LessonScreen id={ID} start={false} statuses={ALL} onRetryDetect={() => {}} />);
    expect(await screen.findByText("Tutor: Claude Code")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Change tutor" })).toBeInTheDocument();
  });

  it("missing_cli_blocks_lesson_with_banner", async () => {
    const onRetryDetect = vi.fn();
    const { api } = installApi({
      getSession: vi.fn(async () => ({ ...S([act(A.probe()), pick(1)]), cli: "gemini" as const })),
    });
    const statuses: CliStatus[] = [
      { id: "codex", installed: true, version: "1" },
      { id: "claude", installed: true, version: "1" },
      { id: "gemini", installed: false, version: null },
    ];
    render(
      <LessonScreen id={ID} start={false} statuses={statuses} onRetryDetect={onRetryDetect} />,
    );
    expect(
      await screen.findByText("Gemini not found. Install it and sign in, then press Retry."),
    ).toBeInTheDocument();
    expect(screen.queryByText("The last reply did not arrive.")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Retry" })).toHaveLength(1);
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetryDetect).toHaveBeenCalledTimes(1);
    expect(api.advance).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Submit" })).not.toBeInTheDocument();
  });

  it("a missing CLI disables the pending card", async () => {
    installApi({
      getSession: vi.fn(async () => ({ ...S([act(A.probe())]), cli: "gemini" as const })),
    });
    const statuses: CliStatus[] = [
      { id: "codex", installed: true, version: "1" },
      { id: "claude", installed: true, version: "1" },
      { id: "gemini", installed: false, version: null },
    ];
    render(<LessonScreen id={ID} start={false} statuses={statuses} onRetryDetect={() => {}} />);
    expect(
      await screen.findByText("Gemini not found. Install it and sign in, then press Retry."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit" })).toBeDisabled();
  });

  it("switch_tutor_asks_then_stores", async () => {
    const { api, emitUpdated } = installApi({
      getSession: vi.fn(async () => S([act(A.probe())])),
      setSessionCli: vi.fn(async () => ({ ok: true, session: S([act(A.probe())]) })),
    });
    render(<LessonScreen id={ID} start={false} statuses={ALL} onRetryDetect={() => {}} />);
    await userEvent.click(await screen.findByRole("button", { name: "Change tutor" }));
    await userEvent.click(screen.getByRole("radio", { name: "Claude Code" }));
    expect(
      screen.getByText(
        "Switch this lesson to Claude Code? It will read the whole lesson so far and continue from there.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Switch" }));
    expect(api.setSessionCli).toHaveBeenCalledTimes(1);
    expect(api.setSessionCli).toHaveBeenCalledWith(ID, "claude");
    expect(api.advance).not.toHaveBeenCalled();
    expect(screen.queryByRole("radiogroup", { name: "Tutor" })).not.toBeInTheDocument();
    rtlAct(() => emitUpdated({ ...S([act(A.probe())]), cli: "claude" as const }));
    expect(screen.getByText("Tutor: Claude Code")).toBeInTheDocument();
  });

  it("switch cancel keeps the tutor", async () => {
    const { api } = installApi({ getSession: vi.fn(async () => S([act(A.probe())])) });
    render(<LessonScreen id={ID} start={false} statuses={ALL} onRetryDetect={() => {}} />);
    await userEvent.click(await screen.findByRole("button", { name: "Change tutor" }));
    await userEvent.click(screen.getByRole("radio", { name: "Claude Code" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(api.setSessionCli).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("Change tutor is disabled while a reply is on the way", async () => {
    installApi({
      getSession: vi.fn(async () => S([act(A.probe())])),
      isRunning: vi.fn(async () => true),
    });
    render(<LessonScreen id={ID} start={false} statuses={ALL} onRetryDetect={() => {}} />);
    await screen.findByText("Thinking…");
    expect(screen.getByRole("button", { name: "Change tutor" })).toBeDisabled();
  });

  it("Change tutor is hidden when the lesson is done", async () => {
    const events = [
      ...toTeach,
      ...toCheck("n1"),
      pick(1),
      ...toCheck("n2"),
      pick(0),
      act(A.explain("n2")),
      pick(0),
      act(A.explain("n2")),
      pick(0),
      act(A.done()),
    ];
    installApi({ getSession: vi.fn(async () => S(events)) });
    render(<LessonScreen id={ID} start={false} statuses={ALL} onRetryDetect={() => {}} />);
    expect(await screen.findByText("Lesson complete")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Change tutor" })).not.toBeInTheDocument();
    expect(screen.getByText("Tutor: Codex")).toBeInTheDocument();
  });

  it("a lesson with an unknown tutor opens as Codex", async () => {
    const odd = { ...S([act(A.probe())]), cli: "mystery" } as unknown as Session;
    installApi({ getSession: vi.fn(async () => odd) });
    const first = render(
      <LessonScreen id={ID} start={false} statuses={ALL} onRetryDetect={() => {}} />,
    );
    expect(await screen.findByText("Tutor: Codex")).toBeInTheDocument();
    first.unmount();
    const bare = { ...S([act(A.probe())]) } as Partial<Session>;
    delete bare.cli;
    installApi({ getSession: vi.fn(async () => bare as Session) });
    render(<LessonScreen id={ID} start={false} statuses={ALL} onRetryDetect={() => {}} />);
    expect(await screen.findByText("Tutor: Codex")).toBeInTheDocument();
  });

  it("the card stays disabled while the CLI check is running", async () => {
    installApi({ getSession: vi.fn(async () => S([act(A.probe())])) });
    render(<LessonScreen id={ID} start={false} statuses={null} onRetryDetect={() => {}} />);
    expect(await screen.findByText("Pick")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit" })).toBeDisabled();
    expect(screen.queryByText(/not found/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Change tutor" })).toBeDisabled();
  });

  it("Switch ignores a double click", async () => {
    const setSessionCli = vi.fn(
      () =>
        new Promise<{ ok: true; session: Session }>((r) =>
          setTimeout(() => r({ ok: true, session: S([act(A.probe())]) }), 20),
        ),
    );
    installApi({ getSession: vi.fn(async () => S([act(A.probe())])), setSessionCli });
    render(<LessonScreen id={ID} start={false} statuses={ALL} onRetryDetect={() => {}} />);
    await userEvent.click(await screen.findByRole("button", { name: "Change tutor" }));
    await userEvent.click(screen.getByRole("radio", { name: "Claude Code" }));
    const button = screen.getByRole("button", { name: "Switch" });
    await userEvent.dblClick(button);
    await rtlAct(async () => {
      await new Promise((r) => setTimeout(r, 40));
    });
    expect(setSessionCli).toHaveBeenCalledTimes(1);
  });

  it("a refused or failed switch says so", async () => {
    const refuse = vi.fn(async () => ({
      ok: false as const,
      message: "A reply is already on the way.",
    }));
    installApi({ getSession: vi.fn(async () => S([act(A.probe())])), setSessionCli: refuse });
    const first = render(
      <LessonScreen id={ID} start={false} statuses={ALL} onRetryDetect={() => {}} />,
    );
    await userEvent.click(await screen.findByRole("button", { name: "Change tutor" }));
    await userEvent.click(screen.getByRole("radio", { name: "Claude Code" }));
    await userEvent.click(screen.getByRole("button", { name: "Switch" }));
    expect(await screen.findByText("A reply is already on the way.")).toBeInTheDocument();
    expect(screen.getByText("Tutor: Codex")).toBeInTheDocument();
    first.unmount();
    const fail = vi.fn(async () => {
      throw new Error("disk");
    });
    installApi({ getSession: vi.fn(async () => S([act(A.probe())])), setSessionCli: fail });
    render(<LessonScreen id={ID} start={false} statuses={ALL} onRetryDetect={() => {}} />);
    await userEvent.click(await screen.findByRole("button", { name: "Change tutor" }));
    await userEvent.click(screen.getByRole("radio", { name: "Claude Code" }));
    await userEvent.click(screen.getByRole("button", { name: "Switch" }));
    expect(await screen.findByText("Could not save. Check free disk space.")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  const withMaterial = (over: Partial<Session> = {}): Session => ({
    ...S([act(A.probe())]),
    folder: "/Users/x/notes",
    attachments: [{ file: "a1-paper.pdf", name: "paper.pdf", bytes: 10, kind: "pdf" }],
    webSearch: false,
    ...over,
  });

  it("the lesson header shows its material", async () => {
    installApi({ getSession: vi.fn(async () => withMaterial()) });
    render(<LessonScreen id={ID} start={false} statuses={ALL} onRetryDetect={() => {}} />);
    expect(await screen.findByText("notes")).toBeInTheDocument();
    expect(screen.getByText("paper.pdf")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Change" })).toBeEnabled();
    expect(screen.getByRole("checkbox", { name: "Web search" })).not.toBeChecked();
  });

  it("changing and removing the folder call the api", async () => {
    const next = withMaterial({ folder: "/Users/x/other" });
    const { api } = installApi({
      getSession: vi.fn(async () => withMaterial()),
      pickFolder: vi.fn(async () => "/Users/x/other"),
      setSessionFolder: vi.fn(async () => ({ ok: true, session: next })),
    });
    render(<LessonScreen id={ID} start={false} statuses={ALL} onRetryDetect={() => {}} />);
    await userEvent.click(await screen.findByRole("button", { name: "Change" }));
    expect(api.setSessionFolder).toHaveBeenCalledWith(ID, "/Users/x/other");
    await userEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(api.setSessionFolder).toHaveBeenLastCalledWith(ID, null);
  });

  it("attaching and removing files call the api", async () => {
    const { api } = installApi({
      getSession: vi.fn(async () => withMaterial()),
      pickFiles: vi.fn(async () => ["/tmp/b.txt"]),
      addAttachments: vi.fn(async () => ({
        ok: false,
        message: "That file type is not supported.",
      })),
      removeAttachment: vi.fn(async () => ({
        ok: true,
        session: withMaterial({ attachments: [] }),
      })),
    });
    render(<LessonScreen id={ID} start={false} statuses={ALL} onRetryDetect={() => {}} />);
    await userEvent.click(await screen.findByRole("button", { name: "Attach files" }));
    expect(api.addAttachments).toHaveBeenCalledWith(ID, ["/tmp/b.txt"]);
    expect(await screen.findByText("That file type is not supported.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Remove paper.pdf" }));
    expect(api.removeAttachment).toHaveBeenCalledWith(ID, "a1-paper.pdf");
  });

  it("the search switch calls the api", async () => {
    const { api } = installApi({
      getSession: vi.fn(async () => withMaterial()),
      setSessionWebSearch: vi.fn(async () => ({
        ok: true,
        session: withMaterial({ webSearch: true }),
      })),
    });
    render(<LessonScreen id={ID} start={false} statuses={ALL} onRetryDetect={() => {}} />);
    await userEvent.click(await screen.findByRole("checkbox", { name: "Web search" }));
    expect(api.setSessionWebSearch).toHaveBeenCalledWith(ID, true);
  });

  it("header_controls_disabled_while_running", async () => {
    installApi({
      getSession: vi.fn(async () => withMaterial()),
      isRunning: vi.fn(async () => true),
    });
    render(<LessonScreen id={ID} start={false} statuses={ALL} onRetryDetect={() => {}} />);
    await screen.findByText("Thinking…");
    expect(screen.getByRole("button", { name: "Change" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Remove" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Attach files" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Remove paper.pdf" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Web search" })).toBeDisabled();
  });

  it("missing_folder_blocks_call_with_banner (display)", async () => {
    const { api, emitEnded } = installApi({
      getSession: vi.fn(async () => withMaterial()),
    });
    const message = "The material folder was not found. Choose it again or remove it.";
    render(<LessonScreen id={ID} start={false} statuses={ALL} onRetryDetect={() => {}} />);
    await screen.findByText("notes");
    rtlAct(() =>
      emitEnded(ID, { ok: false, error: { kind: "folder_missing", message }, session: null }),
    );
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
    expect(screen.queryByText("The last reply did not arrive.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Change" })).toBeEnabled();
    expect(api.advance).not.toHaveBeenCalled();
  });

  it("choosing another folder after folder_missing resumes the lesson", async () => {
    const { api, emitEnded } = installApi({
      getSession: vi.fn(async () => withMaterial()),
      pickFolder: vi.fn(async () => "/other"),
      setSessionFolder: vi.fn(async () => ({ ok: true, session: withMaterial() })),
    });
    const message = "The material folder was not found. Choose it again or remove it.";
    render(<LessonScreen id={ID} start={false} statuses={ALL} onRetryDetect={() => {}} />);
    await screen.findByText("notes");
    rtlAct(() =>
      emitEnded(ID, { ok: false, error: { kind: "folder_missing", message }, session: null }),
    );
    expect(await screen.findByText(message)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Change" }));
    await vi.waitFor(() => expect(api.advance).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(message)).not.toBeInTheDocument();
  });

  it("removing the folder after folder_missing resumes the lesson", async () => {
    const { api, emitEnded } = installApi({
      getSession: vi.fn(async () => withMaterial()),
      setSessionFolder: vi.fn(async () => ({ ok: true, session: withMaterial() })),
    });
    const message = "The material folder was not found. Choose it again or remove it.";
    render(<LessonScreen id={ID} start={false} statuses={ALL} onRetryDetect={() => {}} />);
    await screen.findByText("notes");
    rtlAct(() =>
      emitEnded(ID, { ok: false, error: { kind: "folder_missing", message }, session: null }),
    );
    expect(await screen.findByText(message)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Remove" }));
    await vi.waitFor(() => expect(api.advance).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(message)).not.toBeInTheDocument();
  });
});

describe("LessonScreen call", () => {
  const props = { id: ID, start: false, statuses: ALL, onRetryDetect: () => {} };
  const withKey = (over: Parameters<typeof installApi>[0] = {}) =>
    installApi({
      getSession: vi.fn(async () => S([act(A.probe(textQ))])),
      voiceHasKey: vi.fn(async () => true),
      voiceStart: vi.fn(async () => ({ ok: true })),
      ...over,
    });
  const begin = async () => {
    await screen.findByText("Say");
    const start = screen.getByRole("button", { name: "Start call" });
    await vi.waitFor(() => expect(start).toBeEnabled());
    await userEvent.click(start);
    await screen.findByText("On call · listening");
  };

  it("the lesson header has the call bar", async () => {
    installApi({ getSession: vi.fn(async () => S([act(A.probe())])) });
    const first = render(<LessonScreen {...props} />);
    await screen.findByText("T");
    expect(screen.getByRole("button", { name: "Start call" })).toBeDisabled();
    expect(screen.getByText("Add a Deepgram key in Profile to use voice.")).toBeInTheDocument();
    first.unmount();
    installApi({
      getSession: vi.fn(async () => S([act(A.probe())])),
      voiceHasKey: vi.fn(async () => true),
    });
    render(<LessonScreen {...props} />);
    await vi.waitFor(() =>
      expect(screen.getByRole("button", { name: "Start call" })).toBeEnabled(),
    );
  });

  it("Start call opens a call and shows its state", async () => {
    const { api, emitVoiceState } = withKey();
    render(<LessonScreen {...props} />);
    await begin();
    expect(api.voiceStart).toHaveBeenCalledWith(ID);
    rtlAct(() => emitVoiceState("speaking"));
    expect(screen.getByText("On call · speaking")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "End call" }));
    expect(api.voiceStop).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Start call" })).toBeInTheDocument();
  });

  it("what is heard appears in the pending answer box", async () => {
    const { emitVoiceTranscript } = withKey();
    render(<LessonScreen {...props} />);
    await begin();
    rtlAct(() => emitVoiceTranscript("hello", false));
    expect(screen.getByLabelText("Your answer")).toHaveValue("hello");
    await userEvent.click(screen.getByRole("button", { name: "Start over" }));
    expect(screen.getByLabelText("Your answer")).toHaveValue("");
  });

  it("mic_refused_message (display)", async () => {
    withKey();
    vi.mocked(startMic).mockResolvedValueOnce({ ok: false });
    render(<LessonScreen {...props} />);
    await screen.findByText("Say");
    const start = screen.getByRole("button", { name: "Start call" });
    await vi.waitFor(() => expect(start).toBeEnabled());
    await userEvent.click(start);
    expect(
      await screen.findByText(
        "Microphone access was refused. Allow it in System Settings, then start the call again.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start call" })).toBeInTheDocument();
  });

  it("deepgram_failure_ends_call_lesson_continues (display)", async () => {
    const { api, emitVoiceError } = withKey({
      answer: vi.fn(async () => ({ ok: true, session: S([act(A.probe(textQ))]) })),
    });
    render(<LessonScreen {...props} />);
    await begin();
    rtlAct(() => emitVoiceError("the Deepgram key was not accepted"));
    expect(
      await screen.findByText("Voice stopped: the Deepgram key was not accepted."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start call" })).toBeInTheDocument();
    const box = screen.getByLabelText("Your answer");
    expect(box).toBeEnabled();
    await userEvent.type(box, "typed");
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(api.answer).toHaveBeenCalled();
  });

  it("call_ends_when_lesson_closes (display)", async () => {
    const { api } = withKey();
    const view = render(<LessonScreen {...props} />);
    await begin();
    view.unmount();
    expect(api.voiceStop).toHaveBeenCalled();
  });

  it("a spoken answer is not sent while the tutor is missing", async () => {
    const { api, emitVoiceTranscript, emitVoiceUtterance } = withKey();
    const view = render(<LessonScreen {...props} />);
    await begin();
    const none: CliStatus[] = ALL.map((c) => ({ ...c, installed: false, version: null }));
    view.rerender(<LessonScreen {...props} statuses={none} />);
    rtlAct(() => emitVoiceTranscript("an answer", true));
    rtlAct(() => emitVoiceUtterance());
    expect(api.answer).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Your answer")).toHaveValue("");
  });

  it("the lesson has the side question box under its last item", async () => {
    installApi({ getSession: vi.fn(async () => S([act(A.probe())])) });
    const view = render(
      <LessonScreen id={ID} start={false} statuses={ALL} onRetryDetect={() => {}} />,
    );
    const card = await screen.findByText("Pick");
    const field = screen.getByLabelText("Ask a side question");
    const button = screen.getByRole("button", { name: "Ask" });
    expect(card.compareDocumentPosition(field) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(card.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    view.unmount();
    installApi({
      getSession: vi.fn(async () =>
        S([
          ...toTeach,
          ...toCheck("n1"),
          pick(1),
          ...toCheck("n2"),
          pick(0),
          act(A.explain("n2")),
          pick(0),
          act(A.explain("n2")),
          pick(0),
          act(A.done()),
        ]),
      ),
    });
    render(<LessonScreen id={ID} start={false} statuses={ALL} onRetryDetect={() => {}} />);
    expect(await screen.findByText("Lesson complete")).toBeInTheDocument();
    expect(screen.getByLabelText("Ask a side question")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ask" })).toBeInTheDocument();
  });

  it("asking a side question calls the api and shows the aside", async () => {
    const before = S([act(A.probe())]);
    const { api } = installApi({
      getSession: vi.fn(async () => before),
      aside: vi.fn(async () => ({ ok: true, session: S([act(A.probe()), asideEv()]) })),
    });
    render(<LessonScreen id={ID} start={false} statuses={ALL} onRetryDetect={() => {}} />);
    await screen.findByText("Pick");
    await userEvent.type(screen.getByLabelText("Ask a side question"), "why");
    await userEvent.click(screen.getByRole("button", { name: "Ask" }));
    expect(api.aside).toHaveBeenCalledWith(ID, "why");
    expect(await screen.findByText("Aside")).toBeInTheDocument();
    expect(screen.getByText("because")).toBeInTheDocument();
    for (const radio of screen.getAllByRole("radio")) expect(radio).toBeEnabled();
  });

  it("a failed side question shows its message under the box", async () => {
    const message = "The model gave an unusable reply. Press Retry.";
    const before = S([act(A.probe())]);
    const { api } = installApi({
      getSession: vi.fn(async () => before),
      aside: vi.fn(async () => ({
        ok: false,
        error: { kind: "bad_reply", message },
        session: before,
      })),
    });
    render(<LessonScreen id={ID} start={false} statuses={ALL} onRetryDetect={() => {}} />);
    await screen.findByText("Pick");
    await userEvent.type(screen.getByLabelText("Ask a side question"), "why");
    await userEvent.click(screen.getByRole("button", { name: "Ask" }));
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
    expect(api.advance).not.toHaveBeenCalled();
  });

  it("the side question box is disabled while a reply is on the way", async () => {
    installApi({
      getSession: vi.fn(async () => S([act(A.probe())])),
      isRunning: vi.fn(async () => true),
    });
    render(<LessonScreen id={ID} start={false} statuses={ALL} onRetryDetect={() => {}} />);
    await screen.findByText("Thinking…");
    expect(screen.getByLabelText("Ask a side question")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Ask" })).toBeDisabled();
  });
  it("retry_banners_wait_for_cli_check", async () => {
    const events = [act(A.probe()), pick(1)];
    const retryButton = () => screen.queryByRole("button", { name: "Retry" });
    {
      const { api, emitEnded } = installApi({ getSession: vi.fn(async () => S(events)) });
      const view = render(
        <LessonScreen id={ID} start={false} statuses={null} onRetryDetect={() => {}} />,
      );
      expect(await screen.findByText("The last reply did not arrive.")).toBeInTheDocument();
      expect(retryButton()).toBeNull();
      rtlAct(() =>
        emitEnded(ID, {
          ok: false,
          error: { kind: "cli", message: "Codex failed: boom" },
          session: null,
        }),
      );
      expect(await screen.findByText("Codex failed: boom")).toBeInTheDocument();
      expect(retryButton()).toBeNull();
      rtlAct(() =>
        emitEnded(ID, {
          ok: false,
          error: { kind: "stopped", message: "Stopped." },
          session: null,
        }),
      );
      expect(await screen.findByText("Stopped.")).toBeInTheDocument();
      expect(retryButton()).toBeNull();
      view.rerender(<LessonScreen id={ID} start={false} statuses={ALL} onRetryDetect={() => {}} />);
      await userEvent.click(screen.getByRole("button", { name: "Retry" }));
      expect(api.advance).toHaveBeenCalledTimes(1);
      view.unmount();
    }
    installApi({ getSession: vi.fn(async () => S(events)) });
    render(<LessonScreen id={ID} start={false} statuses={null} onRetryDetect={() => {}} />);
    await screen.findByText("The last reply did not arrive.");
    expect(retryButton()).toBeNull();
  });

  it("corrupt_lesson_shows_message_not_blank (screen)", async () => {
    installApi({ getSession: vi.fn(async () => S([pick(1)])) });
    render(<LessonScreen id={ID} start={false} statuses={ALL} onRetryDetect={() => {}} />);
    expect(await screen.findByText("This lesson could not be read.")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("This lesson could not be read.");
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(screen.queryByText("Thinking…")).not.toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  });
});

describe("LessonScreen header", () => {
  const withClis = (clis: Record<string, { model: string; effort: string }>) => {
    const base = mergeSettings(null);
    return { ...base, clis: { ...base.clis, ...clis } };
  };

  it("header_shows_model_and_effort", async () => {
    const settings = withClis({
      claude: { model: "sonnet", effort: "medium" },
      codex: { model: "", effort: "low" },
    });
    installApi({
      getSession: vi.fn(async () => ({ ...S([act(A.probe())]), cli: "claude" as const })),
      getSettings: vi.fn(async () => settings),
    });
    const first = render(
      <LessonScreen id={ID} start={false} statuses={ALL} onRetryDetect={() => {}} />,
    );
    expect(await screen.findByText("Tutor: Claude Code · sonnet · medium")).toBeInTheDocument();
    first.unmount();

    installApi({
      getSession: vi.fn(async () => S([act(A.probe())])),
      getSettings: vi.fn(async () => settings),
    });
    const second = render(
      <LessonScreen id={ID} start={false} statuses={ALL} onRetryDetect={() => {}} />,
    );
    expect(await screen.findByText("Tutor: Codex · low")).toBeInTheDocument();
    second.unmount();

    installApi({
      getSession: vi.fn(async () => S([act(A.probe())])),
      getSettings: vi.fn(async () => withClis({ codex: { model: "gpt-x", effort: "" } })),
    });
    const third = render(
      <LessonScreen id={ID} start={false} statuses={ALL} onRetryDetect={() => {}} />,
    );
    expect(await screen.findByText("Tutor: Codex · gpt-x")).toBeInTheDocument();
    third.unmount();

    const { emitUpdated } = installApi({
      getSession: vi.fn(async () => S([act(A.probe())])),
      getSettings: vi.fn(async () => settings),
      setSessionCli: vi.fn(async () => ({ ok: true, session: S([act(A.probe())]) })),
    });
    render(<LessonScreen id={ID} start={false} statuses={ALL} onRetryDetect={() => {}} />);
    expect(await screen.findByText("Tutor: Codex · low")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Change tutor" }));
    await userEvent.click(screen.getByRole("radio", { name: "Claude Code" }));
    await userEvent.click(screen.getByRole("button", { name: "Switch" }));
    rtlAct(() => emitUpdated({ ...S([act(A.probe())]), cli: "claude" as const }));
    expect(screen.getByText("Tutor: Claude Code · sonnet · medium")).toBeInTheDocument();
  });

  it("the header shows the tutor alone when nothing is set", async () => {
    installApi({ getSession: vi.fn(async () => S([act(A.probe())])) });
    const first = render(
      <LessonScreen id={ID} start={false} statuses={ALL} onRetryDetect={() => {}} />,
    );
    expect(await screen.findByText("Tutor: Codex")).toBeInTheDocument();
    first.unmount();

    installApi({
      getSession: vi.fn(async () => S([act(A.probe())])),
      getSettings: vi.fn(async () => {
        throw new Error("no");
      }),
    });
    const second = render(
      <LessonScreen id={ID} start={false} statuses={ALL} onRetryDetect={() => {}} />,
    );
    expect(await screen.findByText("Tutor: Codex")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    second.unmount();

    installApi({
      getSession: vi.fn(async () => ({ ...S([act(A.probe())]), cli: "gemini" as const })),
      getSettings: vi.fn(async () => withClis({ gemini: { model: "g", effort: "high" } })),
    });
    render(<LessonScreen id={ID} start={false} statuses={ALL} onRetryDetect={() => {}} />);
    expect(await screen.findByText("Tutor: Gemini · g")).toBeInTheDocument();
  });
});
