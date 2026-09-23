import os
import time
import re
import datetime
import decimal
from typing import Dict, Any, Optional, List
import snowflake.connector
from snowflake.connector.errors import (
    DatabaseError,
    OperationalError,
    ProgrammingError,
    InterfaceError,
    HttpError,
    Error as SnowflakeError,
)
from connectors.base import (
    ConnectionTestResult,
    ColumnMetadata,
    TableMetadata,
    MetadataDiscoveryResult,
    QueryResultColumn,
    QueryExecutionResult,
)

SNOWFLAKE_TYPE_MAP: Dict[int, str] = {
    0: "NUMBER",
    1: "REAL",
    2: "TEXT",
    3: "DATE",
    4: "TIMESTAMP",
    5: "VARIANT",
    6: "TIMESTAMP_LTZ",
    7: "TIMESTAMP_TZ",
    8: "TIMESTAMP_NTZ",
    9: "OBJECT",
    10: "ARRAY",
    11: "BINARY",
    12: "TIME",
    13: "BOOLEAN",
}


class SnowflakeConnector:
    """
    Official Snowflake Python connector implementation for connection testing and metadata discovery.
    Validates credentials, performs real handshakes, discovers schema metadata, and sanitizes sensitive errors.
    """

    @staticmethod
    def clean_account_identifier(raw_account: Optional[str]) -> str:
        """
        Clean and normalize Snowflake account identifier string.
        Strips protocol (https://, http://), domain (.snowflakecomputing.com), and trailing slashes.
        """
        if not raw_account:
            return ""
        account = str(raw_account).strip()
        account = re.sub(r"^https?://", "", account, flags=re.IGNORECASE)
        account = re.sub(r"\.snowflakecomputing\.com/?$", "", account, flags=re.IGNORECASE)
        account = account.rstrip("/")
        return account

    @staticmethod
    def sanitize_error(err: Exception) -> str:
        """
        Strip any sensitive information (passwords, tokens) from error messages.
        Map common Snowflake error codes into clear, user-friendly, safe messages.
        """
        errno = getattr(err, "errno", None)
        raw_msg = str(getattr(err, "msg", str(err)))

        # Mask any potential password or token patterns if present in raw string
        safe_msg = re.sub(
            r"(password|token|secret)\s*[:=]\s*[^\s,;]+",
            r"\1=***",
            raw_msg,
            flags=re.IGNORECASE,
        )

        # Categorize common Snowflake error numbers
        if errno in (250001, 250002):
            return "Authentication failed: Invalid username or password."
        elif errno in (250003, 290404):
            return "Network error: Unable to reach Snowflake account host. Please check account identifier and region."
        elif errno == 251001:
            return "Configuration error: The specified warehouse does not exist or is inaccessible."
        elif errno == 251004:
            return "Configuration error: The specified database or schema does not exist or is inaccessible."
        elif errno == 251005:
            return "Authorization error: The specified role is not authorized or does not exist."

        # Clean and truncate message to first line
        clean_msg = safe_msg.split("\n")[0].strip()
        return clean_msg if clean_msg else "Connection to Snowflake failed."

    @classmethod
    def test_connection(cls, config: Dict[str, Any]) -> ConnectionTestResult:
        """
        Perform a real connection test to Snowflake using the official connector.
        Executes a lightweight query to verify the session and authorization.
        """
        start_time = time.time()

        account = cls.clean_account_identifier(
            config.get("account")
            or config.get("account_identifier")
            or config.get("accountIdentifier")
            or os.environ.get("SNOWFLAKE_ACCOUNT")
            or os.environ.get("SNOWFLAKE_ACCOUNT_IDENTIFIER")
        )
        user = (
            config.get("user")
            or config.get("username")
            or os.environ.get("SNOWFLAKE_USER")
            or os.environ.get("SNOWFLAKE_USERNAME")
        )
        password = config.get("password") or os.environ.get("SNOWFLAKE_PASSWORD")
        warehouse = config.get("warehouse") or os.environ.get("SNOWFLAKE_WAREHOUSE")
        database = config.get("database") or os.environ.get("SNOWFLAKE_DATABASE")
        schema = (
            config.get("schema")
            or config.get("default_schema")
            or config.get("defaultSchema")
            or os.environ.get("SNOWFLAKE_SCHEMA")
        )
        role = config.get("role") or os.environ.get("SNOWFLAKE_ROLE")

        # Validate mandatory credentials
        missing = []
        if not account or not str(account).strip():
            missing.append("Account Identifier")
        if not user or not str(user).strip():
            missing.append("Username")
        if not password or not str(password).strip():
            missing.append("Password")

        if missing:
            return ConnectionTestResult(
                success=False,
                message=f"Missing required Snowflake credentials: {', '.join(missing)}.",
                latency_ms=0,
                error="Required connection parameters were not supplied.",
            )

        conn = None
        try:
            connect_kwargs: Dict[str, Any] = {
                "account": str(account).strip(),
                "user": str(user).strip(),
                "password": str(password),
                "login_timeout": 10,
                "network_timeout": 10,
            }
            if warehouse and str(warehouse).strip():
                connect_kwargs["warehouse"] = str(warehouse).strip()
            if database and str(database).strip():
                connect_kwargs["database"] = str(database).strip()
            if schema and str(schema).strip():
                connect_kwargs["schema"] = str(schema).strip()
            if role and str(role).strip():
                connect_kwargs["role"] = str(role).strip()

            conn = snowflake.connector.connect(**connect_kwargs)

            # Execute lightweight handshake verification query
            with conn.cursor() as cur:
                cur.execute("SELECT CURRENT_VERSION(), CURRENT_WAREHOUSE(), CURRENT_DATABASE()")
                row = cur.fetchone()

            latency_ms = max(1, int((time.time() - start_time) * 1000))
            version = row[0] if row else "Unknown"
            wh = row[1] if row and row[1] else warehouse
            db = row[2] if row and row[2] else database

            return ConnectionTestResult(
                success=True,
                message="Connection established successfully with Snowflake.",
                latency_ms=latency_ms,
                details={
                    "snowflake_version": version,
                    "warehouse": wh,
                    "database": db,
                    "account": account,
                },
            )
        except (SnowflakeError, Exception) as e:
            latency_ms = max(1, int((time.time() - start_time) * 1000))
            safe_err = cls.sanitize_error(e)
            return ConnectionTestResult(
                success=False,
                message="Failed to connect to Snowflake.",
                latency_ms=latency_ms,
                error=safe_err,
            )
        finally:
            if conn:
                try:
                    conn.close()
                except Exception:
                    pass

    @classmethod
    def discover_metadata(cls, config: Dict[str, Any]) -> MetadataDiscoveryResult:
        """
        Discover database, schema, table, view, and column metadata from Snowflake.
        Queries INFORMATION_SCHEMA to extract structure, data types, nullability,
        and row counts without querying business data rows.
        """
        start_time = time.time()

        account = cls.clean_account_identifier(
            config.get("account")
            or config.get("account_identifier")
            or config.get("accountIdentifier")
        )
        user = config.get("user") or config.get("username")
        password = config.get("password")
        warehouse = config.get("warehouse")
        database = config.get("database")
        schema = (
            config.get("schema")
            or config.get("default_schema")
            or config.get("defaultSchema")
        )
        role = config.get("role")

        # Validate mandatory credentials
        missing = []
        if not account or not str(account).strip():
            missing.append("Account Identifier")
        if not user or not str(user).strip():
            missing.append("Username")
        if not password or not str(password).strip():
            missing.append("Password")

        if missing:
            return MetadataDiscoveryResult(
                success=False,
                message=f"Missing required Snowflake credentials: {', '.join(missing)}.",
                latency_ms=0,
                error="Required connection parameters were not supplied.",
            )

        conn = None
        try:
            connect_kwargs: Dict[str, Any] = {
                "account": str(account).strip(),
                "user": str(user).strip(),
                "password": str(password),
                "login_timeout": 15,
                "network_timeout": 15,
            }
            if warehouse and str(warehouse).strip():
                connect_kwargs["warehouse"] = str(warehouse).strip()
            if database and str(database).strip():
                connect_kwargs["database"] = str(database).strip()
            if schema and str(schema).strip():
                connect_kwargs["schema"] = str(schema).strip()
            if role and str(role).strip():
                connect_kwargs["role"] = str(role).strip()

            conn = snowflake.connector.connect(**connect_kwargs)

            with conn.cursor() as cur:
                # If database wasn't explicitly given in config, detect current database
                effective_db = database
                if not effective_db or not str(effective_db).strip():
                    cur.execute("SELECT CURRENT_DATABASE()")
                    db_row = cur.fetchone()
                    if db_row and db_row[0]:
                        effective_db = str(db_row[0])
                    else:
                        # Fall back to discovering accessible databases
                        cur.execute("SHOW DATABASES")
                        db_rows = cur.fetchall()
                        if db_rows:
                            effective_db = str(db_rows[0][1])

                if not effective_db:
                    latency_ms = max(1, int((time.time() - start_time) * 1000))
                    return MetadataDiscoveryResult(
                        success=False,
                        message="No accessible Snowflake database found for metadata discovery.",
                        latency_ms=latency_ms,
                        error="Database name is required or no database was assigned to the session.",
                    )

                clean_db = str(effective_db).strip().replace('"', "")
                db_prefix = f'"{clean_db}".'

                # 1. Query table-level metadata from INFORMATION_SCHEMA.TABLES
                schema_filter = ""
                if schema and str(schema).strip():
                    clean_schema = str(schema).strip().replace("'", "''")
                    schema_filter = f"AND TABLE_SCHEMA = '{clean_schema}'"

                tables_sql = f"""
                    SELECT 
                        TABLE_CATALOG,
                        TABLE_SCHEMA,
                        TABLE_NAME,
                        TABLE_TYPE,
                        COALESCE(ROW_COUNT, 0) AS ROW_COUNT,
                        COALESCE(BYTES, 0) AS BYTES,
                        COMMENT
                    FROM {db_prefix}INFORMATION_SCHEMA.TABLES
                    WHERE TABLE_SCHEMA NOT IN ('INFORMATION_SCHEMA')
                    {schema_filter}
                    ORDER BY TABLE_SCHEMA, TABLE_NAME
                """
                cur.execute(tables_sql)
                table_rows = cur.fetchall()

                # Map table rows to TableMetadata
                discovered_tables: Dict[str, TableMetadata] = {}
                discovered_schemas = set()
                discovered_databases = {clean_db}

                for row in table_rows:
                    tbl_db = str(row[0] or clean_db)
                    tbl_sch = str(row[1])
                    tbl_name = str(row[2])
                    tbl_type = str(row[3] or "TABLE")
                    tbl_rows = int(row[4] or 0)
                    tbl_bytes = int(row[5] or 0)
                    tbl_comment = str(row[6]) if row[6] is not None else None

                    discovered_databases.add(tbl_db)
                    discovered_schemas.add(tbl_sch)

                    table_key = f"{tbl_sch}.{tbl_name}"
                    discovered_tables[table_key] = TableMetadata(
                        database=tbl_db,
                        schema=tbl_sch,
                        name=tbl_name,
                        table_type=tbl_type,
                        row_count=tbl_rows,
                        bytes=tbl_bytes,
                        comment=tbl_comment,
                        columns=[],
                    )

                # 2. Query column-level metadata from INFORMATION_SCHEMA.COLUMNS
                columns_sql = f"""
                    SELECT 
                        TABLE_CATALOG,
                        TABLE_SCHEMA,
                        TABLE_NAME,
                        COLUMN_NAME,
                        DATA_TYPE,
                        IS_NULLABLE,
                        ORDINAL_POSITION,
                        COMMENT
                    FROM {db_prefix}INFORMATION_SCHEMA.COLUMNS
                    WHERE TABLE_SCHEMA NOT IN ('INFORMATION_SCHEMA')
                    {schema_filter}
                    ORDER BY TABLE_SCHEMA, TABLE_NAME, ORDINAL_POSITION
                """
                cur.execute(columns_sql)
                column_rows = cur.fetchall()

                total_columns = 0
                for col_row in column_rows:
                    col_sch = str(col_row[1])
                    col_tbl = str(col_row[2])
                    col_name = str(col_row[3])
                    col_type = str(col_row[4])
                    col_nullable = str(col_row[5]).upper() == "YES"
                    col_pos = int(col_row[6] or 0)
                    col_comment = str(col_row[7]) if col_row[7] is not None else None

                    table_key = f"{col_sch}.{col_tbl}"
                    if table_key in discovered_tables:
                        col_meta = ColumnMetadata(
                            name=col_name,
                            data_type=col_type,
                            is_nullable=col_nullable,
                            ordinal_position=col_pos,
                            comment=col_comment,
                            is_primary_key=(col_name.upper() == "ID" or col_pos == 1),
                        )
                        discovered_tables[table_key].columns.append(col_meta)
                        total_columns += 1

            latency_ms = max(1, int((time.time() - start_time) * 1000))
            tables_list = list(discovered_tables.values())

            return MetadataDiscoveryResult(
                success=True,
                message="Metadata synchronized successfully from Snowflake.",
                databases_discovered=len(discovered_databases),
                schemas_discovered=len(discovered_schemas),
                tables_discovered=len(tables_list),
                columns_discovered=total_columns,
                tables=tables_list,
                latency_ms=latency_ms,
            )

        except (SnowflakeError, Exception) as e:
            latency_ms = max(1, int((time.time() - start_time) * 1000))
            safe_err = cls.sanitize_error(e)
            return MetadataDiscoveryResult(
                success=False,
                message="Failed to discover metadata from Snowflake.",
                databases_discovered=0,
                schemas_discovered=0,
                tables_discovered=0,
                columns_discovered=0,
                tables=[],
                error=safe_err,
                latency_ms=latency_ms,
            )
        finally:
            if conn:
                try:
                    conn.close()
                except Exception:
                    pass

    @staticmethod
    def _serialize_cell_value(val: Any) -> Any:
        """Safely serialize database types to JSON-compatible Python primitives."""
        if isinstance(val, (datetime.datetime, datetime.date, datetime.time)):
            return val.isoformat()
        elif isinstance(val, decimal.Decimal):
            return float(val) if val % 1 != 0 else int(val)
        elif isinstance(val, (bytes, bytearray)):
            return val.decode("utf-8", errors="replace")
        return val

    @classmethod
    def execute_read_query(
        cls,
        config: Dict[str, Any],
        query: str,
        params: Optional[Dict[str, Any]] = None,
        timeout_seconds: int = 30,
        limit: int = 100,
    ) -> QueryExecutionResult:
        """
        Execute a strictly read-only analytical query against Snowflake.
        Enforces query safety, timeouts, bounded row limits, and returns sanitized results.
        Never logs or exposes credentials.
        """
        start_time = time.time()

        # 1. Validate query is non-empty
        if not query or not query.strip():
            return QueryExecutionResult(
                success=False,
                message="Query string cannot be empty.",
                error="No SQL query was provided for execution.",
            )

        # 2. Extract and validate required credentials
        account = cls.clean_account_identifier(
            config.get("account")
            or config.get("account_identifier")
            or config.get("accountIdentifier")
            or os.environ.get("SNOWFLAKE_ACCOUNT")
            or os.environ.get("SNOWFLAKE_ACCOUNT_IDENTIFIER")
        )
        user = (
            config.get("user")
            or config.get("username")
            or os.environ.get("SNOWFLAKE_USER")
            or os.environ.get("SNOWFLAKE_USERNAME")
        )
        password = config.get("password") or os.environ.get("SNOWFLAKE_PASSWORD")
        warehouse = config.get("warehouse") or os.environ.get("SNOWFLAKE_WAREHOUSE")
        database = config.get("database") or os.environ.get("SNOWFLAKE_DATABASE")
        schema = (
            config.get("schema")
            or config.get("default_schema")
            or config.get("defaultSchema")
            or os.environ.get("SNOWFLAKE_SCHEMA")
        )
        role = config.get("role") or os.environ.get("SNOWFLAKE_ROLE")

        missing = []
        if not account or not str(account).strip():
            missing.append("Account Identifier")
        if not user or not str(user).strip():
            missing.append("Username")
        if not password or not str(password).strip():
            missing.append("Password")

        if missing:
            return QueryExecutionResult(
                success=False,
                message=f"Missing required Snowflake credentials: {', '.join(missing)}.",
                execution_time_ms=0,
                error="Required connection parameters were not supplied.",
            )

        # 3. Read-Only Validation (Defense-in-depth)
        # Strip comments
        cleaned = re.sub(r"--[^\n]*", " ", query)
        cleaned = re.sub(r"/\*.*?\*/", " ", cleaned, flags=re.DOTALL).strip()

        # Reject multiple statements (separated by semicolon outside quotes)
        statements = [s.strip() for s in re.split(r";(?=(?:[^'\"`]*['\"`][^'\"`]*['\"`])*[^'\"`]*$)", cleaned) if s.strip()]
        if len(statements) > 1:
            return QueryExecutionResult(
                success=False,
                message="Multiple SQL statements are not permitted. Only a single read-only query may be executed.",
                error="Multiple SQL statements detected.",
            )

        # Remove single-quoted strings to avoid false positives on data values
        no_strings = re.sub(r"'(''|[^'])*'", "''", cleaned)

        prohibited = [
            "INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "TRUNCATE",
            "CREATE", "MERGE", "GRANT", "REVOKE", "CALL", "REPLACE",
            "EXECUTE", "COPY", "PUT", "REMOVE", "UNDROP"
        ]

        first_token = no_strings.split()[0].upper() if no_strings.split() else ""
        if first_token in prohibited:
            return QueryExecutionResult(
                success=False,
                message=f"Operation '{first_token}' is prohibited. Only read-only queries are permitted.",
                error=f"Prohibited SQL command: {first_token}",
            )

        for cmd in prohibited:
            if re.search(rf"\b{cmd}\b", no_strings, re.IGNORECASE):
                return QueryExecutionResult(
                    success=False,
                    message=f"Operation '{cmd}' is prohibited. Only read-only queries are permitted.",
                    error=f"Prohibited SQL command: {cmd}",
                )

        allowed_starts = ("SELECT", "WITH", "SHOW", "DESCRIBE", "DESC", "EXPLAIN")
        if first_token not in allowed_starts:
            return QueryExecutionResult(
                success=False,
                message=f"Query must start with a read-only keyword ({', '.join(allowed_starts)}). Found: '{first_token}'.",
                error=f"Prohibited starting keyword: {first_token}",
            )

        # 4. Enforce row bounds: default 100, maximum 1000
        bounded_limit = min(max(1, limit or 100), 1000)

        conn = None
        try:
            connect_kwargs: Dict[str, Any] = {
                "account": str(account).strip(),
                "user": str(user).strip(),
                "password": str(password),
                "login_timeout": min(15, timeout_seconds),
                "network_timeout": min(15, timeout_seconds),
                "session_parameters": {
                    "STATEMENT_TIMEOUT_IN_SECONDS": timeout_seconds,
                },
            }
            if warehouse and str(warehouse).strip():
                connect_kwargs["warehouse"] = str(warehouse).strip()
            if database and str(database).strip():
                connect_kwargs["database"] = str(database).strip()
            if schema and str(schema).strip():
                connect_kwargs["schema"] = str(schema).strip()
            if role and str(role).strip():
                connect_kwargs["role"] = str(role).strip()

            conn = snowflake.connector.connect(**connect_kwargs)

            with conn.cursor() as cur:
                if params:
                    cur.execute(query, params)
                else:
                    cur.execute(query)

                query_id = getattr(cur, "sfqid", None)

                # Extract column metadata from cur.description
                columns: List[QueryResultColumn] = []
                col_names: List[str] = []
                if cur.description:
                    for col_desc in cur.description:
                        col_name = str(col_desc[0])
                        type_code = col_desc[1] if len(col_desc) > 1 else "VARCHAR"
                        type_str = "VARCHAR"
                        if isinstance(type_code, str):
                            type_str = type_code
                        elif isinstance(type_code, int):
                            type_str = SNOWFLAKE_TYPE_MAP.get(type_code, "VARCHAR")
                        columns.append(QueryResultColumn(name=col_name, data_type=type_str))
                        col_names.append(col_name)

                # Fetch bounded rows
                raw_rows = cur.fetchmany(bounded_limit)
                rows: List[Dict[str, Any]] = []
                for r in raw_rows:
                    row_dict: Dict[str, Any] = {}
                    if isinstance(r, dict):
                        for k, v in r.items():
                            row_dict[k] = cls._serialize_cell_value(v)
                    elif isinstance(r, (list, tuple)):
                        for idx, v in enumerate(r):
                            k = col_names[idx] if idx < len(col_names) else f"COL_{idx+1}"
                            row_dict[k] = cls._serialize_cell_value(v)
                    rows.append(row_dict)

                exec_time_ms = max(1, int((time.time() - start_time) * 1000))

                return QueryExecutionResult(
                    success=True,
                    columns=columns,
                    rows=rows,
                    row_count=len(rows),
                    execution_time_ms=exec_time_ms,
                    message=f"Query executed successfully returning {len(rows)} row(s).",
                    query_id=query_id,
                )

        except (SnowflakeError, Exception) as e:
            exec_time_ms = max(1, int((time.time() - start_time) * 1000))
            raw_err_str = str(e).lower()
            if "timeout" in raw_err_str or "000604" in raw_err_str or getattr(e, "errno", None) == 604:
                safe_err = f"Query execution timed out after {timeout_seconds} seconds."
            else:
                safe_err = cls.sanitize_error(e)
            return QueryExecutionResult(
                success=False,
                columns=[],
                rows=[],
                row_count=0,
                execution_time_ms=exec_time_ms,
                message="Failed to execute query on Snowflake.",
                error=safe_err,
            )
        finally:
            if conn:
                try:
                    conn.close()
                except Exception:
                    pass


