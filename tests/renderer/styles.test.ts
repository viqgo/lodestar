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

it("styles have the unit row rule", () => {
  const css = fs.readFileSync(path.join(process.cwd(), "src/renderer/src/styles/app.css"), "utf8");
  expect(/\.unit-row\s*\{[^}]*display: grid/.test(css)).toBe(true);
});

it("styles have the chat rules", () => {
  const css = fs.readFileSync(path.join(process.cwd(), "src/renderer/src/styles/app.css"), "utf8");
  expect(/\.chat\s*\{[^}]*flex-direction: column/.test(css)).toBe(true);
  expect(/\.chat-msg\.is-owner\s*\{[^}]*align-self: flex-end/.test(css)).toBe(true);
});

it("styles have the flashcard and box rules", () => {
  const css = fs.readFileSync(path.join(process.cwd(), "src/renderer/src/styles/app.css"), "utf8");
  expect(/\.flashcard\s*\{[^}]*min-height: 160px/.test(css)).toBe(true);
  expect(/\.box-1\s*\{[^}]*color: var\(--color-danger\)/.test(css)).toBe(true);
  expect(/\.box-4,\s*\.box-5\s*\{[^}]*color: var\(--color-success\)/.test(css)).toBe(true);
});

it("styles have the select rule", () => {
  const css = fs.readFileSync(path.join(process.cwd(), "src/renderer/src/styles/app.css"), "utf8");
  expect(/\.field select\s*\{[^}]*border: 1px solid var\(--color-border\)/.test(css)).toBe(true);
});

it("styles have the aside rule", () => {
  const css = fs.readFileSync(path.join(process.cwd(), "src/renderer/src/styles/app.css"), "utf8");
  expect(/\.aside\s*\{[^}]*border-left: 3px solid var\(--color-border\)/.test(css)).toBe(true);
});

it("the light theme has the ten colors of UI.md", () => {
  const css = fs.readFileSync(
    path.join(process.cwd(), "src/renderer/src/styles/tokens.css"),
    "utf8",
  );
  const rootStart = css.indexOf(":root");
  const rootEnd = css.indexOf("}", rootStart);
  const root = css.slice(rootStart, rootEnd);
  expect(root).toContain("--color-bg: #0e0e0f");
  const lightStart = css.indexOf('[data-theme="light"]');
  expect(lightStart).toBeGreaterThan(rootEnd);
  const block = css.slice(css.indexOf("{", lightStart) + 1, css.indexOf("}", lightStart));
  const declarations = block
    .split(";")
    .map((d) => d.trim())
    .filter((d) => d !== "");
  expect(declarations).toEqual([
    "--color-bg: #fafaf8",
    "--color-surface: #ffffff",
    "--color-surface-2: #f0efeb",
    "--color-text: #1b1b1a",
    "--color-muted: #6b6d73",
    "--color-border: #dcdad3",
    "--color-accent: #b07d12",
    "--color-accent-text: #ffffff",
    "--color-danger: #c2473d",
    "--color-success: #2f8f57",
  ]);
});
