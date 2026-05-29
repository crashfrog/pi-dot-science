import { readFileSync } from "node:fs";

export interface KittyEncoderOptions {
  maxWidth?: number;
  maxHeight?: number;
}

export class KittyEncoder {
  private readonly maxWidth: number;
  private readonly maxHeight: number;

  constructor(options?: KittyEncoderOptions) {
    this.maxWidth = options?.maxWidth ?? 1024;
    this.maxHeight = options?.maxHeight ?? 768;
  }

  async encode(imagePath: string): Promise<string> {
    const resized = await this.resize(imagePath);
    const b64 = resized.toString("base64");
    // Kitty protocol: transmit PNG directly (f=100 = PNG format, a=T = transmit + display)
    return `\x1b_Ga=T,f=100,m=0;${b64}\x1b\\`;
  }

  private async resize(imagePath: string): Promise<Buffer> {
    // Read first to surface "not found" errors cleanly
    readFileSync(imagePath); // throws if missing
    const proc = Bun.spawn(
      [
        "convert",
        imagePath,
        "-geometry", `${this.maxWidth}x${this.maxHeight}>`,
        "png:-",
      ],
      { stdout: "pipe", stderr: "pipe" },
    );
    const buf = await new Response(proc.stdout).arrayBuffer();
    const code = await proc.exited;
    if (code !== 0) throw new Error(`ImageMagick exited with code ${code} for ${imagePath}`);
    return Buffer.from(buf);
  }
}
