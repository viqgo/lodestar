import fs from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";

it("app.css uses no raw colors", () => {
  const css = fs.readFileSync(path.join(process.cwd(), "src/renderer/src/styles/app.css"), "utf8");
  expect(/#[0-9a-fA-F]{3,8}\b/.test(css)).toBe(false);
  expect(/rgba?\(/.test(css)).toBe(false);
});

it("styles give real hover, focus and layering rules", () => {
  const css = fs.readFileSync(path.join(process.cwd(), "src/renderer/src/styles/app.css"), "utf8");
  expect(/\.overlay\s*\{[^}]*z-index/.test(css)).toBe(true);
  expect(/\.btn:hover/.test(css)).toBe(true);
  expect(/\.field input:focus/.test(css)).toBe(true);
  expect(/\.options\s*\{/.test(css)).toBe(true);
  expect(/\.lesson-row:hover \.icon-btn/.test(css)).toBe(true);
});
