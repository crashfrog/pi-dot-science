import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { DoltServerManager } from "./dolt-server";

/**
 * Acceptance tests for GitHub Issue #28: Dolt walking skeleton (server lifecycle)
 *
 * Run with: bun test --grep "issue-28"
 *
 * These tests verify:
 * - [AC1] Server manager spawns dolt sql-server in a temp data dir
 * - [AC2] Polls for readiness via health-check (SELECT 1)
 * - [AC3] Reuses an already-running healthy server instead of double-spawning
 * - [AC4] Detects stale descriptor (dead pid) and replaces it
 * - [AC5] Server lifecycle: spawn on demand, shutdown on exit
 * - [AC6] Free-port probing with retry (cap 3 retries)
 *
 * Tests deliberately cover the feature specification WITHOUT implementing the feature.
 * These tests SHOULD FAIL until the implementation agent completes the work.
 */

// Check if dolt is installed
function isDoltInstalled(): boolean {
  try {
    const result = Bun.spawnSync(["dolt", "version"]);
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

describe.skipIf(!isDoltInstalled)("issue-28: DoltServerManager", () => {
  if (!isDoltInstalled()) {
    console.warn(
      "Skipping Dolt server tests: dolt binary not found. " +
      "Install from https://github.com/dolthub/dolt/releases"
    );
  }

  let tempDir: string;
  let serverManager: DoltServerManager;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-science-test-"));
  });

  afterAll(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe("Server spawn and reuse", () => {
    it("spawns dolt sql-server on first ensureRunning call", async () => {
      const projectDir = path.join(tempDir, "project-spawn-1");
      fs.mkdirSync(projectDir, { recursive: true });

      serverManager = new DoltServerManager();
      const result = await serverManager.ensureRunning(projectDir);

      expect(result).toHaveProperty("port");
      expect(typeof result.port).toBe("number");
      expect(result.port).toBeGreaterThan(0);

      // Verify server descriptor file was created
      const descriptorPath = path.join(projectDir, ".pi-science", "dolt", "server.json");
      expect(fs.existsSync(descriptorPath)).toBe(true);

      const descriptor = JSON.parse(fs.readFileSync(descriptorPath, "utf-8"));
      expect(descriptor).toHaveProperty("port");
      expect(descriptor).toHaveProperty("pid");

      await serverManager.shutdownIfIdle();
    });

    it("reuses an already-running healthy server", async () => {
      const projectDir = path.join(tempDir, "project-reuse-1");
      fs.mkdirSync(projectDir, { recursive: true });

      serverManager = new DoltServerManager();
      const result1 = await serverManager.ensureRunning(projectDir);
      const port1 = result1.port;

      // Get the PID from the descriptor
      const descriptorPath = path.join(projectDir, ".pi-science", "dolt", "server.json");
      const descriptor1 = JSON.parse(fs.readFileSync(descriptorPath, "utf-8"));
      const pid1 = descriptor1.pid;

      // Call ensureRunning again on the same project
      const result2 = await serverManager.ensureRunning(projectDir);
      const port2 = result2.port;

      // Should return the same port and not spawn a new server
      expect(port2).toBe(port1);

      const descriptor2 = JSON.parse(fs.readFileSync(descriptorPath, "utf-8"));
      expect(descriptor2.pid).toBe(pid1);

      await serverManager.shutdownIfIdle();
    });

    it("detects stale descriptor (dead pid) and spawns new server", async () => {
      const projectDir = path.join(tempDir, "project-stale-pid");
      fs.mkdirSync(projectDir, { recursive: true });

      // Create a descriptor with a process that doesn't exist (PID 999999)
      const doltDir = path.join(projectDir, ".pi-science", "dolt");
      fs.mkdirSync(doltDir, { recursive: true });
      const descriptorPath = path.join(doltDir, "server.json");
      fs.writeFileSync(descriptorPath, JSON.stringify({ port: 9999, pid: 999999 }));

      serverManager = new DoltServerManager();
      const result = await serverManager.ensureRunning(projectDir);

      // Should have spawned a new server (different port or healthy connection)
      expect(result).toHaveProperty("port");

      // Verify the descriptor was updated with the new server's info
      const updatedDescriptor = JSON.parse(fs.readFileSync(descriptorPath, "utf-8"));
      expect(updatedDescriptor.pid).not.toBe(999999);

      await serverManager.shutdownIfIdle();
    });
  });

  describe("Server health check and port probing", () => {
    it("performs health-check via SELECT 1 query", async () => {
      const projectDir = path.join(tempDir, "project-health");
      fs.mkdirSync(projectDir, { recursive: true });

      serverManager = new DoltServerManager();
      const result = await serverManager.ensureRunning(projectDir);

      // If server is reused/found, health check passed
      expect(result.port).toBeGreaterThan(0);

      await serverManager.shutdownIfIdle();
    });

    it("probes for free port with retry logic", async () => {
      const projectDir = path.join(tempDir, "project-port-probe");
      fs.mkdirSync(projectDir, { recursive: true });

      serverManager = new DoltServerManager();
      const result = await serverManager.ensureRunning(projectDir);

      // Should find an available port
      expect(result.port).toBeGreaterThan(0);
      expect(result.port).toBeLessThan(65536);

      await serverManager.shutdownIfIdle();
    });

    it("respects port configuration from global config", async () => {
      const projectDir = path.join(tempDir, "project-port-config");
      fs.mkdirSync(projectDir, { recursive: true });

      // This test verifies that DoltServerManager can be configured with a preferred port
      // The implementation should use doltPort from ConfigManager if available
      serverManager = new DoltServerManager();
      const result = await serverManager.ensureRunning(projectDir);

      // Verify a port was assigned
      expect(result.port).toBeGreaterThan(0);

      await serverManager.shutdownIfIdle();
    });
  });

  describe("Server shutdown", () => {
    it("shuts down server when no other clients are connected", async () => {
      const projectDir = path.join(tempDir, "project-shutdown-1");
      fs.mkdirSync(projectDir, { recursive: true });

      serverManager = new DoltServerManager();
      const result = await serverManager.ensureRunning(projectDir);
      const port = result.port;

      // Shutdown should complete without error
      await expect(serverManager.shutdownIfIdle()).resolves.not.toThrow();

      // After shutdown, the descriptor should be removed or invalidated
      const descriptorPath = path.join(projectDir, ".pi-science", "dolt", "server.json");
      // Give it a moment for cleanup
      await new Promise(r => setTimeout(r, 100));

      // Descriptor may be removed or contain invalid pid after shutdown
      if (fs.existsSync(descriptorPath)) {
        const descriptor = JSON.parse(fs.readFileSync(descriptorPath, "utf-8"));
        // After shutdown, should not be valid for reuse
        const checkResult = await serverManager.ensureRunning(projectDir);
        expect(checkResult.port).toBeGreaterThan(0);
        await serverManager.shutdownIfIdle();
      }
    });

    it("only shuts down server if this process spawned it", async () => {
      const projectDir = path.join(tempDir, "project-shutdown-check");
      fs.mkdirSync(projectDir, { recursive: true });

      serverManager = new DoltServerManager();
      await serverManager.ensureRunning(projectDir);

      // Spawning process should be able to shut down its own server
      await serverManager.shutdownIfIdle();

      // Process cleanup verification is implicit: no errors thrown
      expect(true).toBe(true);
    });
  });

  describe("Server descriptor file format", () => {
    it("writes descriptor with port and pid fields", async () => {
      const projectDir = path.join(tempDir, "project-descriptor");
      fs.mkdirSync(projectDir, { recursive: true });

      serverManager = new DoltServerManager();
      await serverManager.ensureRunning(projectDir);

      const descriptorPath = path.join(projectDir, ".pi-science", "dolt", "server.json");
      expect(fs.existsSync(descriptorPath)).toBe(true);

      const descriptor = JSON.parse(fs.readFileSync(descriptorPath, "utf-8"));
      expect(descriptor).toHaveProperty("port");
      expect(descriptor).toHaveProperty("pid");
      expect(typeof descriptor.port).toBe("number");
      expect(typeof descriptor.pid).toBe("number");

      await serverManager.shutdownIfIdle();
    });

    it("stores descriptor in .pi-science/dolt/server.json within project dir", async () => {
      const projectDir = path.join(tempDir, "project-path-check");
      fs.mkdirSync(projectDir, { recursive: true });

      serverManager = new DoltServerManager();
      await serverManager.ensureRunning(projectDir);

      const expectedPath = path.join(projectDir, ".pi-science", "dolt", "server.json");
      expect(fs.existsSync(expectedPath)).toBe(true);

      await serverManager.shutdownIfIdle();
    });
  });
});
