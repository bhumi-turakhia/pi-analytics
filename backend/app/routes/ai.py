"""
Step 10 – AI Analytics Copilot endpoint.

POST /api/ai/copilot
    Accepts a natural-language prompt + dashboard context, grounds the
    prompt with real catalog metadata from PostgreSQL, calls Google
    Gemini to produce a structured analytics response, and returns it.

    When GEMINI_API_KEY is absent or invalid the endpoint returns HTTP 503
    so the frontend can fall back to its client-side simulation gracefully.
"""
import json
import os
import re
import time
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import text

from app.database import engine

router = APIRouter(prefix="/api/ai", tags=["AI Copilot"])

# ─────────────────────────────────────────────
# Pydantic models
# ─────────────────────────────────────────────

class DashboardKPIContext(BaseModel):
    id: str
    label: str
    value: str
    change: str
    isPositive: bool


class DashboardChartContext(BaseModel):
    id: str
    title: str
    chartType: str
    unit: str


class DashboardContext(BaseModel):
    sourceId: Optional[str] = None
    sourceName: Optional[str] = None
    platform: Optional[str] = "snowflake"
    title: Optional[str] = None
    activeFilter: Optional[str] = None
    kpis: Optional[List[DashboardKPIContext]] = []
    primaryChart: Optional[DashboardChartContext] = None
    secondaryChart: Optional[DashboardChartContext] = None
    lastPromptExecuted: Optional[str] = None


class CopilotRequest(BaseModel):
    source_id: Optional[int] = None
    source_name: Optional[str] = None
    platform: Optional[str] = "snowflake"
    prompt: str
    dashboard_context: Optional[DashboardContext] = None
    catalog_context: Optional[List[str]] = None  # table names already known client-side


class DashboardMutation(BaseModel):
    """
    Partial update the frontend should apply to its DashboardState.
    All fields are optional — only populated fields are mutated.
    """
    subtitle: Optional[str] = None
    insights: Optional[List[str]] = None
    primary_chart_title: Optional[str] = None
    secondary_chart_title: Optional[str] = None


class CopilotResponse(BaseModel):
    success: bool
    explanation: str
    sql_query: Optional[str] = None
    applied_changes: List[str] = []
    suggested_follow_ups: List[str] = []
    dashboard_mutation: Optional[DashboardMutation] = None
    model_used: Optional[str] = None
    latency_ms: Optional[int] = None
    error: Optional[str] = None


# ─────────────────────────────────────────────
# Catalog helper
# ─────────────────────────────────────────────

def _fetch_catalog_tables(source_id: Optional[int], limit: int = 30) -> List[str]:
    """Return fully-qualified table names from datasets table in PostgreSQL."""
    if not source_id:
        return []
    try:
        with engine.connect() as conn:
            rows = conn.execute(
                text("""
                    SELECT database_name, schema_name, table_name
                    FROM datasets
                    WHERE source_id = :sid
                    ORDER BY id
                    LIMIT :lim
                """),
                {"sid": source_id, "lim": limit},
            ).fetchall()
        return [
            f"{r.database_name}.{r.schema_name}.{r.table_name}"
            for r in rows
            if r.database_name and r.schema_name and r.table_name
        ]
    except Exception:
        return []


# ─────────────────────────────────────────────
# Prompt builder
# ─────────────────────────────────────────────

_SYSTEM_PROMPT = """\
You are Pi Analytics AI Copilot, an expert data analyst embedded in an enterprise analytics platform.
You will receive a natural-language prompt from a user who is viewing a live analytics dashboard connected to a {platform} data warehouse.

Your job:
1. Interpret the analytical intent of the prompt.
2. Generate a SQL query that would answer the question, using the provided real table names where possible.
3. Describe what dashboard changes you are applying.
4. Return a clean, structured JSON object — no markdown fences, no prose outside the JSON.

Dashboard context:
  Source: {source_name}
  Platform: {platform}
  Current KPIs: {kpi_summary}
  Active filter: {active_filter}
  Available tables: {tables}

Respond with ONLY a valid JSON object matching this exact schema:
{{
  "explanation": "<1-3 sentence plain-English summary of what you are doing>",
  "sql_query": "<runnable SQL SELECT query grounded to the real tables above; use double-quoted identifiers>",
  "applied_changes": ["<short bullet 1>", "<short bullet 2>"],
  "suggested_follow_ups": ["<follow-up question 1>", "<follow-up question 2>", "<follow-up question 3>"],
  "dashboard_mutation": {{
    "subtitle": "<optional updated subtitle for the dashboard>",
    "insights": ["<insight 1>", "<insight 2>", "<insight 3>"],
    "primary_chart_title": "<optional new title for the primary chart>",
    "secondary_chart_title": "<optional new title for the secondary chart>"
  }}
}}

Rules:
- The sql_query MUST start with SELECT or WITH.
- Do not include INSERT, UPDATE, DELETE, DROP, ALTER, or any mutating statement.
- Keep explanations concise and analytical in tone.
- suggested_follow_ups must be actionable analytical questions, not generic.
- All JSON values must be properly escaped strings.
"""


def _build_prompt(req: CopilotRequest, tables: List[str]) -> str:
    ctx = req.dashboard_context
    kpi_summary = ""
    active_filter = "All Time"

    if ctx:
        if ctx.kpis:
            kpi_summary = "; ".join(
                f"{k.label}: {k.value} ({k.change})" for k in ctx.kpis[:4]
            )
        if ctx.activeFilter:
            active_filter = ctx.activeFilter

    table_list = "\n".join(f"  - {t}" for t in tables) if tables else "  (No catalog metadata available — use generic analytics SQL)"

    system = _SYSTEM_PROMPT.format(
        platform=(req.platform or "snowflake").upper(),
        source_name=req.source_name or "Unknown Source",
        kpi_summary=kpi_summary or "Not provided",
        active_filter=active_filter,
        tables=table_list,
    )
    return f"{system}\n\nUser prompt: {req.prompt}"


# ─────────────────────────────────────────────
# Gemini call
# ─────────────────────────────────────────────

_GEMINI_MODEL = "gemini-2.0-flash"


def _call_gemini(full_prompt: str) -> Dict[str, Any]:
    """
    Call Google Gemini and return a parsed dict.
    Raises RuntimeError if the SDK is unavailable, key is missing, or parsing fails.
    """
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not api_key or api_key in ("MY_GEMINI_API_KEY", ""):
        raise RuntimeError("GEMINI_API_KEY is not configured")

    try:
        import google.generativeai as genai  # type: ignore
    except ImportError:
        raise RuntimeError("google-generativeai SDK is not installed")

    genai.configure(api_key=api_key)
    model = genai.GenerativeModel(_GEMINI_MODEL)

    generation_config = genai.GenerationConfig(
        temperature=0.3,
        max_output_tokens=1024,
        response_mime_type="application/json",
    )

    response = model.generate_content(full_prompt, generation_config=generation_config)
    raw_text = response.text.strip()

    # Strip accidental markdown fences if the model adds them despite the instruction
    raw_text = re.sub(r"^```(?:json)?\s*", "", raw_text, flags=re.MULTILINE)
    raw_text = re.sub(r"\s*```$", "", raw_text, flags=re.MULTILINE)

    parsed = json.loads(raw_text)
    return parsed


# ─────────────────────────────────────────────
# Route
# ─────────────────────────────────────────────

@router.post("/copilot", response_model=CopilotResponse)
def ai_copilot(req: CopilotRequest):
    """
    AI Analytics Copilot endpoint (Step 10).

    Accepts a natural-language analytical prompt, grounds it with real
    catalog metadata from PostgreSQL, calls Google Gemini, and returns a
    structured CopilotResponse.

    Returns HTTP 503 when the Gemini API key is not configured, allowing
    the frontend to fall back to client-side simulation gracefully.
    """
    if not req.prompt or not req.prompt.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="prompt must not be empty.",
        )

    # 1. Fetch real catalog tables from PostgreSQL
    catalog_tables = req.catalog_context or []
    if req.source_id and not catalog_tables:
        catalog_tables = _fetch_catalog_tables(req.source_id)

    # 2. Build the full prompt
    full_prompt = _build_prompt(req, catalog_tables)

    # 3. Call Gemini
    t0 = time.monotonic()
    try:
        parsed = _call_gemini(full_prompt)
    except RuntimeError as exc:
        # Gemini is not configured — tell the frontend to fall back
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        )
    except Exception as exc:
        # Gemini call failed (network, quota, parse error, etc.)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Gemini API error: {exc}",
        )
    latency_ms = int((time.monotonic() - t0) * 1000)

    # 4. Extract and validate fields safely
    explanation = str(parsed.get("explanation", "Analysis complete."))
    sql_query = parsed.get("sql_query") or None
    applied_changes = parsed.get("applied_changes") or []
    suggested_follow_ups = parsed.get("suggested_follow_ups") or []
    mutation_raw = parsed.get("dashboard_mutation") or {}

    dashboard_mutation = DashboardMutation(
        subtitle=mutation_raw.get("subtitle"),
        insights=mutation_raw.get("insights") or [],
        primary_chart_title=mutation_raw.get("primary_chart_title"),
        secondary_chart_title=mutation_raw.get("secondary_chart_title"),
    )

    return CopilotResponse(
        success=True,
        explanation=explanation,
        sql_query=sql_query,
        applied_changes=applied_changes if isinstance(applied_changes, list) else [],
        suggested_follow_ups=suggested_follow_ups if isinstance(suggested_follow_ups, list) else [],
        dashboard_mutation=dashboard_mutation,
        model_used=_GEMINI_MODEL,
        latency_ms=latency_ms,
    )
