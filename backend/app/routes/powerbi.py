from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from powerbi.exporter import build_powerbi_project, zip_powerbi_project


router = APIRouter(
    prefix="/api/powerbi",
    tags=["powerbi"],
)


class PowerBIExportPayload(BaseModel):
    metrics: List[Dict[str, Any]] = Field(default_factory=list)
    breakdown: List[Dict[str, Any]] = Field(default_factory=list)
    records: List[Dict[str, Any]] = Field(default_factory=list)
    project_name: Optional[str] = "PI_Analytics_Dashboard"


@router.post("/export")
def export_powerbi(payload: PowerBIExportPayload):
    try:
        project_root = build_powerbi_project(
            metrics=payload.metrics,
            breakdown=payload.breakdown,
            records=payload.records,
            project_name=payload.project_name or "PI_Analytics_Dashboard",
        )

        zip_path = zip_powerbi_project(project_root)

        return FileResponse(
            path=str(zip_path),
            media_type="application/zip",
            filename=f"{project_root.name}.zip",
        )

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Power BI project export failed: {exc}",
        ) from exc
