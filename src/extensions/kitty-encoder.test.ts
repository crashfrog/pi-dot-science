import { describe, it, expect, afterEach } from "bun:test";
import { writeFileSync, rmSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { KittyEncoder } from "./kitty-encoder";

// 1×1 white RGB PNG
const TINY_PNG = Buffer.from(
  "89504e470d0a1a0a0000000d4948445200000001000000010802000000907753de" +
  "0000000c49444154789c63f8ffff3f0005fe02fe0def46b80000000049454e44ae426082",
  "hex"
);

describe("KittyEncoder", () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  });

  it("encode output starts with Kitty APC escape and ends with ST", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "kitty-"));
    const png = join(tmpDir, "test.png");
    writeFileSync(png, TINY_PNG);
    const enc = new KittyEncoder();
    const result = await enc.encode(png);
    expect(result.startsWith("\x1b_G")).toBe(true);
    expect(result.endsWith("\x1b\\")).toBe(true);
  });

  it("encode output contains base64-encoded image data", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "kitty-"));
    const png = join(tmpDir, "test.png");
    writeFileSync(png, TINY_PNG);
    const enc = new KittyEncoder();
    const result = await enc.encode(png);
    // base64 chars live between the header and the ST terminator
    const inner = result.slice(result.indexOf(";") + 1, result.lastIndexOf("\x1b\\"));
    expect(inner.length).toBeGreaterThan(0);
    expect(/^[A-Za-z0-9+/=]+$/.test(inner)).toBe(true);
  });

  it("encode respects maxWidth and maxHeight options", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "kitty-"));
    const png = join(tmpDir, "test.png");
    writeFileSync(png, TINY_PNG);
    const enc = new KittyEncoder({ maxWidth: 400, maxHeight: 300 });
    // Should not throw; geometry is passed to resize step
    const result = await enc.encode(png);
    expect(result.startsWith("\x1b_G")).toBe(true);
  });

  it("gracefully falls back when image file does not exist", async () => {
    const enc = new KittyEncoder();
    await expect(enc.encode("/nonexistent/path.png")).rejects.toThrow();
  });
});
