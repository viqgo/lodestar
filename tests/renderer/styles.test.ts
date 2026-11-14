import fs from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";

it("app.css uses no raw colors", () => {
  const css = fs.readFileSync(path.join(process.cwd(), "src/renderer/src/styles/app.css"), "utf8");
  expect(/#[0-9a-fA-F]{3,8}\b/.test(css)).toBe(false);
  expect(/rgba?\(/.test(css)).toBe(false);
});
