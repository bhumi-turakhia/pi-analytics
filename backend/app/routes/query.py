import re
from typing import Dict, Any, Optional, List
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import text

from app.database import engine
from connectors import execute_source_query

router = APIRouter(
    prefix="/api/query",
    tags=["Query Execution"]
)

PROHIBITED_COMMANDS = [
    "INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "TRUNCATE",
    "CREATE", "MERGE", "GRANT", "REVOKE", "CALL", "REPLACE",
    "EXECUTE", "EXEC", "COPY", "PUT", "REMOVE", "UNDROP",
    "LOAD", "IMPORT", "XP_", "SP_"
]

ALLOWED_START_KEYWORDS = ("SELECT", "WITH", "SHOW", "DESCRIBE", "DESC", "EXPLAIN")
IDENTIFIER_REGEX = re.compile(r"^[A-Za-z0-9_]+$")


def validate_read_only_query(query: str, max_limit: int = 1000) -> None:
    """
    Strictly enforce read-only analytical SQL.
    Rejects multiple statements, destructive keywords, and mutating commands.
    """
    if not query or not query.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="SQL query cannot be empty."
        )

    # Strip comments: -- and /* ... */
    cleaned = re.sub(r"--[^\n]*", " ", query)
    cleaned = re.sub(r"/\*.*?\*/", " ", cleaned, flags=re.DOTALL).strip()

    if not cleaned:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="SQL query contains no executable statements."
        )

    # Reject multiple statements (separated by semicolon outside quotes)
    statements = [s.strip() for s in re.split(r";(?=(?:[^'\"`]*['\"`][^'\"`]*['\"`])*[^'\"`]*$)", cleaned) if s.strip()]
    if len(statements) > 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Multiple SQL statements are not permitted. Only a single read-only query may be executed."
        )

    # Strip single-quoted string literals to avoid false positives on query filter values (e.g. WHERE status = 'DELETED')
    no_strings = re.sub(r"'(''|[^'])*'", "''", cleaned)

    first_token = no_strings.split()[0].upper() if no_strings.split() else ""
    if first_token in PROHIBITED_COMMANDS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Operation '{first_token}' is prohibited. Only read-only queries are permitted."
        )

    for cmd in PROHIBITED_COMMANDS:
        if re.search(rf"\b{cmd}\b", no_strings, re.IGNORECASE):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Operation '{cmd}' is prohibited. Only read-only queries are permitted."
            )

    if first_token not in ALLOWED_START_KEYWORDS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Query must start with a read-only keyword ({', '.join(ALLOWED_START_KEYWORDS)}). Found: '{first_token}'."
        )

    # Inspect embedded LIMIT clause if present
    limit_match = re.search(r"\bLIMIT\s+(\d+)", no_strings, re.IGNORECASE)
    if limit_match:
        embedded_limit = int(limit_match.group(1))
        if embedded_limit > max_limit:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Requested row limit of {embedded_limit} in SQL exceeds maximum allowed limit of {max_limit} rows."
            )
        if embedded_limit <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Requested row limit must be greater than 0."
            )


class ColumnResponse(BaseModel):
    name: str
    data_type: str = "VARCHAR"


class QueryExecutionResponse(BaseModel):
    success: bool
    columns: List[ColumnResponse] = []
    rows: List[Dict[str, Any]] = []
    row_count: int = 0
    execution_time_ms: int = 0
    query_id: Optional[str] = None
    message: Optional[str] = None
    error: Optional[str] = None


class QueryExecutePayload(BaseModel):
    source_id: int
    database: Optional[str] = None
    schema_name: Optional[str] = Field(None, alias="schema")
    table: Optional[str] = None
    sql_query: Optional[str] = Field(None, alias="sqlQuery")
    limit: Optional[int] = 100

    # Ephemeral credentials (used for Snowflake connection, never stored or returned)
    account_identifier: Optional[str] = None
    accountIdentifier: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None
    warehouse: Optional[str] = None
    role: Optional[str] = None

    model_config = {"populate_by_name": True}


@router.post("/execute", response_model=QueryExecutionResponse)
def execute_query(payload: QueryExecutePayload):
    """
    Execute a strictly read-only analytical query against the connected data source (Snowflake).
    Enforces read-only safety, maximum limit of 1000 rows, statement timeout, and catalog identifier quoting.
    Credentials are used ephemerally and never logged, stored in PostgreSQL, or returned in response.
    """
    # 1. Validate data source existence in PostgreSQL
    with engine.connect() as connection:
        source_result = connection.execute(
            text("""
                SELECT id, name, source_type
                FROM data_sources
                WHERE id = :source_id
            """),
            {"source_id": payload.source_id}
        )
        source_row = source_result.fetchone()

        if not source_row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Data source with id {payload.source_id} not found"
            )

    source_type = (source_row.source_type or "snowflake").strip().lower()
    if source_type not in {"snowflake", "salesforce"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported data source type '{source_type}'."
        )

    # 2. Validate row limit
    limit = payload.limit if payload.limit is not None else 100
    if limit <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Requested row limit must be greater than 0."
        )
    if limit > 1000:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Requested row limit of {limit} exceeds maximum allowed limit of 1000 rows."
        )

    # 3. Resolve SQL query: either custom raw SQL worksheet or catalog-table preview query
    effective_sql = ""
    target_db = payload.database
    target_schema = payload.schema_name

    if payload.sql_query and payload.sql_query.strip():
        raw_sql = payload.sql_query.strip()
        validate_read_only_query(raw_sql, max_limit=1000)

        # If query lacks a LIMIT clause, append bounded limit to prevent accidental full-table scans
        cleaned = re.sub(r"--[^\n]*", " ", raw_sql)
        cleaned = re.sub(r"/\*.*?\*/", " ", cleaned, flags=re.DOTALL)
        no_strings = re.sub(r"'(''|[^'])*'", "''", cleaned)
        if not re.search(r"\bLIMIT\b", no_strings, re.IGNORECASE):
            effective_sql = f"{raw_sql.rstrip(';')} LIMIT {limit};"
        else:
            effective_sql = raw_sql

    elif payload.table and payload.table.strip():
        tbl_name = payload.table.strip()

        # Validate database/schema/table against catalog metadata in PostgreSQL
        with engine.connect() as connection:
            ds_filter = "WHERE source_id = :sid AND LOWER(table_name) = LOWER(:tbl)"
            ds_params: Dict[str, Any] = {"sid": payload.source_id, "tbl": tbl_name}
            if target_db:
                ds_filter += " AND LOWER(database_name) = LOWER(:db)"
                ds_params["db"] = target_db.strip()
            if target_schema:
                ds_filter += " AND LOWER(schema_name) = LOWER(:sch)"
                ds_params["sch"] = target_schema.strip()

            dataset_match = connection.execute(
                text(f"SELECT database_name, schema_name, table_name FROM datasets {ds_filter} LIMIT 1"),
                ds_params
            ).fetchone()

            if dataset_match:
                target_db = dataset_match.database_name
                target_schema = dataset_match.schema_name
                tbl_name = dataset_match.table_name

        # Validate that identifiers are safe alphanumeric / underscore
        for ident_label, ident_val in [("database", target_db), ("schema", target_schema), ("table", tbl_name)]:
            if ident_val and not IDENTIFIER_REGEX.match(ident_val):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid SQL identifier for {ident_label}: '{ident_val}'."
                )

        # Construct a source-specific safe preview query.
        if source_type == "salesforce":
            # Salesforce objects are queried directly by object/API name.
            effective_sql = f"SELECT FIELDS(ALL) FROM {tbl_name} LIMIT {limit}"
        else:
            # Snowflake uses database/schema/table identifiers.
            if target_db and target_schema:
                effective_sql = f'SELECT * FROM "{target_db}"."{target_schema}"."{tbl_name}" LIMIT {limit};'
            elif target_schema:
                effective_sql = f'SELECT * FROM "{target_schema}"."{tbl_name}" LIMIT {limit};'
            else:
                effective_sql = f'SELECT * FROM "{tbl_name}" LIMIT {limit};'

    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Either sql_query or table must be provided for query execution."
        )

    # 4. Prepare ephemeral configuration for connector
    # 4. Prepare source configuration.
    # Snowflake credentials are resolved server-side by the connector from
    # backend environment variables. Salesforce remains request-configured.
    if source_type == "snowflake":
        config: Dict[str, Any] = {
            "database": target_db,
            "schema": target_schema,
        }
    else:
        config = {}

    # 5. Execute query via dispatcher
    result = execute_source_query(
        source_type=source_type,
        config=config,
        query=effective_sql,
        timeout_seconds=30,
        limit=limit,
    )

    if not result.success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=result.error or result.message or "Failed to execute query on Snowflake."
        )

    return QueryExecutionResponse(
        success=True,
        columns=[ColumnResponse(name=c.name, data_type=c.data_type) for c in result.columns],
        rows=result.rows,
        row_count=result.row_count,
        execution_time_ms=result.execution_time_ms,
        query_id=result.query_id,
        message=result.message,
    )
