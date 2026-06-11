import { describe, it, expect, afterEach } from "bun:test";
import { writeFileSync, rmSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SixelEncoder } from "./sixel-encoder";

// Minimal 1×1 white RGB PNG (valid)
const TINY_PNG = Buffer.from(
  "89504e470d0a1a0a0000000d4948445200000001000000010802000000907753de" +
  "0000000c49444154789c63f8ffff3f0005fe02fe0def46b80000000049454e44ae426082",
  "hex"
);

const mockSixel = "\x1bPq#0;2;0;0;0!1~-\x1b\\";
const mockConverter = async () => mockSixel;

describe("SixelEncoder", () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  });

  it("encode returns the converter output", async () => {
    const enc = new SixelEncoder({ converter: mockConverter });
    tmpDir = mkdtempSync(join(tmpdir(), "sixel-"));
    const png = join(tmpDir, "test.png");
    writeFileSync(png, TINY_PNG);
    const result = await enc.encode(png);
    expect(result).toBe(mockSixel);
  });

  it("encode output starts with DCS and ends with ST", async () => {
    const enc = new SixelEncoder({ converter: mockConverter });
    tmpDir = mkdtempSync(join(tmpdir(), "sixel-"));
    const png = join(tmpDir, "test.png");
    writeFileSync(png, TINY_PNG);
    const result = await enc.encode(png);
    expect(result.startsWith("\x1bP")).toBe(true);
    expect(result.endsWith("\x1b\\")).toBe(true);
  });

  it("passes width and height constraints to converter", async () => {
    let capturedWidth = 0, capturedHeight = 0;
    const capturingConverter = async (_path: string, w: number, h: number) => {
      capturedWidth = w; capturedHeight = h;
      return mockSixel;
    };
    const enc = new SixelEncoder({ maxWidth: 800, maxHeight: 600, converter: capturingConverter });
    tmpDir = mkdtempSync(join(tmpdir(), "sixel-"));
    const png = join(tmpDir, "test.png");
    writeFileSync(png, TINY_PNG);
    await enc.encode(png);
    expect(capturedWidth).toBe(800);
    expect(capturedHeight).toBe(600);
  });

  it("uses ImageMagick convert by default and returns non-empty Sixel output", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "sixel-"));
    const png = join(tmpDir, "test.png");
    writeFileSync(png, TINY_PNG);
    const enc = new SixelEncoder();
    const result = await enc.encode(png);
    expect(result.length).toBeGreaterThan(0);
    expect(result.startsWith("\x1bP")).toBe(true);
    expect(result.endsWith("\x1b\\")).toBe(true);
  });
});
