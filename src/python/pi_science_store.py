"""
pi_science_store: Python bridge for pi.science dataframe persistence with Dolt.

Provides four main functions:
  - list_dataframes() -> list[str]
  - load_dataframe(name: str) -> pd.DataFrame
  - save_dataframe(name: str, df: pd.DataFrame, source_code: str = '', source: str = '', immutable: bool = False) -> None
  - get_schema(name: str) -> dict

Connection details from environment variables:
  - PI_SCIENCE_DOLT_PORT: MySQL port (default 3306)
  - PI_SCIENCE_DOLT_DB: database name (default 'pi_science', can be 'pi_science/session-id')
"""

import os
import re
import pymysql
import pandas as pd
from typing import List, Optional


def _get_connection():
    """Create and return a MySQL connection to the Dolt database."""
    port = int(os.environ.get('PI_SCIENCE_DOLT_PORT', '3306'))
    db = os.environ.get('PI_SCIENCE_DOLT_DB', 'pi_science')

    # Handle branch syntax: 'pi_science/session-xyz' -> connect to 'pi_science' and use branch
    if '/' in db:
        db_name, branch = db.split('/', 1)
    else:
        db_name = db
        branch = None

    conn = pymysql.connect(
        host='127.0.0.1',
        port=port,
        user='root',
        database=db_name
    )

    if branch:
        cursor = conn.cursor()
        cursor.execute(f"CALL DOLT_CHECKOUT(%s)", (branch,))
        cursor.close()

    return conn


def _sanitize_name(name: str) -> str:
    """
    Validate and sanitize a dataframe name.

    Rules:
    - Must start with a letter [a-zA-Z]
    - Must contain only alphanumeric characters and underscores
    - Cannot be empty
    - Cannot exceed 255 characters (MySQL table name limit)

    Raises ValueError if invalid.
    """
    if not name:
        raise ValueError("Dataframe name cannot be empty")

    if len(name) > 255:
        raise ValueError(f"Dataframe name too long (max 255 chars): {name}")

    if not re.match(r'^[a-zA-Z]', name):
        raise ValueError(
            f"Dataframe name must start with a letter [a-zA-Z], got: {name}"
        )

    if not re.match(r'^[a-zA-Z][a-zA-Z0-9_]*$', name):
        raise ValueError(
            f"Dataframe name must contain only letters, digits, and underscores, got: {name}"
        )

    return name


def _pandas_dtype_to_mysql(dtype) -> str:
    """Convert a pandas dtype to a MySQL type."""
    dtype_str = str(dtype)

    if dtype_str == 'int64':
        return 'BIGINT'
    elif dtype_str == 'float64':
        return 'DOUBLE'
    elif dtype_str == 'bool':
        return 'BOOLEAN'
    elif dtype_str.startswith('datetime64'):
        return 'DATETIME(6)'
    else:  # object, string, etc.
        return 'LONGTEXT'


def _mysql_dtype_to_pandas(mysql_type: str) -> str:
    """Convert a MySQL type to a pandas dtype string."""
    mysql_type = mysql_type.upper()

    if mysql_type == 'BIGINT':
        return 'int64'
    elif mysql_type == 'DOUBLE':
        return 'float64'
    elif mysql_type in ('BOOLEAN', 'TINYINT'):
        return 'bool'
    elif mysql_type.startswith('DATETIME'):
        return 'datetime64[ns]'
    else:  # TEXT, LONGTEXT, etc.
        return 'object'


def _ensure_provenance_table(conn):
    """Ensure _provenance table exists."""
    cursor = conn.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS _provenance (
            df_name VARCHAR(255) NOT NULL,
            seq BIGINT NOT NULL,
            source LONGTEXT,
            source_code LONGTEXT,
            created_at DATETIME(6),
            immutable BOOLEAN DEFAULT FALSE,
            PRIMARY KEY (df_name, seq)
        )
    """)

    cursor.close()
    conn.commit()


def list_dataframes() -> List[str]:
    """
    List all dataframe names in the database.

    Returns a list of table names, excluding the _provenance table.
    """
    conn = _get_connection()
    try:
        cursor = conn.cursor()

        cursor.execute("""
            SELECT TABLE_NAME FROM information_schema.TABLES
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME != '_provenance'
        """)

        rows = cursor.fetchall()
        cursor.close()

        return [row[0] for row in rows]
    finally:
        conn.close()


def get_schema(name: str) -> dict:
    """
    Get the schema of a dataframe.

    Returns a dict with keys:
      - 'columns': list of column names (excluding __row_id)
      - 'dtypes': dict mapping column names to dtype strings
    """
    name = _sanitize_name(name)

    conn = _get_connection()
    try:
        _ensure_provenance_table(conn)
        cursor = conn.cursor()

        cursor.execute("""
            SELECT COLUMN_NAME, DATA_TYPE FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = %s AND COLUMN_NAME != '__row_id'
            ORDER BY ORDINAL_POSITION
        """, (name,))

        rows = cursor.fetchall()
        cursor.close()

        columns = [row[0] for row in rows]
        dtypes = {row[0]: row[1] for row in rows}

        return {
            'columns': columns,
            'dtypes': dtypes
        }
    finally:
        conn.close()


def load_dataframe(name: str) -> pd.DataFrame:
    """
    Load a dataframe from the database.

    Returns a pandas DataFrame with the correct dtypes restored.
    """
    name = _sanitize_name(name)

    conn = _get_connection()
    try:
        _ensure_provenance_table(conn)
        cursor = conn.cursor()

        # Get schema info first
        cursor.execute("""
            SELECT COLUMN_NAME, DATA_TYPE FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = %s
            ORDER BY ORDINAL_POSITION
        """, (name,))

        schema_rows = cursor.fetchall()
        schema_map = {row[0]: row[1] for row in schema_rows}

        # Fetch all rows from the table
        cursor.execute(f"SELECT * FROM `{name}`")
        rows = cursor.fetchall()
        cursor.close()

        # If no rows, create empty dataframe
        if not rows:
            columns = [row[0] for row in schema_rows if row[0] != '__row_id']
            return pd.DataFrame({col: [] for col in columns})

        # Build column mapping (including __row_id position)
        columns = [row[0] for row in schema_rows]

        # Convert rows to dict of lists
        data = {col: [] for col in columns}
        for row in rows:
            for i, col in enumerate(columns):
                data[col].append(row[i])

        # Create DataFrame
        df = pd.DataFrame(data)

        # Convert dtypes and set index
        for col, mysql_type in schema_map.items():
            if col == '__row_id':
                continue

            pandas_dtype = _mysql_dtype_to_pandas(mysql_type)

            if pandas_dtype == 'bool':
                df[col] = df[col].astype(bool)
            elif pandas_dtype == 'datetime64[ns]':
                df[col] = pd.to_datetime(df[col])
            elif pandas_dtype == 'int64':
                df[col] = df[col].astype('int64')
            elif pandas_dtype == 'float64':
                df[col] = df[col].astype('float64')
            # else: object/string stays as is

        # Set __row_id as index if it exists, then drop it from columns
        if '__row_id' in df.columns:
            df.set_index('__row_id', inplace=True)
            df.reset_index(drop=True, inplace=True)

        return df
    finally:
        conn.close()


def save_dataframe(
    name: str,
    df: pd.DataFrame,
    source_code: str = '',
    source: str = '',
    immutable: bool = False
) -> None:
    """
    Save a dataframe to the database with full provenance tracking.

    - Sanitizes name (raises ValueError if invalid)
    - Checks immutability constraint (raises ValueError if overwriting immutable)
    - Creates table with __row_id as primary key
    - Converts pandas dtypes to MySQL types
    - Batch inserts data
    - Records provenance entry
    - Creates Dolt commit with source code in message

    Args:
        name: dataframe name (must start with letter, alphanumeric + underscore)
        df: pandas DataFrame to save
        source_code: source code snippet (optional)
        source: data source URI (optional)
        immutable: if True, subsequent saves to this name will fail

    Raises:
        ValueError: if name is invalid or immutable constraint violated
    """
    name = _sanitize_name(name)

    conn = _get_connection()
    try:
        _ensure_provenance_table(conn)
        cursor = conn.cursor()

        # Check immutability constraint
        cursor.execute(
            "SELECT immutable FROM _provenance WHERE df_name = %s ORDER BY seq DESC LIMIT 1",
            (name,)
        )
        result = cursor.fetchone()

        if result and result[0]:  # result[0] is the immutable flag
            cursor.close()
            conn.close()
            raise ValueError(f"Cannot save over immutable dataframe '{name}'")

        # Get next sequence number
        cursor.execute(
            "SELECT COALESCE(MAX(seq)+1, 1) FROM _provenance WHERE df_name = %s",
            (name,)
        )
        next_seq = cursor.fetchone()[0]

        # Drop and recreate table
        cursor.execute(f"DROP TABLE IF EXISTS `{name}`")

        # Build CREATE TABLE statement
        col_defs = ['`__row_id` BIGINT NOT NULL PRIMARY KEY']
        for col in df.columns:
            mysql_type = _pandas_dtype_to_mysql(df[col].dtype)
            col_defs.append(f"`{col}` {mysql_type}")

        create_table_sql = f"CREATE TABLE `{name}` ({', '.join(col_defs)})"
        cursor.execute(create_table_sql)

        # Batch insert data
        if len(df) > 0:
            batch_size = 1000
            for batch_start in range(0, len(df), batch_size):
                batch_end = min(batch_start + batch_size, len(df))
                batch_df = df.iloc[batch_start:batch_end]

                # Convert to list of tuples for insertion
                rows_to_insert = []
                for idx, row in batch_df.iterrows():
                    row_id = batch_start + (idx - batch_start)
                    row_values = [row_id]
                    for val in row:
                        # Handle None/NaN
                        if pd.isna(val):
                            row_values.append(None)
                        else:
                            row_values.append(val)
                    rows_to_insert.append(row_values)

                placeholders = ', '.join(['%s'] * (len(df.columns) + 1))
                insert_sql = f"INSERT INTO `{name}` (`__row_id`, " + \
                    ', '.join([f"`{col}`" for col in df.columns]) + \
                    f") VALUES ({placeholders})"

                cursor.executemany(insert_sql, rows_to_insert)

        # Insert provenance record
        import datetime
        now = datetime.datetime.now()

        cursor.execute("""
            INSERT INTO _provenance (df_name, seq, source, source_code, created_at, immutable)
            VALUES (%s, %s, %s, %s, %s, %s)
        """, (name, next_seq, source, source_code, now, immutable))

        # Create Dolt commit
        msg = f"save_dataframe({name}): {source_code[:60]}"
        cursor.execute(
            "CALL DOLT_COMMIT('-A', '-m', %s, '--author', %s)",
            (msg, 'pi.science <pi-science@local>')
        )

        cursor.close()
        conn.commit()
    finally:
        conn.close()
