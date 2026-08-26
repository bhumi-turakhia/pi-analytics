from fastapi import APIRouter
from sqlalchemy import text

from app.database import engine

router = APIRouter(
    prefix="/api/datasets",
    tags=["Datasets"]
)


@router.get("/")
def get_datasets():
    with engine.connect() as connection:
        result = connection.execute(
            text("""
                SELECT
                    id,
                    source_id,
                    database_name,
                    schema_name,
                    table_name,
                    created_at
                FROM datasets
                ORDER BY id
            """)
        )

        datasets = []

        for row in result:
            datasets.append({
                "id": row.id,
                "source_id": row.source_id,
                "database_name": row.database_name,
                "schema_name": row.schema_name,
                "table_name": row.table_name,
                "created_at": row.created_at
            })

        return datasets
