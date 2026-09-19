from typing import Optional, Set
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import text

from app.database import engine
from app.config import PROJECT_ROOT
from connectors import test_source_connection, discover_source_metadata

router = APIRouter(
    prefix="/api/sources",
    tags=["Data Sources"]
)

# Session tracking for disconnected sources when the database table lacks a status column
_disconnected_sources: Set[int] = set()


def _has_status_column(connection) -> bool:
    """Check if the data_sources table in PostgreSQL has a status column."""
    try:
        res = connection.execute(text("""
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'data_sources' AND column_name = 'status'
        """)).fetchone()
        return res is not None
    except Exception:
        return False


class DataSourceCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    source_type: Optional[str] = Field(None, max_length=50)
    platform: Optional[str] = Field(None, max_length=50)
    environment: Optional[str] = None
    account_identifier: Optional[str] = None
    accountIdentifier: Optional[str] = None
    warehouse: Optional[str] = None
    database: Optional[str] = None
    default_schema: Optional[str] = None
    defaultSchema: Optional[str] = None
    username: Optional[str] = None
    role: Optional[str] = None
    auto_sync_enabled: Optional[bool] = None
    autoSyncEnabled: Optional[bool] = None
    sync_interval_minutes: Optional[int] = None
    syncIntervalMinutes: Optional[int] = None


class ConnectionTestPayload(BaseModel):
    source_type: Optional[str] = Field(None, max_length=50)
    platform: Optional[str] = Field(None, max_length=50)
    account_identifier: Optional[str] = None
    accountIdentifier: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None
    warehouse: Optional[str] = None
    database: Optional[str] = None
    default_schema: Optional[str] = None
    defaultSchema: Optional[str] = None
    role: Optional[str] = None


@router.get("/")
def get_sources():
    with engine.connect() as connection:
        has_status = _has_status_column(connection)
        status_select = ", s.status" if has_status else ""

        result = connection.execute(
            text(f"""
                SELECT
                    s.id,
                    s.name,
                    s.source_type,
                    s.created_at{status_select},
                    (
                        SELECT pr.completed_at
                        FROM pipeline_runs pr
                        WHERE pr.source_id = s.id
                        ORDER BY pr.id DESC
                        LIMIT 1
                    ) AS last_sync_at
                FROM data_sources s
                ORDER BY s.id
            """)
        )

        sources = []

        for row in result:
            if has_status and getattr(row, 'status', None):
                status_val = row.status
            else:
                status_val = "disconnected" if row.id in _disconnected_sources else "healthy"

            sources.append({
                "id": row.id,
                "name": row.name,
                "source_type": row.source_type,
                "created_at": row.created_at,
                "last_sync_at": row.last_sync_at,
                "status": status_val
            })

        return sources


@router.post("/", status_code=status.HTTP_201_CREATED)
def create_source(payload: DataSourceCreate):
    name = payload.name.strip()
    source_type = (payload.source_type or payload.platform or "snowflake").strip()

    if not name:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Name is required"
        )
    if not source_type:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Source type / platform is required"
        )

    with engine.begin() as connection:
        has_status = _has_status_column(connection)

        if has_status:
            result = connection.execute(
                text("""
                    INSERT INTO data_sources (name, source_type, status)
                    VALUES (:name, :source_type, 'healthy')
                    RETURNING id, name, source_type, created_at, status
                """),
                {"name": name, "source_type": source_type}
            )
        else:
            result = connection.execute(
                text("""
                    INSERT INTO data_sources (name, source_type)
                    VALUES (:name, :source_type)
                    RETURNING id, name, source_type, created_at
                """),
                {"name": name, "source_type": source_type}
            )
        row = result.fetchone()

        if not row:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create data source"
            )

        _disconnected_sources.discard(row.id)

        return {
            "id": row.id,
            "name": row.name,
            "source_type": row.source_type,
            "created_at": row.created_at,
            "last_sync_at": None,
            "status": "healthy"
        }


@router.post("/{source_id}/sync")
def sync_source(source_id: int):
    with engine.begin() as connection:
        # 1. Validate that the source exists
        source_result = connection.execute(
            text("""
                SELECT id, name, source_type, created_at
                FROM data_sources
                WHERE id = :source_id
            """),
            {"source_id": source_id}
        )
        source_row = source_result.fetchone()

        if not source_row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Data source with id {source_id} not found"
            )

        # Reconnect if previously disconnected
        if _has_status_column(connection):
            connection.execute(
                text("UPDATE data_sources SET status = 'healthy' WHERE id = :source_id"),
                {"source_id": source_id}
            )
        _disconnected_sources.discard(source_id)

        # Count actual cataloged tables for this source
        dataset_count = connection.execute(
            text("SELECT COUNT(*) FROM datasets WHERE source_id = :source_id"),
            {"source_id": source_id}
        ).scalar() or 0

        # 2. Insert a new successful pipeline run
        run_result = connection.execute(
            text("""
                INSERT INTO pipeline_runs (source_id, status, started_at, completed_at, rows_processed)
                VALUES (:source_id, 'SUCCESS', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, :rows_processed)
                RETURNING id, source_id, status, started_at, completed_at, rows_processed
            """),
            {"source_id": source_id, "rows_processed": dataset_count}
        )
        run_row = run_result.fetchone()

        return {
            "id": source_row.id,
            "name": source_row.name,
            "source_type": source_row.source_type,
            "created_at": source_row.created_at,
            "last_sync_at": run_row.completed_at if run_row else None,
            "status": "healthy",
            "pipeline_run": {
                "id": run_row.id,
                "source_id": run_row.source_id,
                "status": run_row.status,
                "started_at": run_row.started_at,
                "completed_at": run_row.completed_at,
                "rows_processed": run_row.rows_processed
            } if run_row else None
        }


@router.post("/{source_id}/disconnect")
def disconnect_source(source_id: int):
    """
    Disconnect a data source without deleting it.
    Updates status in PostgreSQL if supported by the schema.
    """
    with engine.begin() as connection:
        # 1. Validate that the source exists in PostgreSQL
        source_result = connection.execute(
            text("""
                SELECT id, name, source_type, created_at
                FROM data_sources
                WHERE id = :source_id
            """),
            {"source_id": source_id}
        )
        source_row = source_result.fetchone()

        if not source_row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Data source with id {source_id} not found"
            )

        # 2. Update status in PostgreSQL if schema supports it
        if _has_status_column(connection):
            connection.execute(
                text("UPDATE data_sources SET status = 'disconnected' WHERE id = :source_id"),
                {"source_id": source_id}
            )

        # Track disconnected state
        _disconnected_sources.add(source_id)

        # 3. Retrieve latest sync timestamp
        last_sync_result = connection.execute(
            text("""
                SELECT completed_at
                FROM pipeline_runs
                WHERE source_id = :source_id
                ORDER BY id DESC
                LIMIT 1
            """),
            {"source_id": source_id}
        )
        last_sync_row = last_sync_result.fetchone()

        return {
            "id": source_row.id,
            "name": source_row.name,
            "source_type": source_row.source_type,
            "created_at": source_row.created_at,
            "last_sync_at": last_sync_row[0] if last_sync_row else None,
            "status": "disconnected"
        }


@router.delete("/{source_id}")
def delete_source(source_id: int):
    """
    Safely delete a data source from PostgreSQL.
    Inspects referencing tables (datasets, pipeline_runs) and prevents
    deletion if foreign keys reference this source.
    """
    with engine.begin() as connection:
        # 1. Validate that the source exists
        source_result = connection.execute(
            text("""
                SELECT id, name
                FROM data_sources
                WHERE id = :source_id
            """),
            {"source_id": source_id}
        )
        source_row = source_result.fetchone()

        if not source_row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Data source with id {source_id} not found"
            )

        # 2. Inspect whether datasets or pipeline_runs reference the source
        dataset_count = connection.execute(
            text("SELECT COUNT(*) FROM datasets WHERE source_id = :source_id"),
            {"source_id": source_id}
        ).scalar() or 0

        run_count = connection.execute(
            text("SELECT COUNT(*) FROM pipeline_runs WHERE source_id = :source_id"),
            {"source_id": source_id}
        ).scalar() or 0

        # 3. If foreign-key constraints prevent deletion, return a meaningful error
        if dataset_count > 0 or run_count > 0:
            dependencies = []
            if dataset_count > 0:
                dependencies.append(f"{dataset_count} dataset(s)")
            if run_count > 0:
                dependencies.append(f"{run_count} pipeline run(s)")
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"Cannot delete data source '{source_row.name}' (ID: {source_id}) because it is "
                    f"referenced by {', '.join(dependencies)}. "
                    f"To maintain data integrity, referencing records must be removed or reassigned first."
                )
            )

        # 4. Atomic deletion from PostgreSQL
        try:
            connection.execute(
                text("DELETE FROM data_sources WHERE id = :source_id"),
                {"source_id": source_id}
            )
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Database constraint prevented deletion of data source {source_id}: {str(e)}"
            )

        _disconnected_sources.discard(source_id)

        return {
            "status": "success",
            "message": f"Data source {source_id} deleted successfully",
            "id": source_id
        }


@router.post("/test-connection")
def test_connection_unpersisted(payload: ConnectionTestPayload):
    """
    Test connection configuration before saving a new data source.
    Used by the connection wizard for pre-flight handshake validation.
    Credentials are processed only for the duration of the test and never persisted.
    """
    source_type = (payload.source_type or payload.platform or "snowflake").strip().lower()
    config = payload.model_dump(exclude_unset=True)

    result = test_source_connection(source_type, config)

    response = {
        "success": result.success,
        "source_id": None,
        "source_type": source_type,
        "message": result.message,
        "latency_ms": result.latency_ms,
    }
    if result.error:
        response["error"] = result.error
    if result.details:
        response["details"] = result.details

    return response


@router.post("/{source_id}/test-connection")
def test_existing_source_connection(
    source_id: int,
    payload: Optional[ConnectionTestPayload] = None
):
    """
    Test connection for an existing data source.
    Validates that the source exists in PostgreSQL (returns 404 if missing),
    merges stored source type with any test credentials provided,
    performs a real connection test for Snowflake without persisting secrets,
    and returns a safe structured response without altering the source or database.
    """
    with engine.connect() as connection:
        source_result = connection.execute(
            text("""
                SELECT id, name, source_type
                FROM data_sources
                WHERE id = :source_id
            """),
            {"source_id": source_id}
        )
        source_row = source_result.fetchone()

        if not source_row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Data source with id {source_id} not found"
            )

    source_type = (source_row.source_type or "snowflake").strip().lower()
    config = payload.model_dump(exclude_unset=True) if payload else {}

    result = test_source_connection(source_type, config)

    response = {
        "success": result.success,
        "source_id": source_id,
        "source_type": source_type,
        "message": result.message,
        "latency_ms": result.latency_ms,
    }
    if result.error:
        response["error"] = result.error
    if result.details:
        response["details"] = result.details

    return response


@router.post("/{source_id}/metadata/sync")
def sync_source_metadata(
    source_id: int,
    payload: Optional[ConnectionTestPayload] = None
):
    """
    Synchronize metadata for a data source from Snowflake.
    Discovers databases, schemas, tables, views, and columns without querying business data rows.
    Persists metadata idempotently in PostgreSQL datasets and catalog_columns tables.
    Credentials are used ephemerally and never stored in the database or returned in responses.
    """
    # 1. Validate that the source exists in PostgreSQL
    with engine.connect() as connection:
        source_result = connection.execute(
            text("""
                SELECT id, name, source_type
                FROM data_sources
                WHERE id = :source_id
            """),
            {"source_id": source_id}
        )
        source_row = source_result.fetchone()

        if not source_row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Data source with id {source_id} not found"
            )

    source_type = (source_row.source_type or "snowflake").strip().lower()
    config = payload.model_dump(exclude_unset=True) if payload else {}

    # 2. Discover metadata via the connector layer
    discovery_result = discover_source_metadata(source_type, config)

    if not discovery_result.success:
        response = {
            "success": False,
            "source_id": source_id,
            "source_type": source_type,
            "databases_discovered": 0,
            "schemas_discovered": 0,
            "tables_discovered": 0,
            "columns_discovered": 0,
            "message": discovery_result.message,
        }
        if discovery_result.error:
            response["error"] = discovery_result.error
        return response

    # 3. Persist metadata idempotently in PostgreSQL transaction
    persisted_tables = 0
    persisted_columns = 0

    with engine.begin() as connection:
        # Reconnect source if disconnected
        if _has_status_column(connection):
            connection.execute(
                text("UPDATE data_sources SET status = 'healthy' WHERE id = :source_id"),
                {"source_id": source_id}
            )
        _disconnected_sources.discard(source_id)

        for table in discovery_result.tables:
            # UPSERT dataset record
            dataset_row = connection.execute(
                text("""
                    INSERT INTO datasets (
                        source_id, database_name, schema_name, table_name,
                        table_type, row_count, size_bytes, updated_at
                    )
                    VALUES (
                        :source_id, :db, :schema, :table_name,
                        :table_type, :row_count, :size_bytes, CURRENT_TIMESTAMP
                    )
                    ON CONFLICT (source_id, database_name, schema_name, table_name)
                    DO UPDATE SET
                        table_type = EXCLUDED.table_type,
                        row_count = EXCLUDED.row_count,
                        size_bytes = EXCLUDED.size_bytes,
                        updated_at = CURRENT_TIMESTAMP
                    RETURNING id
                """),
                {
                    "source_id": source_id,
                    "db": table.database,
                    "schema": table.schema,
                    "table_name": table.name,
                    "table_type": table.table_type,
                    "row_count": table.row_count,
                    "size_bytes": table.bytes,
                }
            ).fetchone()

            if not dataset_row:
                continue

            dataset_id = dataset_row[0]
            persisted_tables += 1

            # UPSERT column records
            for col in table.columns:
                connection.execute(
                    text("""
                        INSERT INTO catalog_columns (
                            dataset_id, column_name, data_type, is_nullable,
                            ordinal_position, comment, updated_at
                        )
                        VALUES (
                            :dataset_id, :column_name, :data_type, :is_nullable,
                            :ordinal_position, :comment, CURRENT_TIMESTAMP
                        )
                        ON CONFLICT (dataset_id, column_name)
                        DO UPDATE SET
                            data_type = EXCLUDED.data_type,
                            is_nullable = EXCLUDED.is_nullable,
                            ordinal_position = EXCLUDED.ordinal_position,
                            comment = EXCLUDED.comment,
                            updated_at = CURRENT_TIMESTAMP
                    """),
                    {
                        "dataset_id": dataset_id,
                        "column_name": col.name,
                        "data_type": col.data_type,
                        "is_nullable": col.is_nullable,
                        "ordinal_position": col.ordinal_position,
                        "comment": col.comment,
                    }
                )
                persisted_columns += 1

        # Record a successful pipeline run for metadata sync
        connection.execute(
            text("""
                INSERT INTO pipeline_runs (source_id, status, started_at, completed_at, rows_processed)
                VALUES (:source_id, 'SUCCESS', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, :rows_processed)
            """),
            {"source_id": source_id, "rows_processed": persisted_tables}
        )

    return {
        "success": True,
        "source_id": source_id,
        "source_type": source_type,
        "databases_discovered": discovery_result.databases_discovered,
        "schemas_discovered": discovery_result.schemas_discovered,
        "tables_discovered": persisted_tables,
        "columns_discovered": persisted_columns,
        "message": "Metadata synchronized successfully"
    }



