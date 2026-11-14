// @vitest-environment jsdom
import "../helpers/dom";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ProfileScreen } from "../../src/renderer/src/components/ProfileScreen";
import { installApi } from "../helpers/dom";
import { DEFAULT_SETTINGS } from "../../src/core/settings";

const NOTE =
  "Tell your tutor how you want to be taught. It is added to every lesson from the next reply on.";

async function ready() {
  const box = await screen.findByLabelText("Tutor instructions");
  await vi.waitFor(() => expect(box).toHaveValue("Be brief."));
  return box;
}

describe("ProfileScreen", () => {
  it("ProfileScreen shows the saved instructions", async () => {
    installApi({ getProfile: vi.fn(async () => "Be brief.") });
    render(<ProfileScreen />);
    expect(await ready()).toHaveValue("Be brief.");
    expect(screen.getByText("Profile")).toBeInTheDocument();
    expect(screen.getByText(NOTE)).toBeInTheDocument();
  });

  it("ProfileScreen enables Save only after an edit", async () => {
    installApi({ getProfile: vi.fn(async () => "Be brief.") });
    render(<ProfileScreen />);
    const box = await ready();
    const save = screen.getAllByRole("button", { name: "Save" })[0];
    expect(save).toBeDisabled();
    await userEvent.type(box, "!");
    expect(save).toBeEnabled();
    await userEvent.type(box, "{Backspace}");
    expect(save).toBeDisabled();
  });

  it("ProfileScreen saves and confirms", async () => {
    const { api } = installApi({ getProfile: vi.fn(async () => "Be brief.") });
    render(<ProfileScreen />);
    const box = await ready();
    await userEvent.type(box, "!");
    await userEvent.click(screen.getAllByRole("button", { name: "Save" })[0]);
    expect(api.saveProfile).toHaveBeenCalledWith("Be brief.!");
    expect(await screen.findByText("Saved.")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Save" })[0]).toBeDisabled();
  });

  it("ProfileScreen reports a failed save", async () => {
    const saveProfile = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, message: "Keep it under 2000 characters." })
      .mockRejectedValueOnce(new Error("disk"));
    installApi({ getProfile: vi.fn(async () => "Be brief."), saveProfile });
    render(<ProfileScreen />);
    const box = await ready();
    await userEvent.type(box, "!");
    await userEvent.click(screen.getAllByRole("button", { name: "Save" })[0]);
    expect(await screen.findByText("Keep it under 2000 characters.")).toBeInTheDocument();
    expect(screen.queryByText("Saved.")).not.toBeInTheDocument();
    await userEvent.click(screen.getAllByRole("button", { name: "Save" })[0]);
    expect(await screen.findByText("Could not save. Check free disk space.")).toBeInTheDocument();
    expect(screen.queryByText("Saved.")).not.toBeInTheDocument();
  });
});

const voiceSave = () => screen.getAllByRole("button", { name: "Save" })[1];

describe("ProfileScreen voice", () => {
  it("the voice section shows the saved language and voice", async () => {
    installApi({
      getSettings: vi.fn(async () => ({
        ...DEFAULT_SETTINGS,
        voice: { language: "de", voice: "aura-2-x" },
      })),
    });
    render(<ProfileScreen />);
    await vi.waitFor(() => expect(screen.getByLabelText("Speech language")).toHaveValue("de"));
    expect(screen.getByLabelText("Voice")).toHaveValue("aura-2-x");
    expect(screen.getByLabelText("Deepgram API key")).toBeInTheDocument();
  });

  it("key shown only as saved", async () => {
    installApi({ voiceHasKey: vi.fn(async () => true) });
    const { container } = render(<ProfileScreen />);
    expect(await screen.findByText("Key saved")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Deepgram API key")).not.toBeInTheDocument();
    await vi.waitFor(() => expect(screen.getByLabelText("Speech language")).toHaveValue("en"));
    const others = Array.from(container.querySelectorAll("input")).filter(
      (i) => i.value !== "" && i.value !== "en" && i.value !== "aura-2-thalia-en",
    );
    expect(others).toHaveLength(0);
  });

  it("saving a key sends it once and shows Key saved", async () => {
    const { api } = installApi();
    render(<ProfileScreen />);
    const key = await screen.findByLabelText("Deepgram API key");
    await vi.waitFor(() => expect(screen.getByLabelText("Speech language")).toHaveValue("en"));
    await userEvent.type(key, "dg_test_key_123");
    await userEvent.click(voiceSave());
    expect(await screen.findByText("Key saved")).toBeInTheDocument();
    expect(api.voiceSetKey).toHaveBeenCalledTimes(1);
    expect(api.voiceSetKey).toHaveBeenCalledWith("dg_test_key_123");
    expect(await screen.findByText("Saved.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Deepgram API key")).not.toBeInTheDocument();
    expect(api.saveSettings).not.toHaveBeenCalled();
  });

  it("Remove deletes the key and shows the key field again", async () => {
    const { api } = installApi({ voiceHasKey: vi.fn(async () => true) });
    render(<ProfileScreen />);
    await userEvent.click(await screen.findByRole("button", { name: "Remove" }));
    expect(api.voiceRemoveKey).toHaveBeenCalledTimes(1);
    expect(await screen.findByLabelText("Deepgram API key")).toBeInTheDocument();
    expect(screen.queryByText("Key saved")).not.toBeInTheDocument();
  });

  it("voice settings are saved", async () => {
    const { api } = installApi();
    render(<ProfileScreen />);
    const lang = await screen.findByLabelText("Speech language");
    await vi.waitFor(() => expect(lang).toHaveValue("en"));
    await userEvent.clear(lang);
    await userEvent.type(lang, "de");
    await userEvent.click(voiceSave());
    expect(api.saveSettings).toHaveBeenCalledWith({
      ...DEFAULT_SETTINGS,
      voice: { language: "de", voice: "aura-2-thalia-en" },
    });
    expect(await screen.findByText("Saved.")).toBeInTheDocument();
    expect(voiceSave()).toBeDisabled();
  });

  it("a refused key or setting shows its message", async () => {
    const voiceSetKey = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, message: "This Mac cannot store the key safely." });
    const saveSettings = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, message: "Enter a speech language and a voice." })
      .mockRejectedValueOnce(new Error("disk"));
    const { api } = installApi({ voiceSetKey, saveSettings });
    render(<ProfileScreen />);
    const key = await screen.findByLabelText("Deepgram API key");
    await vi.waitFor(() => expect(screen.getByLabelText("Speech language")).toHaveValue("en"));
    await userEvent.type(key, "dg_x");
    await userEvent.click(voiceSave());
    expect(await screen.findByText("This Mac cannot store the key safely.")).toBeInTheDocument();
    expect(api.saveSettings).not.toHaveBeenCalled();
    expect(screen.queryByText("Saved.")).not.toBeInTheDocument();
    await userEvent.clear(key);
    const lang = screen.getByLabelText("Speech language");
    await userEvent.clear(lang);
    await userEvent.click(voiceSave());
    expect(await screen.findByText("Enter a speech language and a voice.")).toBeInTheDocument();
    await userEvent.type(lang, "de");
    await userEvent.click(voiceSave());
    expect(await screen.findByText("Could not save. Check free disk space.")).toBeInTheDocument();
    expect(screen.queryByText("Saved.")).not.toBeInTheDocument();
  });

  it("voice Save is disabled until something changes", async () => {
    installApi();
    render(<ProfileScreen />);
    const lang = await screen.findByLabelText("Speech language");
    await vi.waitFor(() => expect(lang).toHaveValue("en"));
    expect(voiceSave()).toBeDisabled();
    await userEvent.type(lang, "x");
    expect(voiceSave()).toBeEnabled();
    await userEvent.type(lang, "{Backspace}");
    expect(voiceSave()).toBeDisabled();
    await userEvent.type(await screen.findByLabelText("Deepgram API key"), "k");
    expect(voiceSave()).toBeEnabled();
  });
});

describe("ProfileScreen theme", () => {
  it("the theme is saved when it is chosen", async () => {
    const settings = { ...DEFAULT_SETTINGS, theme: "system" as const };
    const onTheme = vi.fn();
    const { api } = installApi({ getSettings: vi.fn(async () => settings) });
    render(<ProfileScreen onTheme={onTheme} />);
    const select = await screen.findByLabelText("Theme");
    await vi.waitFor(() => expect(select).toBeEnabled());
    expect(select).toHaveValue("system");
    expect(Array.from((select as HTMLSelectElement).options).map((o) => o.text)).toEqual([
      "Dark",
      "Light",
      "System",
    ]);
    await userEvent.selectOptions(select, "Light");
    expect(onTheme).toHaveBeenCalledWith("light");
    await vi.waitFor(() =>
      expect(api.saveSettings).toHaveBeenCalledWith({ ...settings, theme: "light" }),
    );
    await userEvent.type(screen.getByLabelText("Speech language"), "x");
    await userEvent.click(voiceSave());
    await vi.waitFor(() => expect(api.saveSettings).toHaveBeenCalledTimes(2));
    expect(api.saveSettings).toHaveBeenLastCalledWith({
      ...settings,
      theme: "light",
      voice: { ...settings.voice, language: `${settings.voice.language}x` },
    });

    cleanup();
    const onTheme2 = vi.fn();
    installApi({
      saveSettings: vi.fn(async () => ({
        ok: false as const,
        message: "Could not save. Check free disk space.",
      })),
    });
    render(<ProfileScreen onTheme={onTheme2} />);
    const select2 = await screen.findByLabelText("Theme");
    await vi.waitFor(() => expect(select2).toBeEnabled());
    await userEvent.selectOptions(select2, "Light");
    expect(await screen.findByText("Could not save. Check free disk space.")).toBeInTheDocument();
    expect(onTheme2).toHaveBeenCalledWith("light");
    cleanup();
    installApi();
    render(<ProfileScreen />);
    const again = await screen.findByLabelText("Theme");
    await vi.waitFor(() => expect(again).toBeEnabled());
    await userEvent.selectOptions(again, "Light");
  });
});
