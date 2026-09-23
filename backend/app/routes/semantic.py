"""
P0-2: Semantic / Business Intelligence Layer

Provides business context (metrics, dimensions, KPI definitions) on top of
physical catalog metadata. The Copilot uses this to generate better SQL by
understanding business meaning (e.g. "Total Revenue" = SUM of SALES.REVENUE).

This is a DATA description layer, NOT a hardcoded question-answer dictionary.
"""
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import text

from app.database import engine

router = APIRouter(
    prefix="/api/semantic",
    tags=["Semantic / BI Layer"]
)


# ─────────────────────────────────────────────────────────────
# Pydantic Models
# ─────────────────────────────────────────────────────────────

class SemanticMetricCreate(BaseModel):
    source_id: int
    name: str
    label: Optional[str] = None
    description: Optional[str] = None
    source_table: Optional[str] = None
    source_column: Optional[str] = None
    aggregation: Optional[str] = "SUM"
    format_hint: Optional[str] = "number"


class SemanticDimensionCreate(BaseModel):
    source_id: int
    name: str
    label: Optional[str] = None
    description: Optional[str] = None
    source_table: Optional[str] = None
    source_column: Optional[str] = None
    data_type: Optional[str] = None


# ─────────────────────────────────────────────────────────────
# Metrics Endpoints
# ─────────────────────────────────────────────────────────────

@router.get("/metrics", response_model=List[Dict[str, Any]])
def list_metrics(source_id: Optional[int] = Query(None)):
    """Return all semantic metric definitions for a source."""
    with engine.connect() as conn:
        params: Dict[str, Any] = {}
        where = ""
        if source_id is not None:
            where = "WHERE source_id = :source_id"
            params["source_id"] = source_id
        rows = conn.execute(
            text(f"""
                SELECT id, source_id, name, label, description,
                       source_table, source_column, aggregation, format_hint,
                       created_at, updated_at
                FROM semantic_metrics
                {where}
                ORDER BY name
            """),
            params
        ).fetchall()

    return [
        {
            "id": r.id,
            "source_id": r.source_id,
            "name": r.name,
            "label": r.label,
            "description": r.description,
            "source_table": r.source_table,
            "source_column": r.source_column,
            "aggregation": r.aggregation,
            "format_hint": r.format_hint,
            "created_at": r.created_at.isoformat() if hasattr(r.created_at, "isoformat") else str(r.created_at),
            "updated_at": r.updated_at.isoformat() if hasattr(r.updated_at, "isoformat") else str(r.updated_at),
        }
        for r in rows
    ]


@router.post("/metrics", status_code=status.HTTP_201_CREATED)
def create_metric(payload: SemanticMetricCreate):
    """Create or upsert a semantic metric definition."""
    with engine.begin() as conn:
        row = conn.execute(
            text("""
                INSERT INTO semantic_metrics (
                    source_id, name, label, description,
                    source_table, source_column, aggregation, format_hint
                )
                VALUES (
                    :source_id, :name, :label, :description,
                    :source_table, :source_column, :aggregation, :format_hint
                )
                ON CONFLICT ON CONSTRAINT uq_semantic_metrics_source_name
                DO UPDATE SET
                    label = EXCLUDED.label,
                    description = EXCLUDED.description,
                    source_table = EXCLUDED.source_table,
                    source_column = EXCLUDED.source_column,
                    aggregation = EXCLUDED.aggregation,
                    format_hint = EXCLUDED.format_hint,
                    updated_at = CURRENT_TIMESTAMP
                RETURNING id, source_id, name, label, description,
                          source_table, source_column, aggregation, format_hint,
                          created_at, updated_at
            """),
            {
                "source_id": payload.source_id,
                "name": payload.name,
                "label": payload.label,
                "description": payload.description,
                "source_table": payload.source_table,
                "source_column": payload.source_column,
                "aggregation": payload.aggregation or "SUM",
                "format_hint": payload.format_hint or "number",
            }
        ).fetchone()
    return {
        "id": row.id,
        "source_id": row.source_id,
        "name": row.name,
        "label": row.label,
        "description": row.description,
        "source_table": row.source_table,
        "source_column": row.source_column,
        "aggregation": row.aggregation,
        "format_hint": row.format_hint,
    }


@router.delete("/metrics/{metric_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_metric(metric_id: int):
    """Delete a semantic metric definition."""
    with engine.begin() as conn:
        res = conn.execute(
            text("DELETE FROM semantic_metrics WHERE id = :id"),
            {"id": metric_id}
        )
        if res.rowcount == 0:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Metric {metric_id} not found."
            )
    return None


# ─────────────────────────────────────────────────────────────
# Dimensions Endpoints
# ─────────────────────────────────────────────────────────────

@router.get("/dimensions", response_model=List[Dict[str, Any]])
def list_dimensions(source_id: Optional[int] = Query(None)):
    """Return all semantic dimension definitions for a source."""
    with engine.connect() as conn:
        params: Dict[str, Any] = {}
        where = ""
        if source_id is not None:
            where = "WHERE source_id = :source_id"
            params["source_id"] = source_id
        rows = conn.execute(
            text(f"""
                SELECT id, source_id, name, label, description,
                       source_table, source_column, data_type,
                       created_at, updated_at
                FROM semantic_dimensions
                {where}
                ORDER BY name
            """),
            params
        ).fetchall()

    return [
        {
            "id": r.id,
            "source_id": r.source_id,
            "name": r.name,
            "label": r.label,
            "description": r.description,
            "source_table": r.source_table,
            "source_column": r.source_column,
            "data_type": r.data_type,
            "created_at": r.created_at.isoformat() if hasattr(r.created_at, "isoformat") else str(r.created_at),
            "updated_at": r.updated_at.isoformat() if hasattr(r.updated_at, "isoformat") else str(r.updated_at),
        }
        for r in rows
    ]


@router.post("/dimensions", status_code=status.HTTP_201_CREATED)
def create_dimension(payload: SemanticDimensionCreate):
    """Create or upsert a semantic dimension definition."""
    with engine.begin() as conn:
        row = conn.execute(
            text("""
                INSERT INTO semantic_dimensions (
                    source_id, name, label, description,
                    source_table, source_column, data_type
                )
                VALUES (
                    :source_id, :name, :label, :description,
                    :source_table, :source_column, :data_type
                )
                ON CONFLICT ON CONSTRAINT uq_semantic_dimensions_source_name
                DO UPDATE SET
                    label = EXCLUDED.label,
                    description = EXCLUDED.description,
                    source_table = EXCLUDED.source_table,
                    source_column = EXCLUDED.source_column,
                    data_type = EXCLUDED.data_type,
                    updated_at = CURRENT_TIMESTAMP
                RETURNING id, source_id, name, label, description,
                          source_table, source_column, data_type,
                          created_at, updated_at
            """),
            {
                "source_id": payload.source_id,
                "name": payload.name,
                "label": payload.label,
                "description": payload.description,
                "source_table": payload.source_table,
                "source_column": payload.source_column,
                "data_type": payload.data_type,
            }
        ).fetchone()
    return {
        "id": row.id,
        "source_id": row.source_id,
        "name": row.name,
        "label": row.label,
        "description": row.description,
        "source_table": row.source_table,
        "source_column": row.source_column,
        "data_type": row.data_type,
    }


@router.delete("/dimensions/{dim_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_dimension(dim_id: int):
    """Delete a semantic dimension definition."""
    with engine.begin() as conn:
        res = conn.execute(
            text("DELETE FROM semantic_dimensions WHERE id = :id"),
            {"id": dim_id}
        )
        if res.rowcount == 0:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Dimension {dim_id} not found."
            )
    return None


# ─────────────────────────────────────────────────────────────
# Auto-populate semantic layer from physical catalog
# ─────────────────────────────────────────────────────────────

@router.post("/populate-from-catalog/{source_id}")
def populate_semantic_from_catalog(source_id: int):
    """
    Auto-populate the semantic layer from physical catalog metadata.
    Infers metrics (numeric columns) and dimensions (categorical/date columns).
    This is generic — it does NOT hardcode questions or business logic.
    Only populates entries that don't already exist.
    """
    with engine.connect() as conn:
        src = conn.execute(
            text("SELECT id FROM data_sources WHERE id = :id"),
            {"id": source_id}
        ).fetchone()
        if not src:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Data source {source_id} not found."
            )

        rows = conn.execute(
            text("""
                SELECT d.table_name, c.column_name, c.data_type
                FROM datasets d
                JOIN catalog_columns c ON d.id = c.dataset_id
                WHERE d.source_id = :sid
                ORDER BY d.table_name, c.ordinal_position
            """),
            {"sid": source_id}
        ).fetchall()

    metrics_added = 0
    dimensions_added = 0

    NUMERIC_TYPES = ("INT", "NUM", "FLOAT", "DOUBLE", "DECIMAL", "REAL", "BIGINT", "MONEY", "NUMBER")
    DATE_TYPES = ("DATE", "TIME", "TIMESTAMP")
    ID_SUFFIXES = ("_id", "_key", "_code", "_zip", "_num")

    with engine.begin() as conn:
        for r in rows:
            col_name = r.column_name
            dt_upper = r.data_type.upper()
            col_lower = col_name.lower()
            table_name = r.table_name

            # Infer metric: numeric column that is not an identifier
            is_numeric = any(t in dt_upper for t in NUMERIC_TYPES)
            is_id_col = any(col_lower.endswith(s) for s in ID_SUFFIXES)

            if is_numeric and not is_id_col:
                agg = "SUM"
                fmt = "currency" if any(k in col_lower for k in ("revenue", "amount", "price", "cost", "sales", "total")) else "number"
                metric_name = f"{table_name}.{col_name}"
                metric_label = col_name.replace("_", " ").title()
                conn.execute(text("""
                    INSERT INTO semantic_metrics
                        (source_id, name, label, source_table, source_column, aggregation, format_hint)
                    VALUES
                        (:sid, :name, :label, :table, :col, :agg, :fmt)
                    ON CONFLICT ON CONSTRAINT uq_semantic_metrics_source_name DO NOTHING
                """), {
                    "sid": source_id,
                    "name": metric_name,
                    "label": metric_label,
                    "table": table_name,
                    "col": col_name,
                    "agg": agg,
                    "fmt": fmt,
                })
                metrics_added += 1
            else:
                # Infer dimension: categorical or date column
                is_date = any(t in dt_upper for t in DATE_TYPES)
                is_date |= any(k in col_lower for k in ("month", "year", "quarter", "period"))
                dim_name = f"{table_name}.{col_name}"
                dim_label = col_name.replace("_", " ").title()
                conn.execute(text("""
                    INSERT INTO semantic_dimensions
                        (source_id, name, label, source_table, source_column, data_type)
                    VALUES
                        (:sid, :name, :label, :table, :col, :dtype)
                    ON CONFLICT ON CONSTRAINT uq_semantic_dimensions_source_name DO NOTHING
                """), {
                    "sid": source_id,
                    "name": dim_name,
                    "label": dim_label,
                    "table": table_name,
                    "col": col_name,
                    "dtype": r.data_type,
                })
                dimensions_added += 1

    return {
        "source_id": source_id,
        "metrics_added": metrics_added,
        "dimensions_added": dimensions_added,
    }


# ─────────────────────────────────────────────────────────────
# Helper for Copilot: Get semantic context as prompt string
# ─────────────────────────────────────────────────────────────

def get_semantic_context_for_prompt(source_id: int) -> str:
    """
    Returns a compact text representation of semantic metrics and dimensions
    for inclusion in the Gemini SQL generation prompt.
    """
    try:
        with engine.connect() as conn:
            metrics = conn.execute(
                text("""
                    SELECT name, label, source_table, source_column, aggregation, format_hint
                    FROM semantic_metrics
                    WHERE source_id = :sid
                    ORDER BY name
                    LIMIT 50
                """),
                {"sid": source_id}
            ).fetchall()

            dimensions = conn.execute(
                text("""
                    SELECT name, label, source_table, source_column, data_type
                    FROM semantic_dimensions
                    WHERE source_id = :sid
                    ORDER BY name
                    LIMIT 100
                """),
                {"sid": source_id}
            ).fetchall()

        if not metrics and not dimensions:
            return ""

        lines = ["Business Intelligence / Semantic Layer:"]
        if metrics:
            lines.append("  Metrics (pre-defined aggregations):")
            for m in metrics:
                fmt = f" [{m.format_hint}]" if m.format_hint else ""
                lines.append(f"    - {m.label or m.name}: {m.aggregation}({m.source_table}.{m.source_column}){fmt}")
        if dimensions:
            lines.append("  Dimensions (grouping/filter columns):")
            for d in dimensions:
                lines.append(f"    - {d.label or d.name}: {d.source_table}.{d.source_column} ({d.data_type})")

        return "\n".join(lines)
    except Exception:
        return ""
