// @vitest-environment jsdom
import "../helpers/dom";
import { act as rtlAct, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LessonScreen } from "../../src/renderer/src/components/LessonScreen";
import type { SessionEvent } from "../../src/shared/types";
import { installApi } from "../helpers/dom";
import { A, act, pick, session, toCheck, toPlan, toTeach } from "../helpers/fixtures";

vi.mock("../../src/renderer/src/components/PlanPanel", () => ({
  PlanPanel: () => <div data-testid="plan" />,
}));

const S = (events: SessionEvent[]) => session(events);
const ID = session().id;

describe("LessonScreen", () => {
  it("resume_shows_pending_question", async () => {
    installApi({ getSession: vi.fn(async () => S([act(A.probe())])) });
    render(<LessonScreen id={ID} start={false} />);
    expect(await screen.findByText("T")).toBeInTheDocument();
    expect(screen.getByText("Goal: G")).toBeInTheDocument();
    expect(await screen.findByText("Pick")).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole("radio")[0]);
    expect(screen.getByRole("button", { name: "Submit" })).toBeEnabled();
  });

  it("LessonScreen starts a new lesson", async () => {
    const { api } = installApi({ getSession: vi.fn(async () => S([])) });
    render(<LessonScreen id={ID} start={true} />);
    await screen.findByText("Thinking…");
    expect(api.advance).toHaveBeenCalledTimes(1);
  });

  it("LessonScreen shows thinking and disables the card", async () => {
    installApi({
      getSession: vi.fn(async () => S([act(A.probe())])),
      isRunning: vi.fn(async () => true),
    });
    render(<LessonScreen id={ID} start={false} />);
    expect(await screen.findByText("Thinking…")).toBeInTheDocument();
    for (const radio of screen.getAllByRole("radio")) expect(radio).toBeDisabled();
  });

  it("LessonScreen Stop stops the turn", async () => {
    const { api } = installApi({
      getSession: vi.fn(async () => S([act(A.probe())])),
      isRunning: vi.fn(async () => true),
    });
    render(<LessonScreen id={ID} start={false} />);
    await userEvent.click(await screen.findByRole("button", { name: "Stop" }));
    expect(api.stop).toHaveBeenCalledWith(ID);
  });

  it("LessonScreen shows a failed call and retries", async () => {
    const { api, emitEnded } = installApi({
      getSession: vi.fn(async () => S([act(A.probe()), pick(1)])),
    });
    render(<LessonScreen id={ID} start={false} />);
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
    render(<LessonScreen id={ID} start={false} />);
    await screen.findByText("T");
    rtlAct(() =>
      emitEnded(ID, { ok: false, error: { kind: "stopped", message: "Stopped." }, session: null }),
    );
    expect(await screen.findByText("Stopped.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("LessonScreen shows a missing lesson without Retry", async () => {
    const { emitEnded } = installApi({ getSession: vi.fn(async () => null) });
    render(<LessonScreen id={ID} start={false} />);
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
    render(<LessonScreen id={ID} start={false} />);
    expect(await screen.findByText("The last reply did not arrive.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(api.advance).not.toHaveBeenCalled();
  });

  it("LessonScreen shows the map only once there is a plan", async () => {
    installApi({ getSession: vi.fn(async () => S(toPlan)) });
    const first = render(<LessonScreen id={ID} start={false} />);
    await screen.findByText("T");
    expect(screen.queryByTestId("plan")).not.toBeInTheDocument();
    first.unmount();
    installApi({ getSession: vi.fn(async () => S(toTeach)) });
    render(<LessonScreen id={ID} start={false} />);
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
    render(<LessonScreen id={ID} start={false} />);
    expect(await screen.findByText("Lesson complete")).toBeInTheDocument();
    expect(screen.getByText(/1 items added to your knowledge list\./)).toBeInTheDocument();
    expect(screen.getByText(/1 step is still shaky\./)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Submit" })).not.toBeInTheDocument();
  });

  it("reopening a lesson with no events offers Retry", async () => {
    const { api } = installApi({ getSession: vi.fn(async () => S([])) });
    render(<LessonScreen id={ID} start={false} />);
    expect(await screen.findByText("The last reply did not arrive.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(api.advance).not.toHaveBeenCalled();
  });
});
