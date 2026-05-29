import { describe, it, expect } from "bun:test";
import { FallbackLinkGenerator } from "./fallback-link";

const wslPath = "/home/crash/images/plot.png";

describe("FallbackLinkGenerator", () => {
  describe("WSL", () => {
    it("generates a Windows path via wslpath", async () => {
      const gen = new FallbackLinkGenerator({
        platform: "wsl",
        wslpath: async (p) => `C:\\Users\\crash\\images\\${p.split("/").pop()}`,
      });
      const link = await gen.generate(wslPath);
      expect(link).toContain("C:\\");
      expect(link).toContain("plot.png");
    });

    it("falls back to HTTP localhost link if wslpath fails", async () => {
      const gen = new FallbackLinkGenerator({
        platform: "wsl",
        wslpath: async () => { throw new Error("wslpath failed"); },
      });
      const link = await gen.generate(wslPath);
      expect(link).toMatch(/^http:\/\/localhost:\d+/);
    });
  });

  describe("native-linux", () => {
    it("generates a file:// URL", async () => {
      const gen = new FallbackLinkGenerator({ platform: "native-linux" });
      const link = await gen.generate("/home/user/plot.png");
      expect(link).toBe("file:///home/user/plot.png");
    });
  });

  describe("macOS", () => {
    it("generates a file:// URL", async () => {
      const gen = new FallbackLinkGenerator({ platform: "macos" });
      const link = await gen.generate("/Users/user/plot.png");
      expect(link).toBe("file:///Users/user/plot.png");
    });
  });
});
