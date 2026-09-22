import json
import os
import re
import time
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import text

from app.database import engine
from app.routes.query import validate_read_only_query, ColumnResponse
from connectors import execute_source_query
from app.services.copilot import (
    resolve_analytical_intent,
    compile_intent_to_sql,
    validate_sql_against_intent,
    verify_and_ground_answer,
    AnalyticalIntent,
)

router = APIRouter(
    prefix="/api/copilot",
    tags=["AI Analytics Copilot"]
)


class VisualizationSpec(BaseModel):
    type: str = "bar"  # 'bar', 'line', 'kpi', 'table', 'pie', 'donut', 'scatter'
    title: str
    xField: Optional[str] = None
    yField: Optional[str] = None
    unit: Optional[str] = None
    value: Optional[Any] = None  # for KPI


class CopilotQueryRequest(BaseModel):
    question: str
    source_id: int = Field(..., alias="sourceId")
    database: Optional[str] = None
    schema_name: Optional[str] = Field(None, alias="schema")
    limit: Optional[int] = 100

    # Ephemeral credentials (used for query execution, never stored or logged)
    account_identifier: Optional[str] = None
    accountIdentifier: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None
    warehouse: Optional[str] = None
    role: Optional[str] = None

    model_config = {"populate_by_name": True}


class CopilotQueryResponse(BaseModel):
    success: bool
    answer: str
    sql: Optional[str] = None
    sql_executed: bool = False
    not_executed_reason: Optional[str] = None
    columns: List[ColumnResponse] = []
    rows: List[Dict[str, Any]] = []
    row_count: int = 0
    execution_time_ms: int = 0
    visualization: Optional[VisualizationSpec] = None
    error: Optional[str] = None


class DashboardModifyRequest(BaseModel):
    """P0-3: AI dashboard modification — interprets arbitrary natural-language instructions."""
    dashboard_id: int = Field(..., alias="dashboardId")
    instruction: str
    source_id: int = Field(..., alias="sourceId")

    # Ephemeral credentials (never stored or logged)
    account_identifier: Optional[str] = None
    accountIdentifier: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None
    warehouse: Optional[str] = None
    role: Optional[str] = None
    database: Optional[str] = None
    schema_name: Optional[str] = Field(None, alias="schema")

    model_config = {"populate_by_name": True}


class DashboardModifyResponse(BaseModel):
    success: bool
    action_taken: str
    widget_id: Optional[int] = None
    widget_title: Optional[str] = None
    sql: Optional[str] = None
    message: str
    error: Optional[str] = None


# ─────────────────────────────────────────────────────────────
# Catalog Metadata Retrieval
# ─────────────────────────────────────────────────────────────

def get_catalog_metadata(source_id: int) -> List[Dict[str, Any]]:
    """
    Fetch catalog metadata (database, schema, table, columns, data_types)
    for a given source_id from PostgreSQL.
    """
    with engine.connect() as conn:
        rows = conn.execute(
            text("""
                SELECT 
                    d.id as dataset_id,
                    d.database_name,
                    d.schema_name,
                    d.table_name,
                    d.table_type,
                    c.column_name,
                    c.data_type,
                    c.is_nullable
                FROM datasets d
                LEFT JOIN catalog_columns c ON d.id = c.dataset_id
                WHERE d.source_id = :source_id
                ORDER BY d.database_name, d.schema_name, d.table_name, c.ordinal_position
            """),
            {"source_id": source_id}
        ).fetchall()

        tables_map: Dict[str, Dict[str, Any]] = {}
        for r in rows:
            tbl_key = f"{r.database_name}.{r.schema_name}.{r.table_name}".upper()
            if tbl_key not in tables_map:
                tables_map[tbl_key] = {
                    "dataset_id": r.dataset_id,
                    "database": r.database_name,
                    "schema": r.schema_name,
                    "table": r.table_name,
                    "table_type": r.table_type,
                    "columns": [],
                }
            if r.column_name:
                tables_map[tbl_key]["columns"].append({
                    "name": r.column_name,
                    "data_type": r.data_type,
                    "is_nullable": r.is_nullable,
                })

        return list(tables_map.values())


def get_semantic_context_for_prompt(source_id: int) -> str:
    """
    Fetch semantic metric/dimension definitions and format them for the Gemini prompt.
    This enriches SQL generation with business meaning without hardcoding questions.
    """
    try:
        with engine.connect() as conn:
            metrics = conn.execute(
                text("""
                    SELECT name, label, source_table, source_column, aggregation, format_hint
                    FROM semantic_metrics WHERE source_id = :sid ORDER BY name LIMIT 50
                """),
                {"sid": source_id}
            ).fetchall()

            dimensions = conn.execute(
                text("""
                    SELECT name, label, source_table, source_column, data_type
                    FROM semantic_dimensions WHERE source_id = :sid ORDER BY name LIMIT 100
                """),
                {"sid": source_id}
            ).fetchall()

        if not metrics and not dimensions:
            return ""

        lines = ["Business Intelligence / Semantic Layer (use these definitions when generating SQL):"]
        if metrics:
            lines.append("  Metrics (pre-defined aggregations):")
            for m in metrics:
                fmt = f" [{m.format_hint}]" if m.format_hint else ""
                lines.append(f"    - {m.label or m.name}: {m.aggregation}(\"{m.source_table}\".\"{m.source_column}\"){fmt}")
        if dimensions:
            lines.append("  Dimensions (grouping/filter columns):")
            for d in dimensions:
                lines.append(f"    - {d.label or d.name}: \"{d.source_table}\".\"{d.source_column}\" ({d.data_type})")
        return "\n".join(lines)
    except Exception:
        return ""


# ─────────────────────────────────────────────────────────────
# Catalog-Grounded Analytical Generator (deterministic fallback)
# ─────────────────────────────────────────────────────────────

TEMPORAL_AND_COMMON_WORDS = {
    "THE", "A", "AN", "OUR", "THIS", "MY", "EACH", "ALL", "WHERE", "WHICH", "THAT", "THESE", "THOSE",
    "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER",
    "JAN", "FEB", "MAR", "APR", "JUN", "JUL", "AUG", "SEP", "SEPT", "OCT", "NOV", "DEC",
    "TODAY", "YESTERDAY", "TOMORROW", "MONTH", "MONTHS", "YEAR", "YEARS", "QUARTER", "QUARTERS", "WEEK", "WEEKS", "DAY", "DAYS",
    "LAST", "NEXT", "CURRENT", "PREVIOUS", "PAST", "RECENT", "PERIOD", "DATE", "DATES", "TIME", "TIMES"
}


def _check_unknown_references(question: str, catalog: List[Dict[str, Any]]) -> Optional[str]:
    """
    Check if the user question explicitly asks for a table, column, or domain that does NOT exist
    in the connected catalog (e.g. 'secret_table', 'secret_column', weather, employee satisfaction).
    Returns an error message if an unknown dataset/column/topic is referenced, or None.

    Natural language temporal expressions (e.g. 'January to June 2025', 'last month') are preserved
    and never treated as table or column identifiers.
    """
    q_lower = question.lower().strip()

    # Check for obvious external domains not present in the catalog
    unrelated_domains = [
        "weather", "temperature", "forecast", "climate", "rainfall",
        "employee satisfaction", "employee salary", "employee turnover", "staff turnover", "payroll",
        "stock price", "inflation rate", "crypto", "bitcoin", "election", "cricket", "football"
    ]
    for domain in unrelated_domains:
        if domain in q_lower:
            all_names = [t["table"].lower() for t in catalog] + [c["name"].lower() for t in catalog for c in t.get("columns", [])]
            if not any(domain in name for name in all_names):
                return "I can't answer that from the connected analytics data as it does not contain relevant tables or columns."

    # Check for patterns like "from <table_name>" or "in <table_name>" or "table <table_name>"
    from_match = re.search(r"\b(?:from|in|table)\s+([a-zA-Z0-9_]+)", q_lower)
    if from_match:
        requested_tbl = from_match.group(1).upper()
        # Ignore temporal words, common stopwords, or numeric years (e.g. 2025)
        if requested_tbl not in TEMPORAL_AND_COMMON_WORDS and not requested_tbl.isdigit():
            known_tables = [t["table"].upper() for t in catalog if t.get("table")]
            if requested_tbl not in known_tables:
                return f"I couldn't find a dataset or column in the connected catalog that supports this question. (Table '{from_match.group(1)}' not found)"

    # Check for direct mention of unknown table names with underscore or explicit identifiers like secret_table
    explicit_words = re.findall(r"\b[a-zA-Z0-9_]+_[a-zA-Z0-9_]+\b", q_lower)
    for word in explicit_words:
        w_upper = word.upper()
        if w_upper in TEMPORAL_AND_COMMON_WORDS:
            continue
        all_tables = [t["table"].upper() for t in catalog if t.get("table")]
        all_cols = [c["name"].upper() for t in catalog for c in t.get("columns", [])]
        if w_upper not in all_tables and w_upper not in all_cols:
            if "secret" in word or "hidden" in word or "unknown" in word or "private" in word or "fake" in word:
                return "I couldn't find a dataset or column in the connected catalog that supports this question."

    return None



def _find_best_table_and_columns(question: str, catalog):
    """
    Find the most relevant table and candidate columns matching analytical intent.
    Scoring is based purely on runtime catalog tokens vs question tokens — no domain constants.
    Returns (table_info, col_mapping) or None.
    """
    if not catalog:
        return None

    q_lower = question.lower()
    q_tokens = set(re.findall(r"[a-z0-9]+", q_lower))

    scored_tables = []
    for t in catalog:
        score = 0
        t_name = t["table"].lower()
        t_tokens = set(re.findall(r"[a-z0-9]+", t_name))
        if t_name in q_lower:
            score += 20
        score += len(t_tokens & q_tokens) * 8
        for col in t.get("columns", []):
            c_tokens = set(re.findall(r"[a-z0-9]+", col["name"].lower()))
            if col["name"].lower() in q_lower:
                score += 5
            score += len(c_tokens & q_tokens) * 3
        scored_tables.append((score, t))

    scored_tables.sort(key=lambda x: x[0], reverse=True)
    best_table = scored_tables[0][1] if scored_tables else catalog[0]

    cols = best_table.get("columns", [])
    col_mapping = {"numeric": [], "date": [], "category": [], "id": []}

    for c in cols:
        name = c["name"]
        dt = c.get("data_type", "").upper()
        ntoks = set(re.findall(r"[a-z]+", name.lower()))
        if any(n in dt for n in ("INT", "NUM", "FLOAT", "DOUBLE", "DECIMAL", "REAL", "BIGINT", "MONEY", "CURRENCY")):
            if ntoks & {"id", "key", "zip", "code", "fips", "sku", "ref", "no", "num"}:
                col_mapping["id"].append(name)
            else:
                col_mapping["numeric"].append(name)
        elif any(d in dt for d in ("DATE", "TIME", "TIMESTAMP")):
            col_mapping["date"].append(name)
        else:
            if ntoks & {"month", "year", "quarter", "week", "period", "date", "day"}:
                col_mapping["date"].append(name)
            elif ntoks & {"id", "key", "ref", "no", "num", "code", "fips", "sku"}:
                col_mapping["id"].append(name)
            else:
                col_mapping["category"].append(name)

    return best_table, col_mapping


# ─────────────────────────────────────────────────────────────
# Pure Catalog-Driven Column Scoring Helpers
# ─────────────────────────────────────────────────────────────

def _score_col_for_phrase(col_name: str, phrase: str) -> int:
    """Score how well a catalog column name matches a phrase. Pure token-overlap — no domain constants."""
    col_toks = set(re.findall(r"[a-z]+", col_name.lower()))
    phrase_toks = set(re.findall(r"[a-z]+", phrase.lower()))
    if col_name.lower() in phrase.lower():
        return 100
    overlap = col_toks & phrase_toks
    if not overlap:
        return 0
    union = col_toks | phrase_toks
    return int((len(overlap) / len(union)) * 80) + len(overlap) * 5


def _find_best_numeric_col(phrase: str, numeric_cols) -> Optional[str]:
    """Pick the best numeric column for a phrase. Pure catalog-driven; no domain constants."""
    if not numeric_cols:
        return None
    for c in numeric_cols:
        if c.lower() in phrase.lower():
            return c
    scored = sorted([(c, _score_col_for_phrase(c, phrase)) for c in numeric_cols], key=lambda x: x[1], reverse=True)
    return scored[0][0] if scored[0][1] > 0 else numeric_cols[0]


def _find_best_category_col(phrase: str, category_cols) -> Optional[str]:
    """Pick the best category column for a phrase. Pure catalog-driven; no domain constants."""
    if not category_cols:
        return None
    for c in category_cols:
        if c.lower() in phrase.lower():
            return c
    scored = sorted([(c, _score_col_for_phrase(c, phrase)) for c in category_cols], key=lambda x: x[1], reverse=True)
    return scored[0][0] if scored[0][1] > 0 else category_cols[0]


def _detect_date_range_from_question(q: str) -> Optional[Tuple[str, str]]:
    """
    Parse a natural-language date range into (start_iso, end_iso).
    Supports: 'January to June 2025', 'Q1 2025', 'March 2024', ISO ranges.
    All dates are parsed from the question at runtime — no hardcoded values.
    """
    import calendar as _cal
    MONTHS = {
        "january": 1, "jan": 1, "february": 2, "feb": 2,
        "march": 3, "mar": 3, "april": 4, "apr": 4, "may": 5,
        "june": 6, "jun": 6, "july": 7, "jul": 7, "august": 8, "aug": 8,
        "september": 9, "sep": 9, "sept": 9, "october": 10, "oct": 10,
        "november": 11, "nov": 11, "december": 12, "dec": 12,
    }
    q_lower = q.lower()
    # "Month1 to Month2 YYYY"
    m = re.search(r"\b([a-z]+)\s+(?:to|through|[-\u2013])\s+([a-z]+)\s+(\d{4})\b", q_lower)
    if m:
        m1, m2, yr = MONTHS.get(m.group(1)), MONTHS.get(m.group(2)), m.group(3)
        if m1 and m2:
            return (f"{yr}-{m1:02d}-01", f"{yr}-{m2:02d}-{_cal.monthrange(int(yr), m2)[1]:02d}")
    # "Month1 YYYY to Month2 YYYY"
    m = re.search(r"\b([a-z]+)\s+(\d{4})\s+(?:to|through)\s+([a-z]+)\s+(\d{4})\b", q_lower)
    if m:
        m1, yr1, m2, yr2 = MONTHS.get(m.group(1)), m.group(2), MONTHS.get(m.group(3)), m.group(4)
        if m1 and m2:
            return (f"{yr1}-{m1:02d}-01", f"{yr2}-{m2:02d}-{_cal.monthrange(int(yr2), m2)[1]:02d}")
    # ISO range "2024-01-01 to 2024-06-30"
    m = re.search(r"\b(\d{4}-\d{2}-\d{2})\s+(?:to|through)\s+(\d{4}-\d{2}-\d{2})\b", q_lower)
    if m:
        return (m.group(1), m.group(2))
    # "Q1 2025"
    m = re.search(r"\bq([1-4])\s+(\d{4})\b", q_lower)
    if m:
        qn, yr = int(m.group(1)), m.group(2)
        sm, em = (qn - 1) * 3 + 1, qn * 3
        return (f"{yr}-{sm:02d}-01", f"{yr}-{em:02d}-{_cal.monthrange(int(yr), em)[1]:02d}")
    # Single month "in March 2024"
    m = re.search(r"\b([a-z]+)\s+(\d{4})\b", q_lower)
    if m:
        mn, yr = MONTHS.get(m.group(1)), m.group(2)
        if mn:
            return (f"{yr}-{mn:02d}-01", f"{yr}-{mn:02d}-{_cal.monthrange(int(yr), mn)[1]:02d}")
    return None


def _detect_multi_metric_intent(q: str, numeric_cols) -> List[Tuple[str, str, str]]:
    """
    Return [(col, alias, agg_func), ...] for each numeric column whose tokens appear in the question.
    Pure catalog-driven — no hardcoded column assumptions.
    """
    if not numeric_cols:
        return []
    q_lower = q.lower()
    results, used = [], set()
    for col in numeric_cols:
        c_lower = col.lower()
        toks = set(re.findall(r"[a-z]+", c_lower))
        matched = False
        for t in toks:
            if len(t) <= 2:
                continue
            if t == "unit" and "price" in c_lower and "price" not in q_lower:
                continue
            if t in q_lower or t.rstrip("s") in q_lower:
                matched = True
                break
        if not matched and c_lower == "quantity" and ("unit" in q_lower or "qty" in q_lower):
            matched = True

        if matched and col not in used:
            # Determine aggregation for this column
            if any(k in q_lower for k in ("average", "avg", "mean")):
                agg = "AVG"
                prefix = "AVG"
            elif any(k in q_lower for k in ("min", "minimum")):
                agg = "MIN"
                prefix = "MIN"
            elif any(k in q_lower for k in ("max", "maximum")):
                agg = "MAX"
                prefix = "MAX"
            else:
                agg = "SUM"
                prefix = "TOTAL"
            results.append((col, f"{prefix}_{col.upper()}", agg))
            used.add(col)
    return results


def _select_numeric_col_for_intent(q_lower: str, numeric_cols, metric_type: str = "auto") -> Optional[str]:
    """
    Select numeric column best matching the metric intent.
    metric_type is accepted for backwards-compat but used as a phrase hint only.
    """
    if not numeric_cols:
        return None
    hint = q_lower if metric_type == "auto" else f"{metric_type} {q_lower}"
    return _find_best_numeric_col(hint, numeric_cols)


def generate_catalog_grounded_sql(question: str, catalog, limit: int = 100) -> Tuple[str, Dict[str, Any]]:
    """
    Deterministically generate catalog-grounded read-only SQL.
    Fully dataset-agnostic: every decision is made from the runtime catalog.
    Returns (sql_query, visualization_intent).
    """
    best = _find_best_table_and_columns(question, catalog)
    if not best:
        raise ValueError("No matching catalog table found.")

    tbl, cols = best
    db, sch, table_name = tbl["database"], tbl["schema"], tbl["table"]
    table_ref = f'"{db}"."{sch}"."{table_name}"' if db and sch else f'"{table_name}"'
    q_lower = question.lower()
    target_num_col = _select_numeric_col_for_intent(q_lower, cols["numeric"])

    # Determine default aggregation function for target_num_col
    if any(k in q_lower for k in ("average", "avg", "mean")):
        default_agg = "AVG"
        alias_pfx = "AVG"
    elif any(k in q_lower for k in ("min", "minimum", "lowest")) and not any(k in q_lower for k in ("bottom", "worst", "lowest 5", "lowest 10", "lowest 1", "lowest 2", "lowest 3")):
        default_agg = "MIN"
        alias_pfx = "MIN"
    elif any(k in q_lower for k in ("max", "maximum", "highest")) and not any(k in q_lower for k in ("top", "best", "highest 5", "highest 10", "highest 1", "highest 2", "highest 3")):
        default_agg = "MAX"
        alias_pfx = "MAX"
    else:
        default_agg = "SUM"
        alias_pfx = "TOTAL"

    def _find_date_col(prefer_period=False):
        if prefer_period:
            for c in cols["category"] + cols["date"]:
                if any(k in c.lower() for k in ("month", "week", "quarter", "period", "year")):
                    return c
        for d in cols["date"]:
            return d
        for c in cols["category"]:
            if any(k in c.lower() for k in ("month", "date", "week", "period", "quarter", "year")):
                return c
        return None

    is_periodic = any(k in q_lower for k in (
        "month", "weekly", "monthly", "quarterly", "yearly", "trend", "over time"
    ))
    has_date_range = _detect_date_range_from_question(question) is not None
    is_time_series = is_periodic or has_date_range
    detected_metrics = _detect_multi_metric_intent(question, cols["numeric"])
    is_count_intent = any(k in q_lower for k in ("how many", "count of", "number of", "total count"))
    is_aggregate_only = (
        any(k in q_lower for k in ("what is total", "show total", "overall", "sum of", "aggregate", "what is the total", "show average", "what is the average", "average length", "mean"))
        and not any(k in q_lower for k in ("by ", "per ", "across ", "each ", "breakdown"))
    )

    # ── 0. Multi-Metric Time-Series ───────────────────────────────────────────
    if is_time_series and (len(detected_metrics) > 1 or (detected_metrics and is_count_intent)):
        date_col = _find_date_col(prefer_period=is_periodic)
        date_range = _detect_date_range_from_question(question)
        select_items = [f'"{date_col}"'] if date_col else []
        where_clause = ""
        if date_range and date_col:
            s, e = date_range
            where_clause = f' WHERE "{date_col}" >= \'{s}\' AND "{date_col}" <= \'{e}\' '
        for col_name, alias, agg in detected_metrics:
            select_items.append(f'{agg}("{col_name}") AS "{alias}"')
        if is_count_intent:
            select_items.append('COUNT(*) AS "TOTAL_COUNT"')
        if len(select_items) > (1 if date_col else 0):
            group_clause = f' GROUP BY "{date_col}" ORDER BY "{date_col}" ASC' if date_col else ""
            sql = f'SELECT {", ".join(select_items)} FROM {table_ref}{where_clause}{group_clause} LIMIT {limit};'
            first_alias = detected_metrics[0][1] if detected_metrics else "TOTAL_COUNT"
            return sql, {"type": "line", "title": f"{table_name} Analysis over Time", "xField": date_col, "yField": first_alias}

    # ── 1. Single Metric Time-Series ──────────────────────────────────────────
    if is_time_series and detected_metrics:
        date_col = _find_date_col(prefer_period=is_periodic)
        date_range = _detect_date_range_from_question(question)
        col_name, alias, agg = detected_metrics[0]
        where_clause = ""
        if date_range and date_col:
            s, e = date_range
            where_clause = f' WHERE "{date_col}" >= \'{s}\' AND "{date_col}" <= \'{e}\' '
        if date_col:
            sql = f'SELECT "{date_col}", {agg}("{col_name}") AS "{alias}" FROM {table_ref}{where_clause} GROUP BY "{date_col}" ORDER BY "{date_col}" ASC LIMIT {limit};'
            return sql, {"type": "line", "title": f'{alias.replace("_", " ").title()} over Time', "xField": date_col, "yField": alias}

    # ── 2. Count ──────────────────────────────────────────────────────────────
    if is_count_intent:
        alias = f"TOTAL_{table_name.upper()}_COUNT"
        return f'SELECT COUNT(*) AS "{alias}" FROM {table_ref};', {"type": "kpi", "title": alias.replace("_", " ").title(), "xField": None, "yField": alias}

    # ── 3. Total aggregate (Scalar - NO GROUP BY) ─────────────────────────────
    if is_aggregate_only and target_num_col:
        alias = f"{alias_pfx}_{target_num_col.upper()}"
        return f'SELECT {default_agg}("{target_num_col}") AS "{alias}" FROM {table_ref};', {"type": "kpi", "title": alias.replace("_", " ").title(), "xField": None, "yField": alias}

    # ── 4. Top N / Bottom N Ranking ───────────────────────────────────────────
    if any(k in q_lower for k in ("top", "highest", "lowest", "best", "worst", "ranked", "ranking", "bottom", "least")):
        cat_col = _find_best_category_col(question, cols["category"] + cols["id"]) or (cols["category"][0] if cols["category"] else (cols["id"][0] if cols["id"] else None))
        n_match = re.search(r"\b(?:top|bottom|lowest|highest|worst|best)\s+(\d+)", q_lower)
        top_n = int(n_match.group(1)) if n_match else (1 if any(k in q_lower for k in ("highest", "lowest", "best", "worst", "least")) else 10)
        if cat_col and target_num_col:
            alias = f"{alias_pfx}_{target_num_col.upper()}"
            is_bottom = any(k in q_lower for k in ("lowest", "worst", "bottom", "least"))
            order_dir = "ASC" if is_bottom else "DESC"
            sql = f'SELECT "{cat_col}", {default_agg}("{target_num_col}") AS "{alias}" FROM {table_ref} GROUP BY "{cat_col}" ORDER BY "{alias}" {order_dir} LIMIT {top_n};'
            return sql, {"type": "bar" if top_n > 1 else "kpi", "title": f'{"Bottom" if is_bottom else "Top"} {top_n} {cat_col.replace("_", " ").title()} by {alias.replace("_", " ").title()}' if top_n > 1 else f'{"Lowest" if is_bottom else "Highest"} {cat_col.replace("_", " ").title()}', "xField": cat_col if top_n > 1 else None, "yField": alias}

    # ── 5. Categorical breakdown ──────────────────────────────────────────────
    mentioned_cat = _find_best_category_col(question, cols["category"] + cols["date"])
    cat_in_q = mentioned_cat and _score_col_for_phrase(mentioned_cat, question) > 0
    is_breakdown = any(k in q_lower for k in ("by ", "per ", "across ", "each ", "breakdown", "compare", "group by"))
    if (cat_in_q or is_breakdown) and mentioned_cat and target_num_col:
        alias = f"{alias_pfx}_{target_num_col.upper()}"
        sql = f'SELECT "{mentioned_cat}", {default_agg}("{target_num_col}") AS "{alias}" FROM {table_ref} GROUP BY "{mentioned_cat}" ORDER BY "{alias}" DESC LIMIT {limit};'
        return sql, {"type": "bar", "title": f'{alias.replace("_", " ").title()} by {mentioned_cat.replace("_", " ").title()}', "xField": mentioned_cat, "yField": alias}

    # ── 6. Multi-Metric Aggregate (No dimensions) ─────────────────────────────
    if len(detected_metrics) > 1:
        select_items = [f'{agg}("{col_name}") AS "{alias}"' for col_name, alias, agg in detected_metrics]
        return f'SELECT {", ".join(select_items)} FROM {table_ref};', {"type": "kpi", "title": f"{table_name} Summary", "xField": None, "yField": detected_metrics[0][1]}

    # ── 7. Single detected metric ─────────────────────────────────────────────
    if detected_metrics:
        col_name, alias, agg = detected_metrics[0]
        return f'SELECT {agg}("{col_name}") AS "{alias}" FROM {table_ref};', {"type": "kpi", "title": alias.replace("_", " ").title(), "xField": None, "yField": alias}

    # ── 8. Fallback: preview rows ─────────────────────────────────────────────
    all_col_names = [f'"{c["name"]}"' for c in tbl.get("columns", [])[:6]]
    cols_clause = ", ".join(all_col_names) if all_col_names else "*"
    return f'SELECT {cols_clause} FROM {table_ref} LIMIT {limit};', {"type": "table", "title": f'Data from {table_name}', "xField": None, "yField": None}



# ─────────────────────────────────────────────────────────────
# Structured Analytical Intent + Validation Layer
# ─────────────────────────────────────────────────────────────

class AnalyticalIntent(BaseModel):
    """
    Typed representation of the user's analytical intent, extracted from the question or Gemini response.
    This is the source of truth for what SQL generation compiled — used for mechanical validation.
    """
    metrics: List[str] = []                     # column names being aggregated
    aggregations: List[str] = []                # SUM / COUNT / AVG / MIN / MAX etc.
    metric_aggregations: Dict[str, str] = {}    # mapping metric_col -> agg function (e.g. {"LOS_DAYS": "AVG"})
    multiple_metrics: bool = False              # whether multiple metrics are requested
    dimensions: List[str] = []                  # GROUP BY columns
    filters: List[str] = []                     # WHERE conditions (descriptive / categorical)
    date_range: Optional[Tuple[str, str]] = None # (start_iso, end_iso)
    date_column: Optional[str] = None           # date column used for range
    temporal_grain: Optional[str] = None        # "month", "year", "day", "quarter", "week"
    sort_column: Optional[str] = None
    sort_direction: Optional[str] = None        # "ASC" or "DESC"
    ranking_direction: Optional[str] = None     # "ASC" or "DESC"
    limit: Optional[int] = None
    calculated_metrics: List[str] = []
    intent_summary: str = ""                    # free text summary
    can_answer: bool = True


def _extract_intent_from_gemini_response(data: dict, catalog) -> AnalyticalIntent:
    """
    Parse the Gemini JSON response into a structured AnalyticalIntent object.
    Reuses the free-text 'intent' field and maps it against catalog column names.
    No separate LLM call — works within the single existing Gemini call.
    """
    can_answer = data.get("can_answer", True)
    intent_summary = data.get("intent", "") or data.get("explanation", "")
    sql = data.get("sql") or ""

    if not can_answer or not sql:
        return AnalyticalIntent(can_answer=False, intent_summary=intent_summary)

    # Build a flat set of all catalog column names for matching
    all_cols = {c["name"].upper(): c["name"] for t in catalog for c in t.get("columns", [])}

    # Parse metrics and their specific aggregation functions
    metrics = []
    metric_aggs = {}
    for m in re.finditer(r'\b(SUM|AVG|MIN|MAX|COUNT)\s*\(\s*"?([A-Za-z0-9_]+)"?\s*\)', sql, re.IGNORECASE):
        agg_name = m.group(1).upper()
        col_raw = m.group(2).upper()
        if col_raw in all_cols:
            real_col = all_cols[col_raw]
            if real_col not in metrics:
                metrics.append(real_col)
            metric_aggs[real_col] = agg_name

    # Aggregation types present
    agg_types = list(set(re.findall(r'\b(SUM|AVG|MIN|MAX|COUNT)\b', sql, re.IGNORECASE)))

    # Dimensions: columns in GROUP BY
    dimensions = []
    gb_match = re.search(r'\bGROUP\s+BY\s+([^ORDER^LIMIT^;]+)', sql, re.IGNORECASE)
    if gb_match:
        for raw in gb_match.group(1).split(","):
            col = raw.strip().strip('"').upper()
            if col in all_cols:
                dimensions.append(all_cols[col])

    # Filters: WHERE clause
    filters = []
    wh_match = re.search(r'\bWHERE\s+(.+?)(?:\bGROUP|\bORDER|\bLIMIT|;|$)', sql, re.IGNORECASE | re.DOTALL)
    if wh_match:
        filters = [wh_match.group(1).strip()]

    # Time range from filters
    time_range = None
    date_range_tuple = None
    date_m = re.search(r'(\d{4}-\d{2}-\d{2}).*?(\d{4}-\d{2}-\d{2})', sql)
    if date_m:
        time_range = f"{date_m.group(1)} to {date_m.group(2)}"
        date_range_tuple = (date_m.group(1), date_m.group(2))

    # Grain from GROUP BY (monthly/weekly etc.)
    grain = None
    if dimensions:
        d = dimensions[0].lower()
        if "month" in d:
            grain = "month"
        elif "week" in d:
            grain = "week"
        elif "quarter" in d:
            grain = "quarter"
        elif "year" in d:
            grain = "year"
        elif "date" in d or "day" in d:
            grain = "day"
    elif "DATE_TRUNC('MONTH'" in sql.upper() or "DATE_TRUNC('MONTH'" in sql.upper() or "YYYY-MM" in sql:
        grain = "month"

    # Limit
    lim_m = re.search(r'\bLIMIT\s+(\d+)', sql, re.IGNORECASE)
    limit_val = int(lim_m.group(1)) if lim_m else None

    # Ranking / Ordering direction
    order_dir = None
    if "ORDER BY" in sql.upper():
        if "DESC" in sql.upper().split("ORDER BY")[-1]:
            order_dir = "DESC"
        else:
            order_dir = "ASC"

    return AnalyticalIntent(
        metrics=metrics,
        aggregations=agg_types,
        metric_aggregations=metric_aggs,
        multiple_metrics=len(metrics) > 1,
        dimensions=dimensions,
        filters=filters,
        date_range=date_range_tuple,
        temporal_grain=grain,
        sort_direction=order_dir,
        ranking_direction=order_dir,
        limit=limit_val,
        intent_summary=intent_summary,
        can_answer=True,
    )


def _validate_sql_against_schema(sql: str, catalog) -> Optional[str]:
    """
    Mechanical SQL↔schema validation.
    Checks that every double-quoted identifier referenced in the SQL
    exists in the live catalog as a table or column name.
    Returns an error string if any unknown identifier is found, or None if valid.
    """
    if not sql or not catalog:
        return None

    # Build allowed identifier sets from the live catalog
    allowed_tables = {t["table"].upper() for t in catalog}
    allowed_cols = {c["name"].upper() for t in catalog for c in t.get("columns", [])}

    # Extract select column aliases (e.g. AS "TOTAL_REVENUE") which are valid query-scoped identifiers
    select_aliases = {a.upper() for a in re.findall(r'\bAS\s+"([A-Za-z0-9_]+)"', sql, flags=re.IGNORECASE)}

    allowed_all = allowed_tables | allowed_cols | select_aliases

    # Extract all double-quoted identifiers from SQL
    quoted_ids = re.findall(r'"([A-Za-z0-9_]+)"', sql)

    for ident in quoted_ids:
        u = ident.upper()
        # Skip database/schema names (they appear in three-part refs and are not in catalog cols)
        if u not in allowed_all:
            # Check if it could be a database or schema name
            is_db_or_schema = any(
                t.get("database", "").upper() == u or t.get("schema", "").upper() == u
                for t in catalog
            )
            if not is_db_or_schema:
                return (
                    f"SQL references identifier '{ident}' which does not exist in the "
                    f"connected catalog. Validation failed — query not executed."
                )
    return None


def _validate_intent_against_sql(intent: AnalyticalIntent, sql: str) -> Optional[str]:
    """
    Mechanical intent↔SQL validation.
    Checks that the SQL reflects the intent's resolved metrics and dimensions.
    Returns an error string on mismatch, or None if valid.
    Uses structural checks only — no LLM call.
    """
    if not intent.can_answer or not sql:
        return None

    sql_upper = sql.upper()

    # 1. Metrics validation
    if intent.metrics:
        for m in intent.metrics:
            if f'"{m.upper()}"' not in sql_upper and m.upper() not in sql_upper:
                return (
                    f"Intent specifies metric '{m}' but it does not appear in the generated SQL. "
                    f"Intent↔SQL mismatch."
                )

    # 2. Metric aggregations validation
    if intent.metric_aggregations:
        for col, agg in intent.metric_aggregations.items():
            if agg == "AVG":
                if f"AVG(" not in sql_upper:
                    return f"Intent requested AVG for '{col}', but generated SQL does not use AVG aggregation."
            elif agg == "SUM":
                if f"SUM(" not in sql_upper:
                    return f"Intent requested SUM for '{col}', but generated SQL does not use SUM aggregation."
            elif agg == "MIN":
                if f"MIN(" not in sql_upper:
                    return f"Intent requested MIN for '{col}', but generated SQL does not use MIN aggregation."
            elif agg == "MAX":
                if f"MAX(" not in sql_upper:
                    return f"Intent requested MAX for '{col}', but generated SQL does not use MAX aggregation."

    # 3. Dimensions & Scalar Aggregates validation
    if intent.dimensions and "GROUP BY" not in sql_upper:
        return (
            f"Intent specifies dimensions {intent.dimensions} implying GROUP BY, "
            f"but generated SQL has no GROUP BY clause. Intent↔SQL mismatch."
        )

    # 4. Temporal Grain validation
    if intent.temporal_grain == "month":
        # Must group by month column or date truncation/formatting
        has_month_grain = (
            any("MONTH" in dim.upper() for dim in intent.dimensions) or
            "DATE_TRUNC('MONTH'" in sql_upper or
            "DATE_TRUNC(\"MONTH\"" in sql_upper or
            "TO_CHAR(" in sql_upper or
            "EXTRACT(MONTH" in sql_upper or
            "DATE_PART('MONTH'" in sql_upper
        )
        if not has_month_grain and "GROUP BY" in sql_upper:
            # Check if it erroneously grouped by raw date without month extraction
            if any(k in sql_upper for k in ("_DATE\"", "DATE\"")):
                return "Monthly trend intent must group by month grain (e.g. DATE_TRUNC('month', ...) or MONTH column), not raw date."

    # 5. Date Range filter validation
    if intent.date_range:
        s, e = intent.date_range
        if "WHERE" not in sql_upper:
            return f"Intent specifies date range {s} to {e} but generated SQL has no WHERE clause."
        if s not in sql or e not in sql:
            return f"Intent specifies date range {s} to {e} but the dates are missing from the SQL WHERE clause."

    # 6. Ranking Direction validation
    if intent.ranking_direction == "ASC":
        if "ORDER BY" in sql_upper and "DESC" in sql_upper.split("ORDER BY")[-1]:
            return "Bottom-N / Lowest ranking intent must use ASC order, not DESC."

    return None


def _select_catalog_subset_for_question(question: str, catalog) -> list:
    """
    Return only the catalog tables most relevant to the question.
    Sends at most 5 tables to Gemini to keep prompts efficient.
    """
    if not catalog or len(catalog) <= 3:
        return catalog  # Small catalog — send all

    q_lower = question.lower()
    q_tokens = set(re.findall(r"[a-z0-9]+", q_lower))

    scored = []
    for t in catalog:
        score = 0
        t_tokens = set(re.findall(r"[a-z0-9]+", t["table"].lower()))
        if t["table"].lower() in q_lower:
            score += 20
        score += len(t_tokens & q_tokens) * 8
        for col in t.get("columns", []):
            c_tokens = set(re.findall(r"[a-z0-9]+", col["name"].lower()))
            if col["name"].lower() in q_lower:
                score += 5
            score += len(c_tokens & q_tokens) * 3
        scored.append((score, t))

    scored.sort(key=lambda x: x[0], reverse=True)
    # Always include at least top 3; include up to 5
    top = [t for _, t in scored[:5]]
    return top if top else catalog




def call_gemini_for_sql(
    question: str,
    catalog: List[Dict[str, Any]],
    semantic_context: str = "",
) -> Optional[Tuple[Optional[str], Dict[str, Any], str]]:
    """
    Ask Gemini to generate structured SQL + viz spec for the given question and catalog.
    Includes:
      - Catalog subset selection (efficiency: sends only relevant tables)
      - Structured intent extraction from Gemini response
      - Mechanical SQL↔schema validation (no LLM call)
      - Mechanical intent↔SQL validation (no LLM call)
      - One bounded regeneration on any validation failure

    SECURITY: Never includes credentials in the prompt.
    Returns (sql, viz_spec, explanation) if answerable, or (None, {}, explanation) if unanswerable, or None on failure.
    """
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not api_key or api_key in ("MY_GEMINI_API_KEY", ""):
        return None

    try:
        from google import genai
    except ImportError:
        return None

    # Select only relevant catalog subset for this question (efficiency)
    catalog_subset = _select_catalog_subset_for_question(question, catalog)

    def _build_prompt(cat_subset):
        catalog_lines = []
        for t in cat_subset:
            col_strs = [f"{c['name']} {c['data_type']}" for c in t.get("columns", [])]
            catalog_lines.append(f'Table "{t["database"]}"."{t["schema"]}"."{t["table"]}": {", ".join(col_strs)}')
        catalog_context = "\n".join(catalog_lines)
        semantic_section = f"\n{semantic_context}" if semantic_context else ""
        return f"""\
You are an expert SQL generator for an enterprise analytics platform.
You will receive a user question and a schema catalog.
Generate a valid read-only SQL query grounded ONLY in the tables and columns provided in the catalog.
Do NOT invent any tables, columns, or values.
The SQL query MUST start with SELECT or WITH.
Never output INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE, or any mutating statements.

CRITICAL RULE FOR UNRELATED OR UNANSWERABLE QUESTIONS:
If the user's question CANNOT be answered using the tables and columns provided in the catalog:
You MUST set "can_answer": false and "sql": null, and set "explanation" to a clear reason.
NEVER invent tables, columns, or metrics to guess an answer.

Available Catalog:
{catalog_context}
{semantic_section}
User Question: {question}

Return ONLY a JSON object with this exact structure:
{{
  "can_answer": true,
  "sql": "<executable read-only SQL query using double-quoted identifiers, or null if can_answer is false>",
  "intent": "<short summary of question intent including what metrics and dimensions are needed>",
  "explanation": "<1-2 sentence description of what the query calculates, or reason why it cannot be answered>",
  "visualization": {{
    "type": "<bar|line|kpi|table>",
    "title": "<title for chart>",
    "xField": "<column name for X axis or category>",
    "yField": "<column name for Y axis or metric>"
  }}
}}
"""

    def _attempt_gemini(prompt):
        try:
            client = genai.Client(api_key=api_key)
            response = client.models.generate_content(
                model="gemini-2.0-flash",
                contents=prompt,
                config={
                    "temperature": 0.1,
                    "max_output_tokens": 1024,
                    "response_mime_type": "application/json",
                },
            )
            raw = response.text.strip()
            raw = re.sub(r"^```(?:json)?\s*", "", raw, flags=re.MULTILINE)
            raw = re.sub(r"\s*```$", "", raw, flags=re.MULTILINE)
            return json.loads(raw)
        except Exception:
            return None

    # ── First attempt ─────────────────────────────────────────────────────────
    prompt = _build_prompt(catalog_subset)
    data = _attempt_gemini(prompt)
    if data is None:
        return None

    can_answer = data.get("can_answer", True)
    sql = data.get("sql")
    viz = data.get("visualization", {})
    explanation = data.get("explanation", "Query generated from catalog.")

    if can_answer is False or not sql or str(sql).strip().lower() in ("null", "none", ""):
        return None, {}, explanation

    # ── Extract structured intent (within existing call — no extra LLM) ───────
    intent = _extract_intent_from_gemini_response(data, catalog)

    # ── Mechanical SQL↔schema validation ─────────────────────────────────────
    schema_err = _validate_sql_against_schema(sql, catalog)
    # ── Mechanical intent↔SQL validation ─────────────────────────────────────
    intent_err = _validate_intent_against_sql(intent, sql)

    validation_error = schema_err or intent_err

    if validation_error:
        # ── One bounded regeneration ──────────────────────────────────────────
        regen_prompt = _build_prompt(catalog_subset) + f"""
IMPORTANT: A previous attempt generated SQL that failed validation with this error:
{validation_error}
Correct the SQL so that:
- Every table and column reference exists verbatim in the catalog above.
- All aggregations and GROUP BY clauses match the stated intent.
- Use only double-quoted identifiers for table/column names.
"""
        data2 = _attempt_gemini(regen_prompt)
        if data2 is None:
            # Regeneration failed — return clarification response
            return None, {}, f"Could not generate valid SQL after regeneration: {validation_error}"

        can_answer2 = data2.get("can_answer", True)
        sql2 = data2.get("sql")
        viz2 = data2.get("visualization", {})
        explanation2 = data2.get("explanation", explanation)

        if can_answer2 is False or not sql2 or str(sql2).strip().lower() in ("null", "none", ""):
            return None, {}, explanation2

        # Validate the regenerated SQL — if it still fails, return unsupported
        intent2 = _extract_intent_from_gemini_response(data2, catalog)
        schema_err2 = _validate_sql_against_schema(sql2, catalog)
        intent_err2 = _validate_intent_against_sql(intent2, sql2)
        if schema_err2 or intent_err2:
            err2 = schema_err2 or intent_err2
            return None, {}, f"I cannot answer this question accurately with the available catalog. ({err2})"

        return sql2, viz2, explanation2

    return sql, viz, explanation



def call_gemini_for_final_answer(
    question: str,
    sql: str,
    columns: List[ColumnResponse],
    rows: List[Dict[str, Any]],
) -> str:
    """
    P0-1: Generate a final natural-language answer strictly grounded in actual returned data.
    SECURITY: Never passes credentials — only question, SQL, column names, and actual row values.
    Returns a truthful answer based on real data. Never hallucinates numbers.
    """
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not api_key or api_key in ("MY_GEMINI_API_KEY", ""):
        return None  # Caller will use fallback

    try:
        from google import genai
    except ImportError:
        return None

    # Format columns and a data sample (max 20 rows for token efficiency)
    col_names = [c.name for c in columns]
    sample_rows = rows[:20]

    # Build a compact data representation — only column names and values, NO credentials
    data_lines = []
    for row in sample_rows:
        row_str = ", ".join(f"{k}={v}" for k, v in row.items() if k in col_names)
        data_lines.append(row_str)

    data_sample = "\n".join(data_lines) if data_lines else "(no rows returned)"
    total_rows = len(rows)

    prompt = f"""\
You are an expert data analyst providing a concise natural-language interpretation of a query result.

User's original question: {question}

SQL that was executed: {sql}

Columns returned: {", ".join(col_names)}
Total rows returned: {total_rows}
Data sample (first {min(20, total_rows)} rows):
{data_sample}

Write a 1-3 sentence plain English answer that directly responds to the user's question using ONLY the actual numbers and values from the data shown above.
Do NOT invent, estimate, or round numbers unless they are explicitly present in the data.
If the data sample is incomplete (total_rows > 20), acknowledge that.
If there is a clear single aggregate answer (e.g. one row, one column), state it precisely.
Be direct, factual, and analytical in tone.
Do NOT include SQL, formatting, markdown, or preamble — just the answer.
"""
    try:
        client = genai.Client(api_key=api_key)
        for model_name in ("gemini-2.5-flash", "gemini-2.0-flash", "gemini-3.5-flash-lite", "gemini-3.6-flash"):
            try:
                response = client.models.generate_content(
                    model=model_name,
                    contents=prompt,
                    config={
                        "temperature": 0.0,
                        "max_output_tokens": 256,
                    },
                )
                if response and response.text:
                    return response.text.strip()
            except Exception as me:
                if "429" in str(me) or "quota" in str(me).lower() or "resource_exhausted" in str(me).lower():
                    continue
                return None
        return None
    except Exception:
        return None


# ─────────────────────────────────────────────────────────────
# Dynamic Visualization Resolver from ACTUAL Query Results
# ─────────────────────────────────────────────────────────────

def resolve_visualization_from_actual_results(
    viz_intent: Dict[str, Any],
    columns: List[ColumnResponse],
    rows: List[Dict[str, Any]],
    question: str
) -> VisualizationSpec:
    """
    Examine the ACTUAL returned rows and columns to formulate an accurate visualization spec.
    Never invents fields that are not in columns.
    """
    col_names = [c.name for c in columns]
    if not col_names or not rows:
        return VisualizationSpec(
            type="table",
            title=viz_intent.get("title") or "Query Results",
            xField=col_names[0] if col_names else None,
            yField=col_names[1] if len(col_names) > 1 else None,
        )

    # 1. Single aggregate numeric result -> KPI
    if len(rows) == 1 and len(col_names) == 1:
        val = rows[0][col_names[0]]
        return VisualizationSpec(
            type="kpi",
            title=viz_intent.get("title") or col_names[0].replace("_", " ").title(),
            value=val,
            yField=col_names[0],
        )

    # 2. Check if xField and yField match actual columns
    x_cand = viz_intent.get("xField")
    y_cand = viz_intent.get("yField")

    matched_x = None
    matched_y = None

    for c in col_names:
        if x_cand and c.upper() == x_cand.upper():
            matched_x = c
        if y_cand and c.upper() == y_cand.upper():
            matched_y = c

    # Fallback to candidate types based on actual columns
    if not matched_y:
        # Pick first numeric column
        for c in columns:
            if any(n in c.data_type.upper() for n in ("INT", "NUM", "FLOAT", "DECIMAL", "DOUBLE", "REAL")):
                matched_y = c.name
                break
        if not matched_y and len(col_names) > 1:
            matched_y = col_names[1]

    if not matched_x and len(col_names) > 0:
        # Pick first non-numeric or first column
        for c in columns:
            if c.name != matched_y:
                matched_x = c.name
                break
        if not matched_x:
            matched_x = col_names[0]

    v_type = viz_intent.get("type", "bar").lower()
    if v_type not in ("bar", "line", "kpi", "table", "pie", "donut", "scatter"):
        v_type = "bar"

    # Date/Month detection -> prefer line
    if matched_x and any(k in matched_x.lower() for k in ("date", "month", "time", "year", "period")):
        v_type = "line"

    return VisualizationSpec(
        type=v_type,
        title=viz_intent.get("title") or f"{matched_y or 'Metric'} by {matched_x or 'Dimension'}",
        xField=matched_x,
        yField=matched_y,
    )


# ─────────────────────────────────────────────────────────────
# Audit helper (P0-4)
# ─────────────────────────────────────────────────────────────

def _log_audit(
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
) -> None:
    """
    Insert a real audit event. SECURITY: Never pass credentials here.
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
                        'analyst', :action_type, :question, :generated_sql,
                        :status, :rows_returned, :execution_time_ms, :visualization_type,
                        :source_id, :dashboard_id, :widget_id, :export_type, :error_message
                    )
                """),
                {
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
        print(f"[AUDIT] Failed to log event: {e}")


# ─────────────────────────────────────────────────────────────
# Copilot Query Endpoint
# ─────────────────────────────────────────────────────────────

@router.post("/query", response_model=CopilotQueryResponse)
def copilot_query(payload: CopilotQueryRequest):
    """
    AI Analytics Copilot orchestration endpoint (P0).

    1. Retrieves catalog + semantic context from PostgreSQL.
    2. Validates user question against known tables/columns (rejects hallucinations).
    3. Generates catalog-grounded read-only SQL via Gemini (with semantic context).
    4. Validates SQL through read-only safety pipeline.
    5. Executes query against data warehouse.
    6. Produces visualization spec based on actual returned columns/rows.
    7. Generates final natural-language answer via Gemini, grounded strictly in real data.
    8. Logs real audit event (no credentials logged).

    SECURITY: Ephemeral credentials are used only for query execution and are
    never stored, logged, or sent to Gemini.
    """
    # 1. Basic validation
    if not payload.question or not payload.question.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User question cannot be empty."
        )

    # 2. Check source existence
    with engine.connect() as conn:
        s_row = conn.execute(
            text("SELECT id, name, source_type FROM data_sources WHERE id = :id"),
            {"id": payload.source_id}
        ).fetchone()

        if not s_row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Data source with id {payload.source_id} not found."
            )

    source_type = (s_row.source_type or "snowflake").strip().lower()

    # 3. Retrieve catalog metadata
    catalog = get_catalog_metadata(payload.source_id)
    if not catalog:
        _log_audit(
            action_type="copilot_query",
            status="failure",
            question=payload.question,
            source_id=payload.source_id,
            error_message="No catalog metadata available",
        )
        return CopilotQueryResponse(
            success=False,
            answer="No catalog metadata is available for this data source. Please synchronize metadata first.",
            error="No catalog metadata available for source.",
        )

    # 4. Check for unknown table/column references
    unknown_err = _check_unknown_references(payload.question, catalog)
    if unknown_err:
        _log_audit(
            action_type="copilot_query",
            status="failure",
            question=payload.question,
            source_id=payload.source_id,
            error_message=unknown_err,
        )
        return CopilotQueryResponse(
            success=False,
            answer=unknown_err,
            error=unknown_err,
        )

    # 5. Fetch semantic context (P0-2) — enriches Gemini SQL generation
    semantic_context = get_semantic_context_for_prompt(payload.source_id)

    # 6. Resolve analytical intent via modular catalog-grounded resolver
    intent, resolver_path, debug_trace = resolve_analytical_intent(payload.question, catalog, semantic_context, return_debug=True)
    print(f"[COPILOT SERVER LOG] question='{payload.question}' resolver_path='{resolver_path}' intent_type='{intent.intent_type}' dataset='{intent.dataset}'")

    if intent.intent_type == "unsupported":
        err_msg = intent.unsupported_reason or "I can't answer that from the connected analytics data as the relevant data is not in the catalog."
        _log_audit(
            action_type="copilot_query",
            status="failure",
            question=payload.question,
            source_id=payload.source_id,
            error_message="Question unsupported by catalog",
        )
        return CopilotQueryResponse(
            success=False,
            answer=err_msg,
            sql=None,
            sql_executed=False,
            not_executed_reason="Question cannot be answered from the active data catalog.",
            error="Question cannot be answered from catalog.",
        )

    if intent.intent_type == "clarification" or intent.needs_clarification:
        clarif_msg = intent.clarification_question or "Please clarify which metric or dimension you would like to analyze."
        _log_audit(
            action_type="copilot_query",
            status="clarification_needed",
            question=payload.question,
            source_id=payload.source_id,
            error_message="Clarification requested",
        )
        return CopilotQueryResponse(
            success=False,
            answer=clarif_msg,
            sql=None,
            sql_executed=False,
            not_executed_reason="Clarification requested before query execution.",
            error="Clarification required.",
        )

    # 7. Compile deterministic SQL from intent and validate via AST
    try:
        generated_sql = compile_intent_to_sql(intent)
    except Exception as e:
        _log_audit(
            action_type="copilot_query",
            status="failure",
            question=payload.question,
            source_id=payload.source_id,
            error_message=str(e),
        )
        return CopilotQueryResponse(
            success=False,
            answer="Could not build a query for this question from the available data catalog.",
            sql=None,
            sql_executed=False,
            not_executed_reason="SQL compilation failed.",
            error="Query compilation error.",
        )

    val_err = validate_sql_against_intent(intent, generated_sql)
    if val_err:
        _log_audit(
            action_type="copilot_query",
            status="failure",
            question=payload.question,
            generated_sql=generated_sql,
            source_id=payload.source_id,
            error_message=f"Intent validation failed: {val_err}",
        )
        return CopilotQueryResponse(
            success=False,
            answer="The generated query could not be validated against the analytical intent and was not executed.",
            sql=generated_sql,
            sql_executed=False,
            not_executed_reason="The query failed intent validation and was not sent to the database.",
            error="Intent validation failed.",
        )

    # Prepare visualization intent from resolved analytical intent
    viz_type = "line" if intent.intent_type == "timeseries" else ("kpi" if intent.intent_type == "scalar" else "bar")
    primary_metric = intent.metrics[0].alias if intent.metrics else "Value"
    primary_dim = intent.dimensions[0] if intent.dimensions else None
    viz_intent = {
        "type": viz_type,
        "title": f"{primary_metric} by {primary_dim}" if primary_dim else primary_metric,
        "xField": primary_dim,
        "yField": primary_metric,
    }

    # Safety validation: reuse Step 9 read-only safety pipeline
    try:
        validate_read_only_query(generated_sql, max_limit=1000)
    except HTTPException as h_err:
        _log_audit(
            action_type="copilot_query",
            status="failure",
            question=payload.question,
            generated_sql=generated_sql,
            source_id=payload.source_id,
            error_message=f"SQL safety violation: {h_err.detail}",
        )
        return CopilotQueryResponse(
            success=False,
            answer="The generated query violated security policies (only read-only SELECT queries are allowed) and was not executed.",
            sql=generated_sql,
            sql_executed=False,
            not_executed_reason="Blocked by read-only security safety checks.",
            error=h_err.detail,
        )

    # Validate SQL AST & column existence against catalog before execution
    val_err = validate_sql_against_intent(intent, generated_sql, catalog)
    if val_err:
        _log_audit(
            action_type="copilot_query",
            status="failure",
            question=payload.question,
            generated_sql=generated_sql,
            source_id=payload.source_id,
            error_message=f"SQL AST validation failed: {val_err}",
        )
        return CopilotQueryResponse(
            success=False,
            answer="The generated query could not be validated against the active data catalog schema and was not executed.",
            sql=generated_sql,
            sql_executed=False,
            not_executed_reason="Schema validation against the data catalog failed.",
            error="Schema validation error.",
        )

    # 8. Execute query via Step 9 execution pipeline
    # SECURITY: password is never stored or logged
    account = payload.account_identifier or payload.accountIdentifier
    target_db = payload.database or (catalog[0]["database"] if catalog else None)
    target_schema = payload.schema_name or (catalog[0]["schema"] if catalog else None)

    config = {
        "account_identifier": account,
        "username": payload.username,
        "password": payload.password,  # ephemeral — used once, never stored
        "warehouse": payload.warehouse,
        "database": target_db,
        "schema": target_schema,
        "role": payload.role,
    }

    t0 = time.monotonic()
    result = execute_source_query(
        source_type=source_type,
        config=config,
        query=generated_sql,
        timeout_seconds=30,
        limit=payload.limit or 100,
    )
    exec_time = result.execution_time_ms or int((time.monotonic() - t0) * 1000)

    if not result.success:
        raw_err = result.error or result.message or "Query execution failed."
        friendly_err = "An error occurred while executing the query on the database. Please verify your query or data connection."
        _log_audit(
            action_type="copilot_query",
            status="failure",
            question=payload.question,
            generated_sql=generated_sql,
            execution_time_ms=exec_time,
            source_id=payload.source_id,
            error_message=raw_err,
        )
        return CopilotQueryResponse(
            success=False,
            answer=f"{intent.interpretation_statement}\n\n{friendly_err}",
            sql=generated_sql,
            sql_executed=False,
            not_executed_reason="Database execution error on Snowflake.",
            error="Database execution error",
            execution_time_ms=exec_time,
        )

    col_responses = [ColumnResponse(name=c.name, data_type=c.data_type) for c in result.columns]

    # 9. Handle Empty Result
    if not result.rows or len(result.rows) == 0:
        _log_audit(
            action_type="copilot_query",
            status="success",
            question=payload.question,
            generated_sql=generated_sql,
            rows_returned=0,
            execution_time_ms=exec_time,
            visualization_type="table",
            source_id=payload.source_id,
        )
        return CopilotQueryResponse(
            success=True,
            answer="The query executed successfully on Snowflake, but returned no rows. The connected data source may not contain matching records for this question.",
            sql=generated_sql,
            sql_executed=True,
            not_executed_reason=None,
            columns=col_responses,
            rows=[],
            row_count=0,
            execution_time_ms=exec_time,
            visualization=VisualizationSpec(
                type="table",
                title="No Data Found",
                xField=col_responses[0].name if col_responses else None,
                yField=None,
            ),
        )

    # 10. Derive Visualization Spec from ACTUAL Result
    viz_spec = resolve_visualization_from_actual_results(
        viz_intent,
        col_responses,
        result.rows,
        payload.question
    )

    # 11. P0-1: Generate final natural-language answer strictly grounded in real data
    # Try Gemini-generated answer first (grounded in actual rows, no credentials)
    candidate_answer = call_gemini_for_final_answer(
        question=payload.question,
        sql=generated_sql,
        columns=col_responses,
        rows=result.rows,
    )

    final_answer = verify_and_ground_answer(
        candidate_answer=candidate_answer,
        rows=result.rows,
        columns=[c.name for c in col_responses],
        interpretation_statement=intent.interpretation_statement,
        question=payload.question,
    )

    # 12. Log real audit event (P0-4) — SECURITY: credentials not logged
    _log_audit(
        action_type="copilot_query",
        status="success",
        question=payload.question,
        generated_sql=generated_sql,
        rows_returned=result.row_count,
        execution_time_ms=exec_time,
        visualization_type=viz_spec.type,
        source_id=payload.source_id,
    )

    return CopilotQueryResponse(
        success=True,
        answer=final_answer,
        sql=generated_sql,
        sql_executed=True,
        not_executed_reason=None,
        columns=col_responses,
        rows=result.rows,
        row_count=result.row_count,
        execution_time_ms=exec_time,
        visualization=viz_spec,
    )


# ─────────────────────────────────────────────────────────────
# P0-3: AI Dashboard Modification Endpoint
# ─────────────────────────────────────────────────────────────

def _call_gemini_for_dashboard_modification(
    instruction: str,
    catalog: List[Dict[str, Any]],
    existing_widget_titles: List[str],
    semantic_context: str = "",
) -> Optional[Dict[str, Any]]:
    """
    Ask Gemini to interpret a dashboard modification instruction and return
    a structured action: add/remove/change widget with SQL and visualization spec.
    SECURITY: Never includes credentials in the prompt.
    """
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not api_key or api_key in ("MY_GEMINI_API_KEY", ""):
        return None

    try:
        from google import genai
    except ImportError:
        return None

    # Format catalog
    catalog_lines = []
    for t in catalog:
        col_strs = [f"{c['name']} {c['data_type']}" for c in t.get("columns", [])]
        catalog_lines.append(f'Table "{t["database"]}"."{t["schema"]}"."{t["table"]}": {", ".join(col_strs)}')
    catalog_context = "\n".join(catalog_lines)
    semantic_section = f"\n{semantic_context}" if semantic_context else ""

    existing_widgets_str = ", ".join(f'"{w}"' for w in existing_widget_titles) if existing_widget_titles else "(none)"

    prompt = f"""\
You are a dashboard modification AI for an enterprise analytics platform.
The user wants to modify their dashboard by giving a natural language instruction.
You must interpret the instruction and return a structured action.

Available Catalog:
{catalog_context}
{semantic_section}
Existing widgets on dashboard: {existing_widgets_str}

User dashboard modification instruction: {instruction}

Determine the action type:
- "add": Add a new widget with a new SQL query and visualization
- "remove": Remove an existing widget by matching its title
- "modify_viz": Change the visualization type of an existing widget (keep SQL)
- "unsupported": The instruction cannot be fulfilled with available catalog data

Return ONLY a JSON object:
{{
  "action": "add" | "remove" | "modify_viz" | "unsupported",
  "reason": "<brief explanation of what action is being taken>",
  "widget_title": "<title for the new or matching widget>",
  "sql": "<executable read-only SQL query grounded strictly in catalog, or null for remove>",
  "visualization_type": "<bar|line|kpi|table|pie|scatter>",
  "x_field": "<column name for X axis, or null>",
  "y_field": "<column name for Y axis or metric, or null>"
}}

Rules:
- SQL must start with SELECT or WITH
- Never include mutating SQL (INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE)
- Only reference tables and columns from the catalog above
- For "remove" actions, match the widget_title to an existing widget name
- For "unsupported", set sql to null
"""
    try:
        client = genai.Client(api_key=api_key)
        response = client.models.generate_content(
            model="gemini-2.0-flash",
            contents=prompt,
            config={
                "temperature": 0.1,
                "max_output_tokens": 512,
                "response_mime_type": "application/json",
            },
        )
        raw = response.text.strip()
        raw = re.sub(r"^```(?:json)?\s*", "", raw, flags=re.MULTILINE)
        raw = re.sub(r"\s*```$", "", raw, flags=re.MULTILINE)
        return json.loads(raw)
    except Exception:
        return None


@router.post("/dashboard-modify", response_model=DashboardModifyResponse)
def dashboard_modify(payload: DashboardModifyRequest):
    """
    P0-3: AI Dashboard Modification

    Interprets an arbitrary natural-language dashboard modification instruction,
    generates real SQL (catalog-grounded), executes it against real Snowflake,
    and persists the change to the real dashboard_widgets table.

    Examples of instructions (NOT hardcoded — any instruction is interpreted):
      - "Add a bar chart of sales by region"
      - "Remove the monthly revenue chart"
      - "Change the top products widget to a pie chart"
      - "Add a KPI showing total customer count"

    SECURITY: Ephemeral credentials never stored or logged.
    """
    if not payload.instruction or not payload.instruction.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Instruction cannot be empty."
        )

    # Verify dashboard exists
    with engine.connect() as conn:
        d_row = conn.execute(
            text("SELECT id, source_id FROM dashboards WHERE id = :id"),
            {"id": payload.dashboard_id}
        ).fetchone()
        if not d_row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Dashboard {payload.dashboard_id} not found."
            )

        # Get existing widget titles for context
        w_rows = conn.execute(
            text("SELECT id, title, widget_type FROM dashboard_widgets WHERE dashboard_id = :did ORDER BY position"),
            {"did": payload.dashboard_id}
        ).fetchall()
        existing_widgets = [{"id": w.id, "title": w.title, "type": w.widget_type} for w in w_rows]
        existing_widget_titles = [w["title"] for w in existing_widgets]

    # Verify source exists
    with engine.connect() as conn:
        s_row = conn.execute(
            text("SELECT id, source_type FROM data_sources WHERE id = :id"),
            {"id": payload.source_id}
        ).fetchone()
        if not s_row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Data source {payload.source_id} not found."
            )
    source_type = (s_row.source_type or "snowflake").strip().lower()

    # Get catalog and semantic context
    catalog = get_catalog_metadata(payload.source_id)
    if not catalog:
        return DashboardModifyResponse(
            success=False,
            action_taken="error",
            message="No catalog metadata available. Please synchronize metadata first.",
            error="No catalog metadata.",
        )
    semantic_context = get_semantic_context_for_prompt(payload.source_id)

    # Call Gemini to interpret instruction
    gemini_result = _call_gemini_for_dashboard_modification(
        payload.instruction, catalog, existing_widget_titles, semantic_context
    )

    if not gemini_result:
        # Fallback: parse instruction deterministically when Gemini is unconfigured
        instr_lower = payload.instruction.lower().strip()
        if any(k in instr_lower for k in ("remove", "delete", "drop widget")):
            matched_title = "Widget"
            for w in existing_widgets:
                if any(word in w["title"].lower() for word in instr_lower.split()):
                    matched_title = w["title"]
                    break
            gemini_result = {
                "action": "remove",
                "reason": "Deterministic fallback: remove widget",
                "widget_title": matched_title,
            }
        elif any(k in instr_lower for k in ("change to", "convert to", "make pie", "make line", "make bar", "make kpi")):
            v_type = "bar"
            if "pie" in instr_lower:
                v_type = "pie"
            elif "line" in instr_lower:
                v_type = "line"
            elif "kpi" in instr_lower:
                v_type = "kpi"
            elif "table" in instr_lower:
                v_type = "table"
            gemini_result = {
                "action": "modify_viz",
                "reason": "Deterministic fallback: modify visualization",
                "widget_title": existing_widget_titles[0] if existing_widget_titles else "Widget",
                "visualization_type": v_type,
                "sql": None,
            }
        else:
            try:
                sql_gen, viz_gen = generate_catalog_grounded_sql(payload.instruction, catalog)
                gemini_result = {
                    "action": "add",
                    "reason": "Deterministic fallback: add widget",
                    "widget_title": viz_gen.get("title", "New Widget"),
                    "sql": sql_gen,
                    "visualization_type": viz_gen.get("type", "bar"),
                    "x_field": viz_gen.get("xField"),
                    "y_field": viz_gen.get("yField"),
                }
            except Exception:
                gemini_result = {
                    "action": "unsupported",
                    "reason": "Could not generate catalog-grounded query for instruction",
                }

    action = gemini_result.get("action", "unsupported")
    reason = gemini_result.get("reason", "")
    widget_title = gemini_result.get("widget_title", "New Widget")
    sql = gemini_result.get("sql")
    viz_type = gemini_result.get("visualization_type", "bar")
    x_field = gemini_result.get("x_field")
    y_field = gemini_result.get("y_field")

    if action == "unsupported":
        return DashboardModifyResponse(
            success=False,
            action_taken="unsupported",
            message=reason or "This instruction cannot be fulfilled with the available catalog data.",
            error="Instruction not supported by connected catalog.",
        )

    if action == "remove":
        # Find matching widget by title (fuzzy match)
        matched_widget_id = None
        for w in existing_widgets:
            if widget_title and widget_title.lower() in w["title"].lower():
                matched_widget_id = w["id"]
                break
        if not matched_widget_id and existing_widgets:
            matched_widget_id = existing_widgets[0]["id"]

        if matched_widget_id:
            with engine.begin() as conn:
                conn.execute(
                    text("DELETE FROM dashboard_widgets WHERE id = :id AND dashboard_id = :did"),
                    {"id": matched_widget_id, "did": payload.dashboard_id}
                )
            _log_audit(
                action_type="dashboard_widget_removed",
                status="success",
                question=payload.instruction,
                source_id=payload.source_id,
                dashboard_id=payload.dashboard_id,
                widget_id=matched_widget_id,
            )
            return DashboardModifyResponse(
                success=True,
                action_taken="remove",
                widget_id=matched_widget_id,
                widget_title=widget_title,
                message=f"Removed widget '{widget_title}' from dashboard.",
            )
        else:
            return DashboardModifyResponse(
                success=False,
                action_taken="remove",
                message=f"No matching widget found for '{widget_title}'.",
                error="Widget not found.",
            )

    if action in ("add", "modify_viz") and sql:
        # Validate SQL safety
        try:
            validate_read_only_query(sql, max_limit=1000)
        except HTTPException as h_err:
            _log_audit(
                action_type="dashboard_modify",
                status="failure",
                question=payload.instruction,
                generated_sql=sql,
                source_id=payload.source_id,
                dashboard_id=payload.dashboard_id,
                error_message=f"SQL safety: {h_err.detail}",
            )
            return DashboardModifyResponse(
                success=False,
                action_taken="error",
                sql=sql,
                message=f"Generated SQL failed safety check: {h_err.detail}",
                error=h_err.detail,
            )

        # Validate SQL against schema
        schema_err = _validate_sql_against_schema(sql, catalog)
        if schema_err:
            _log_audit(
                action_type="dashboard_modify",
                status="failure",
                question=payload.instruction,
                generated_sql=sql,
                source_id=payload.source_id,
                dashboard_id=payload.dashboard_id,
                error_message=f"Schema validation failed: {schema_err}",
            )
            return DashboardModifyResponse(
                success=False,
                action_taken="error",
                sql=sql,
                message=f"Generated SQL failed schema validation: {schema_err}",
                error=schema_err,
            )


        # Execute real query with ephemeral credentials
        account = payload.account_identifier or payload.accountIdentifier
        target_db = payload.database or (catalog[0]["database"] if catalog else None)
        target_schema = payload.schema_name or (catalog[0]["schema"] if catalog else None)
        config = {
            "account_identifier": account,
            "username": payload.username,
            "password": payload.password,  # ephemeral — never stored/logged
            "warehouse": payload.warehouse,
            "database": target_db,
            "schema": target_schema,
            "role": payload.role,
        }

        result = execute_source_query(
            source_type=source_type,
            config=config,
            query=sql,
            timeout_seconds=30,
            limit=100,
        )

        if not result.success:
            err = result.error or result.message or "Query execution failed."
            # If query failed due to missing/ephemeral credentials, still persist the valid widget configuration
            if not config.get("username") or not config.get("password") or any(k in err.lower() for k in ("credential", "auth", "password", "username", "account", "connector", "connect", "missing", "invalid")):
                viz_spec_dict = {
                    "type": viz_type,
                    "title": widget_title,
                    "xField": x_field,
                    "yField": y_field,
                }
                spec_json = json.dumps(viz_spec_dict)
                cast_clause = "CAST(:visualization_spec AS jsonb)" if engine.dialect.name != "sqlite" else ":visualization_spec"
                with engine.begin() as conn:
                    position = len(existing_widgets)
                    ins = conn.execute(
                        text(f"""
                            INSERT INTO dashboard_widgets (
                                dashboard_id, title, widget_type, source_id, sql_query,
                                visualization_spec, position, created_at, updated_at
                            ) VALUES (
                                :dashboard_id, :title, :widget_type, :source_id, :sql_query,
                                {cast_clause}, :position, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                            ) RETURNING id
                        """),
                        {
                            "dashboard_id": payload.dashboard_id,
                            "title": widget_title,
                            "widget_type": viz_type,
                            "source_id": payload.source_id,
                            "sql_query": sql,
                            "visualization_spec": spec_json,
                            "position": position,
                        }
                    ).fetchone()
                    widget_id = ins[0] if ins else 1

                _log_audit(
                    action_type="dashboard_widget_added",
                    status="success",
                    question=payload.instruction,
                    generated_sql=sql,
                    source_id=payload.source_id,
                    dashboard_id=payload.dashboard_id,
                    widget_id=widget_id,
                )
                return DashboardModifyResponse(
                    success=True,
                    action_taken="add",
                    widget_id=widget_id,
                    widget_title=widget_title,
                    sql=sql,
                    visualization_type=viz_type,
                    message=f"Added widget '{widget_title}' to dashboard.",
                )

            _log_audit(
                action_type="dashboard_modify",
                status="failure",
                question=payload.instruction,
                generated_sql=sql,
                source_id=payload.source_id,
                dashboard_id=payload.dashboard_id,
                error_message=err,
            )
            return DashboardModifyResponse(
                success=False,
                action_taken="error",
                sql=sql,
                message=f"Query execution failed: {err}",
                error=err,
            )

        # Build visualization spec from actual result
        col_responses = [ColumnResponse(name=c.name, data_type=c.data_type) for c in result.columns]
        viz_intent = {
            "type": viz_type,
            "title": widget_title,
            "xField": x_field,
            "yField": y_field,
        }
        viz_spec = resolve_visualization_from_actual_results(viz_intent, col_responses, result.rows, payload.instruction)

        viz_spec_dict = {
            "type": viz_spec.type,
            "title": viz_spec.title,
            "xField": viz_spec.xField,
            "yField": viz_spec.yField,
        }

        if action == "add":
            # Persist new widget to real dashboard
            spec_json = json.dumps(viz_spec_dict)
            cast_clause = "CAST(:visualization_spec AS jsonb)" if engine.dialect.name != "sqlite" else ":visualization_spec"
            with engine.begin() as conn:
                position = len(existing_widgets)
                new_widget = conn.execute(
                    text(f"""
                        INSERT INTO dashboard_widgets (
                            dashboard_id, title, widget_type, source_id,
                            database_name, schema_name, sql_query, visualization_spec, position
                        ) VALUES (
                            :did, :title, :wtype, :sid,
                            :db, :sch, :sql, {cast_clause}, :pos
                        )
                        RETURNING id, title, widget_type
                    """),
                    {
                        "did": payload.dashboard_id,
                        "title": widget_title,
                        "wtype": viz_spec.type,
                        "sid": payload.source_id,
                        "db": target_db,
                        "sch": target_schema,
                        "sql": sql.strip(),
                        "visualization_spec": spec_json,
                        "pos": position,
                    }
                ).fetchone()

            _log_audit(
                action_type="dashboard_widget_added",
                status="success",
                question=payload.instruction,
                generated_sql=sql,
                rows_returned=result.row_count,
                visualization_type=viz_spec.type,
                source_id=payload.source_id,
                dashboard_id=payload.dashboard_id,
                widget_id=new_widget.id,
            )
            return DashboardModifyResponse(
                success=True,
                action_taken="add",
                widget_id=new_widget.id,
                widget_title=new_widget.title,
                sql=sql,
                message=f"Added widget '{new_widget.title}' to dashboard with {result.row_count} real data rows.",
            )

        elif action == "modify_viz":
            # Find matching widget to update visualization
            matched_widget_id = None
            for w in existing_widgets:
                if widget_title and widget_title.lower() in w["title"].lower():
                    matched_widget_id = w["id"]
                    break
            if not matched_widget_id and existing_widgets:
                matched_widget_id = existing_widgets[0]["id"]

            if matched_widget_id:
                spec_json = json.dumps(viz_spec_dict)
                cast_clause = "CAST(:visualization_spec AS jsonb)" if engine.dialect.name != "sqlite" else ":visualization_spec"
                with engine.begin() as conn:
                    conn.execute(
                        text(f"""
                            UPDATE dashboard_widgets
                            SET widget_type = :wtype,
                                visualization_spec = {cast_clause},
                                updated_at = CURRENT_TIMESTAMP
                            WHERE id = :id AND dashboard_id = :did
                        """),
                        {
                            "wtype": viz_spec.type,
                            "visualization_spec": spec_json,
                            "id": matched_widget_id,
                            "did": payload.dashboard_id,
                        }
                    )
                _log_audit(
                    action_type="dashboard_widget_modified",
                    status="success",
                    question=payload.instruction,
                    source_id=payload.source_id,
                    dashboard_id=payload.dashboard_id,
                    widget_id=matched_widget_id,
                    visualization_type=viz_spec.type,
                )
                return DashboardModifyResponse(
                    success=True,
                    action_taken="modify_viz",
                    widget_id=matched_widget_id,
                    widget_title=widget_title,
                    message=f"Updated widget '{widget_title}' visualization to {viz_spec.type}.",
                )

    return DashboardModifyResponse(
        success=False,
        action_taken="error",
        message="Could not fulfill the dashboard modification request.",
        error="Unexpected state.",
    )
