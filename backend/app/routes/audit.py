"""
P0-4: Real Audit Trail API

All audit events are persisted to the audit_events PostgreSQL table and
surfaced through this router. Credentials are never logged.
"""
import csv
import io
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import text

from app.database import engine

router = APIRouter(
    prefix="/api/audit",
    tags=["Audit Trail"]
)


def _row_to_dict(r: Any) -> Dict[str, Any]:
    return {
        "id": r.id,
        "timestamp": r.timestamp.isoformat() if hasattr(r.timestamp, "isoformat") else str(r.timestamp),
        "actor": r.actor or "analyst",
        "action_type": r.action_type,
        "question": r.question,
        "generated_sql": r.generated_sql,
        "status": r.status,
        "rows_returned": r.rows_returned,
        "execution_time_ms": r.execution_time_ms,
        "visualization_type": r.visualization_type,
        "source_id": r.source_id,
        "dashboard_id": r.dashboard_id,
        "widget_id": r.widget_id,
        "export_type": r.export_type,
        "error_message": r.error_message,
    }


@router.get("/events", response_model=List[Dict[str, Any]])
def list_audit_events(
    limit: int = Query(200, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    action_type: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
):
    """
    Return real audit events from PostgreSQL, newest first.
    Credentials are never stored and never returned here.
    """
    conditions = []
    params: Dict[str, Any] = {"limit": limit, "offset": offset}

    if action_type:
        conditions.append("action_type = :action_type")
        params["action_type"] = action_type
    if status:
        conditions.append("status = :status")
        params["status"] = status

    where_clause = ("WHERE " + " AND ".join(conditions)) if conditions else ""

    with engine.connect() as conn:
        rows = conn.execute(
            text(f"""
                SELECT
                    id, timestamp, actor, action_type, question, generated_sql,
                    status, rows_returned, execution_time_ms, visualization_type,
                    source_id, dashboard_id, widget_id, export_type, error_message
                FROM audit_events
                {where_clause}
                ORDER BY timestamp DESC
                LIMIT :limit OFFSET :offset
            """),
            params
        ).fetchall()

    return [_row_to_dict(r) for r in rows]


@router.get("/events/export")
def export_audit_csv():
    """
    Export all audit events as a CSV file. Credentials are never included.
    """
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT
                id, timestamp, actor, action_type, question,
                status, rows_returned, execution_time_ms, visualization_type,
                source_id, dashboard_id, widget_id, export_type, error_message
            FROM audit_events
            ORDER BY timestamp DESC
            LIMIT 10000
        """)).fetchall()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "id", "timestamp", "actor", "action_type", "question",
        "status", "rows_returned", "execution_time_ms", "visualization_type",
        "source_id", "dashboard_id", "widget_id", "export_type", "error_message"
    ])
    for r in rows:
        ts = r.timestamp.isoformat() if hasattr(r.timestamp, "isoformat") else str(r.timestamp)
        writer.writerow([
            r.id, ts, r.actor or "analyst", r.action_type,
            r.question or "", r.status,
            r.rows_returned or 0, r.execution_time_ms or 0,
            r.visualization_type or "", r.source_id or "",
            r.dashboard_id or "", r.widget_id or "",
            r.export_type or "", r.error_message or "",
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=pi-analytics-audit.csv"},
    )


def log_audit_event(
    action_type: str,
    status: str = "success",
    question: Optional[str] = None,
    generated_sql: Optional[str] = None,
    rows_returned: int = 0,
    execution_time_ms: int = 0,
    visualization_type: Optional[str] = None,
    source_id: Optional[int] = None,
    dashboard_id: Optional[int] = None,
    widget_id: Optional[int] = None,
    export_type: Optional[str] = None,
    error_message: Optional[str] = None,
    actor: str = "analyst",
) -> None:
    """
    Insert a real audit event into PostgreSQL.
    SECURITY: Never pass credentials (password, account details) to this function.
    Only analytics metadata is logged.
    """
    try:
        with engine.begin() as conn:
            conn.execute(
                text("""
                    INSERT INTO audit_events (
                        actor, action_type, question, generated_sql,
                        status, rows_returned, execution_time_ms, visualization_type,
                        source_id, dashboard_id, widget_id, export_type, error_message
                    ) VALUES (
                        :actor, :action_type, :question, :generated_sql,
                        :status, :rows_returned, :execution_time_ms, :visualization_type,
                        :source_id, :dashboard_id, :widget_id, :export_type, :error_message
                    )
                """),
                {
                    "actor": actor,
                    "action_type": action_type,
                    "question": question,
                    "generated_sql": generated_sql,
                    "status": status,
                    "rows_returned": rows_returned,
                    "execution_time_ms": execution_time_ms,
                    "visualization_type": visualization_type,
                    "source_id": source_id,
                    "dashboard_id": dashboard_id,
                    "widget_id": widget_id,
                    "export_type": export_type,
                    "error_message": error_message,
                }
            )
    except Exception as e:
        # Audit logging must never crash the main application flow
        print(f"[AUDIT] Failed to log event: {e}")
