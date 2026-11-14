// @vitest-environment jsdom
import "../helpers/dom";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MarkdownView } from "../../src/renderer/src/components/MarkdownView";

describe("MarkdownView", () => {
  it("MarkdownView renders paragraphs", () => {
    const { container } = render(<MarkdownView markdown="Hello **world**" />);
    const strong = container.querySelector("strong");
    expect(strong).not.toBeNull();
    expect(strong?.textContent).toBe("world");
  });

  it("MarkdownView renders inline math", () => {
    const { container } = render(<MarkdownView markdown={"Slope $\\frac{a}{b}$ here"} />);
    expect(container.querySelector(".katex")).not.toBeNull();
  });

  it("MarkdownView renders display math", () => {
    const { container } = render(<MarkdownView markdown={"$$\nx^2\n$$"} />);
    expect(container.querySelector(".katex-display")).not.toBeNull();
  });

  it("MarkdownView does not render raw HTML", () => {
    const { container } = render(<MarkdownView markdown="a <script>alert(1)</script> <b>b</b>" />);
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
  });
});
