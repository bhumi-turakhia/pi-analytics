from fastapi import APIRouter
from sqlalchemy import text

from app.database import engine

router = APIRouter(
    prefix="/api/pipeline-runs",
    tags=["Pipeline Runs"]
)


@router.get("/")
def get_pipeline_runs():
    with engine.connect() as connection:
        result = connection.execute(
            text("""
                SELECT
                    id,
                    source_id,
                    status,
                    started_at,
                    completed_at,
                    rows_processed
                FROM pipeline_runs
                ORDER BY id DESC
            """)
        )

        pipeline_runs = []

        for row in result:
            pipeline_runs.append({
                "id": row.id,
                "source_id": row.source_id,
                "status": row.status,
                "started_at": row.started_at,
                "completed_at": row.completed_at,
                "rows_processed": row.rows_processed
            })

        return pipeline_runs
