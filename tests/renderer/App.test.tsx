// @vitest-environment jsdom
import "../helpers/dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { App } from "../../src/renderer/src/App";
import type { SessionSummary } from "../../src/shared/types";
import { installApi } from "../helpers/dom";
import { AT, session } from "../helpers/fixtures";

vi.mock("../../src/renderer/src/components/PlanPanel", () => ({
  PlanPanel: () => <div data-testid="plan" />,
}));

const ID = session().id;
const summary = (id: string, topic: string): SessionSummary => ({
  id,
  topic,
  phase: "probe",
  updatedAt: AT,
});

describe("App", () => {
  it("App starts on the new lesson screen", async () => {
    installApi();
    render(<App />);
    expect(await screen.findByText("What do you want to learn?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New lesson" })).toBeEnabled();
  });

  it("App shows the Codex banner and disables New lesson", async () => {
    installApi({ detectCli: vi.fn(async () => ({ ok: false })) });
    render(<App />);
    expect(
      await screen.findByText("Codex CLI not found. Install it and sign in, then press Retry."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New lesson" })).toBeDisabled();
  });

  it("App Retry checks for Codex again", async () => {
    const detectCli = vi
      .fn()
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValue({ ok: true, version: "1" });
    installApi({ detectCli });
    render(<App />);
    await userEvent.click(await screen.findByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("button", { name: "New lesson", hidden: false })).toBeEnabled();
    expect(
      screen.queryByText("Codex CLI not found. Install it and sign in, then press Retry."),
    ).not.toBeInTheDocument();
  });

  it("sessions_listed_newest_first (display)", async () => {
    installApi({
      listSessions: vi.fn(async () => [summary("a", "Alpha"), summary("b", "Beta")]),
    });
    render(<App />);
    const first = await screen.findByText("Alpha");
    const second = screen.getByText("Beta");
    expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("App opens a lesson from the list", async () => {
    const { api } = installApi({
      listSessions: vi.fn(async () => [summary(ID, "Alpha")]),
      getSession: vi.fn(async () => ({ ...session(), topic: "Alpha" })),
    });
    render(<App />);
    await userEvent.click(await screen.findByText("Alpha"));
    expect(await screen.findByRole("heading", { name: "Alpha" })).toBeInTheDocument();
    expect(api.getSession).toHaveBeenCalledWith(ID);
    expect(api.advance).not.toHaveBeenCalled();
  });

  it("App creating a lesson opens it and starts it", async () => {
    const S = session();
    const { api } = installApi({
      createSession: vi.fn(async () => ({ ok: true, session: S })),
      getSession: vi.fn(async () => S),
    });
    render(<App />);
    await userEvent.type(await screen.findByLabelText("Topic"), "T");
    await userEvent.type(screen.getByLabelText("Goal"), "G");
    await userEvent.click(screen.getByRole("button", { name: "Start" }));
    expect(await screen.findByRole("heading", { name: "T" })).toBeInTheDocument();
    expect(api.advance).toHaveBeenCalledTimes(1);
  });

  it("delete_session_needs_confirm", async () => {
    const { api } = installApi({
      listSessions: vi.fn(async () => [summary(ID, "Alpha")]),
      getSession: vi.fn(async () => ({ ...session(), topic: "Alpha" })),
    });
    render(<App />);
    await userEvent.click(await screen.findByText("Alpha"));
    await screen.findByRole("heading", { name: "Alpha" });

    await userEvent.click(screen.getByRole("button", { name: "Delete lesson" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(api.deleteSession).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Alpha" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Delete lesson" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(api.deleteSession).toHaveBeenCalledWith(ID);
    expect(await screen.findByText("What do you want to learn?")).toBeInTheDocument();
  });

  it("App shows the Codex banner on every screen", async () => {
    installApi({ detectCli: vi.fn(async () => ({ ok: false })) });
    render(<App />);
    await userEvent.click(await screen.findByRole("button", { name: "Knowledge" }));
    await screen.findByText("What you have shown you understand. Later lessons start from here.");
    expect(
      screen.getByText("Codex CLI not found. Install it and sign in, then press Retry."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});
