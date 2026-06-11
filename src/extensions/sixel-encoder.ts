export type SixelConverter = (
  imagePath: string,
  maxWidth: number,
  maxHeight: number,
) => Promise<string>;

export interface SixelEncoderOptions {
  maxWidth?: number;
  maxHeight?: number;
  converter?: SixelConverter;
}

async function imageMagickConverter(
  imagePath: string,
  maxWidth: number,
  maxHeight: number,
): Promise<string> {
  const proc = Bun.spawn(
    ["convert", imagePath, "-geometry", `${maxWidth}x${maxHeight}>`, "sixel:-"],
    { stdout: "pipe", stderr: "pipe" },
  );
  const out = await new Response(proc.stdout).text();
  await proc.exited;
  return out;
}

export class SixelEncoder {
  private readonly maxWidth: number;
  private readonly maxHeight: number;
  private readonly converter: SixelConverter;

  constructor(options?: SixelEncoderOptions) {
    this.maxWidth = options?.maxWidth ?? 1024;
    this.maxHeight = options?.maxHeight ?? 768;
    this.converter = options?.converter ?? imageMagickConverter;
  }

  async encode(imagePath: string): Promise<string> {
    return this.converter(imagePath, this.maxWidth, this.maxHeight);
  }
}
