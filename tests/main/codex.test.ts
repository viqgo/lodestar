import { describe, expect, it } from "vitest";
import { lastStderrLine, parseCodexEvents } from "../../src/main/cli/codex";

const lines = (text: string) => [
  '{"type":"thread.started","thread_id":"01a1"}',
  '{"type":"turn.started"}',
  JSON.stringify({ type: "item.completed", item: { id: "item_0", type: "agent_message", text } }),
  '{"type":"turn.completed","usage":{"input_tokens":17302,"cached_input_tokens":0,"output_tokens":20}}',
];
const SAMPLE = lines("REPLY").join("\n");

describe("parseCodexEvents", () => {
  it("parseCodexEvents returns the agent message and usage", () => {
    expect(parseCodexEvents(SAMPLE)).toEqual({
      text: "REPLY",
      usage: { inputTokens: 17302, outputTokens: 20 },
    });
  });

  it("parseCodexEvents keeps the last agent message and skips junk lines", () => {
    const l = lines("REPLY");
    const second = JSON.stringify({
      type: "item.completed",
      item: { id: "item_1", type: "agent_message", text: "LAST" },
    });
    const stdout = ["not json", l[0], l[1], l[2], second, l[3]].join("\n");
    expect(parseCodexEvents(stdout).text).toBe("LAST");
  });

  it("parseCodexEvents returns nulls when there is no message", () => {
    expect(parseCodexEvents('{"type":"turn.started"}')).toEqual({ text: null, usage: null });
  });
});

describe("lastStderrLine", () => {
  it("lastStderrLine returns the last non-empty line", () => {
    expect(lastStderrLine("a\nboom  \n\n")).toBe("boom");
  });

  it("cli_error_shows_last_stderr_line", () => {
    expect(lastStderrLine("x".repeat(300))).toHaveLength(200);
  });

  it("lastStderrLine has a default for empty stderr", () => {
    expect(lastStderrLine("")).toBe("exited with an error");
  });
});
