import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export interface TerminalCapabilities {
  sixel: boolean;
  kitty: boolean;
}

export interface TerminalCapabilityDetectorOptions {
  cacheDir?: string;
  env?: Record<string, string | undefined>;
  probeSixel?: () => Promise<boolean>;
}

type CapabilitiesCache = Record<string, TerminalCapabilities>;

export class TerminalCapabilityDetector {
  private readonly cacheDir: string;
  private readonly env: Record<string, string | undefined>;
  private readonly probeSixel: () => Promise<boolean>;

  constructor(options?: TerminalCapabilityDetectorOptions) {
    this.cacheDir = options?.cacheDir ?? join(homedir(), ".pi.sci");
    this.env = options?.env ?? (process.env as Record<string, string | undefined>);
    this.probeSixel = options?.probeSixel ?? (() => Promise.resolve(false));
  }

  async detect(): Promise<TerminalCapabilities> {
    const [sixel, kitty] = await Promise.all([
      this.probeSixel(),
      Promise.resolve(!!this.env["KITTY_WINDOW_ID"]),
    ]);
    return { sixel, kitty };
  }

  async detectWithCache(): Promise<TerminalCapabilities> {
    const term = this.env["TERM"] ?? "unknown";
    const cache = await this.readCache();

    if (cache[term]) return cache[term];

    const caps = await this.detect();
    cache[term] = caps;
    await this.writeCache(cache);
    return caps;
  }

  private cacheFilePath(): string {
    return join(this.cacheDir, "terminal-capabilities-cache.json");
  }

  private async readCache(): Promise<CapabilitiesCache> {
    const file = Bun.file(this.cacheFilePath());
    if (!(await file.exists())) return {};
    return JSON.parse(await file.text()) as CapabilitiesCache;
  }

  private async writeCache(cache: CapabilitiesCache): Promise<void> {
    mkdirSync(this.cacheDir, { recursive: true });
    await Bun.write(this.cacheFilePath(), JSON.stringify(cache, null, 2));
  }
}
