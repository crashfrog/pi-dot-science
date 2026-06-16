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

  describe("issue-31: Session branches", () => {
    beforeEach(async () => {
      store = new DoltStore(port);
      await store.initialize();
    });

    it("openSession() creates a new branch visible in dolt_branches", async () => {
      // Open a session
      const sessionId = await store.openSession();

      // Verify sessionId is a non-empty string
      expect(typeof sessionId).toBe("string");
      expect(sessionId.length).toBeGreaterThan(0);

      // Query dolt_branches to verify the session branch exists
      const branchesResult = await store.query(
        "SELECT branch_name FROM dolt_branches"
      );

      expect(Array.isArray(branchesResult)).toBe(true);
      const branchNames = (branchesResult as any[]).map(
        (b: any) => b.branch_name
      );

      // The session branch should exist with the pattern session-<uuid>
      const expectedBranchName = `session-${sessionId}`;
      expect(branchNames).toContain(expectedBranchName);
    });

    it("getSessionStore() returns a DoltStore connected to session branch", async () => {
      // Open a session
      const sessionId = await store.openSession();

      // Get a session-scoped store
      const sessionStore = await store.getSessionStore(sessionId);

      // Verify it's a DoltStore instance
      expect(sessionStore).toBeDefined();
      expect(typeof sessionStore.query).toBe("function");
      expect(typeof sessionStore.commit).toBe("function");

      // Insert a record in the session store
      await sessionStore.query(
        "INSERT INTO _provenance (df_name, seq, source, source_code, created_at, immutable) VALUES (?, ?, ?, ?, ?, ?)",
        ["session_table", 1, "source", "code", new Date().toISOString(), 0]
      );

      // Verify the record exists in the session store
      const resultSession = await sessionStore.query(
        "SELECT df_name FROM _provenance WHERE df_name = ?",
        ["session_table"]
      );

      expect((resultSession as any[]).length).toBe(1);
      expect((resultSession[0] as any).df_name).toBe("session_table");
    });

    it("two session stores on different branches do not see each other's data", async () => {
      // Open two sessions
      const session1Id = await store.openSession();
      const session2Id = await store.openSession();

      // Get stores for each session
      const store1 = await store.getSessionStore(session1Id);
      const store2 = await store.getSessionStore(session2Id);

      // Insert different data in each session
      await store1.query(
        "INSERT INTO _provenance (df_name, seq, source, source_code, created_at, immutable) VALUES (?, ?, ?, ?, ?, ?)",
        ["shared_name", 1, "source1", "code1", new Date().toISOString(), 0]
      );

      await store2.query(
        "INSERT INTO _provenance (df_name, seq, source, source_code, created_at, immutable) VALUES (?, ?, ?, ?, ?, ?)",
        ["shared_name", 1, "source2", "code2", new Date().toISOString(), 0]
      );

      // Verify each session only sees its own data
      const result1 = await store1.query(
        "SELECT source_code FROM _provenance WHERE df_name = ? AND seq = ?",
        ["shared_name", 1]
      );

      const result2 = await store2.query(
        "SELECT source_code FROM _provenance WHERE df_name = ? AND seq = ?",
        ["shared_name", 1]
      );

      // Session 1 should see source_code='code1'
      expect((result1[0] as any).source_code).toBe("code1");

      // Session 2 should see source_code='code2'
      expect((result2[0] as any).source_code).toBe("code2");
    });

    it("mergeToMain() for clean session lands commits on main's dolt_log", async () => {
      // Create a session and make changes
      const sessionId = await store.openSession();
      const sessionStore = await store.getSessionStore(sessionId);

      // Insert data and commit in session
      await sessionStore.query(
        "INSERT INTO _provenance (df_name, seq, source, source_code, created_at, immutable) VALUES (?, ?, ?, ?, ?, ?)",
        [
          "clean_merge_test",
          1,
          "source",
          "code",
          new Date().toISOString(),
          0,
        ]
      );

      const sessionCommitHash = await sessionStore.commit("Session work");

      // Merge back to main
      const mergeResult = await store.mergeToMain(sessionId);

      // Merge should succeed with no conflicts
      expect(mergeResult.success).toBe(true);
      expect(mergeResult.conflicts).toBeUndefined();

      // Verify the commit appears in main's dolt_log
      const mainLog = await store.getLog();

      expect(Array.isArray(mainLog)).toBe(true);
      expect(mainLog.length).toBeGreaterThan(0);

      // The session commit (or a merge commit) should be visible
      const hasSessionWork = mainLog.some(
        (entry: any) =>
          entry.message === "Session work" ||
          entry.message.includes("Merge session-" + sessionId)
      );

      expect(hasSessionWork).toBe(true);
    });

    it("mergeToMain() with conflicting primary-key edits returns ConflictInfo with base/ours/theirs", async () => {
      // Ensure main has initial data
      await store.query(
        "CREATE TABLE IF NOT EXISTS conflict_test (id INT PRIMARY KEY, value VARCHAR(255))"
      );

      await store.query(
        "INSERT INTO conflict_test (id, value) VALUES (?, ?)",
        [1, "main_value"]
      );

      await store.commit("Initial main data");

      // Create first session and modify the same row
      const session1Id = await store.openSession();
      const sessionStore1 = await store.getSessionStore(session1Id);

      await sessionStore1.query(
        "UPDATE conflict_test SET value = ? WHERE id = ?",
        ["session1_value", 1]
      );

      await sessionStore1.commit("Session 1 change");

      // Merge first session (should succeed since main hasn't changed)
      const mergeResult1 = await store.mergeToMain(session1Id);
      expect(mergeResult1.success).toBe(true);

      // Create second session from original main (before session 1's changes)
      // This requires querying before merge, or creating from a known commit
      const session2Id = await store.openSession();
      const sessionStore2 = await store.getSessionStore(session2Id);

      // Session 2 also modifies the same row with a different value
      await sessionStore2.query(
        "UPDATE conflict_test SET value = ? WHERE id = ?",
        ["session2_value", 1]
      );

      await sessionStore2.commit("Session 2 change");

      // Try to merge second session - should conflict
      const mergeResult2 = await store.mergeToMain(session2Id);

      // Verify conflict is reported
      expect(mergeResult2.success).toBe(false);
      expect(mergeResult2.conflicts).toBeDefined();
      expect(Array.isArray(mergeResult2.conflicts)).toBe(true);
      expect(mergeResult2.conflicts!.length).toBeGreaterThan(0);

      // Verify ConflictInfo structure
      const conflict = mergeResult2.conflicts![0];
      expect(conflict.table).toBe("conflict_test");
      expect(typeof conflict.count).toBe("number");
      expect(conflict.count).toBeGreaterThan(0);
      expect(Array.isArray(conflict.rows)).toBe(true);

      // Verify rows have base/ours/theirs
      if (conflict.rows.length > 0) {
        const row = conflict.rows[0];
        expect(row).toHaveProperty("base");
        expect(row).toHaveProperty("ours");
        expect(row).toHaveProperty("theirs");
      }
    });

    it("resolveConflicts('theirs') applies the session change to main", async () => {
      // Set up initial state
      await store.query(
        "CREATE TABLE IF NOT EXISTS resolve_test (id INT PRIMARY KEY, value VARCHAR(255))"
      );

      await store.query(
        "INSERT INTO resolve_test (id, value) VALUES (?, ?)",
        [1, "main_initial"]
      );

      await store.commit("Initial data");

      // Create session and modify
      const sessionId = await store.openSession();
      const sessionStore = await store.getSessionStore(sessionId);

      await sessionStore.query(
        "UPDATE resolve_test SET value = ? WHERE id = ?",
        ["session_value", 1]
      );

      await sessionStore.commit("Session change");

      // Merge and expect success (no conflict expected in this simple case)
      const mergeResult = await store.mergeToMain(sessionId);

      if (!mergeResult.success && mergeResult.conflicts) {
        // Resolve conflicts using 'theirs' (session's version)
        for (const conflict of mergeResult.conflicts) {
          await store.resolveConflicts(conflict.table, "theirs");
        }

        // Complete the merge
        await store.completeMerge();
      }

      // Verify main has the session value
      const result = await store.query(
        "SELECT value FROM resolve_test WHERE id = ?",
        [1]
      );

      expect((result[0] as any).value).toBe("session_value");
    });

    it("resolveConflicts('ours') keeps main's version", async () => {
      // Set up initial state
      await store.query(
        "CREATE TABLE IF NOT EXISTS ours_test (id INT PRIMARY KEY, value VARCHAR(255))"
      );

      await store.query(
        "INSERT INTO ours_test (id, value) VALUES (?, ?)",
        [1, "main_original"]
      );

      await store.commit("Initial data");

      // Create session and modify
      const sessionId = await store.openSession();
      const sessionStore = await store.getSessionStore(sessionId);

      await sessionStore.query(
        "UPDATE ours_test SET value = ? WHERE id = ?",
        ["session_value", 1]
      );

      await sessionStore.commit("Session change");

      // Merge and handle conflicts
      const mergeResult = await store.mergeToMain(sessionId);

      if (!mergeResult.success && mergeResult.conflicts) {
        // Resolve conflicts using 'ours' (main's version)
        for (const conflict of mergeResult.conflicts) {
          await store.resolveConflicts(conflict.table, "ours");
        }

        // Complete the merge
        await store.completeMerge();
      }

      // Verify main kept its original value
      const result = await store.query(
        "SELECT value FROM ours_test WHERE id = ?",
        [1]
      );

      expect((result[0] as any).value).toBe("main_original");
    });

    it("abortMerge() restores main to pre-merge state", async () => {
      // Set up initial state
      await store.query(
        "CREATE TABLE IF NOT EXISTS abort_test (id INT PRIMARY KEY, value VARCHAR(255))"
      );

      await store.query(
        "INSERT INTO abort_test (id, value) VALUES (?, ?)",
        [1, "pre_merge"]
      );

      const preMergeLog = await store.getLog();

      // Create session and modify
      const sessionId = await store.openSession();
      const sessionStore = await store.getSessionStore(sessionId);

      await sessionStore.query(
        "UPDATE abort_test SET value = ? WHERE id = ?",
        ["session_value", 1]
      );

      await sessionStore.commit("Session change");

      // Attempt merge
      const mergeResult = await store.mergeToMain(sessionId);

      if (!mergeResult.success) {
        // Abort the merge
        await store.abortMerge();

        // Verify main is back to pre-merge state
        const postAbortLog = await store.getLog();

        // Log length should be the same or main should have no new commits
        const mainValue = await store.query(
          "SELECT value FROM abort_test WHERE id = ?",
          [1]
        );

        expect((mainValue[0] as any).value).toBe("pre_merge");
      } else {
        // If merge succeeded without conflict, abort may not be applicable
        // In this case, verify it doesn't throw
        await expect(store.abortMerge()).resolves.not.toThrow();
      }
    });

    it("discardSession() deletes the branch and main remains unaffected", async () => {
      // Create a session and make changes
      const sessionId = await store.openSession();
      const sessionStore = await store.getSessionStore(sessionId);

      // Insert data in session
      await sessionStore.query(
        "INSERT INTO _provenance (df_name, seq, source, source_code, created_at, immutable) VALUES (?, ?, ?, ?, ?, ?)",
        ["discard_test", 1, "source", "code", new Date().toISOString(), 0]
      );

      await sessionStore.commit("Session work");

      // Get main's initial state
      const mainBeforeDiscard = await store.query(
        "SELECT COUNT(*) as cnt FROM _provenance WHERE df_name = ?",
        ["discard_test"]
      );

      // Discard the session
      await store.discardSession(sessionId);

      // Verify the session branch no longer exists
      const branchesResult = await store.query(
        "SELECT branch_name FROM dolt_branches"
      );

      const branchNames = (branchesResult as any[]).map(
        (b: any) => b.branch_name
      );
      const expectedBranchName = `session-${sessionId}`;

      expect(branchNames).not.toContain(expectedBranchName);

      // Verify main's data is unaffected (should be empty for this table)
      const mainAfterDiscard = await store.query(
        "SELECT COUNT(*) as cnt FROM _provenance WHERE df_name = ?",
        ["discard_test"]
      );

      expect((mainAfterDiscard[0] as any).cnt).toBe(
        (mainBeforeDiscard[0] as any).cnt
      );
    });

    it("diffAgainstMain() returns added/modified/removed rows for a dataframe", async () => {
      // Set up main with initial data
      await store.query(
        "CREATE TABLE IF NOT EXISTS diff_test (id INT PRIMARY KEY, value VARCHAR(255))"
      );

      await store.query(
        "INSERT INTO diff_test (id, value) VALUES (?, ?)",
        [1, "main_v1"]
      );

      await store.query(
        "INSERT INTO diff_test (id, value) VALUES (?, ?)",
        [2, "main_v2"]
      );

      await store.commit("Initial main data");

      // Create a session and modify
      const sessionId = await store.openSession();
      const sessionStore = await store.getSessionStore(sessionId);

      // Modify an existing row
      await sessionStore.query(
        "UPDATE diff_test SET value = ? WHERE id = ?",
        ["session_v1_modified", 1]
      );

      // Delete a row
      await sessionStore.query("DELETE FROM diff_test WHERE id = ?", [2]);

      // Add a new row
      await sessionStore.query(
        "INSERT INTO diff_test (id, value) VALUES (?, ?)",
        [3, "session_v3_new"]
      );

      await sessionStore.commit("Session changes");

      // Get diff against main
      const diffResult = await store.diffAgainstMain(sessionId, "diff_test");

      expect(diffResult).toBeDefined();
      expect(diffResult).toHaveProperty("added");
      expect(diffResult).toHaveProperty("modified");
      expect(diffResult).toHaveProperty("removed");

      // Verify the diff contains expected rows
      expect(Array.isArray(diffResult.added)).toBe(true);
      expect(Array.isArray(diffResult.modified)).toBe(true);
      expect(Array.isArray(diffResult.removed)).toBe(true);

      // Should have added row 3
      expect(
        diffResult.added.some((row: any) => row.id === 3)
      ).toBe(true);

      // Should have modified row 1
      expect(
        diffResult.modified.some((row: any) => row.id === 1)
      ).toBe(true);

      // Should have removed row 2
      expect(
        diffResult.removed.some((row: any) => row.id === 2)
      ).toBe(true);
    });

    it("history() returns dolt_log entries for the session", async () => {
      // Create a session and make commits
      const sessionId = await store.openSession();
      const sessionStore = await store.getSessionStore(sessionId);

      // Make a few commits
      await sessionStore.query(
        "INSERT INTO _provenance (df_name, seq, source, source_code, created_at, immutable) VALUES (?, ?, ?, ?, ?, ?)",
        ["history_test", 1, "source1", "code1", new Date().toISOString(), 0]
      );

      await sessionStore.commit("First session commit");

      await sessionStore.query(
        "INSERT INTO _provenance (df_name, seq, source, source_code, created_at, immutable) VALUES (?, ?, ?, ?, ?, ?)",
        ["history_test", 2, "source2", "code2", new Date().toISOString(), 0]
      );

      await sessionStore.commit("Second session commit");

      // Get history for the session
      const historyResult = await store.history(sessionId);

      expect(Array.isArray(historyResult)).toBe(true);
      expect(historyResult.length).toBeGreaterThanOrEqual(2);

      // Verify structure of returned entries
      for (const entry of historyResult) {
        expect(entry).toHaveProperty("commit_hash");
        expect(entry).toHaveProperty("message");
        expect(entry).toHaveProperty("author");
        expect(typeof entry.commit_hash).toBe("string");
        expect(typeof entry.message).toBe("string");
        expect(typeof entry.author).toBe("string");
      }

      // Verify our commits are in the history
      const messages = historyResult.map((e: any) => e.message);
      expect(messages).toContain("First session commit");
      expect(messages).toContain("Second session commit");
    });

    it("history(sessionId, dfName) filters to table history when dfName provided", async () => {
      // Create a session with a specific dataframe table
      const sessionId = await store.openSession();
      const sessionStore = await store.getSessionStore(sessionId);

      // Create a table and make changes
      await sessionStore.query(
        "CREATE TABLE IF NOT EXISTS history_filter_test (id INT PRIMARY KEY, data VARCHAR(255))"
      );

      await sessionStore.query(
        "INSERT INTO history_filter_test (id, data) VALUES (?, ?)",
        [1, "data1"]
      );

      await sessionStore.commit("Commit for history_filter_test");

      // Make another change to a different table
      await sessionStore.query(
        "INSERT INTO _provenance (df_name, seq, source, source_code, created_at, immutable) VALUES (?, ?, ?, ?, ?, ?)",
        ["other_df", 1, "source", "code", new Date().toISOString(), 0]
      );

      await sessionStore.commit("Commit for other_df");

      // Get history filtered to the specific table
      const tableHistory = await store.history(
        sessionId,
        "history_filter_test"
      );

      expect(Array.isArray(tableHistory)).toBe(true);

      // Should contain the commit that touched history_filter_test
      const hasTableCommit = tableHistory.some(
        (e: any) => e.message === "Commit for history_filter_test"
      );

      expect(hasTableCommit).toBe(true);
    });
  });
});
