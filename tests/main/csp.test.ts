import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CSP } from "../../src/main/csp";

describe("csp", () => {
  it("csp_string_is_exact", () => {
    expect(CSP).toBe(
      "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; media-src 'self' blob:; connect-src 'self'",
    );
  });

  it("the main process sets the policy from csp.ts", () => {
    const text = fs.readFileSync(path.join(process.cwd(), "src/main/index.ts"), "utf8");
    expect(text).toContain('import { CSP } from "./csp"');
    expect(text).toContain('"Content-Security-Policy": [CSP]');
    expect(text).not.toContain("default-src");
  });

  it("the packaged app ignores ELECTRON_RENDERER_URL", () => {
    const text = fs.readFileSync(path.join(process.cwd(), "src/main/index.ts"), "utf8");
    expect(text).toContain("app.isPackaged");
    expect(text.match(/process\.env\.ELECTRON_RENDERER_URL/g)).toHaveLength(1);
  });
});
