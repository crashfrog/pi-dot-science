import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { DoltServerManager } from "./dolt-server.js";
import { DoltStore } from "./dolt-store.js";

/**
 * Extension factory that wires DoltServerManager and DoltStore into the pi-coding-agent
 * Handles session lifecycle:
 * - On session_start: ensure Dolt server running, initialize store, open session branch
 * - On session_end: merge session branch back to main, shutdown server if idle
 */
export function doltStoreExtension(pi: ExtensionAPI): void {
  pi.on("session_start", async (session: any) => {
    const projectDir = session.cwd || process.cwd();
    const serverManager = new DoltServerManager();
    const { port } = await serverManager.ensureRunning(projectDir);
    const store = new DoltStore(port);
    await store.initialize();
    const sessionId = await store.openSession();

    // Seam: Python subprocess will read these to connect to the session branch
    process.env.PI_SCIENCE_DOLT_PORT = String(port);
    process.env.PI_SCIENCE_DOLT_DB = `pi_science/session-${sessionId}`;

    session.store = store;
    session.sessionId = sessionId;
    session.serverManager = serverManager;
  });

  pi.on("session_end", async (session: any) => {
    if (session.store && session.sessionId) {
      await session.store.mergeToMain(session.sessionId);
    }
    if (session.serverManager) {
      await session.serverManager.shutdownIfIdle();
    }
  });
}

export default doltStoreExtension;
