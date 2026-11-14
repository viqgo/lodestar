// @vitest-environment jsdom
import "../helpers/dom";
import { act as rtlAct, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LessonScreen } from "../../src/renderer/src/components/LessonScreen";
import type { CliStatus, Session, SessionEvent } from "../../src/shared/types";
import { installApi } from "../helpers/dom";
import { A, act, pick, session, toCheck, toPlan, toTeach } from "../helpers/fixtures";

vi.mock("../../src/renderer/src/components/PlanPanel", () => ({
  PlanPanel: () => <div data-testid="plan" />,
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
});
