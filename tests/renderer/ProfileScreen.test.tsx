// @vitest-environment jsdom
import "../helpers/dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ProfileScreen } from "../../src/renderer/src/components/ProfileScreen";
import { installApi } from "../helpers/dom";

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
    const save = screen.getByRole("button", { name: "Save" });
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
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(api.saveProfile).toHaveBeenCalledWith("Be brief.!");
    expect(await screen.findByText("Saved.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
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
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Keep it under 2000 characters.")).toBeInTheDocument();
    expect(screen.queryByText("Saved.")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Could not save. Check free disk space.")).toBeInTheDocument();
    expect(screen.queryByText("Saved.")).not.toBeInTheDocument();
  });
});
