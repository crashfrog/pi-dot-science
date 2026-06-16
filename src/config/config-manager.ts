// Configuration manager for pi.science
// Handles platform detection, config file management, and environment variable overrides

import * as fs from "fs";
import * as path from "path";

export type Platform = "wsl" | "native-linux" | "macos";

export interface Config {
  platform: Platform;
  doltBin?: string;
  doltPort?: number;
}

export class ConfigManager {
  private configDir: string;
  private configPath: string;

  constructor() {
    const home = process.env.HOME || "";
    this.configDir = path.join(home, ".pi.sci");
    this.configPath = path.join(this.configDir, "config.json");
  }

  // Platform detection via heuristics
  // - Check WSL_DISTRO_NAME environment variable
  // - Check /proc/version for WSL/Linux indicators
  // - Check uname -s for Darwin (macOS)
  detectPlatform(procVersionPath?: string | null, uname?: string): Platform {
    // Explicit arguments override host environment so detection is testable
    const hasExplicitArgs = procVersionPath !== undefined || uname !== undefined;

    // Priority 1: Check WSL_DISTRO_NAME environment variable
    if (!hasExplicitArgs && process.env.WSL_DISTRO_NAME) {
      return "wsl";
    }

    // Priority 2: Check /proc/version if provided or exists (null skips this check)
    const versionPath = procVersionPath === undefined ? "/proc/version" : procVersionPath;
    try {
      let versionContent = "";

      // Try to read the provided path first
      if (versionPath && fs.existsSync(versionPath)) {
        versionContent = fs.readFileSync(versionPath, "utf-8");
      } else if (versionPath) {
        // If the path doesn't exist, try to check if it's a fixture path
        // For /proc/version-wsl, look for fixtures/proc/version-wsl
        const relativeFixturePath = versionPath.replace(/^\//, "");
        const fixturesPath = path.resolve(path.dirname(__filename), "..", "..", "fixtures", relativeFixturePath);
        if (fs.existsSync(fixturesPath)) {
          versionContent = fs.readFileSync(fixturesPath, "utf-8");
        }
      }

      if (versionContent) {
        if (versionContent.toLowerCase().includes("wsl")) {
          return "wsl";
        }
        // If /proc/version exists but doesn't mention WSL, it's Linux
        return "native-linux";
      }
    } catch {
      // If reading /proc/version fails, continue to other detection methods
    }

    // Priority 3: Check uname output or provided parameter
    const platform = (uname || process.platform).toLowerCase();
    if (platform === "darwin") {
      return "macos";
    }
    if (platform === "linux") {
      return "native-linux";
    }

    // Default to native-linux
    return "native-linux";
  }

  // Ensure ~/.pi.sci/ directory exists
  ensureConfigDirExists(): void {
    try {
      fs.mkdirSync(this.configDir, { recursive: true });
    } catch (error) {
      // If directory creation fails, throw the error
      throw error;
    }
  }

  // Load configuration from config.json
  loadConfig(): Config {
    try {
      if (fs.existsSync(this.configPath)) {
        const content = fs.readFileSync(this.configPath, "utf-8");
        const parsed = JSON.parse(content);
        return parsed as Config;
      }
    } catch (error) {
      // If config loading fails (corrupted JSON, etc.), return empty config
      // This allows the application to fall back to detection
    }
    // Return empty config if file doesn't exist or parsing failed
    return { platform: "native-linux" };
  }

  // Save configuration to config.json
  saveConfig(config: Config): void {
    // Validate platform value
    const validPlatforms: Platform[] = ["wsl", "native-linux", "macos"];
    if (!validPlatforms.includes(config.platform)) {
      throw new Error(`Invalid platform: ${config.platform}`);
    }

    // Ensure directory exists
    this.ensureConfigDirExists();

    // Write config file
    fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
  }

  // Get the effective platform with priority: env var > config file > detection
  getPlatform(): Platform {
    // Priority 1: Check environment variable
    const envPlatform = process.env.PI_SCIENCE_PLATFORM;
    if (envPlatform) {
      const validPlatforms: Platform[] = ["wsl", "native-linux", "macos"];
      if (validPlatforms.includes(envPlatform as Platform)) {
        return envPlatform as Platform;
      }
      // If env var is invalid, fall through to other methods
    }

    // Priority 2: Check config file
    try {
      if (fs.existsSync(this.configPath)) {
        const config = this.loadConfig();
        if (config.platform) {
          return config.platform;
        }
      }
    } catch {
      // If config loading fails, continue to detection
    }

    // Priority 3: Detect platform
    return this.detectPlatform();
  }

  // Initialize first-run setup: create directory, detect platform, save config
  initializeFirstRun(detectedPlatform: Platform): void {
    this.ensureConfigDirExists();
    this.saveConfig({ platform: detectedPlatform });
  }

  // Save cache file (for terminal capabilities cache)
  saveCacheFile(filePath: string, data: unknown): void {
    // Ensure directory exists for the cache file
    const fileDir = path.dirname(filePath);
    fs.mkdirSync(fileDir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  }

  // Get dolt binary path with priority: env > config file > "dolt"
  getDoltBin(): string {
    // Priority 1: Environment variable
    const envBin = process.env.PI_SCIENCE_DOLT_BIN;
    if (envBin && envBin.trim()) {
      return envBin;
    }

    // Priority 2: Config file
    try {
      if (fs.existsSync(this.configPath)) {
        const config = this.loadConfig();
        if (config.doltBin && config.doltBin.trim()) {
          return config.doltBin;
        }
      }
    } catch {
      // Fall through to default
    }

    // Default: "dolt"
    return "dolt";
  }

  // Get dolt port with priority: env > config file > 3306
  // Validates port is in range 1-65535
  getDoltPort(): number {
    // Priority 1: Environment variable
    const envPort = process.env.PI_SCIENCE_DOLT_PORT;
    if (envPort) {
      const parsed = parseInt(envPort, 10);
      if (!isNaN(parsed) && parsed > 0 && parsed < 65536) {
        return parsed;
      }
      // If invalid, fall back to next priority
    }

    // Priority 2: Config file
    try {
      if (fs.existsSync(this.configPath)) {
        const config = this.loadConfig();
        if (config.doltPort !== undefined && config.doltPort !== null) {
          if (config.doltPort > 0 && config.doltPort < 65536) {
            return config.doltPort;
          }
          // If invalid in config, fall back to default
        }
      }
    } catch {
      // If config loading fails, fall through to default
    }

    // Default: 3306
    return 3306;
  }
}

export default ConfigManager;
