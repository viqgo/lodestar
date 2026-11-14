import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"));

describe("package.json build config", () => {
  it("dist_config_names_both_targets", () => {
    expect(pkg.version).toBe("0.2.0");
    expect(pkg.scripts.dist).toBe(
      "electron-vite build && electron-builder --mac dmg --arm64 --x64",
    );
    expect(pkg.build.appId).toBe("io.github.viqgo.lodestar");
    expect(pkg.build.productName).toBe("lodestar");
    expect(pkg.build.files).toEqual(["out/**"]);
    expect(pkg.build.artifactName).toBe("lodestar-${version}-${arch}.dmg");
    expect(pkg.build.mac.target).toBe("dmg");
    expect(pkg.build.mac.identity).toBe("-");
    expect(pkg.devDependencies["electron-builder"]).toBe("26.18.0");
    expect("type" in pkg).toBe(false);
    expect(pkg.main).toBe("./out/main/index.js");
  });

  it("plist_has_microphone_text", () => {
    expect(pkg.build.mac.extendInfo.NSMicrophoneUsageDescription).toBe(
      "lodestar listens to your spoken answers during a call.",
    );
    expect(Object.keys(pkg.build.mac.extendInfo)).toEqual(["NSMicrophoneUsageDescription"]);
  });

  it("runtime_dependencies_are_only_ws_and_zod", () => {
    expect(Object.keys(pkg.dependencies).sort()).toEqual(["ws", "zod"]);
  });
});
