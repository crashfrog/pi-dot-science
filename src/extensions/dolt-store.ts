// Dolt Store for pi.science
// Provides audited provenance storage and versioning via Dolt + MySQL

import { SQL } from "bun";

export interface ProvenanceRecord {
  df_name: string;
  seq: number;
  source: string;
  source_code: string;
  immutable?: boolean;
}

export interface CommitLogEntry {
  commit_hash: string;
  message: string;
  author: string;
}

export class DoltStore {
  private port: number;
  private sqlClient: SQL;
  private connectionString: string;

  constructor(port: number) {
    this.port = port;
    this.connectionString = `mysql://root@localhost:${port}/pi_science`;
    this.sqlClient = new SQL(this.connectionString);
  }

  /**
   * Initialize the database and _provenance table
   * - CREATE DATABASE IF NOT EXISTS pi_science
   * - USE pi_science
   * - CREATE TABLE IF NOT EXISTS _provenance (df_name, seq, source, source_code, created_at, immutable; PK: df_name, seq)
   */
  async initialize(): Promise<void> {
    // Create database
    await this.query(`CREATE DATABASE IF NOT EXISTS pi_science`);

    // Use the database
    await this.query(`USE pi_science`);

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
      `SELECT df_name, seq, source, source_code, immutable FROM _provenance WHERE df_name = ? ORDER BY seq`,
      [df_name]
    );
    return result as ProvenanceRecord[];
  }

  /**
   * Make a Dolt commit with explicit author 'pi.science <pi-science@local>'
   * Returns the commit hash
   */
  async commit(message: string): Promise<string> {
    try {
      // Try using prepared statement first
      const result = await this.sqlClient`
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
      const unsafeResult = await this.sqlClient.unsafe(
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
      `SELECT commit_hash, message, committer_name as author FROM dolt_log`
    );
    return result.map((row: Record<string, unknown>) => ({
      commit_hash: String(row.commit_hash),
      message: String(row.message),
      author: String(row.author),
    }));
  }

  /**
   * Execute a SQL query with optional parameters
   * Chokepoint for all query execution - handles both regular queries and Dolt operations
   * Returns result array
   */
  async query(sql: string, params?: unknown[]): Promise<unknown[]> {
    try {
      if (!params || params.length === 0) {
        // No parameters, use simple query
        const result = await this.sqlClient.unsafe(sql);
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
      // Since we can't use template literals directly, use unsafe with proper escaping
      let escapedSql = sql;
      for (let i = params.length - 1; i >= 0; i--) {
        const param = params[i];
        const escapedValue = this.escapeValue(param);
        escapedSql = escapedSql.replace("?", escapedValue);
      }

      const result = await this.sqlClient.unsafe(escapedSql);
      return Array.isArray(result) ? result : [];
    } catch (error) {
      throw error;
    }
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
}

export default DoltStore;
