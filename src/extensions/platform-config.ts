import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export type Platform = "wsl" | "native-linux" | "macos";

export interface PlatformConfig {
  platform: Platform;
  imageMaxWidth: number;
  imageMaxHeight: number;
}

export interface PlatformConfigManagerOptions {
  configDir?: string;
  env?: Record<string, string | undefined>;
}

const DEFAULTS: Omit<PlatformConfig, "platform"> = {
  imageMaxWidth: 1024,
  imageMaxHeight: 768,
};

export class PlatformConfigManager {
  private readonly configDir: string;
  private readonly env: Record<string, string | undefined>;

  constructor(options?: PlatformConfigManagerOptions) {
    this.configDir = options?.configDir ?? join(homedir(), ".pi.sci");
    this.env = options?.env ?? (process.env as Record<string, string | undefined>);
  }

  detectPlatform(): Platform {
    if (this.env["WSL_DISTRO_NAME"] || this.env["WSL_INTEROP"]) return "wsl";
    const ostype = this.env["OSTYPE"] ?? "";
    if (ostype.startsWith("darwin")) return "macos";
    return "native-linux";
  }

  getEffectivePlatform(): Platform {
    const override = this.env["PI_SCIENCE_PLATFORM"];
    if (override === "wsl" || override === "native-linux" || override === "macos") {
      return override;
    }
    return this.detectPlatform();
  }

  async load(): Promise<PlatformConfig | null> {
    const file = Bun.file(join(this.configDir, "config.json"));
    if (!(await file.exists())) return null;
    return JSON.parse(await file.text()) as PlatformConfig;
  }

  async save(config: PlatformConfig): Promise<void> {
    mkdirSync(this.configDir, { recursive: true });
    await Bun.write(join(this.configDir, "config.json"), JSON.stringify(config, null, 2));
  }
}
