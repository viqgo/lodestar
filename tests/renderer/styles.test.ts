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

it("styles mark questions apart from reading text", () => {
  const css = fs.readFileSync(path.join(process.cwd(), "src/renderer/src/styles/app.css"), "utf8");
  expect(/\.card\s*\{[^}]*border-left: 3px solid var\(--color-accent\)/.test(css)).toBe(true);
  expect(
    /\.card \.field input,\s*\.card \.field textarea\s*\{[^}]*background: var\(--color-bg\)/.test(
      css,
    ),
  ).toBe(true);
  expect(/\.reading\s*\{/.test(css)).toBe(true);
});

it("styles have the disabled option and row rules", () => {
  const css = fs.readFileSync(path.join(process.cwd(), "src/renderer/src/styles/app.css"), "utf8");
  expect(/\.option\.is-disabled\s*\{[^}]*color: var\(--color-muted\)/.test(css)).toBe(true);
  expect(/\.row\s*\{[^}]*display: flex/.test(css)).toBe(true);
});

it("styles have the switch and chip rules", () => {
  const css = fs.readFileSync(path.join(process.cwd(), "src/renderer/src/styles/app.css"), "utf8");
  expect(/\.switch\s*\{[^}]*display: flex/.test(css)).toBe(true);
  expect(/\.chip\s*\{[^}]*display: inline-flex/.test(css)).toBe(true);
});
