import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { PlatformConfigManager, type PlatformConfig } from "./platform-config";

describe("PlatformConfigManager", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "pi-sci-cfg-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("platform detection", () => {
    it("detects WSL when WSL_DISTRO_NAME is set", () => {
      const mgr = new PlatformConfigManager({
        configDir: tmpDir,
        env: { WSL_DISTRO_NAME: "Ubuntu" },
      });
      expect(mgr.detectPlatform()).toBe("wsl");
    });

    it("detects WSL when WSL_INTEROP is set", () => {
      const mgr = new PlatformConfigManager({
        configDir: tmpDir,
        env: { WSL_INTEROP: "/run/WSL/8_interop" },
      });
      expect(mgr.detectPlatform()).toBe("wsl");
    });

    it("detects macOS when OSTYPE starts with darwin", () => {
      const mgr = new PlatformConfigManager({
        configDir: tmpDir,
        env: { OSTYPE: "darwin23" },
      });
      expect(mgr.detectPlatform()).toBe("macos");
    });

    it("falls back to native-linux when no WSL or macOS markers present", () => {
      const mgr = new PlatformConfigManager({
        configDir: tmpDir,
        env: {},
      });
      expect(mgr.detectPlatform()).toBe("native-linux");
    });
  });

  describe("env var override", () => {
    it("PI_SCIENCE_PLATFORM overrides detection", () => {
      const mgr = new PlatformConfigManager({
        configDir: tmpDir,
        env: { PI_SCIENCE_PLATFORM: "macos", WSL_DISTRO_NAME: "Ubuntu" },
      });
      expect(mgr.getEffectivePlatform()).toBe("macos");
    });

    it("getEffectivePlatform returns detected platform when no override", () => {
      const mgr = new PlatformConfigManager({
        configDir: tmpDir,
        env: { WSL_DISTRO_NAME: "Ubuntu" },
      });
      expect(mgr.getEffectivePlatform()).toBe("wsl");
    });

    it("ignores invalid PI_SCIENCE_PLATFORM values", () => {
      const mgr = new PlatformConfigManager({
        configDir: tmpDir,
        env: { PI_SCIENCE_PLATFORM: "windows" },
      });
      expect(mgr.getEffectivePlatform()).toBe("native-linux");
    });
  });

  describe("config file", () => {
    it("load returns null when no config file exists", async () => {
      const mgr = new PlatformConfigManager({ configDir: tmpDir });
      expect(await mgr.load()).toBeNull();
    });

    it("save creates the configDir if absent", async () => {
      const nested = join(tmpDir, "new", ".pi.sci");
      const mgr = new PlatformConfigManager({ configDir: nested });
      await mgr.save({ platform: "wsl", imageMaxWidth: 1024, imageMaxHeight: 768 });
      const { existsSync } = await import("node:fs");
      expect(existsSync(nested)).toBe(true);
    });

    it("save writes config.json and load restores it", async () => {
      const mgr = new PlatformConfigManager({ configDir: tmpDir });
      const config: PlatformConfig = { platform: "wsl", imageMaxWidth: 800, imageMaxHeight: 600 };
      await mgr.save(config);
      expect(await mgr.load()).toEqual(config);
    });
  });
});
