import { describe, it, expect, afterEach } from "bun:test";
import { writeFileSync, rmSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ImageRenderer } from "./image-renderer";
import type { TerminalCapabilities } from "./capability-detector";

// 1×1 white RGB PNG
const TINY_PNG = Buffer.from(
  "89504e470d0a1a0a0000000d4948445200000001000000010802000000907753de" +
  "0000000c49444154789c63f8ffff3f0005fe02fe0def46b80000000049454e44ae426082",
  "hex"
);

function fakeCapabilities(caps: Partial<TerminalCapabilities>): () => Promise<TerminalCapabilities> {
  return async () => ({ sixel: false, kitty: false, ...caps });
}

describe("ImageRenderer (pipeline)", () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  });

  it("renders via Sixel when sixel capability is detected", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "ir-"));
    const png = join(tmpDir, "plot.png");
    writeFileSync(png, TINY_PNG);

    let sixelCalled = false;
    const renderer = new ImageRenderer({
      platform: "wsl",
      detectCapabilities: fakeCapabilities({ sixel: true }),
      sixelEncode: async () => { sixelCalled = true; return "\x1bPq#0~\x1b\\"; },
      kittyEncode: async () => { throw new Error("should not call kitty"); },
      fallbackLink: async () => "file://plot.png",
    });

    const output = await renderer.renderImage(png);
    expect(sixelCalled).toBe(true);
    expect(output).toContain("\x1bP");
  });

  it("renders via Kitty when kitty capable but not sixel", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "ir-"));
    const png = join(tmpDir, "plot.png");
    writeFileSync(png, TINY_PNG);

    let kittyCalled = false;
    const renderer = new ImageRenderer({
      platform: "native-linux",
      detectCapabilities: fakeCapabilities({ kitty: true }),
      sixelEncode: async () => { throw new Error("should not call sixel"); },
      kittyEncode: async () => { kittyCalled = true; return "\x1b_Ga=T;abc\x1b\\"; },
      fallbackLink: async () => "file://plot.png",
    });

    const output = await renderer.renderImage(png);
    expect(kittyCalled).toBe(true);
    expect(output).toContain("\x1b_G");
  });

  it("falls back to link when neither sixel nor kitty available", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "ir-"));
    const png = join(tmpDir, "plot.png");
    writeFileSync(png, TINY_PNG);

    const renderer = new ImageRenderer({
      platform: "native-linux",
      detectCapabilities: fakeCapabilities({}),
      sixelEncode: async () => { throw new Error("not called"); },
      kittyEncode: async () => { throw new Error("not called"); },
      fallbackLink: async (p) => `file://${p}`,
    });

    const output = await renderer.renderImage(png);
    expect(output).toContain("file://");
    expect(output).toContain("plot.png");
  });

  it("prefers Sixel over Kitty when both available", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "ir-"));
    const png = join(tmpDir, "plot.png");
    writeFileSync(png, TINY_PNG);

    let sixelCalled = false;
    const renderer = new ImageRenderer({
      platform: "wsl",
      detectCapabilities: fakeCapabilities({ sixel: true, kitty: true }),
      sixelEncode: async () => { sixelCalled = true; return "\x1bPq~\x1b\\"; },
      kittyEncode: async () => "\x1b_Gabc\x1b\\",
      fallbackLink: async () => "file://x",
    });

    await renderer.renderImage(png);
    expect(sixelCalled).toBe(true);
  });

  it("image size is configurable", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "ir-"));
    const png = join(tmpDir, "plot.png");
    writeFileSync(png, TINY_PNG);

    let capturedPath = "";
    const renderer = new ImageRenderer({
      platform: "wsl",
      maxWidth: 800,
      maxHeight: 600,
      detectCapabilities: fakeCapabilities({ sixel: true }),
      sixelEncode: async (p) => { capturedPath = p; return "\x1bPq~\x1b\\"; },
      kittyEncode: async () => "",
      fallbackLink: async () => "",
    });

    await renderer.renderImage(png);
    expect(capturedPath).toBe(png);
  });
});
