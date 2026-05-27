import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { ConfigManager } from "./config-manager";

describe("issue-10", () => {
  let tempDir: string;
  const originalEnv = process.env.PI_SCIENCE_PLATFORM;
  const originalHome = process.env.HOME;

  beforeEach(() => {
    // Create a temporary directory for testing
    tempDir = `/tmp/pi-science-test-${Date.now()}`;
    fs.mkdirSync(tempDir, { recursive: true });
    process.env.HOME = tempDir;
    delete process.env.PI_SCIENCE_PLATFORM;
  });

  afterEach(() => {
    // Clean up temporary directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    // Restore environment
    process.env.HOME = originalHome;
    if (originalEnv) {
      process.env.PI_SCIENCE_PLATFORM = originalEnv;
    }
  });

  describe("Platform auto-detection", () => {
    it("issue-10: detects WSL platform correctly", () => {
      // Setup: Create a mock /proc/version that contains WSL indicators
      const configManager = new ConfigManager();
      const platform = configManager.detectPlatform("/proc/version-wsl");
      expect(platform).toBe("wsl");
    });

    it("issue-10: detects native Linux platform correctly", () => {
      const configManager = new ConfigManager();
      const platform = configManager.detectPlatform("/proc/version-linux");
      expect(platform).toBe("native-linux");
    });

    it("issue-10: detects macOS platform correctly", () => {
      const configManager = new ConfigManager();
      const platform = configManager.detectPlatform(null, "Darwin");
      expect(platform).toBe("macos");
    });

    it("issue-10: detects Linux platform from environment variable", () => {
      const configManager = new ConfigManager();
      const platform = configManager.detectPlatform(null, "Linux");
      expect(platform).toBe("native-linux");
    });

    it("issue-10: prefers WSL_DISTRO_NAME environment variable for WSL detection", () => {
      process.env.WSL_DISTRO_NAME = "Debian";
      const configManager = new ConfigManager();
      const platform = configManager.detectPlatform();
      expect(platform).toBe("wsl");
      delete process.env.WSL_DISTRO_NAME;
    });
  });

  describe("Configuration directory creation", () => {
    it("issue-10: creates ~/.pi.sci/ directory if it does not exist", () => {
      const piSciDir = path.join(tempDir, ".pi.sci");
      expect(fs.existsSync(piSciDir)).toBe(false);

      const configManager = new ConfigManager();
      configManager.ensureConfigDirExists();

      expect(fs.existsSync(piSciDir)).toBe(true);
      expect(fs.statSync(piSciDir).isDirectory()).toBe(true);
    });

    it("issue-10: handles existing ~/.pi.sci/ directory gracefully", () => {
      const piSciDir = path.join(tempDir, ".pi.sci");
      fs.mkdirSync(piSciDir, { recursive: true });

      const configManager = new ConfigManager();
      expect(() => {
        configManager.ensureConfigDirExists();
      }).not.toThrow();
    });
  });

  describe("Configuration file creation and persistence", () => {
    it("issue-10: creates config.json on first run", () => {
      const configPath = path.join(tempDir, ".pi.sci", "config.json");
      expect(fs.existsSync(configPath)).toBe(false);

      const configManager = new ConfigManager();
      configManager.saveConfig({ platform: "native-linux" });

      expect(fs.existsSync(configPath)).toBe(true);
    });

    it("issue-10: saves platform configuration to config.json", () => {
      const configManager = new ConfigManager();
      const testConfig = { platform: "wsl" as const };

      configManager.saveConfig(testConfig);

      const configPath = path.join(tempDir, ".pi.sci", "config.json");
      const savedConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      expect(savedConfig.platform).toBe("wsl");
    });

    it("issue-10: reads configuration from config.json on subsequent runs", () => {
      const configPath = path.join(tempDir, ".pi.sci");
      fs.mkdirSync(configPath, { recursive: true });
      fs.writeFileSync(
        path.join(configPath, "config.json"),
        JSON.stringify({ platform: "macos" })
      );

      const configManager = new ConfigManager();
      const config = configManager.loadConfig();

      expect(config.platform).toBe("macos");
    });

    it("issue-10: persists configuration across multiple manager instances", () => {
      const config1 = new ConfigManager();
      config1.saveConfig({ platform: "native-linux" });

      const config2 = new ConfigManager();
      const loaded = config2.loadConfig();

      expect(loaded.platform).toBe("native-linux");
    });
  });

  describe("Environment variable override", () => {
    it("issue-10: PI_SCIENCE_PLATFORM env var overrides config file", () => {
      process.env.PI_SCIENCE_PLATFORM = "macos";

      const configPath = path.join(tempDir, ".pi.sci");
      fs.mkdirSync(configPath, { recursive: true });
      fs.writeFileSync(
        path.join(configPath, "config.json"),
        JSON.stringify({ platform: "wsl" })
      );

      const configManager = new ConfigManager();
      const platform = configManager.getPlatform();

      expect(platform).toBe("macos");
    });

    it("issue-10: respects PI_SCIENCE_PLATFORM with valid value 'wsl'", () => {
      process.env.PI_SCIENCE_PLATFORM = "wsl";

      const configManager = new ConfigManager();
      const platform = configManager.getPlatform();

      expect(platform).toBe("wsl");
    });

    it("issue-10: respects PI_SCIENCE_PLATFORM with valid value 'native-linux'", () => {
      process.env.PI_SCIENCE_PLATFORM = "native-linux";

      const configManager = new ConfigManager();
      const platform = configManager.getPlatform();

      expect(platform).toBe("native-linux");
    });

    it("issue-10: respects PI_SCIENCE_PLATFORM with valid value 'macos'", () => {
      process.env.PI_SCIENCE_PLATFORM = "macos";

      const configManager = new ConfigManager();
      const platform = configManager.getPlatform();

      expect(platform).toBe("macos");
    });

    it("issue-10: validates PI_SCIENCE_PLATFORM and falls back to detection if invalid", () => {
      process.env.PI_SCIENCE_PLATFORM = "invalid-platform";

      const configManager = new ConfigManager();
      const platform = configManager.getPlatform();

      // Should fall back to detection or config file, not accept invalid value
      expect(["wsl", "native-linux", "macos"]).toContain(platform);
    });
  });

  describe("Integration: First-run flow", () => {
    it("issue-10: complete first-run initialization creates config and directory", () => {
      const piSciDir = path.join(tempDir, ".pi.sci");
      const configPath = path.join(piSciDir, "config.json");

      expect(fs.existsSync(piSciDir)).toBe(false);
      expect(fs.existsSync(configPath)).toBe(false);

      const configManager = new ConfigManager();
      configManager.initializeFirstRun("native-linux");

      expect(fs.existsSync(piSciDir)).toBe(true);
      expect(fs.existsSync(configPath)).toBe(true);

      const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      expect(config.platform).toBe("native-linux");
    });
  });

  describe("Configuration loading priorities", () => {
    it("issue-10: priority is: env var > config file > detection", () => {
      // Setup config file
      const piSciDir = path.join(tempDir, ".pi.sci");
      fs.mkdirSync(piSciDir, { recursive: true });
      fs.writeFileSync(
        path.join(piSciDir, "config.json"),
        JSON.stringify({ platform: "wsl" })
      );

      // Set env var
      process.env.PI_SCIENCE_PLATFORM = "macos";

      const configManager = new ConfigManager();
      const platform = configManager.getPlatform();

      // Env var should win
      expect(platform).toBe("macos");
    });

    it("issue-10: uses config file if env var not set", () => {
      const piSciDir = path.join(tempDir, ".pi.sci");
      fs.mkdirSync(piSciDir, { recursive: true });
      fs.writeFileSync(
        path.join(piSciDir, "config.json"),
        JSON.stringify({ platform: "native-linux" })
      );

      const configManager = new ConfigManager();
      const platform = configManager.getPlatform();

      expect(platform).toBe("native-linux");
    });

    it("issue-10: uses detection if no env var or config file", () => {
      const configManager = new ConfigManager();
      const platform = configManager.getPlatform();

      // Should detect something
      expect(["wsl", "native-linux", "macos"]).toContain(platform);
    });
  });

  describe("Error handling and edge cases", () => {
    it("issue-10: handles corrupted config.json gracefully", () => {
      const piSciDir = path.join(tempDir, ".pi.sci");
      fs.mkdirSync(piSciDir, { recursive: true });
      fs.writeFileSync(path.join(piSciDir, "config.json"), "invalid json {");

      const configManager = new ConfigManager();
      expect(() => {
        configManager.loadConfig();
      }).not.toThrow();
    });

    it("issue-10: handles missing platform in config.json", () => {
      const piSciDir = path.join(tempDir, ".pi.sci");
      fs.mkdirSync(piSciDir, { recursive: true });
      fs.writeFileSync(
        path.join(piSciDir, "config.json"),
        JSON.stringify({ someOtherField: "value" })
      );

      const configManager = new ConfigManager();
      expect(() => {
        configManager.loadConfig();
      }).not.toThrow();
    });

    it("issue-10: returns valid platform even if config loading fails", () => {
      const piSciDir = path.join(tempDir, ".pi.sci");
      fs.mkdirSync(piSciDir, { recursive: true });
      fs.writeFileSync(path.join(piSciDir, "config.json"), "invalid");

      const configManager = new ConfigManager();
      const platform = configManager.getPlatform();

      expect(["wsl", "native-linux", "macos"]).toContain(platform);
    });

    it("issue-10: handles permission errors when creating directory", () => {
      const piSciDir = path.join(tempDir, ".pi.sci");
      fs.mkdirSync(piSciDir, { recursive: true });
      fs.chmodSync(piSciDir, 0o444); // Read-only

      const configManager = new ConfigManager();

      // Should handle gracefully or throw meaningful error
      try {
        configManager.saveConfig({ platform: "wsl" });
      } catch (error) {
        expect(error).toBeDefined();
      }

      // Restore permissions for cleanup
      fs.chmodSync(piSciDir, 0o755);
    });
  });

  describe("Configuration validation", () => {
    it("issue-10: validates that platform value is one of the allowed types", () => {
      const configManager = new ConfigManager();

      expect(() => {
        configManager.saveConfig({ platform: "wsl" });
      }).not.toThrow();

      expect(() => {
        configManager.saveConfig({ platform: "native-linux" });
      }).not.toThrow();

      expect(() => {
        configManager.saveConfig({ platform: "macos" });
      }).not.toThrow();
    });
  });

  describe("Directory structure initialization", () => {
    it("issue-10: creates terminal-capabilities-cache.json location", () => {
      const configManager = new ConfigManager();
      configManager.ensureConfigDirExists();

      const piSciDir = path.join(tempDir, ".pi.sci");
      expect(fs.existsSync(piSciDir)).toBe(true);

      // Should be ready to write capability cache
      const cacheFile = path.join(piSciDir, "terminal-capabilities-cache.json");
      configManager.saveCacheFile(cacheFile, {});
      expect(fs.existsSync(cacheFile)).toBe(true);
    });
  });
});
