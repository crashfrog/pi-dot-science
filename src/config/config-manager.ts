// Configuration manager for pi.science
// Handles platform detection, config file management, and environment variable overrides

export type Platform = "wsl" | "native-linux" | "macos";

export interface Config {
  platform: Platform;
}

export class ConfigManager {
  private configDir: string;
  private configPath: string;

  constructor() {
    // TODO: Implement constructor
    this.configDir = "";
    this.configPath = "";
  }

  // Platform detection via heuristics
  // - Check WSL_DISTRO_NAME environment variable
  // - Check /proc/version for WSL/Linux indicators
  // - Check uname -s for Darwin (macOS)
  detectPlatform(procVersionPath?: string | null, uname?: string): Platform {
    // TODO: Implement platform detection
    throw new Error("detectPlatform not implemented");
  }

  // Ensure ~/.pi.sci/ directory exists
  ensureConfigDirExists(): void {
    // TODO: Implement directory creation
    throw new Error("ensureConfigDirExists not implemented");
  }

  // Load configuration from config.json
  loadConfig(): Config {
    // TODO: Implement config loading
    throw new Error("loadConfig not implemented");
  }

  // Save configuration to config.json
  saveConfig(config: Config): void {
    // TODO: Implement config saving
    throw new Error("saveConfig not implemented");
  }

  // Get the effective platform with priority: env var > config file > detection
  getPlatform(): Platform {
    // TODO: Implement platform resolution
    throw new Error("getPlatform not implemented");
  }

  // Initialize first-run setup: create directory, detect platform, save config
  initializeFirstRun(detectedPlatform: Platform): void {
    // TODO: Implement first-run initialization
    throw new Error("initializeFirstRun not implemented");
  }

  // Save cache file (for terminal capabilities cache)
  saveCacheFile(filePath: string, data: unknown): void {
    // TODO: Implement cache file saving
    throw new Error("saveCacheFile not implemented");
  }
}

export default ConfigManager;
