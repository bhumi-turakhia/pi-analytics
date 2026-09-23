from __future__ import annotations

import csv
import shutil
import zipfile
from pathlib import Path
from typing import Any, Dict, List


BASE_DIR = Path(__file__).resolve().parent
GENERATED_DIR = BASE_DIR / "generated"


def _write_csv(
    path: Path,
    fieldnames: List[str],
    rows: List[Dict[str, Any]],
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)

    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=fieldnames,
            extrasaction="ignore",
        )
        writer.writeheader()

        for row in rows:
            writer.writerow(
                {
                    field: "" if row.get(field) is None else row.get(field)
                    for field in fieldnames
                }
            )


def build_powerbi_project(
    metrics: List[Dict[str, Any]],
    breakdown: List[Dict[str, Any]],
    records: List[Dict[str, Any]],
    project_name: str = "PI_Analytics_Dashboard",
) -> Path:
    safe_name = "".join(
        character if character.isalnum() or character in ("-", "_")
        else "_"
        for character in (project_name or "PI_Analytics_Dashboard")
    )

    output_root = GENERATED_DIR / safe_name

    if output_root.exists():
        shutil.rmtree(output_root)

    output_root.mkdir(parents=True, exist_ok=True)

    data_dir = output_root / "data"

    _write_csv(
        data_dir / "dashboard_metrics.csv",
        ["metric_name", "metric_value"],
        metrics,
    )

    _write_csv(
        data_dir / "dashboard_breakdown.csv",
        ["category", "metric_name", "metric_value"],
        breakdown,
    )

    _write_csv(
        data_dir / "dashboard_records.csv",
        [
            "record_id",
            "record_name",
            "region",
            "metric_value",
            "created_date",
        ],
        records,
    )

    return output_root


def zip_powerbi_project(project_root: Path) -> Path:
    zip_path = project_root.parent / f"{project_root.name}.zip"

    if zip_path.exists():
        zip_path.unlink()

    with zipfile.ZipFile(
        zip_path,
        "w",
        compression=zipfile.ZIP_DEFLATED,
    ) as archive:
        for file_path in project_root.rglob("*"):
            if file_path.is_file():
                archive.write(
                    file_path,
                    file_path.relative_to(project_root.parent),
                )

    return zip_path
