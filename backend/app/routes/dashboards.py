import json
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import text

from app.database import engine
from connectors import execute_source_query
from app.routes.query import validate_read_only_query, ColumnResponse

router = APIRouter(
    prefix="/api/dashboards",
    tags=["Dashboard Persistence"]
)


class WidgetCreatePayload(BaseModel):
    title: str
    widget_type: str = Field("bar", alias="widgetType")
    source_id: Optional[int] = Field(None, alias="sourceId")
    database_name: Optional[str] = Field(None, alias="databaseName")
    schema_name: Optional[str] = Field(None, alias="schemaName")
    table_name: Optional[str] = Field(None, alias="tableName")
    sql_query: str = Field(..., alias="sqlQuery")
    visualization_spec: Dict[str, Any] = Field(..., alias="visualizationSpec")
    position: Optional[int] = 0
    width: Optional[int] = 6
    height: Optional[int] = 4

    model_config = {"populate_by_name": True}


class DashboardCreatePayload(BaseModel):
    name: str
    source_id: Optional[int] = Field(None, alias="sourceId")

    model_config = {"populate_by_name": True}


class DashboardUpdatePayload(BaseModel):
    name: Optional[str] = None
    source_id: Optional[int] = Field(None, alias="sourceId")

    model_config = {"populate_by_name": True}


class WidgetRunPayload(BaseModel):
    account_identifier: Optional[str] = None
    accountIdentifier: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None
    warehouse: Optional[str] = None
    role: Optional[str] = None
    limit: Optional[int] = 100

    model_config = {"populate_by_name": True}


def _format_dt(val: Any) -> Optional[str]:
    if val is None:
        return None
    if isinstance(val, str):
        return val
    if hasattr(val, "isoformat"):
        return val.isoformat()
    return str(val)


@router.get("", response_model=List[Dict[str, Any]])
def list_dashboards():
    """List all persisted dashboards with widget counts and connected source names."""
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT 
                d.id, 
                d.name, 
                d.source_id, 
                s.name as source_name,
                s.source_type,
                d.created_at, 
                d.updated_at,
                COUNT(w.id) as widget_count
            FROM dashboards d
            LEFT JOIN data_sources s ON d.source_id = s.id
            LEFT JOIN dashboard_widgets w ON d.id = w.dashboard_id
            GROUP BY d.id, d.name, d.source_id, s.name, s.source_type, d.created_at, d.updated_at
            ORDER BY d.id ASC
        """)).fetchall()

        return [
            {
                "id": r.id,
                "name": r.name,
                "source_id": r.source_id,
                "source_name": r.source_name,
                "source_type": r.source_type,
                "created_at": _format_dt(r.created_at),
                "updated_at": _format_dt(r.updated_at),
                "widget_count": int(r.widget_count or 0),
            }
            for r in rows
        ]


@router.post("", status_code=status.HTTP_201_CREATED)
def create_dashboard(payload: DashboardCreatePayload):
    """Create a new analytical dashboard."""
    if not payload.name or not payload.name.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Dashboard name cannot be empty."
        )

    with engine.begin() as conn:
        row = conn.execute(
            text("""
                INSERT INTO dashboards (name, source_id)
                VALUES (:name, :source_id)
                RETURNING id, name, source_id, created_at, updated_at
            """),
            {"name": payload.name.strip(), "source_id": payload.source_id}
        ).fetchone()

        return {
            "id": row.id,
            "name": row.name,
            "source_id": row.source_id,
            "created_at": _format_dt(row.created_at),
            "updated_at": _format_dt(row.updated_at),
            "widgets": [],
        }


@router.get("/{dashboard_id}")
def get_dashboard(dashboard_id: int):
    """Retrieve a dashboard and all its persisted widgets."""
    with engine.connect() as conn:
        d_row = conn.execute(
            text("""
                SELECT d.id, d.name, d.source_id, s.name as source_name, s.source_type, d.created_at, d.updated_at
                FROM dashboards d
                LEFT JOIN data_sources s ON d.source_id = s.id
                WHERE d.id = :id
            """),
            {"id": dashboard_id}
        ).fetchone()

        if not d_row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Dashboard with id {dashboard_id} not found."
            )

        w_rows = conn.execute(
            text("""
                SELECT 
                    id, dashboard_id, title, widget_type, source_id,
                    database_name, schema_name, table_name,
                    sql_query, visualization_spec, position, width, height,
                    created_at, updated_at
                FROM dashboard_widgets
                WHERE dashboard_id = :id
                ORDER BY position ASC, id ASC
            """),
            {"id": dashboard_id}
        ).fetchall()

        widgets = []
        for w in w_rows:
            spec = w.visualization_spec
            if isinstance(spec, str):
                try:
                    spec = json.loads(spec)
                except Exception:
                    spec = {}
            widgets.append({
                "id": w.id,
                "dashboard_id": w.dashboard_id,
                "title": w.title,
                "widget_type": w.widget_type,
                "source_id": w.source_id,
                "database_name": w.database_name,
                "schema_name": w.schema_name,
                "table_name": w.table_name,
                "sql_query": w.sql_query,
                "visualization_spec": spec,
                "position": w.position,
                "width": w.width,
                "height": w.height,
                "created_at": _format_dt(w.created_at),
                "updated_at": _format_dt(w.updated_at),
            })

        return {
            "id": d_row.id,
            "name": d_row.name,
            "source_id": d_row.source_id,
            "source_name": d_row.source_name,
            "source_type": d_row.source_type,
            "created_at": _format_dt(d_row.created_at),
            "updated_at": _format_dt(d_row.updated_at),
            "widgets": widgets,
        }


@router.put("/{dashboard_id}")
def update_dashboard(dashboard_id: int, payload: DashboardUpdatePayload):
    """Update a dashboard's name or linked source."""
    with engine.begin() as conn:
        existing = conn.execute(
            text("SELECT id FROM dashboards WHERE id = :id"),
            {"id": dashboard_id}
        ).fetchone()
        if not existing:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Dashboard with id {dashboard_id} not found."
            )

        updates = []
        params: Dict[str, Any] = {"id": dashboard_id}
        if payload.name is not None:
            updates.append("name = :name")
            params["name"] = payload.name.strip()
        if payload.source_id is not None:
            updates.append("source_id = :source_id")
            params["source_id"] = payload.source_id

        if updates:
            updates.append("updated_at = CURRENT_TIMESTAMP")
            conn.execute(
                text(f"UPDATE dashboards SET {', '.join(updates)} WHERE id = :id"),
                params
            )

    return get_dashboard(dashboard_id)


@router.delete("/{dashboard_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_dashboard(dashboard_id: int):
    """Delete a dashboard and its widgets."""
    with engine.begin() as conn:
        res = conn.execute(
            text("DELETE FROM dashboards WHERE id = :id"),
            {"id": dashboard_id}
        )
        if res.rowcount == 0:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Dashboard with id {dashboard_id} not found."
            )
    return None


@router.post("/{dashboard_id}/widgets", status_code=status.HTTP_201_CREATED)
def add_widget(dashboard_id: int, payload: WidgetCreatePayload):
    """
    Add a widget with query and visualization specification to a dashboard.
    Enforces read-only safety on the stored SQL.
    Does NOT store credentials.
    """
    # 1. Verify dashboard exists
    with engine.connect() as conn:
        d_row = conn.execute(
            text("SELECT id, source_id FROM dashboards WHERE id = :id"),
            {"id": dashboard_id}
        ).fetchone()
        if not d_row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Dashboard with id {dashboard_id} not found."
            )

    # 2. Validate read-only query
    validate_read_only_query(payload.sql_query)

    # 3. Insert widget
    source_id = payload.source_id or d_row.source_id
    spec_json = json.dumps(payload.visualization_spec)
    cast_clause = "CAST(:visualization_spec AS jsonb)" if engine.dialect.name != "sqlite" else ":visualization_spec"

    with engine.begin() as conn:
        w_row = conn.execute(
            text(f"""
                INSERT INTO dashboard_widgets (
                    dashboard_id, title, widget_type, source_id,
                    database_name, schema_name, table_name,
                    sql_query, visualization_spec, position, width, height
                )
                VALUES (
                    :dashboard_id, :title, :widget_type, :source_id,
                    :database_name, :schema_name, :table_name,
                    :sql_query, {cast_clause}, :position, :width, :height
                )
                RETURNING 
                    id, dashboard_id, title, widget_type, source_id,
                    database_name, schema_name, table_name,
                    sql_query, visualization_spec, position, width, height,
                    created_at, updated_at
            """),
            {
                "dashboard_id": dashboard_id,
                "title": payload.title.strip(),
                "widget_type": payload.widget_type.strip(),
                "source_id": source_id,
                "database_name": payload.database_name,
                "schema_name": payload.schema_name,
                "table_name": payload.table_name,
                "sql_query": payload.sql_query.strip(),
                "visualization_spec": spec_json,
                "position": payload.position or 0,
                "width": payload.width or 6,
                "height": payload.height or 4,
            }
        ).fetchone()

        spec = w_row.visualization_spec
        if isinstance(spec, str):
            try:
                spec = json.loads(spec)
            except Exception:
                spec = {}

        return {
            "id": w_row.id,
            "dashboard_id": w_row.dashboard_id,
            "title": w_row.title,
            "widget_type": w_row.widget_type,
            "source_id": w_row.source_id,
            "database_name": w_row.database_name,
            "schema_name": w_row.schema_name,
            "table_name": w_row.table_name,
            "sql_query": w_row.sql_query,
            "visualization_spec": spec,
            "position": w_row.position,
            "width": w_row.width,
            "height": w_row.height,
            "created_at": _format_dt(w_row.created_at),
            "updated_at": _format_dt(w_row.updated_at),
        }


@router.delete("/{dashboard_id}/widgets/{widget_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_widget(dashboard_id: int, widget_id: int):
    """Delete a widget from a dashboard."""
    with engine.begin() as conn:
        res = conn.execute(
            text("DELETE FROM dashboard_widgets WHERE id = :wid AND dashboard_id = :did"),
            {"wid": widget_id, "did": dashboard_id}
        )
        if res.rowcount == 0:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Widget with id {widget_id} not found on dashboard {dashboard_id}."
            )
    return None


@router.post("/{dashboard_id}/widgets/{widget_id}/run")
def run_widget_query(dashboard_id: int, widget_id: int, payload: WidgetRunPayload):
    """
    Re-execute the saved widget query using ephemeral credentials.
    Returns real rows and columns from the data source without persisting any credentials.
    """
    with engine.connect() as conn:
        w_row = conn.execute(
            text("""
                SELECT w.id, w.sql_query, w.source_id, w.database_name, w.schema_name, s.source_type
                FROM dashboard_widgets w
                LEFT JOIN data_sources s ON w.source_id = s.id
                WHERE w.id = :wid AND w.dashboard_id = :did
            """),
            {"wid": widget_id, "did": dashboard_id}
        ).fetchone()

        if not w_row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Widget with id {widget_id} not found on dashboard {dashboard_id}."
            )

    source_type = (w_row.source_type or "snowflake").strip().lower()
    validate_read_only_query(w_row.sql_query)

    account = payload.account_identifier or payload.accountIdentifier
    config = {
        "account_identifier": account,
        "username": payload.username,
        "password": payload.password,
        "warehouse": payload.warehouse,
        "database": w_row.database_name,
        "schema": w_row.schema_name,
        "role": payload.role,
    }

    result = execute_source_query(
        source_type=source_type,
        config=config,
        query=w_row.sql_query,
        timeout_seconds=30,
        limit=payload.limit or 100,
    )

    if not result.success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=result.error or result.message or "Failed to execute saved widget query."
        )

    return {
        "success": True,
        "widget_id": widget_id,
        "columns": [c.name for c in result.columns],
        "rows": result.rows,
        "row_count": result.row_count,
        "execution_time_ms": result.execution_time_ms,
    }

class VersionCreatePayload(BaseModel):
    change_summary: Optional[str] = Field(None, alias="changeSummary")
    created_by: Optional[str] = Field(None, alias="createdBy")

    model_config = {"populate_by_name": True}


def _snapshot_dashboard(conn, dashboard_id: int) -> Dict[str, Any]:
    """Capture the current dashboard and widgets as a version snapshot."""
    dashboard = conn.execute(
        text("""
            SELECT id, name, source_id
            FROM dashboards
            WHERE id = :id
        """),
        {"id": dashboard_id}
    ).fetchone()

    if not dashboard:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Dashboard with id {dashboard_id} not found."
        )

    widget_rows = conn.execute(
        text("""
            SELECT
                id, dashboard_id, title, widget_type, source_id,
                database_name, schema_name, table_name,
                sql_query, visualization_spec, position, width, height
            FROM dashboard_widgets
            WHERE dashboard_id = :dashboard_id
            ORDER BY position ASC, id ASC
        """),
        {"dashboard_id": dashboard_id}
    ).fetchall()

    widgets = []

    for w in widget_rows:
        spec = w.visualization_spec

        if isinstance(spec, str):
            try:
                spec = json.loads(spec)
            except Exception:
                spec = {}

        widgets.append({
            "id": w.id,
            "dashboard_id": w.dashboard_id,
            "title": w.title,
            "widget_type": w.widget_type,
            "source_id": w.source_id,
            "database_name": w.database_name,
            "schema_name": w.schema_name,
            "table_name": w.table_name,
            "sql_query": w.sql_query,
            "visualization_spec": spec,
            "position": w.position,
            "width": w.width,
            "height": w.height,
        })

    return {
        "dashboard_name": dashboard.name,
        "source_id": dashboard.source_id,
        "widgets": widgets,
    }


@router.post("/{dashboard_id}/versions")
def create_dashboard_version(
    dashboard_id: int,
    payload: VersionCreatePayload = VersionCreatePayload()
):
    """Create a version snapshot of the current dashboard state."""
    with engine.begin() as conn:
        snapshot = _snapshot_dashboard(conn, dashboard_id)

        latest = conn.execute(
            text("""
                SELECT COALESCE(MAX(version_number), 0) AS version_number
                FROM dashboard_versions
                WHERE dashboard_id = :dashboard_id
            """),
            {"dashboard_id": dashboard_id}
        ).fetchone()

        next_version = int(latest.version_number or 0) + 1

        widgets_json = json.dumps(snapshot["widgets"])

        row = conn.execute(
            text("""
                INSERT INTO dashboard_versions (
                    dashboard_id,
                    version_number,
                    dashboard_name,
                    source_id,
                    widgets,
                    created_by,
                    change_summary
                )
                VALUES (
                    :dashboard_id,
                    :version_number,
                    :dashboard_name,
                    :source_id,
                    CAST(:widgets AS jsonb),
                    :created_by,
                    :change_summary
                )
                RETURNING
                    id,
                    dashboard_id,
                    version_number,
                    dashboard_name,
                    source_id,
                    widgets,
                    created_at,
                    created_by,
                    change_summary
            """),
            {
                "dashboard_id": dashboard_id,
                "version_number": next_version,
                "dashboard_name": snapshot["dashboard_name"],
                "source_id": snapshot["source_id"],
                "widgets": widgets_json,
                "created_by": payload.created_by,
                "change_summary": payload.change_summary,
            }
        ).fetchone()

        return {
            "id": row.id,
            "dashboard_id": row.dashboard_id,
            "version_number": row.version_number,
            "dashboard_name": row.dashboard_name,
            "source_id": row.source_id,
            "widgets": row.widgets,
            "created_at": _format_dt(row.created_at),
            "created_by": row.created_by,
            "change_summary": row.change_summary,
        }


@router.get("/{dashboard_id}/versions")
def list_dashboard_versions(dashboard_id: int):
    """List saved dashboard versions from newest to oldest."""
    with engine.connect() as conn:
        dashboard = conn.execute(
            text("SELECT id FROM dashboards WHERE id = :id"),
            {"id": dashboard_id}
        ).fetchone()

        if not dashboard:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Dashboard with id {dashboard_id} not found."
            )

        rows = conn.execute(
            text("""
                SELECT
                    id,
                    dashboard_id,
                    version_number,
                    dashboard_name,
                    source_id,
                    created_at,
                    created_by,
                    change_summary,
                    jsonb_array_length(widgets) AS widget_count
                FROM dashboard_versions
                WHERE dashboard_id = :dashboard_id
                ORDER BY version_number DESC
            """),
            {"dashboard_id": dashboard_id}
        ).fetchall()

        return [
            {
                "id": r.id,
                "dashboard_id": r.dashboard_id,
                "version_number": r.version_number,
                "dashboard_name": r.dashboard_name,
                "source_id": r.source_id,
                "created_at": _format_dt(r.created_at),
                "created_by": r.created_by,
                "change_summary": r.change_summary,
                "widget_count": int(r.widget_count or 0),
            }
            for r in rows
        ]


@router.get("/{dashboard_id}/versions/{version_number}")
def get_dashboard_version(dashboard_id: int, version_number: int):
    """Retrieve a complete dashboard version snapshot."""
    with engine.connect() as conn:
        row = conn.execute(
            text("""
                SELECT
                    id,
                    dashboard_id,
                    version_number,
                    dashboard_name,
                    source_id,
                    widgets,
                    created_at,
                    created_by,
                    change_summary
                FROM dashboard_versions
                WHERE dashboard_id = :dashboard_id
                  AND version_number = :version_number
            """),
            {
                "dashboard_id": dashboard_id,
                "version_number": version_number,
            }
        ).fetchone()

        if not row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Version {version_number} not found for dashboard {dashboard_id}."
            )

        return {
            "id": row.id,
            "dashboard_id": row.dashboard_id,
            "version_number": row.version_number,
            "dashboard_name": row.dashboard_name,
            "source_id": row.source_id,
            "widgets": row.widgets,
            "created_at": _format_dt(row.created_at),
            "created_by": row.created_by,
            "change_summary": row.change_summary,
        }


@router.post("/{dashboard_id}/versions/{version_number}/restore")
def restore_dashboard_version(dashboard_id: int, version_number: int):
    """Restore a dashboard and its widgets from a saved version."""
    with engine.begin() as conn:
        version = conn.execute(
            text("""
                SELECT
                    dashboard_name,
                    source_id,
                    widgets
                FROM dashboard_versions
                WHERE dashboard_id = :dashboard_id
                  AND version_number = :version_number
            """),
            {
                "dashboard_id": dashboard_id,
                "version_number": version_number,
            }
        ).fetchone()

        if not version:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Version {version_number} not found for dashboard {dashboard_id}."
            )

        dashboard = conn.execute(
            text("SELECT id FROM dashboards WHERE id = :id"),
            {"id": dashboard_id}
        ).fetchone()

        if not dashboard:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Dashboard with id {dashboard_id} not found."
            )

        # Save the current state before restoring the older version.
        current = _snapshot_dashboard(conn, dashboard_id)

        latest = conn.execute(
            text("""
                SELECT COALESCE(MAX(version_number), 0) AS version_number
                FROM dashboard_versions
                WHERE dashboard_id = :dashboard_id
            """),
            {"dashboard_id": dashboard_id}
        ).fetchone()

        restore_version_number = int(latest.version_number or 0) + 1

        conn.execute(
            text("""
                INSERT INTO dashboard_versions (
                    dashboard_id,
                    version_number,
                    dashboard_name,
                    source_id,
                    widgets,
                    change_summary
                )
                VALUES (
                    :dashboard_id,
                    :version_number,
                    :dashboard_name,
                    :source_id,
                    CAST(:widgets AS jsonb),
                    :change_summary
                )
            """),
            {
                "dashboard_id": dashboard_id,
                "version_number": restore_version_number,
                "dashboard_name": current["dashboard_name"],
                "source_id": current["source_id"],
                "widgets": json.dumps(current["widgets"]),
                "change_summary": f"Automatic snapshot before restoring version {version_number}",
            }
        )

        conn.execute(
            text("""
                UPDATE dashboards
                SET
                    name = :name,
                    source_id = :source_id,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = :dashboard_id
            """),
            {
                "dashboard_id": dashboard_id,
                "name": version.dashboard_name,
                "source_id": version.source_id,
            }
        )

        conn.execute(
            text("DELETE FROM dashboard_widgets WHERE dashboard_id = :dashboard_id"),
            {"dashboard_id": dashboard_id}
        )

        widgets = version.widgets or []

        if isinstance(widgets, str):
            widgets = json.loads(widgets)

        for widget in widgets:
            validate_read_only_query(widget["sql_query"])

            conn.execute(
                text("""
                    INSERT INTO dashboard_widgets (
                        dashboard_id,
                        title,
                        widget_type,
                        source_id,
                        database_name,
                        schema_name,
                        table_name,
                        sql_query,
                        visualization_spec,
                        position,
                        width,
                        height
                    )
                    VALUES (
                        :dashboard_id,
                        :title,
                        :widget_type,
                        :source_id,
                        :database_name,
                        :schema_name,
                        :table_name,
                        :sql_query,
                        CAST(:visualization_spec AS jsonb),
                        :position,
                        :width,
                        :height
                    )
                """),
                {
                    "dashboard_id": dashboard_id,
                    "title": widget["title"],
                    "widget_type": widget["widget_type"],
                    "source_id": widget.get("source_id"),
                    "database_name": widget.get("database_name"),
                    "schema_name": widget.get("schema_name"),
                    "table_name": widget.get("table_name"),
                    "sql_query": widget["sql_query"],
                    "visualization_spec": json.dumps(
                        widget.get("visualization_spec") or {}
                    ),
                    "position": widget.get("position", 0),
                    "width": widget.get("width", 6),
                    "height": widget.get("height", 4),
                }
            )

    return {
        "success": True,
        "dashboard_id": dashboard_id,
        "restored_version": version_number,
        "message": f"Dashboard restored to version {version_number}.",
    }
