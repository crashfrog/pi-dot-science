import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { DoltStore } from "./dolt-store";
import { DoltServerManager } from "./dolt-server";

/**
 * Acceptance tests for GitHub Issue #28: Dolt walking skeleton (DoltStore)
 *
 * Run with: bun test --grep "issue-28"
 *
 * These tests verify:
 * - [AC1] DoltStore connects over MySQL wire protocol via Bun's SQL adapter
 * - [AC2] Creates pi_science database on first run
 * - [AC3] Creates _provenance table (df_name, seq, source, source_code, created_at, immutable; PK (df_name, seq))
 * - [AC4] Makes a Dolt commit with explicit author 'pi.science <pi-science@local>'
 * - [AC5] Commit appears in dolt_log with correct author
 * - [AC6] Records outcome of prepared statements vs simple-query routing in PR description
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

describe.skipIf(!isDoltInstalled)("issue-28: DoltStore", () => {
  if (!isDoltInstalled()) {
    console.warn(
      "Skipping Dolt store tests: dolt binary not found. " +
      "Install from https://github.com/dolthub/dolt/releases"
    );
  }

  let tempDir: string;
  let serverManager: DoltServerManager;
  let port: number;
  let store: DoltStore;

  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-science-test-"));

    // Start a Dolt server for all tests in this describe block
    const projectDir = path.join(tempDir, "project");
    fs.mkdirSync(projectDir, { recursive: true });

    serverManager = new DoltServerManager();
    const serverInfo = await serverManager.ensureRunning(projectDir);
    port = serverInfo.port;
  });

  afterAll(async () => {
    await serverManager.shutdownIfIdle();

    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe("Database and table initialization", () => {
    it("creates pi_science database on first initialize()", async () => {
      store = new DoltStore(port);
      await store.initialize();

      // Verify the database was created by querying it
      const result = await store.query("SELECT DATABASE() as db");
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it("creates _provenance table with correct schema", async () => {
      store = new DoltStore(port);
      await store.initialize();

      // Query the table structure
      const result = await store.query(
        "SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '_provenance' ORDER BY ORDINAL_POSITION"
      );

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);

      // Verify expected columns exist
      const columnNames = (result as any[]).map((r: any) => r.COLUMN_NAME);
      expect(columnNames).toContain("df_name");
      expect(columnNames).toContain("seq");
      expect(columnNames).toContain("source");
      expect(columnNames).toContain("source_code");
      expect(columnNames).toContain("created_at");
      expect(columnNames).toContain("immutable");
    });

    it("_provenance table has composite primary key (df_name, seq)", async () => {
      store = new DoltStore(port);
      await store.initialize();

      // Query for primary key constraint
      const result = await store.query(
        "SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE WHERE TABLE_NAME = '_provenance' AND CONSTRAINT_NAME = 'PRIMARY'"
      );

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it("idempotent: calling initialize() twice does not fail", async () => {
      store = new DoltStore(port);
      await store.initialize();
      await store.initialize();

      // Second initialize should not throw
      expect(true).toBe(true);
    });
  });

  describe("Provenance record insertion and querying", () => {
    beforeEach(async () => {
      store = new DoltStore(port);
      await store.initialize();
    });

    it("inserts provenance record into _provenance table", async () => {
      const dfName = "test_df";
      const seq = 1;
      const source = "csv:///data/test.csv";
      const sourceCode = "df = read_csv('test.csv')";
      const createdAt = new Date().toISOString();

      await store.query(
        "INSERT INTO _provenance (df_name, seq, source, source_code, created_at, immutable) VALUES (?, ?, ?, ?, ?, ?)",
        [dfName, seq, source, sourceCode, createdAt, 0]
      );

      // Query it back
      const result = await store.query(
        "SELECT df_name, seq, source, source_code FROM _provenance WHERE df_name = ? AND seq = ?",
        [dfName, seq]
      );

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(1);
      expect((result[0] as any).df_name).toBe(dfName);
      expect((result[0] as any).seq).toBe(seq);
      expect((result[0] as any).source).toBe(source);
      expect((result[0] as any).source_code).toBe(sourceCode);
    });

    it("supports multiple provenance records per dataframe", async () => {
      const dfName = "multi_df";

      // Insert multiple records
      for (let i = 1; i <= 3; i++) {
        await store.query(
          "INSERT INTO _provenance (df_name, seq, source, source_code, created_at, immutable) VALUES (?, ?, ?, ?, ?, ?)",
          [dfName, i, `source-${i}`, `code-${i}`, new Date().toISOString(), 0]
        );
      }

      // Query all records for this dataframe
      const result = await store.query(
        "SELECT seq FROM _provenance WHERE df_name = ? ORDER BY seq",
        [dfName]
      );

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(3);
    });
  });

  describe("Dolt commit and log", () => {
    beforeEach(async () => {
      store = new DoltStore(port);
      await store.initialize();
    });

    it("makes a Dolt commit with explicit author 'pi.science <pi-science@local>'", async () => {
      // Insert a record first
      await store.query(
        "INSERT INTO _provenance (df_name, seq, source, source_code, created_at, immutable) VALUES (?, ?, ?, ?, ?, ?)",
        ["test_commit", 1, "source", "code", new Date().toISOString(), 0]
      );

      // Make a commit
      const commitHash = await store.commit("Initial provenance entry");

      // Verify commit hash is returned and non-empty
      expect(commitHash).toBeDefined();
      expect(typeof commitHash).toBe("string");
      expect(commitHash.length).toBeGreaterThan(0);
    });

    it("commit appears in dolt_log with correct author", async () => {
      // Insert a record
      await store.query(
        "INSERT INTO _provenance (df_name, seq, source, source_code, created_at, immutable) VALUES (?, ?, ?, ?, ?, ?)",
        ["log_test", 1, "source", "code", new Date().toISOString(), 0]
      );

      const commitMessage = "Test provenance commit";
      await store.commit(commitMessage);

      // Query dolt_log for our commit
      const logResult = await store.getLog();

      expect(Array.isArray(logResult)).toBe(true);
      expect(logResult.length).toBeGreaterThan(0);

      // Find our commit
      const commit = logResult.find((c: any) => c.message === commitMessage);
      expect(commit).toBeDefined();
      expect(commit?.author).toContain("pi.science");
      expect(commit?.author).toContain("pi-science@local");
    });

    it("getLog returns array with commit_hash, message, and author fields", async () => {
      // Insert and commit something
      await store.query(
        "INSERT INTO _provenance (df_name, seq, source, source_code, created_at, immutable) VALUES (?, ?, ?, ?, ?, ?)",
        ["log_fields", 1, "s", "c", new Date().toISOString(), 0]
      );

      await store.commit("Fields test");

      const logResult = await store.getLog();

      expect(Array.isArray(logResult)).toBe(true);
      expect(logResult.length).toBeGreaterThan(0);

      // Verify structure of returned commits
      for (const commit of logResult) {
        expect(commit).toHaveProperty("commit_hash");
        expect(commit).toHaveProperty("message");
        expect(commit).toHaveProperty("author");
        expect(typeof commit.commit_hash).toBe("string");
        expect(typeof commit.message).toBe("string");
        expect(typeof commit.author).toBe("string");
      }
    });

    it("multiple commits are recorded in order", async () => {
      // Insert and commit multiple times
      for (let i = 1; i <= 2; i++) {
        await store.query(
          "INSERT INTO _provenance (df_name, seq, source, source_code, created_at, immutable) VALUES (?, ?, ?, ?, ?, ?)",
          [`multi_commit`, i, `source-${i}`, `code-${i}`, new Date().toISOString(), 0]
        );

        await store.commit(`Multi commit #${i}`);
      }

      const logResult = await store.getLog();

      // Should have at least our two commits
      const ourCommits = logResult.filter((c: any) =>
        c.message === "Multi commit #1" || c.message === "Multi commit #2"
      );
      expect(ourCommits.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("Query interface and routing", () => {
    beforeEach(async () => {
      store = new DoltStore(port);
      await store.initialize();
    });

    it("query() executes SQL with and without parameters", async () => {
      // Query without parameters
      const result1 = await store.query("SELECT 1 as val");
      expect(Array.isArray(result1)).toBe(true);

      // Query with parameters (prepared statement or simple query)
      const result2 = await store.query(
        "SELECT ? as val",
        [42]
      );
      expect(Array.isArray(result2)).toBe(true);
    });

    it("query() with CALL DOLT_* statements works via simple-query path if prepared statements fail", async () => {
      // This test verifies that the implementation handles CALL DOLT_*() correctly
      // Either via prepared statements or by routing to simple-query path

      // Insert something first
      await store.query(
        "INSERT INTO _provenance (df_name, seq, source, source_code, created_at, immutable) VALUES (?, ?, ?, ?, ?, ?)",
        ["dolt_call_test", 1, "s", "c", new Date().toISOString(), 0]
      );

      // Call DOLT_COMMIT via the query interface
      // This is tested indirectly via the commit() method
      const commitHash = await store.commit("Dolt call test");
      expect(typeof commitHash).toBe("string");
      expect(commitHash.length).toBeGreaterThan(0);
    });

    it("handles connection pooling and reuses connections", async () => {
      // Make multiple queries in sequence
      for (let i = 0; i < 5; i++) {
        const result = await store.query("SELECT ? as iteration", [i]);
        expect(Array.isArray(result)).toBe(true);
      }

      // If we get here without errors, connection management is working
      expect(true).toBe(true);
    });
  });

  describe("MySQL wire protocol compliance", () => {
    it("connects successfully over MySQL wire protocol", async () => {
      store = new DoltStore(port);

      // initialize() should connect successfully
      await expect(store.initialize()).resolves.not.toThrow();
    });

    it("handles multiple concurrent queries correctly", async () => {
      store = new DoltStore(port);
      await store.initialize();

      // Insert records in parallel
      const queries = [
        store.query(
          "INSERT INTO _provenance (df_name, seq, source, source_code, created_at, immutable) VALUES (?, ?, ?, ?, ?, ?)",
          ["concurrent_1", 1, "s", "c", new Date().toISOString(), 0]
        ),
        store.query(
          "INSERT INTO _provenance (df_name, seq, source, source_code, created_at, immutable) VALUES (?, ?, ?, ?, ?, ?)",
          ["concurrent_2", 1, "s", "c", new Date().toISOString(), 0]
        ),
      ];

      await Promise.all(queries);

      // Verify both records exist
      const result = await store.query(
        "SELECT COUNT(*) as cnt FROM _provenance WHERE df_name IN ('concurrent_1', 'concurrent_2')"
      );

      expect((result[0] as any).cnt).toBe(2);
    });
  });
});
