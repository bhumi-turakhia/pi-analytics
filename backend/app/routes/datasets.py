from typing import Optional, Dict, List
from fastapi import APIRouter, HTTPException, status
from sqlalchemy import text

from app.database import engine

router = APIRouter(
    prefix="/api/datasets",
    tags=["Datasets"]
)


@router.get("/")
def get_datasets(source_id: Optional[int] = None):
    """
    Retrieve all catalog datasets (tables and views) along with column metadata.
    Optionally filter by source_id.
    """
    with engine.connect() as connection:
        where_clause = "WHERE source_id = :source_id" if source_id is not None else ""
        params = {"source_id": source_id} if source_id is not None else {}

        # 1. Fetch datasets
        result = connection.execute(
            text(f"""
                SELECT
                    id,
                    source_id,
                    database_name,
                    schema_name,
                    table_name,
                    table_type,
                    row_count,
                    size_bytes,
                    created_at,
                    updated_at
                FROM datasets
                {where_clause}
                ORDER BY id
            """),
            params
        )
        dataset_rows = result.fetchall()

        if not dataset_rows:
            return []

        dataset_ids = [row.id for row in dataset_rows]

        # 2. Fetch columns in a single query avoiding N+1
        col_result = connection.execute(
            text("""
                SELECT
                    id,
                    dataset_id,
                    column_name,
                    data_type,
                    is_nullable,
                    ordinal_position,
                    comment
                FROM catalog_columns
                WHERE dataset_id = ANY(:dataset_ids)
                ORDER BY dataset_id, ordinal_position
            """),
            {"dataset_ids": dataset_ids}
        )

        columns_by_dataset: Dict[int, list] = {}
        for col_row in col_result:
            ds_id = col_row.dataset_id
            if ds_id not in columns_by_dataset:
                columns_by_dataset[ds_id] = []
            columns_by_dataset[ds_id].append({
                "id": col_row.id,
                "name": col_row.column_name,
                "data_type": col_row.data_type,
                "is_nullable": col_row.is_nullable,
                "ordinal_position": col_row.ordinal_position,
                "comment": col_row.comment,
            })

        datasets = []
        for row in dataset_rows:
            cols = columns_by_dataset.get(row.id, [])
            datasets.append({
                "id": row.id,
                "source_id": row.source_id,
                "database_name": row.database_name,
                "schema_name": row.schema_name,
                "table_name": row.table_name,
                "table_type": getattr(row, "table_type", "TABLE") or "TABLE",
                "row_count": getattr(row, "row_count", 0) or 0,
                "size_bytes": getattr(row, "size_bytes", 0) or 0,
                "created_at": row.created_at,
                "updated_at": getattr(row, "updated_at", row.created_at),
                "columns": cols,
            })

        return datasets


@router.get("/{dataset_id}")
def get_dataset(dataset_id: int):
    """
    Retrieve single dataset table metadata and its schema columns.
    """
    with engine.connect() as connection:
        result = connection.execute(
            text("""
                SELECT
                    id,
                    source_id,
                    database_name,
                    schema_name,
                    table_name,
                    table_type,
                    row_count,
                    size_bytes,
                    created_at,
                    updated_at
                FROM datasets
                WHERE id = :dataset_id
            """),
            {"dataset_id": dataset_id}
        )
        row = result.fetchone()
        if not row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Dataset with id {dataset_id} not found"
            )

        col_result = connection.execute(
            text("""
                SELECT
                    id,
                    dataset_id,
                    column_name,
                    data_type,
                    is_nullable,
                    ordinal_position,
                    comment
                FROM catalog_columns
                WHERE dataset_id = :dataset_id
                ORDER BY ordinal_position
            """),
            {"dataset_id": dataset_id}
        )
        columns = [
            {
                "id": col_row.id,
                "name": col_row.column_name,
                "data_type": col_row.data_type,
                "is_nullable": col_row.is_nullable,
                "ordinal_position": col_row.ordinal_position,
                "comment": col_row.comment,
            }
            for col_row in col_result
        ]

        return {
            "id": row.id,
            "source_id": row.source_id,
            "database_name": row.database_name,
            "schema_name": row.schema_name,
            "table_name": row.table_name,
            "table_type": getattr(row, "table_type", "TABLE") or "TABLE",
            "row_count": getattr(row, "row_count", 0) or 0,
            "size_bytes": getattr(row, "size_bytes", 0) or 0,
            "created_at": row.created_at,
            "updated_at": getattr(row, "updated_at", row.created_at),
            "columns": columns,
        }
