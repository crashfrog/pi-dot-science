import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { TerminalCapabilityDetector } from "./capability-detector";

describe("TerminalCapabilityDetector", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "pi-sci-cap-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("Kitty detection", () => {
    it("detects Kitty when KITTY_WINDOW_ID is set", async () => {
      const det = new TerminalCapabilityDetector({
        cacheDir: tmpDir,
        env: { KITTY_WINDOW_ID: "1", TERM: "xterm-256color" },
        probeSixel: async () => false,
      });
      const caps = await det.detect();
      expect(caps.kitty).toBe(true);
    });

    it("reports kitty:false when KITTY_WINDOW_ID absent", async () => {
      const det = new TerminalCapabilityDetector({
        cacheDir: tmpDir,
        env: { TERM: "xterm-256color" },
        probeSixel: async () => false,
      });
      const caps = await det.detect();
      expect(caps.kitty).toBe(false);
    });
  });

  describe("Sixel detection", () => {
    it("uses injected probeSixel result", async () => {
      const det = new TerminalCapabilityDetector({
        cacheDir: tmpDir,
        env: { TERM: "xterm-256color" },
        probeSixel: async () => true,
      });
      const caps = await det.detect();
      expect(caps.sixel).toBe(true);
    });
  });

  describe("caching", () => {
    it("detectWithCache writes result to cache file", async () => {
      const det = new TerminalCapabilityDetector({
        cacheDir: tmpDir,
        env: { TERM: "xterm-256color" },
        probeSixel: async () => true,
      });
      await det.detectWithCache();
      const cacheFile = Bun.file(join(tmpDir, "terminal-capabilities-cache.json"));
      expect(await cacheFile.exists()).toBe(true);
    });

    it("cache is keyed by $TERM value", async () => {
      const det = new TerminalCapabilityDetector({
        cacheDir: tmpDir,
        env: { TERM: "xterm-256color" },
        probeSixel: async () => true,
      });
      await det.detectWithCache();
      const cache = JSON.parse(await Bun.file(join(tmpDir, "terminal-capabilities-cache.json")).text());
      expect(cache["xterm-256color"]).toBeDefined();
    });

    it("detectWithCache uses cached result on second call without re-probing", async () => {
      let probeCount = 0;
      const det = new TerminalCapabilityDetector({
        cacheDir: tmpDir,
        env: { TERM: "xterm-256color" },
        probeSixel: async () => { probeCount++; return true; },
      });
      await det.detectWithCache();
      await det.detectWithCache();
      expect(probeCount).toBe(1);
    });

    it("re-probes when $TERM changes", async () => {
      let probeCount = 0;
      const probe = async () => { probeCount++; return false; };

      const det1 = new TerminalCapabilityDetector({
        cacheDir: tmpDir,
        env: { TERM: "xterm-256color" },
        probeSixel: probe,
      });
      await det1.detectWithCache();

      const det2 = new TerminalCapabilityDetector({
        cacheDir: tmpDir,
        env: { TERM: "vte-256color" },
        probeSixel: probe,
      });
      await det2.detectWithCache();

      expect(probeCount).toBe(2);
    });
  });
});
