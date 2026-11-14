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

  it("remote_images_are_blocked", () => {
    const { container, rerender } = render(
      <MarkdownView
        markdown={
          "text ![a](https://example.com/a.png) ![b](http://example.com/b.png) ![c](//example.com/c.png) end"
        }
      />,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain("text");
    expect(container.textContent).toContain("end");
    rerender(<MarkdownView markdown="![d](pic.png)" />);
    const imgs = container.querySelectorAll("img");
    expect(imgs).toHaveLength(1);
    expect(imgs[0]?.getAttribute("src")).toBe("pic.png");
  });

  it("remote images with tabs or backslashes are blocked", () => {
    const sources = [
      "<ht\ttps://example.com/a.png>",
      "<\\\\example.com/b.png>",
      "< //example.com/c.png>",
      "https:\\\\example.com/d.png",
    ];
    for (const src of sources) {
      const { container } = render(<MarkdownView markdown={"![x](" + src + ")"} />);
      for (const img of Array.from(container.querySelectorAll("img"))) {
        const seen = (img.getAttribute("src") ?? "")
          .replace(/%09|%0A|%0D/gi, "")
          .replace(/%5C/gi, "/")
          .trim();
        expect(seen).not.toMatch(/^(https?:)?\/\//i);
      }
    }
  });
});
