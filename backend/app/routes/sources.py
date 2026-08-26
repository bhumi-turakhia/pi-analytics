from typing import Optional
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import text

from app.database import engine

router = APIRouter(
    prefix="/api/sources",
    tags=["Data Sources"]
)


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


@router.get("/")
def get_sources():
    with engine.connect() as connection:
        result = connection.execute(
            text("""
                SELECT
                    s.id,
                    s.name,
                    s.source_type,
                    s.created_at,
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
            sources.append({
                "id": row.id,
                "name": row.name,
                "source_type": row.source_type,
                "created_at": row.created_at,
                "last_sync_at": row.last_sync_at
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

        return {
            "id": row.id,
            "name": row.name,
            "source_type": row.source_type,
            "created_at": row.created_at,
            "last_sync_at": None
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

        # 2. Insert a new successful pipeline run
        run_result = connection.execute(
            text("""
                INSERT INTO pipeline_runs (source_id, status, started_at, completed_at, rows_processed)
                VALUES (:source_id, 'SUCCESS', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, :rows_processed)
                RETURNING id, source_id, status, started_at, completed_at, rows_processed
            """),
            {"source_id": source_id, "rows_processed": 1250}
        )
        run_row = run_result.fetchone()

        return {
            "id": source_row.id,
            "name": source_row.name,
            "source_type": source_row.source_type,
            "created_at": source_row.created_at,
            "last_sync_at": run_row.completed_at if run_row else None,
            "pipeline_run": {
                "id": run_row.id,
                "source_id": run_row.source_id,
                "status": run_row.status,
                "started_at": run_row.started_at,
                "completed_at": run_row.completed_at,
                "rows_processed": run_row.rows_processed
            } if run_row else None
        }
