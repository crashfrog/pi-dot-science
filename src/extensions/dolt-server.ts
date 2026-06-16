// Dolt Server Manager for pi.science
// Handles server lifecycle: spawn, health check, shutdown, port management

import * as fs from "fs";
import * as path from "path";
import { SQL } from "bun";
import { ConfigManager } from "../config/config-manager";

interface ServerDescriptor {
  port: number;
  pid: number;
}

export class DoltServerManager {
  private spawned: boolean = false;
  private spawnedPid?: number;
  private configManager: ConfigManager;

  constructor() {
    this.configManager = new ConfigManager();
  }

  /**
   * Ensure a Dolt SQL server is running for the given project directory.
   * - Reads .pi-science/dolt/server.json if it exists
   * - Health-checks existing server (SELECT 1 via MySQL)
   * - If healthy, reuses it
   * - If stale (dead pid or unreachable), spawns a new server
   * - Initializes dolt data directory on first use
   * Returns { port } with the server port number
   */
  async ensureRunning(projectDir: string): Promise<{ port: number }> {
    const descriptorPath = path.join(projectDir, ".pi-science", "dolt", "server.json");
    const dataDir = path.join(projectDir, ".pi-science", "dolt", "data");
    const doltBin = this.configManager.getDoltBin();
    const preferredPort = this.configManager.getDoltPort();

    // Check if server descriptor exists and is healthy
    if (fs.existsSync(descriptorPath)) {
      try {
        const descriptor = JSON.parse(fs.readFileSync(descriptorPath, "utf-8")) as ServerDescriptor;
        if (await this.isServerHealthy(descriptor.port)) {
          // Server is healthy, reuse it
          return { port: descriptor.port };
        }
      } catch {
        // Descriptor corrupt or server unhealthy, will spawn new
      }
    }

    // Server not available, need to spawn one
    // First, initialize dolt data directory if needed
    if (!fs.existsSync(path.join(dataDir, ".dolt"))) {
      fs.mkdirSync(dataDir, { recursive: true });
      // Run dolt init in the data directory
      try {
        const initResult = Bun.spawnSync([
          doltBin,
          "init",
          "--name",
          "pi.science",
          "--email",
          "pi-science@local",
        ], {
          cwd: dataDir,
          stdio: ["ignore", "pipe", "pipe"],
        });
        if (initResult.exitCode !== 0) {
          throw new Error(`dolt init failed: ${initResult.exitCode}`);
        }
      } catch (error) {
        throw new Error(`Failed to initialize dolt: ${error}`);
      }
    }

    // Find a free port (starting from preferred port with up to 3 retries)
    let port = preferredPort;
    let foundPort = false;
    for (let retry = 0; retry < 3; retry++) {
      if (await this.isPortFree(port)) {
        foundPort = true;
        break;
      }
      port++;
    }

    if (!foundPort) {
      throw new Error("Could not find a free port after 3 retries");
    }

    // Spawn dolt sql-server
    const proc = Bun.spawn([
      doltBin,
      "sql-server",
      "--port",
      port.toString(),
      "--data-dir",
      dataDir,
    ]);

    this.spawned = true;
    this.spawnedPid = proc.pid;

    // Poll for readiness (up to ~10 times with 500ms delay)
    let ready = false;
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 500));
      if (await this.isServerHealthy(port)) {
        ready = true;
        break;
      }
    }

    if (!ready) {
      // Kill the process if it didn't become ready
      try {
        proc.kill();
      } catch {
        // Process already dead
      }
      throw new Error("Dolt server failed to become ready");
    }

    // Write descriptor
    fs.mkdirSync(path.dirname(descriptorPath), { recursive: true });
    fs.writeFileSync(
      descriptorPath,
      JSON.stringify({ port, pid: proc.pid }, null, 2)
    );

    return { port };
  }

  /**
   * Shutdown the server if this instance spawned it.
   * Only kills the process if this DoltServerManager instance spawned it.
   */
  async shutdownIfIdle(): Promise<void> {
    if (this.spawned && this.spawnedPid !== undefined) {
      try {
        // Kill by PID - process.kill sends SIGTERM by default
        process.kill(this.spawnedPid);
      } catch {
        // Process already dead or permission denied
      }
    }
  }

  /**
   * Check if server is healthy by attempting SELECT 1 via MySQL
   */
  private async isServerHealthy(port: number): Promise<boolean> {
    try {
      const sql = new SQL(`mysql://root@localhost:${port}/mysql`);
      await sql`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if a port is free (not in use)
   */
  private async isPortFree(port: number): Promise<boolean> {
    try {
      // Try to connect to the port - if it fails, port is free
      const sql = new SQL(`mysql://root@localhost:${port}/mysql`);
      await sql`SELECT 1`;
      // If we got here, port is in use
      return false;
    } catch {
      // Port is free
      return true;
    }
  }
}

export default DoltServerManager;
