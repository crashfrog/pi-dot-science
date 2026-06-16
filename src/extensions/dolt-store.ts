// Dolt Store for pi.science
// Provides audited provenance storage and versioning via Dolt + MySQL

import { SQL } from "bun";
import { randomUUID } from "crypto";

export interface ProvenanceRecord {
  df_name: string;
  seq: number;
  source: string;
  source_code: string;
  immutable?: boolean;
  created_at?: string | Date;
}

export interface CommitLogEntry {
  commit_hash: string;
  message: string;
  author: string;
}

export interface SchemaInfo {
  columns: string[];
  dtypes: Record<string, string>;
}

export interface DataframeEntry {
  name: string;
  columns: string[];
  dtypes: Record<string, string>;
  shape: [number, number];
  sampleRow: Record<string, any> | null;
  provenance: ProvenanceRecord[];
}

export interface MergeResult {
  success: boolean;
  conflicts?: ConflictInfo[];
}

export interface ConflictInfo {
  table: string;
  count: number;
  rows: Array<{ base: any; ours: any; theirs: any }>;
}

export interface DiffResult {
  added: any[];
  modified: any[];
  removed: any[];
}

export class DoltStore {
  private port: number;
  /** @internal — public for getSessionStore() branch-connection setup only */
  sqlClient: SQL | null = null;
  /** @internal — public for getSessionStore() branch-connection setup only */
  connectionString: string;

  constructor(port: number) {
    this.port = port;
    this.connectionString = `mysql://root@localhost:${port}/pi_science`;
  }

  /**
   * Get or create the SQL client (lazy initialization)
   */
  private getSqlClient(): SQL {
    if (!this.sqlClient) {
      this.sqlClient = new SQL(this.connectionString);
    }
    return this.sqlClient;
  }

  /**
   * Initialize the database and _provenance table
   * - CREATE DATABASE IF NOT EXISTS pi_science
   * - USE pi_science
   * - CREATE TABLE IF NOT EXISTS _provenance (df_name, seq, source, source_code, created_at, immutable; PK: df_name, seq)
   */
  async initialize(): Promise<void> {
    // First, connect to the 'mysql' database to create pi_science
    this.connectionString = `mysql://root@localhost:${this.port}/mysql`;
    this.sqlClient = new SQL(this.connectionString);

    // Create database
    await this.query(`CREATE DATABASE IF NOT EXISTS pi_science`);

    // Now reconnect to pi_science
    this.connectionString = `mysql://root@localhost:${this.port}/pi_science`;
    this.sqlClient = new SQL(this.connectionString);

    // Create _provenance table
    await this.query(`
      CREATE TABLE IF NOT EXISTS _provenance (
        df_name VARCHAR(255) NOT NULL,
        seq INT NOT NULL,
        source TEXT NOT NULL,
        source_code LONGTEXT NOT NULL,
        created_at DATETIME(6),
        immutable BOOLEAN,
        PRIMARY KEY (df_name, seq)
      )
    `);

    // Commit schema changes so the working set is clean before any merges
    try {
      await this.query(
        `CALL DOLT_COMMIT('-A', '-m', 'Initialize pi_science schema', '--author', 'pi.science <pi-science@local>', '--allow-empty')`
      );
    } catch (e: any) {
      // If nothing to commit, that's fine (schema already exists and was committed)
      if (!String(e?.message).includes("nothing to commit") &&
          !String(e?.message).includes("no changes")) {
        throw e;
      }
    }
  }

  /**
   * Insert a provenance record with current timestamp
   */
  async insertProvenance(record: ProvenanceRecord): Promise<void> {
    await this.query(
      `INSERT INTO _provenance (df_name, seq, source, source_code, created_at, immutable)
       VALUES (?, ?, ?, ?, NOW(6), ?)`,
      [
        record.df_name,
        record.seq,
        record.source,
        record.source_code,
        record.immutable ? 1 : 0,
      ]
    );
  }

  /**
   * Get all provenance records for a dataframe, ordered by seq
   */
  async getProvenance(df_name: string): Promise<ProvenanceRecord[]> {
    const result = await this.query(
      `SELECT df_name, seq, source, source_code, created_at, immutable FROM _provenance WHERE df_name = ? ORDER BY seq`,
      [df_name]
    );
    return (result as any[]).map((row) => ({
      df_name: row.df_name,
      seq: row.seq,
      source: row.source,
      source_code: row.source_code,
      created_at: row.created_at,
      immutable: row.immutable === 1 || row.immutable === true,
    }));
  }

  /**
   * Make a Dolt commit with explicit author 'pi.science <pi-science@local>'
   * Returns the commit hash
   */
  async commit(message: string): Promise<string> {
    const sqlClient = this.getSqlClient();
    try {
      // Try using prepared statement first
      const result = await sqlClient`
        CALL DOLT_COMMIT(
          '-A',
          '-m',
          ${message},
          '--author',
          ${'pi.science <pi-science@local>'}
        )
      `;

      // If we got here, extract commit hash from result
      if (Array.isArray(result) && result.length > 0) {
        const row = result[0] as Record<string, unknown>;
        // Dolt_COMMIT returns hash as first column or as a 'hash' field
        const commitHash = row.hash || Object.values(row)[0];
        return String(commitHash);
      }
      throw new Error("No commit hash returned");
    } catch (error) {
      // Prepared statement failed, try unsafe query path
      const unsafeResult = await sqlClient.unsafe(
        `CALL DOLT_COMMIT('-A', '-m', '${message.replace(/'/g, "''")}', '--author', 'pi.science <pi-science@local>')`
      );

      if (Array.isArray(unsafeResult) && unsafeResult.length > 0) {
        const row = unsafeResult[0] as Record<string, unknown>;
        const commitHash = row.hash || Object.values(row)[0];
        return String(commitHash);
      }
      throw new Error("No commit hash returned");
    }
  }

  /**
   * Get commit log from dolt_log table
   * Returns array of {commit_hash, message, author}
   */
  async getLog(): Promise<CommitLogEntry[]> {
    const result = await this.query(
      `SELECT commit_hash, message, CONCAT(committer, ' <', email, '>') as author FROM dolt_log`
    );
    return result.map((row) => {
      const r = row as Record<string, unknown>;
      return {
        commit_hash: String(r.commit_hash),
        message: String(r.message),
        author: String(r.author),
      };
    });
  }

  /**
   * Execute a SQL query with optional parameters
   * Chokepoint for all query execution - handles both regular queries and Dolt operations
   * Returns result array
   */
  async query(sql: string, params?: unknown[]): Promise<unknown[]> {
    const sqlClient = this.getSqlClient();
    try {
      if (!params || params.length === 0) {
        // No parameters, use simple query
        const result = await sqlClient.unsafe(sql);
        return Array.isArray(result) ? result : [];
      }

      // Use prepared statement with parameters
      // Build parameterized query dynamically
      let queryStr = sql;
      const templateParts: string[] = [];
      let paramIndex = 0;
      let charIndex = 0;

      // Parse SQL for ? placeholders and build template string for Bun SQL
      while (charIndex < sql.length) {
        const questionIdx = sql.indexOf("?", charIndex);
        if (questionIdx === -1) {
          templateParts.push(sql.slice(charIndex));
          break;
        }
        templateParts.push(sql.slice(charIndex, questionIdx));
        templateParts.push("${params[" + paramIndex + "]}");
        paramIndex++;
        charIndex = questionIdx + 1;
      }

      // For prepared statements, use the Bun SQL template feature
      // Since we can't use template literals directly, use unsafe with proper escaping.
      // Replace each ? in order (left-to-right) with the corresponding param value.
      let escapedSql = sql;
      for (let i = 0; i < params.length; i++) {
        const param = params[i];
        const escapedValue = this.escapeValue(param);
        // Replace only the first remaining ? placeholder
        escapedSql = escapedSql.replace("?", escapedValue);
      }

      const result = await sqlClient.unsafe(escapedSql);
      return Array.isArray(result) ? result : [];
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get schema information (columns and dtypes) from information_schema
   * Returns null if table doesn't exist
   */
  async getSchema(name: string): Promise<SchemaInfo | null> {
    const result = await this.query(
      `SELECT COLUMN_NAME, DATA_TYPE
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = 'pi_science' AND TABLE_NAME = ? AND COLUMN_NAME != '__row_id'
       ORDER BY ORDINAL_POSITION`,
      [name]
    );

    if (!Array.isArray(result) || result.length === 0) {
      return null;
    }

    const columns = (result as any[]).map((r) => r.COLUMN_NAME);
    const dtypes: Record<string, string> = {};

    for (const row of result as any[]) {
      dtypes[row.COLUMN_NAME] = this.mysqlTypeToDtype(row.DATA_TYPE);
    }

    return { columns, dtypes };
  }

  /**
   * Convert MySQL data type to Python/NumPy dtype string
   */
  private mysqlTypeToDtype(mysqlType: string): string {
    const typeUpper = mysqlType.toUpperCase();

    if (typeUpper === "BIGINT") return "int64";
    if (typeUpper === "DOUBLE") return "float64";
    if (typeUpper === "TINYINT" || typeUpper === "BOOLEAN" || typeUpper === "BOOL")
      return "bool";
    if (typeUpper.includes("DATETIME")) return "datetime64[ns]";
    if (
      typeUpper === "TEXT" ||
      typeUpper === "LONGTEXT" ||
      typeUpper.includes("VARCHAR") ||
      typeUpper === "MEDIUMTEXT"
    )
      return "object";

    // Default to object for unknown types
    return "object";
  }

  /**
   * Get full dataframe entry with metadata and provenance
   * Returns null if table doesn't exist
   */
  async getDataframe(name: string): Promise<DataframeEntry | null> {
    const schema = await this.getSchema(name);
    if (!schema) {
      return null;
    }

    // Get row count
    const countResult = await this.query(
      `SELECT COUNT(*) as cnt FROM \`${name}\``
    );
    const rowCount =
      Array.isArray(countResult) && countResult.length > 0
        ? (countResult[0] as any).cnt
        : 0;

    // Get sample row (first row, excluding __row_id)
    const sampleResult = await this.query(
      `SELECT * FROM \`${name}\` LIMIT 1`
    );
    let sampleRow: Record<string, any> | null = null;

    if (Array.isArray(sampleResult) && sampleResult.length > 0) {
      const fullRow = sampleResult[0] as any;
      sampleRow = { ...fullRow };
      delete sampleRow.__row_id;
    }

    // Get provenance
    const provenance = await this.getProvenance(name);

    const shape: [number, number] = [rowCount, schema.columns.length];

    return {
      name,
      columns: schema.columns,
      dtypes: schema.dtypes,
      shape,
      sampleRow,
      provenance,
    };
  }

  /**
   * List all dataframes in the database (excluding _provenance table)
   * Returns array of DataframeEntry objects with metadata
   */
  async listDataframes(): Promise<DataframeEntry[]> {
    const result = await this.query(
      `SELECT TABLE_NAME FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = 'pi_science' AND TABLE_NAME != '_provenance'`
    );

    if (!Array.isArray(result) || result.length === 0) {
      return [];
    }

    const entries: DataframeEntry[] = [];

    for (const row of result as any[]) {
      const tableName = row.TABLE_NAME;
      const entry = await this.getDataframe(tableName);
      if (entry) {
        entries.push(entry);
      }
    }

    return entries;
  }

  /**
   * Get source_code strings in seq order for replay
   * Returns empty array if no provenance exists
   */
  async replayTransformations(name: string): Promise<string[]> {
    const result = await this.query(
      `SELECT source_code FROM _provenance WHERE df_name = ? ORDER BY seq ASC`,
      [name]
    );

    if (!Array.isArray(result) || result.length === 0) {
      return [];
    }

    return (result as any[]).map((row) => row.source_code);
  }

  /**
   * Check if a dataframe is immutable (based on latest provenance record)
   * Returns false if no provenance exists
   */
  async isImmutable(name: string): Promise<boolean> {
    const result = await this.query(
      `SELECT immutable FROM _provenance WHERE df_name = ? ORDER BY seq DESC LIMIT 1`,
      [name]
    );

    if (!Array.isArray(result) || result.length === 0) {
      return false;
    }

    const immutable = (result[0] as any).immutable;
    return immutable === 1 || immutable === true;
  }

  /**
   * Clear a dataframe: drop table, remove provenance, make commit
   * Throws if dataframe is immutable
   */
  async clearDataframe(name: string): Promise<void> {
    // Check if immutable
    const immut = await this.isImmutable(name);
    if (immut) {
      throw new Error(
        `Cannot clear immutable dataframe '${name}'`
      );
    }

    // Drop the table
    await this.query(`DROP TABLE IF EXISTS \`${name}\``);

    // Delete provenance records
    await this.query(`DELETE FROM _provenance WHERE df_name = ?`, [name]);

    // Make a commit
    await this.commit(`clear_dataframe(${name})`);
  }

  /**
   * Escape a parameter value for unsafe SQL queries
   */
  private escapeValue(value: unknown): string {
    if (value === null || value === undefined) {
      return "NULL";
    }
    if (typeof value === "number") {
      return String(value);
    }
    if (typeof value === "boolean") {
      return value ? "1" : "0";
    }
    if (typeof value === "string") {
      return "'" + value.replace(/'/g, "''") + "'";
    }
    return "'" + String(value).replace(/'/g, "''") + "'";
  }

  /**
   * Open a new session by creating a branch
   * Returns the session ID (UUID)
   */
  async openSession(): Promise<string> {
    const sessionId = randomUUID();
    const branchName = `session-${sessionId}`;

    // Creates a new branch from current HEAD (main). Second arg is start point.
    await this.query(`CALL DOLT_BRANCH('${branchName}', 'main')`);

    return sessionId;
  }

  /**
   * Get a DoltStore instance connected to a specific session branch.
   * Uses the Dolt database/branch connection string format so the branch
   * is pinned at the connection level (works correctly with connection pools).
   */
  async getSessionStore(sessionId: string): Promise<DoltStore> {
    const branchName = `session-${sessionId}`;
    const store = new DoltStore(this.port);
    // Connect directly to the session branch via database/branch syntax
    store.connectionString = `mysql://root@localhost:${this.port}/pi_science/${branchName}`;
    store.sqlClient = new SQL(store.connectionString);
    return store;
  }

  /**
   * Helper: extract conflict rows from dolt_conflicts_<table>
   */
  private async fetchConflictInfo(tableName: string): Promise<ConflictInfo> {
    const conflictRows = await this.query(
      `SELECT * FROM dolt_conflicts_${tableName}`
    );
    // dolt_conflicts_<table> has base_<col>, our_<col>, their_<col> prefixed columns
    const rows = (conflictRows as any[]).map((row) => {
      const base: Record<string, unknown> = {};
      const ours: Record<string, unknown> = {};
      const theirs: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(row)) {
        if (k.startsWith("base_")) base[k.slice(5)] = v;
        else if (k.startsWith("our_")) ours[k.slice(4)] = v;
        else if (k.startsWith("their_")) theirs[k.slice(6)] = v;
      }
      return { base, ours, theirs };
    });
    return { table: tableName, count: rows.length, rows };
  }

  /**
   * Merge a session branch back to main.
   * Uses @@dolt_allow_commit_conflicts=1 so conflicts are kept in dolt_conflicts
   * rather than rolling back the transaction.
   */
  async mergeToMain(sessionId: string): Promise<MergeResult> {
    const branchName = `session-${sessionId}`;

    try {
      // Allow conflicts to persist so we can read them from dolt_conflicts
      await this.query(`SET @@dolt_allow_commit_conflicts = 1`);

      const mergeRows = await this.query(
        `CALL DOLT_MERGE('${branchName}', '--no-ff', '-m', 'Merge ${branchName} to main')`
      );

      // Check if merge returned conflict count > 0
      const mergeResult = mergeRows[0] as any;
      const hasConflicts =
        mergeResult &&
        (mergeResult.conflicts > 0 ||
          mergeResult.num_conflicts > 0);

      if (hasConflicts) {
        // Read conflict details
        const conflictCheck = await this.query(
          `SELECT \`table\`, num_conflicts FROM dolt_conflicts`
        );
        const conflicts: ConflictInfo[] = [];
        for (const conflict of conflictCheck as any[]) {
          conflicts.push(await this.fetchConflictInfo(conflict.table));
        }
        return { success: false, conflicts };
      }

      // Double-check dolt_conflicts in case the result row didn't include count
      const conflictCheck = await this.query(
        `SELECT \`table\`, num_conflicts FROM dolt_conflicts`
      );

      if (Array.isArray(conflictCheck) && conflictCheck.length > 0) {
        const conflicts: ConflictInfo[] = [];
        for (const conflict of conflictCheck as any[]) {
          conflicts.push(await this.fetchConflictInfo(conflict.table));
        }
        return { success: false, conflicts };
      }

      return { success: true };
    } catch (error: any) {
      // Merge may have thrown due to conflicts; try to read conflict state
      try {
        const conflictCheck = await this.query(
          `SELECT \`table\`, num_conflicts FROM dolt_conflicts`
        );

        if (Array.isArray(conflictCheck) && conflictCheck.length > 0) {
          const conflicts: ConflictInfo[] = [];
          for (const conflict of conflictCheck as any[]) {
            conflicts.push(await this.fetchConflictInfo(conflict.table));
          }
          return { success: false, conflicts };
        }
      } catch (e) {
        // Conflict check failed — re-throw original error
      }

      throw error;
    } finally {
      // Restore default autocommit conflict behavior
      try {
        await this.query(`SET @@dolt_allow_commit_conflicts = 0`);
      } catch {
        // Ignore
      }
    }
  }

  /**
   * Resolve conflicts using 'ours' or 'theirs' strategy
   */
  async resolveConflicts(
    table: string,
    strategy: "ours" | "theirs"
  ): Promise<void> {
    // Stage the conflict resolution — caller must call completeMerge() to commit
    await this.query(
      `CALL DOLT_CONFLICTS_RESOLVE('--${strategy}', '${table}')`
    );
  }

  /**
   * Commit a completed merge after all conflicts have been resolved via resolveConflicts()
   */
  async completeMerge(): Promise<void> {
    await this.query(
      `CALL DOLT_COMMIT('-A', '-m', 'Complete merge after conflict resolution', '--author', 'pi.science <pi-science@local>')`
    );
  }

  /**
   * Abort a merge in progress
   */
  async abortMerge(): Promise<void> {
    await this.query(`CALL DOLT_MERGE('--abort')`);
  }

  /**
   * Discard a session branch without merging
   */
  async discardSession(sessionId: string): Promise<void> {
    const branchName = `session-${sessionId}`;
    // -D is force-delete (no need for separate -f flag)
    await this.query(`CALL DOLT_BRANCH('-D', '${branchName}')`);
  }

  /**
   * Get diff of a dataframe between main and a session branch
   */
  async diffAgainstMain(
    sessionId: string,
    dfName: string
  ): Promise<DiffResult> {
    const branchName = `session-${sessionId}`;

    // diff_type is already included in SELECT * for DOLT_DIFF results
    const diffRows = await this.query(
      `SELECT * FROM DOLT_DIFF('main', '${branchName}', '${dfName}')`
    );

    const result: DiffResult = {
      added: [],
      modified: [],
      removed: [],
    };

    for (const row of diffRows as any[]) {
      const diffType = row.diff_type;

      // DOLT_DIFF returns to_<col> for current state and from_<col> for prior state.
      // Normalize: strip the to_/from_ prefix to expose bare column names.
      const normalizeRow = (r: any, prefix: "to_" | "from_") => {
        const normalized: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(r)) {
          if (k.startsWith(prefix)) {
            normalized[k.slice(prefix.length)] = v;
          }
        }
        return normalized;
      };

      if (diffType === "added") {
        result.added.push(normalizeRow(row, "to_"));
      } else if (diffType === "modified") {
        result.modified.push(normalizeRow(row, "to_"));
      } else if (diffType === "removed") {
        result.removed.push(normalizeRow(row, "from_"));
      }
    }

    return result;
  }

  /**
   * Get history for a session or table.
   * - history(sessionId) → all commits on the session branch
   * - history(sessionId, dfName) → commits on session branch that touched dfName
   * - history() → all commits on current branch (dolt_log)
   */
  async history(
    sessionId?: string,
    dfName?: string
  ): Promise<CommitLogEntry[]> {
    try {
      if (sessionId && dfName) {
        // Query via session store so dolt_history_<dfName> resolves against the branch
        const sessionStore = await this.getSessionStore(sessionId);
        const branchName = `session-${sessionId}`;
        // Join session branch log with per-table history to filter to commits touching dfName
        const query = `SELECT l.commit_hash, l.message, CONCAT(l.committer, ' <', l.email, '>') as author FROM dolt_log('${branchName}') l JOIN dolt_history_${dfName} h ON l.commit_hash = h.commit_hash GROUP BY l.commit_hash, l.message, l.committer, l.email ORDER BY l.date DESC`;
        const result = await sessionStore.query(query);
        return (result as any[]).map((row) => ({
          commit_hash: String(row.commit_hash),
          message: String(row.message),
          author: String(row.author),
        }));
      } else if (sessionId) {
        // Use dolt_log('<branch>') table function to get the session branch's commits
        const branchName = `session-${sessionId}`;
        const query = `SELECT commit_hash, message, CONCAT(committer, ' <', email, '>') as author FROM dolt_log('${branchName}') ORDER BY date DESC`;
        const result = await this.query(query);
        return (result as any[]).map((row) => ({
          commit_hash: String(row.commit_hash),
          message: String(row.message),
          author: String(row.author),
        }));
      } else {
        const query = `SELECT commit_hash, message, CONCAT(committer, ' <', email, '>') as author FROM dolt_log ORDER BY date DESC`;
        const result = await this.query(query);
        return (result as any[]).map((row) => ({
          commit_hash: String(row.commit_hash),
          message: String(row.message),
          author: String(row.author),
        }));
      }
    } catch (error) {
      return [];
    }
  }
}

export default DoltStore;
