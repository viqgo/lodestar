import { describe, expect, it } from "vitest";
import { phaseLabel, relativeTime } from "../../src/renderer/src/lib/time";

const now = "2026-03-03T12:00:00.000Z";

describe("time helpers", () => {
  it("relativeTime says just now under a minute", () => {
    expect(relativeTime("2026-03-03T11:59:30.000Z", now)).toBe("just now");
  });
  it("relativeTime counts minutes", () => {
    expect(relativeTime("2026-03-03T11:55:00.000Z", now)).toBe("5m ago");
  });
  it("relativeTime counts hours", () => {
    expect(relativeTime("2026-03-03T10:00:00.000Z", now)).toBe("2h ago");
  });
  it("relativeTime counts days", () => {
    expect(relativeTime("2026-02-28T12:00:00.000Z", now)).toBe("3d ago");
  });
  it("phaseLabel maps phases to words", () => {
    expect(phaseLabel("probe")).toBe("probing");
    expect(phaseLabel("plan")).toBe("planning");
    expect(phaseLabel("teach")).toBe("teaching");
    expect(phaseLabel("done")).toBe("done");
  });
});
