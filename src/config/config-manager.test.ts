import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { ConfigManager } from "./config-manager";

/**
 * Tests for issue #28 are appended at the end in describe block "issue-28"
 */

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

/**
 * Acceptance tests for GitHub Issue #28: Dolt configuration
 *
 * Run with: bun test --grep "issue-28"
 *
 * These tests verify:
 * - [AC1] Config supports dolt binary path with env-var override PI_SCIENCE_DOLT_BIN
 * - [AC2] Config supports dolt port with env-var override PI_SCIENCE_DOLT_PORT
 * - [AC3] getDoltBin() returns env > config file > 'dolt' default
 * - [AC4] getDoltPort() returns env > config file > default port
 * - [AC5] Port configuration respects valid port ranges (0-65535)
 *
 * Tests deliberately cover the feature specification WITHOUT implementing the feature.
 * These tests SHOULD FAIL until the implementation agent completes the work.
 */
describe("issue-28: ConfigManager Dolt Configuration", () => {
  let tempDir: string;
  const originalDoltBinEnv = process.env.PI_SCIENCE_DOLT_BIN;
  const originalDoltPortEnv = process.env.PI_SCIENCE_DOLT_PORT;
  const originalHome = process.env.HOME;

  beforeEach(() => {
    // Create a temporary directory for testing
    tempDir = `/tmp/pi-science-test-dolt-${Date.now()}`;
    fs.mkdirSync(tempDir, { recursive: true });
    process.env.HOME = tempDir;
    delete process.env.PI_SCIENCE_DOLT_BIN;
    delete process.env.PI_SCIENCE_DOLT_PORT;
  });

  afterEach(() => {
    // Clean up temporary directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    // Restore environment
    process.env.HOME = originalHome;
    if (originalDoltBinEnv) {
      process.env.PI_SCIENCE_DOLT_BIN = originalDoltBinEnv;
    }
    if (originalDoltPortEnv) {
      process.env.PI_SCIENCE_DOLT_PORT = originalDoltPortEnv;
    }
  });

  describe("Dolt binary path configuration", () => {
    it("issue-28: getDoltBin() returns PI_SCIENCE_DOLT_BIN env var if set", () => {
      process.env.PI_SCIENCE_DOLT_BIN = "/custom/path/to/dolt";

      const configManager = new ConfigManager();
      const bin = configManager.getDoltBin();

      expect(bin).toBe("/custom/path/to/dolt");
    });

    it("issue-28: getDoltBin() returns config file value if env not set", () => {
      const piSciDir = path.join(tempDir, ".pi.sci");
      fs.mkdirSync(piSciDir, { recursive: true });
      fs.writeFileSync(
        path.join(piSciDir, "config.json"),
        JSON.stringify({ platform: "wsl", doltBin: "/etc/dolt" })
      );

      const configManager = new ConfigManager();
      const bin = configManager.getDoltBin();

      expect(bin).toBe("/etc/dolt");
    });

    it("issue-28: getDoltBin() returns 'dolt' as default if not configured", () => {
      const configManager = new ConfigManager();
      const bin = configManager.getDoltBin();

      expect(bin).toBe("dolt");
    });

    it("issue-28: getDoltBin() prefers env var over config file", () => {
      process.env.PI_SCIENCE_DOLT_BIN = "/env/dolt";

      const piSciDir = path.join(tempDir, ".pi.sci");
      fs.mkdirSync(piSciDir, { recursive: true });
      fs.writeFileSync(
        path.join(piSciDir, "config.json"),
        JSON.stringify({ platform: "wsl", doltBin: "/config/dolt" })
      );

      const configManager = new ConfigManager();
      const bin = configManager.getDoltBin();

      expect(bin).toBe("/env/dolt");
    });

    it("issue-28: doltBin can be saved to config file", () => {
      const configManager = new ConfigManager();
      configManager.saveConfig({
        platform: "native-linux",
        doltBin: "/usr/local/bin/dolt"
      });

      const piSciDir = path.join(tempDir, ".pi.sci");
      const configPath = path.join(piSciDir, "config.json");
      const saved = JSON.parse(fs.readFileSync(configPath, "utf-8"));

      expect(saved.doltBin).toBe("/usr/local/bin/dolt");
    });
  });

  describe("Dolt port configuration", () => {
    it("issue-28: getDoltPort() returns PI_SCIENCE_DOLT_PORT env var if set", () => {
      process.env.PI_SCIENCE_DOLT_PORT = "3307";

      const configManager = new ConfigManager();
      const port = configManager.getDoltPort();

      expect(port).toBe(3307);
    });

    it("issue-28: getDoltPort() returns config file value if env not set", () => {
      const piSciDir = path.join(tempDir, ".pi.sci");
      fs.mkdirSync(piSciDir, { recursive: true });
      fs.writeFileSync(
        path.join(piSciDir, "config.json"),
        JSON.stringify({ platform: "wsl", doltPort: 3308 })
      );

      const configManager = new ConfigManager();
      const port = configManager.getDoltPort();

      expect(port).toBe(3308);
    });

    it("issue-28: getDoltPort() returns default port if not configured", () => {
      const configManager = new ConfigManager();
      const port = configManager.getDoltPort();

      // Default should be a valid port number >= 3306
      expect(port).toBeGreaterThanOrEqual(3306);
      expect(port).toBeLessThan(65536);
    });

    it("issue-28: getDoltPort() prefers env var over config file", () => {
      process.env.PI_SCIENCE_DOLT_PORT = "4000";

      const piSciDir = path.join(tempDir, ".pi.sci");
      fs.mkdirSync(piSciDir, { recursive: true });
      fs.writeFileSync(
        path.join(piSciDir, "config.json"),
        JSON.stringify({ platform: "wsl", doltPort: 5000 })
      );

      const configManager = new ConfigManager();
      const port = configManager.getDoltPort();

      expect(port).toBe(4000);
    });

    it("issue-28: doltPort can be saved to config file", () => {
      const configManager = new ConfigManager();
      configManager.saveConfig({
        platform: "macos",
        doltPort: 3310
      });

      const piSciDir = path.join(tempDir, ".pi.sci");
      const configPath = path.join(piSciDir, "config.json");
      const saved = JSON.parse(fs.readFileSync(configPath, "utf-8"));

      expect(saved.doltPort).toBe(3310);
    });

    it("issue-28: getDoltPort() parses string env var to number", () => {
      process.env.PI_SCIENCE_DOLT_PORT = "3311";

      const configManager = new ConfigManager();
      const port = configManager.getDoltPort();

      expect(typeof port).toBe("number");
      expect(port).toBe(3311);
    });

    it("issue-28: getDoltPort() validates port is within valid range", () => {
      const configManager = new ConfigManager();
      const port = configManager.getDoltPort();

      expect(port).toBeGreaterThan(0);
      expect(port).toBeLessThan(65536);
    });
  });

  describe("Dolt configuration integration with platform", () => {
    it("issue-28: can save both platform and dolt config together", () => {
      const configManager = new ConfigManager();
      configManager.saveConfig({
        platform: "wsl",
        doltBin: "/usr/bin/dolt",
        doltPort: 3309
      });

      const piSciDir = path.join(tempDir, ".pi.sci");
      const configPath = path.join(piSciDir, "config.json");
      const saved = JSON.parse(fs.readFileSync(configPath, "utf-8"));

      expect(saved.platform).toBe("wsl");
      expect(saved.doltBin).toBe("/usr/bin/dolt");
      expect(saved.doltPort).toBe(3309);
    });

    it("issue-28: loadConfig returns all fields including dolt settings", () => {
      const piSciDir = path.join(tempDir, ".pi.sci");
      fs.mkdirSync(piSciDir, { recursive: true });
      fs.writeFileSync(
        path.join(piSciDir, "config.json"),
        JSON.stringify({
          platform: "native-linux",
          doltBin: "/custom/dolt",
          doltPort: 3312
        })
      );

      const configManager = new ConfigManager();
      const config = configManager.loadConfig();

      expect(config.platform).toBe("native-linux");
      expect(config.doltBin).toBe("/custom/dolt");
      expect(config.doltPort).toBe(3312);
    });
  });

  describe("Error handling and edge cases", () => {
    it("issue-28: handles invalid PI_SCIENCE_DOLT_PORT gracefully", () => {
      process.env.PI_SCIENCE_DOLT_PORT = "invalid";

      const configManager = new ConfigManager();

      // Should fall back to default or throw meaningful error
      let port;
      try {
        port = configManager.getDoltPort();
        // If no error, should be a valid number
        expect(typeof port).toBe("number");
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it("issue-28: empty string doltBin falls back to default", () => {
      process.env.PI_SCIENCE_DOLT_BIN = "";

      const configManager = new ConfigManager();
      const bin = configManager.getDoltBin();

      // Empty string should fall back to default
      expect(bin).toBe("dolt");
    });

    it("issue-28: handles negative port numbers", () => {
      process.env.PI_SCIENCE_DOLT_PORT = "-1";

      const configManager = new ConfigManager();

      try {
        const port = configManager.getDoltPort();
        // Should be within valid range
        expect(port).toBeGreaterThan(0);
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it("issue-28: handles port > 65535", () => {
      process.env.PI_SCIENCE_DOLT_PORT = "70000";

      const configManager = new ConfigManager();

      try {
        const port = configManager.getDoltPort();
        // Should be within valid range
        expect(port).toBeLessThan(65536);
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });
});
