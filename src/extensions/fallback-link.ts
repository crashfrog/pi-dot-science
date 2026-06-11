import type { Platform } from "./platform-config";

export type WslpathFn = (path: string) => Promise<string>;

export interface FallbackLinkGeneratorOptions {
  platform: Platform;
  wslpath?: WslpathFn;
  httpPort?: number;
}

async function realWslpath(path: string): Promise<string> {
  const proc = Bun.spawn(["wslpath", "-w", path], { stdout: "pipe", stderr: "pipe" });
  const out = (await new Response(proc.stdout).text()).trim();
  const code = await proc.exited;
  if (code !== 0 || !out) throw new Error(`wslpath failed for ${path}`);
  return out;
}

export class FallbackLinkGenerator {
  private readonly platform: Platform;
  private readonly wslpath: WslpathFn;
  private readonly httpPort: number;

  constructor(options: FallbackLinkGeneratorOptions) {
    this.platform = options.platform;
    this.wslpath = options.wslpath ?? realWslpath;
    this.httpPort = options.httpPort ?? 7432;
  }

  async generate(imagePath: string): Promise<string> {
    switch (this.platform) {
      case "wsl":
        return this.wslLink(imagePath);
      case "macos":
      case "native-linux":
        return `file://${imagePath}`;
    }
  }

  private async wslLink(imagePath: string): Promise<string> {
    try {
      const winPath = await this.wslpath(imagePath);
      return winPath;
    } catch {
      return `http://localhost:${this.httpPort}/${encodeURIComponent(imagePath)}`;
    }
  }
}
