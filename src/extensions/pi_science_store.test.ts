import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { DoltServerManager } from "./dolt-server";
import { DoltStore } from "./dolt-store";

/**
 * Acceptance tests for GitHub Issue #30: Python bridge round-trip with Dolt commits
 *
 * Run with: bun test --grep "issue-30"
 *
 * These tests verify:
 * - [AC1] A dataframe saved from Python loads back equal (values and dtypes) in a fresh Python process
 * - [AC2] Each save produces exactly one Dolt commit with correct message naming the dataframe and source code
 * - [AC3] Provenance row recorded with code, source, timestamp, immutable flag
 * - [AC4] Saving over an immutable dataframe raises an error
 * - [AC5] Invalid dataframe names rejected before any DDL
 * - [AC6] Test skips with visible warning when python3/pymysql absent
 *
 * Tests deliberately cover the feature specification WITHOUT implementing the feature.
 * These tests SHOULD FAIL until the implementation agent completes the work.
 */

// Check if python3 is available
function isPython3Available(): boolean {
  try {
    const result = Bun.spawnSync(["python3", "--version"]);
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

// Check if pymysql is available
function isPymysqlAvailable(): boolean {
  if (!isPython3Available()) return false;
  try {
    const result = Bun.spawnSync(["python3", "-c", "import pymysql; print('ok')"]);
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

// Check if dolt is installed
function isDoltInstalled(): boolean {
  try {
    const result = Bun.spawnSync(["dolt", "version"]);
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

// Check if pandas is available
function isPandasAvailable(): boolean {
  if (!isPython3Available()) return false;
  try {
    const result = Bun.spawnSync(["python3", "-c", "import pandas; print('ok')"]);
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

describe.skipIf(!isPython3Available() || !isPymysqlAvailable() || !isDoltInstalled() || !isPandasAvailable())(
  "issue-30: Python bridge round-trip with Dolt commits",
  () => {
    if (!isPython3Available()) {
      console.warn(
        "Skipping Python bridge tests: python3 not found. " +
        "Install Python 3.8+ from https://www.python.org/"
      );
    }
    if (!isPymysqlAvailable()) {
      console.warn(
        "Skipping Python bridge tests: pymysql not available. " +
        "Install with: pip install pymysql"
      );
    }
    if (!isDoltInstalled()) {
      console.warn(
        "Skipping Python bridge tests: dolt binary not found. " +
        "Install from https://github.com/dolthub/dolt/releases"
      );
    }
    if (!isPandasAvailable()) {
      console.warn(
        "Skipping Python bridge tests: pandas not available. " +
        "Install with: pip install pandas"
      );
    }

    let tempDir: string;
    let projectDir: string;
    let serverManager: DoltServerManager;
    let doltStore: DoltStore;
    let doltPort: number;

    beforeAll(async () => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-science-python-test-"));
      projectDir = path.join(tempDir, "project");
      fs.mkdirSync(projectDir, { recursive: true });

      // Start Dolt server
      serverManager = new DoltServerManager();
      const serverInfo = await serverManager.ensureRunning(projectDir);
      doltPort = serverInfo.port;

      // Initialize DoltStore
      doltStore = new DoltStore(doltPort);
      await doltStore.initialize();
    });

    afterAll(async () => {
      await serverManager.shutdownIfIdle();
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    describe("Round-trip: save and load", () => {
      it("saves a dataframe and loads it back with equal values and dtypes", async () => {
        // Create a simple Python script that:
        // 1. Creates a pandas DataFrame
        // 2. Saves it using save_dataframe
        // 3. Loads it back using load_dataframe
        // 4. Verifies values match
        const pythonScript = `
import sys
sys.path.insert(0, '${path.join(tempDir, "python")}')
import pandas as pd
from pi_science_store import save_dataframe, load_dataframe

# Create test dataframe
df_original = pd.DataFrame({
    'id': [1, 2, 3],
    'name': ['Alice', 'Bob', 'Charlie'],
    'age': [25, 30, 35],
    'active': [True, False, True]
})

# Save it
save_dataframe('test_users', df_original, source_code='df = pd.DataFrame(...)', source='test://data')

# Load it back
df_loaded = load_dataframe('test_users')

# Verify dtypes match
assert df_original.dtypes.equals(df_loaded.dtypes), f"Dtype mismatch: {df_original.dtypes} != {df_loaded.dtypes}"

# Verify values match
assert df_original.equals(df_loaded), "Values do not match after round-trip"

print("OK: Round-trip successful")
`;

        const scriptPath = path.join(tempDir, "test_roundtrip.py");
        fs.writeFileSync(scriptPath, pythonScript);

        // Run the script with environment variables
        const result = Bun.spawnSync(["python3", scriptPath], {
          env: {
            ...process.env,
            PI_SCIENCE_DOLT_PORT: doltPort.toString(),
            PI_SCIENCE_DOLT_DB: "pi_science",
          },
        });

        expect(result.exitCode).toBe(0);
        const output = result.stdout?.toString() || "";
        expect(output).toContain("OK");
      });

      it("preserves int64, float64, bool, datetime64[ns], and object dtypes", async () => {
        const pythonScript = `
import sys
sys.path.insert(0, '${path.join(tempDir, "python")}')
import pandas as pd
from pi_science_store import save_dataframe, load_dataframe
from datetime import datetime

# Create dataframe with all supported types
df_original = pd.DataFrame({
    'int_col': pd.array([1, 2, 3], dtype='int64'),
    'float_col': pd.array([1.5, 2.5, 3.5], dtype='float64'),
    'bool_col': pd.array([True, False, True], dtype='bool'),
    'datetime_col': pd.to_datetime(['2024-01-01', '2024-01-02', '2024-01-03']),
    'str_col': pd.array(['a', 'b', 'c'], dtype='object')
})

# Save and reload
save_dataframe('test_dtypes', df_original, source_code='test', source='test://dtypes')
df_loaded = load_dataframe('test_dtypes')

# Verify each dtype
assert df_loaded['int_col'].dtype == 'int64', f"int64 mismatch: {df_loaded['int_col'].dtype}"
assert df_loaded['float_col'].dtype == 'float64', f"float64 mismatch: {df_loaded['float_col'].dtype}"
assert df_loaded['bool_col'].dtype == 'bool', f"bool mismatch: {df_loaded['bool_col'].dtype}"
assert str(df_loaded['datetime_col'].dtype).startswith('datetime64'), f"datetime mismatch: {df_loaded['datetime_col'].dtype}"
assert df_loaded['str_col'].dtype == 'object', f"object mismatch: {df_loaded['str_col'].dtype}"

print("OK: All dtypes preserved")
`;

        const scriptPath = path.join(tempDir, "test_dtypes.py");
        fs.writeFileSync(scriptPath, pythonScript);

        const result = Bun.spawnSync(["python3", scriptPath], {
          env: {
            ...process.env,
            PI_SCIENCE_DOLT_PORT: doltPort.toString(),
            PI_SCIENCE_DOLT_DB: "pi_science",
          },
        });

        expect(result.exitCode).toBe(0);
        const output = result.stdout?.toString() || "";
        expect(output).toContain("OK");
      });

      it("round-trips dataframe in a fresh Python process (separate from save process)", async () => {
        const saveScript = `
import sys
sys.path.insert(0, '${path.join(tempDir, "python")}')
import pandas as pd
from pi_science_store import save_dataframe

df = pd.DataFrame({
    'x': [10, 20, 30],
    'y': [1.1, 2.2, 3.3]
})

save_dataframe('fresh_test', df, source_code='test', source='test://fresh')
print("SAVED")
`;

        const loadScript = `
import sys
sys.path.insert(0, '${path.join(tempDir, "python")}')
import pandas as pd
from pi_science_store import load_dataframe

df = load_dataframe('fresh_test')
assert len(df) == 3, f"Expected 3 rows, got {len(df)}"
assert list(df.columns) == ['x', 'y'], f"Expected columns [x, y], got {list(df.columns)}"
print("LOADED")
`;

        const env = {
          ...process.env,
          PI_SCIENCE_DOLT_PORT: doltPort.toString(),
          PI_SCIENCE_DOLT_DB: "pi_science",
        };

        const saveResult = Bun.spawnSync(["python3", "-c", saveScript], { env });
        expect(saveResult.exitCode).toBe(0);
        expect(saveResult.stdout?.toString()).toContain("SAVED");

        const loadResult = Bun.spawnSync(["python3", "-c", loadScript], { env });
        expect(loadResult.exitCode).toBe(0);
        expect(loadResult.stdout?.toString()).toContain("LOADED");
      });
    });

    describe("Dolt commits and provenance", () => {
      it("creates exactly one Dolt commit per save_dataframe call", async () => {
        const pythonScript = `
import sys
sys.path.insert(0, '${path.join(tempDir, "python")}')
import pandas as pd
from pi_science_store import save_dataframe

df = pd.DataFrame({'a': [1, 2]})

# Get initial log count
import pymysql
conn = pymysql.connect(host='localhost', port=${doltPort}, user='root', database='pi_science')
cursor = conn.cursor()
cursor.execute('SELECT COUNT(*) FROM dolt_log')
initial_count = cursor.fetchone()[0]

# Save dataframe
save_dataframe('commit_test', df, source_code='code1', source='src1')

# Get new log count
cursor.execute('SELECT COUNT(*) FROM dolt_log')
final_count = cursor.fetchone()[0]

conn.close()

# Should have exactly one more commit
assert final_count == initial_count + 1, f"Expected {initial_count + 1} commits, got {final_count}"
print("OK: Exactly one commit created")
`;

        const scriptPath = path.join(tempDir, "test_commit.py");
        fs.writeFileSync(scriptPath, pythonScript);

        const result = Bun.spawnSync(["python3", scriptPath], {
          env: {
            ...process.env,
            PI_SCIENCE_DOLT_PORT: doltPort.toString(),
            PI_SCIENCE_DOLT_DB: "pi_science",
          },
        });

        expect(result.exitCode).toBe(0);
        const output = result.stdout?.toString() || "";
        expect(output).toContain("OK");
      });

      it("commit message includes dataframe name and truncated source code", async () => {
        const pythonScript = `
import sys
sys.path.insert(0, '${path.join(tempDir, "python")}')
import pandas as pd
from pi_science_store import save_dataframe
import pymysql

df = pd.DataFrame({'val': [42]})
source_code_long = 'x = 1; y = 2; z = 3; ' * 20  # Long code

save_dataframe('msg_test', df, source_code=source_code_long, source='test://msg')

# Check the commit message
conn = pymysql.connect(host='localhost', port=${doltPort}, user='root', database='pi_science')
cursor = conn.cursor()
cursor.execute('SELECT message FROM dolt_log ORDER BY commit_date DESC LIMIT 1')
message = cursor.fetchone()[0]
conn.close()

# Message should name the dataframe
assert 'msg_test' in message, f"Expected 'msg_test' in message: {message}"
# Message should contain some of the source code (truncated to ~60 chars)
assert 'x = 1' in message or 'save_dataframe' in message, f"Expected source code snippet in: {message}"

print("OK: Commit message correct")
`;

        const scriptPath = path.join(tempDir, "test_msg.py");
        fs.writeFileSync(scriptPath, pythonScript);

        const result = Bun.spawnSync(["python3", scriptPath], {
          env: {
            ...process.env,
            PI_SCIENCE_DOLT_PORT: doltPort.toString(),
            PI_SCIENCE_DOLT_DB: "pi_science",
          },
        });

        expect(result.exitCode).toBe(0);
        const output = result.stdout?.toString() || "";
        expect(output).toContain("OK");
      });

      it("commit author is 'pi.science <pi-science@local>'", async () => {
        const pythonScript = `
import sys
sys.path.insert(0, '${path.join(tempDir, "python")}')
import pandas as pd
from pi_science_store import save_dataframe
import pymysql

df = pd.DataFrame({'data': [1, 2, 3]})
save_dataframe('author_test', df, source_code='test', source='src')

conn = pymysql.connect(host='localhost', port=${doltPort}, user='root', database='pi_science')
cursor = conn.cursor()
cursor.execute('SELECT committer_name FROM dolt_log WHERE message LIKE "%author_test%" ORDER BY commit_date DESC LIMIT 1')
author = cursor.fetchone()[0]
conn.close()

assert 'pi.science' in author and 'pi-science@local' in author, f"Expected pi.science <pi-science@local>, got: {author}"
print("OK: Author is correct")
`;

        const scriptPath = path.join(tempDir, "test_author.py");
        fs.writeFileSync(scriptPath, pythonScript);

        const result = Bun.spawnSync(["python3", scriptPath], {
          env: {
            ...process.env,
            PI_SCIENCE_DOLT_PORT: doltPort.toString(),
            PI_SCIENCE_DOLT_DB: "pi_science",
          },
        });

        expect(result.exitCode).toBe(0);
        const output = result.stdout?.toString() || "";
        expect(output).toContain("OK");
      });
    });

    describe("Provenance record storage", () => {
      it("inserts provenance row with code, source, timestamp, immutable flag", async () => {
        const pythonScript = `
import sys
sys.path.insert(0, '${path.join(tempDir, "python")}')
import pandas as pd
from pi_science_store import save_dataframe
import pymysql

df = pd.DataFrame({'x': [1]})
source_code = 'df = make_dataframe()'
source_uri = 'sql://server/table'

save_dataframe('prov_test', df, source_code=source_code, source=source_uri, immutable=False)

conn = pymysql.connect(host='localhost', port=${doltPort}, user='root', database='pi_science')
cursor = conn.cursor()
cursor.execute('SELECT source, source_code, immutable, created_at FROM _provenance WHERE df_name = %s ORDER BY seq DESC LIMIT 1', ('prov_test',))
row = cursor.fetchone()
conn.close()

assert row is not None, "No provenance row found"
source, code, immutable, created_at = row

assert source == source_uri, f"Source mismatch: {source} != {source_uri}"
assert code == source_code, f"Source code mismatch: {code} != {source_code}"
assert immutable == 0, f"Immutable should be 0 (false), got {immutable}"
assert created_at is not None, "created_at should not be NULL"

print("OK: Provenance row complete")
`;

        const scriptPath = path.join(tempDir, "test_prov.py");
        fs.writeFileSync(scriptPath, pythonScript);

        const result = Bun.spawnSync(["python3", scriptPath], {
          env: {
            ...process.env,
            PI_SCIENCE_DOLT_PORT: doltPort.toString(),
            PI_SCIENCE_DOLT_DB: "pi_science",
          },
        });

        expect(result.exitCode).toBe(0);
        const output = result.stdout?.toString() || "";
        expect(output).toContain("OK");
      });

      it("records immutable=True flag in provenance row", async () => {
        const pythonScript = `
import sys
sys.path.insert(0, '${path.join(tempDir, "python")}')
import pandas as pd
from pi_science_store import save_dataframe
import pymysql

df = pd.DataFrame({'x': [1]})
save_dataframe('immut_test', df, source_code='test', source='src', immutable=True)

conn = pymysql.connect(host='localhost', port=${doltPort}, user='root', database='pi_science')
cursor = conn.cursor()
cursor.execute('SELECT immutable FROM _provenance WHERE df_name = %s ORDER BY seq DESC LIMIT 1', ('immut_test',))
immutable = cursor.fetchone()[0]
conn.close()

assert immutable == 1, f"Expected immutable=1, got {immutable}"
print("OK: Immutable flag recorded")
`;

        const scriptPath = path.join(tempDir, "test_immut_flag.py");
        fs.writeFileSync(scriptPath, pythonScript);

        const result = Bun.spawnSync(["python3", scriptPath], {
          env: {
            ...process.env,
            PI_SCIENCE_DOLT_PORT: doltPort.toString(),
            PI_SCIENCE_DOLT_DB: "pi_science",
          },
        });

        expect(result.exitCode).toBe(0);
        const output = result.stdout?.toString() || "";
        expect(output).toContain("OK");
      });
    });

    describe("Immutability enforcement", () => {
      it("raises error when saving over an immutable dataframe", async () => {
        const pythonScript = `
import sys
sys.path.insert(0, '${path.join(tempDir, "python")}')
import pandas as pd
from pi_science_store import save_dataframe

df1 = pd.DataFrame({'x': [1]})
df2 = pd.DataFrame({'x': [2]})

# Save immutable dataframe
save_dataframe('immutable_df', df1, source_code='first', source='src1', immutable=True)

# Try to overwrite it
try:
    save_dataframe('immutable_df', df2, source_code='second', source='src2')
    print("ERROR: Should have raised")
except Exception as e:
    if 'immutable' in str(e).lower():
        print("OK: Immutability enforced")
    else:
        print(f"ERROR: Wrong exception: {e}")
`;

        const scriptPath = path.join(tempDir, "test_immut_enforce.py");
        fs.writeFileSync(scriptPath, pythonScript);

        const result = Bun.spawnSync(["python3", scriptPath], {
          env: {
            ...process.env,
            PI_SCIENCE_DOLT_PORT: doltPort.toString(),
            PI_SCIENCE_DOLT_DB: "pi_science",
          },
        });

        expect(result.exitCode).toBe(0);
        const output = result.stdout?.toString() || "";
        expect(output).toContain("OK");
      });
    });

    describe("Name validation", () => {
      it("rejects invalid dataframe names before any DDL", async () => {
        const pythonScript = `
import sys
sys.path.insert(0, '${path.join(tempDir, "python")}')
import pandas as pd
from pi_science_store import save_dataframe
import pymysql

# Test various invalid names
invalid_names = [
    '123invalid',     # starts with digit
    'has-dashes',     # contains dashes
    'has spaces',     # contains spaces
    'has.dots',       # contains dots
    'has@symbol',     # contains special char
    '',               # empty
    'a' * 256,        # too long (MySQL limit)
]

for invalid_name in invalid_names:
    try:
        df = pd.DataFrame({'x': [1]})
        save_dataframe(invalid_name, df, source_code='test', source='src')
        print(f"ERROR: Should have rejected '{invalid_name}'")
        sys.exit(1)
    except Exception as e:
        # Expected to raise
        pass

# Verify no tables were created for invalid names
conn = pymysql.connect(host='localhost', port=${doltPort}, user='root', database='pi_science')
cursor = conn.cursor()
cursor.execute('SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = "pi_science" AND TABLE_NAME NOT IN ("_provenance", "dolt_log")')
table_count = cursor.fetchone()[0]
conn.close()

# Should be 0 tables created (besides _provenance and dolt_log)
assert table_count == 0, f"Expected 0 user tables, but {table_count} exist"
print("OK: Invalid names rejected before DDL")
`;

        const scriptPath = path.join(tempDir, "test_names.py");
        fs.writeFileSync(scriptPath, pythonScript);

        const result = Bun.spawnSync(["python3", scriptPath], {
          env: {
            ...process.env,
            PI_SCIENCE_DOLT_PORT: doltPort.toString(),
            PI_SCIENCE_DOLT_DB: "pi_science",
          },
        });

        expect(result.exitCode).toBe(0);
        const output = result.stdout?.toString() || "";
        expect(output).toContain("OK");
      });

      it("accepts valid dataframe names (letter-start, alphanumeric + underscore)", async () => {
        const pythonScript = `
import sys
sys.path.insert(0, '${path.join(tempDir, "python")}')
import pandas as pd
from pi_science_store import save_dataframe, load_dataframe

valid_names = [
    'users',
    'user_data',
    'df_123',
    'A',
    '_valid_with_leading_underscore',  # If implementation allows
]

for name in valid_names:
    try:
        df = pd.DataFrame({'x': [1]})
        save_dataframe(name, df, source_code='test', source='src')
        # Verify it can be loaded
        loaded = load_dataframe(name)
        assert len(loaded) == 1, f"Failed to load {name}"
    except Exception as e:
        print(f"ERROR: Valid name '{name}' rejected: {e}")
        sys.exit(1)

print("OK: Valid names accepted")
`;

        const scriptPath = path.join(tempDir, "test_valid_names.py");
        fs.writeFileSync(scriptPath, pythonScript);

        const result = Bun.spawnSync(["python3", scriptPath], {
          env: {
            ...process.env,
            PI_SCIENCE_DOLT_PORT: doltPort.toString(),
            PI_SCIENCE_DOLT_DB: "pi_science",
          },
        });

        expect(result.exitCode).toBe(0);
        const output = result.stdout?.toString() || "";
        expect(output).toContain("OK");
      });
    });

    describe("API completeness", () => {
      it("list_dataframes() returns list of dataframe names", async () => {
        const pythonScript = `
import sys
sys.path.insert(0, '${path.join(tempDir, "python")}')
import pandas as pd
from pi_science_store import save_dataframe, list_dataframes

# Save a few dataframes
df = pd.DataFrame({'x': [1]})
save_dataframe('list_df_1', df, source_code='test', source='src')
save_dataframe('list_df_2', df, source_code='test', source='src')

# Get list
names = list_dataframes()

assert isinstance(names, list), f"list_dataframes() should return list, got {type(names)}"
assert 'list_df_1' in names, "list_df_1 not in list"
assert 'list_df_2' in names, "list_df_2 not in list"

print("OK: list_dataframes works")
`;

        const scriptPath = path.join(tempDir, "test_list.py");
        fs.writeFileSync(scriptPath, pythonScript);

        const result = Bun.spawnSync(["python3", scriptPath], {
          env: {
            ...process.env,
            PI_SCIENCE_DOLT_PORT: doltPort.toString(),
            PI_SCIENCE_DOLT_DB: "pi_science",
          },
        });

        expect(result.exitCode).toBe(0);
        const output = result.stdout?.toString() || "";
        expect(output).toContain("OK");
      });

      it("get_schema(name) returns dict with columns and dtypes", async () => {
        const pythonScript = `
import sys
sys.path.insert(0, '${path.join(tempDir, "python")}')
import pandas as pd
from pi_science_store import save_dataframe, get_schema

df = pd.DataFrame({
    'id': [1, 2],
    'name': ['Alice', 'Bob'],
    'score': [95.5, 87.3]
})

save_dataframe('schema_test', df, source_code='test', source='src')

schema = get_schema('schema_test')

assert isinstance(schema, dict), f"get_schema should return dict, got {type(schema)}"
assert 'columns' in schema, "Schema missing 'columns' key"
assert 'dtypes' in schema, "Schema missing 'dtypes' key"

# Verify column names
assert 'id' in schema['columns'], "Column 'id' missing"
assert 'name' in schema['columns'], "Column 'name' missing"
assert 'score' in schema['columns'], "Column 'score' missing"

# Verify dtypes (format depends on implementation)
assert schema['dtypes']['id'] in ['int64', 'BIGINT'], f"Unexpected dtype for id: {schema['dtypes']['id']}"

print("OK: get_schema works")
`;

        const scriptPath = path.join(tempDir, "test_schema.py");
        fs.writeFileSync(scriptPath, pythonScript);

        const result = Bun.spawnSync(["python3", scriptPath], {
          env: {
            ...process.env,
            PI_SCIENCE_DOLT_PORT: doltPort.toString(),
            PI_SCIENCE_DOLT_DB: "pi_science",
          },
        });

        expect(result.exitCode).toBe(0);
        const output = result.stdout?.toString() || "";
        expect(output).toContain("OK");
      });
    });

    describe("Multiple saves and updates", () => {
      it("subsequent saves create new provenance records with incremented seq", async () => {
        const pythonScript = `
import sys
sys.path.insert(0, '${path.join(tempDir, "python")}')
import pandas as pd
from pi_science_store import save_dataframe
import pymysql

df1 = pd.DataFrame({'x': [1]})
df2 = pd.DataFrame({'x': [2]})

save_dataframe('multi_save', df1, source_code='v1', source='src1')
save_dataframe('multi_save', df2, source_code='v2', source='src2')

conn = pymysql.connect(host='localhost', port=${doltPort}, user='root', database='pi_science')
cursor = conn.cursor()
cursor.execute('SELECT COUNT(*) FROM _provenance WHERE df_name = %s', ('multi_save',))
count = cursor.fetchone()[0]

# Should have 2 provenance records (seq 1 and 2)
assert count == 2, f"Expected 2 provenance records, got {count}"

# Verify seq values
cursor.execute('SELECT seq FROM _provenance WHERE df_name = %s ORDER BY seq', ('multi_save',))
seqs = [row[0] for row in cursor.fetchall()]
assert seqs == [1, 2], f"Expected seqs [1, 2], got {seqs}"

conn.close()
print("OK: Multiple saves with incremented seq")
`;

        const scriptPath = path.join(tempDir, "test_multi.py");
        fs.writeFileSync(scriptPath, pythonScript);

        const result = Bun.spawnSync(["python3", scriptPath], {
          env: {
            ...process.env,
            PI_SCIENCE_DOLT_PORT: doltPort.toString(),
            PI_SCIENCE_DOLT_DB: "pi_science",
          },
        });

        expect(result.exitCode).toBe(0);
        const output = result.stdout?.toString() || "";
        expect(output).toContain("OK");
      });

      it("second save loads the new data (table is overwritten)", async () => {
        const pythonScript = `
import sys
sys.path.insert(0, '${path.join(tempDir, "python")}')
import pandas as pd
from pi_science_store import save_dataframe, load_dataframe

df1 = pd.DataFrame({'val': [10, 20]})
df2 = pd.DataFrame({'val': [100, 200, 300]})

save_dataframe('overwrite_test', df1, source_code='v1', source='src')
save_dataframe('overwrite_test', df2, source_code='v2', source='src')

loaded = load_dataframe('overwrite_test')

# Should have the second dataframe (3 rows)
assert len(loaded) == 3, f"Expected 3 rows, got {len(loaded)}"
assert list(loaded['val']) == [100, 200, 300], f"Wrong values: {list(loaded['val'])}"

print("OK: Second save overwrites table")
`;

        const scriptPath = path.join(tempDir, "test_overwrite.py");
        fs.writeFileSync(scriptPath, pythonScript);

        const result = Bun.spawnSync(["python3", scriptPath], {
          env: {
            ...process.env,
            PI_SCIENCE_DOLT_PORT: doltPort.toString(),
            PI_SCIENCE_DOLT_DB: "pi_science",
          },
        });

        expect(result.exitCode).toBe(0);
        const output = result.stdout?.toString() || "";
        expect(output).toContain("OK");
      });
    });
  }
);
