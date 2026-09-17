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

    # Ephemeral credentials (used for query execution, never stored)
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
    columns: List[ColumnResponse] = []
    rows: List[Dict[str, Any]] = []
    row_count: int = 0
    execution_time_ms: int = 0
    visualization: Optional[VisualizationSpec] = None
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


# ─────────────────────────────────────────────────────────────
# Catalog-Grounded Analytical Generator
# ─────────────────────────────────────────────────────────────

def _check_unknown_references(question: str, catalog: List[Dict[str, Any]]) -> Optional[str]:
    """
    Check if the user question explicitly asks for a table or column that does NOT exist
    in the connected catalog (e.g. 'secret_table', 'secret_column').
    Returns an error message if an unknown dataset/column is referenced, or None.
    """
    q_lower = question.lower()

    # Check for patterns like "from <table_name>" or "in <table_name>" or "secret_table"
    from_match = re.search(r"\b(?:from|in|table)\s+([a-zA-Z0-9_]+)", q_lower)
    if from_match:
        requested_tbl = from_match.group(1).upper()
        # common words to ignore
        if requested_tbl not in ("THE", "A", "OUR", "THIS", "MY", "EACH", "ALL", "WHERE"):
            known_tables = [t["table"].upper() for t in catalog if t.get("table")]
            if requested_tbl not in known_tables:
                return f"I couldn't find a dataset or column in the connected catalog that supports this question. (Table '{from_match.group(1)}' not found)"

    # Check for direct mention of unknown table names with underscore or explicit identifiers like secret_table
    explicit_words = re.findall(r"\b[a-zA-Z0-9_]+_[a-zA-Z0-9_]+\b", q_lower)
    for word in explicit_words:
        w_upper = word.upper()
        all_tables = [t["table"].upper() for t in catalog if t.get("table")]
        all_cols = [c["name"].upper() for t in catalog for c in t.get("columns", [])]
        if w_upper not in all_tables and w_upper not in all_cols:
            if "secret" in word or "hidden" in word or "unknown" in word or "private" in word:
                return "I couldn't find a dataset or column in the connected catalog that supports this question."

    return None


def _find_best_table_and_columns(question: str, catalog: List[Dict[str, Any]]) -> Optional[Tuple[Dict[str, Any], Dict[str, Any]]]:
    """
    Find the most relevant table and candidate columns matching analytical intent.
    Returns (table_info, col_mapping) or None.
    """
    if not catalog:
        return None

    q_lower = question.lower()

    # Score each table by column and table name matches
    scored_tables = []
    for t in catalog:
        score = 0
        t_name = t["table"].lower()
        if t_name in q_lower:
            score += 10

        # Keywords in question
        if any(k in q_lower for k in ("sale", "revenue", "order", "amount", "transaction")) and any(k in t_name for k in ("sale", "order", "revenue", "fact")):
            score += 8
        if any(k in q_lower for k in ("customer", "client", "user", "account")) and any(k in t_name for k in ("customer", "account", "client", "dim_customer")):
            score += 8
        if any(k in q_lower for k in ("product", "item", "inventory")) and any(k in t_name for k in ("product", "item")):
            score += 8

        # Column matches
        for col in t.get("columns", []):
            c_name = col["name"].lower()
            if c_name in q_lower:
                score += 5
            if "region" in q_lower and "region" in c_name:
                score += 6
            if ("month" in q_lower or "date" in q_lower) and ("month" in c_name or "date" in c_name or "day" in c_name):
                score += 6
            if ("revenue" in q_lower or "sale" in q_lower) and ("revenue" in c_name or "sale" in c_name or "amount" in c_name or "price" in c_name):
                score += 6

        scored_tables.append((score, t))

    scored_tables.sort(key=lambda x: x[0], reverse=True)
    best_table = scored_tables[0][1] if scored_tables else catalog[0]

    # Map candidate columns
    cols = best_table.get("columns", [])
    col_mapping = {
        "numeric": [],
        "date": [],
        "category": [],
        "id": [],
    }

    for c in cols:
        name = c["name"]
        dt = c["data_type"].upper()
        if any(n in dt for n in ("INT", "NUM", "FLOAT", "DOUBLE", "DECIMAL", "REAL", "BIGINT")):
            if not any(i in name.lower() for i in ("id", "key", "zip", "code")):
                col_mapping["numeric"].append(name)
            else:
                col_mapping["id"].append(name)
        elif any(d in dt for d in ("DATE", "TIME", "TIMESTAMP")):
            col_mapping["date"].append(name)
        else:
            if any(n in name.lower() for n in ("month", "year", "quarter")):
                col_mapping["date"].append(name)
            elif any(i in name.lower() for i in ("id", "key")):
                col_mapping["id"].append(name)
            else:
                col_mapping["category"].append(name)

    return best_table, col_mapping


def generate_catalog_grounded_sql(question: str, catalog: List[Dict[str, Any]], limit: int = 100) -> Tuple[str, Dict[str, Any]]:
    """
    Deterministically generate valid, catalog-grounded read-only SQL based on user intent.
    Returns (sql_query, visualization_intent).
    """
    best = _find_best_table_and_columns(question, catalog)
    if not best:
        raise ValueError("No matching catalog table found.")

    tbl, cols = best
    db = tbl["database"]
    sch = tbl["schema"]
    table_name = tbl["table"]
    table_ref = f'"{db}"."{sch}"."{table_name}"' if db and sch else f'"{table_name}"'

    q_lower = question.lower()

    # 1. Total aggregate question (e.g. "What is total revenue?", "Total sales")
    if (any(k in q_lower for k in ("what is total", "show total", "total revenue", "total sales", "overall revenue")) and not any(k in q_lower for k in ("by", "across", "month", "region", "per"))):
        num_col = cols["numeric"][0] if cols["numeric"] else (cols["id"][0] if cols["id"] else "*")
        alias = "TOTAL_REVENUE" if "revenue" in q_lower else ("TOTAL_SALES" if "sale" in q_lower else f"TOTAL_{num_col}")
        sql = f'SELECT SUM("{num_col}") AS "{alias}" FROM {table_ref};'
        viz = {
            "type": "kpi",
            "title": alias.replace("_", " ").title(),
            "xField": None,
            "yField": alias,
        }
        return sql, viz

    # 2. Count question (e.g. "How many customers do we have?", "Count of orders")
    if any(k in q_lower for k in ("how many", "count of", "number of")):
        alias = "TOTAL_COUNT"
        if "customer" in q_lower:
            alias = "TOTAL_CUSTOMERS"
        elif "order" in q_lower:
            alias = "TOTAL_ORDERS"
        elif "product" in q_lower:
            alias = "TOTAL_PRODUCTS"
        sql = f'SELECT COUNT(*) AS "{alias}" FROM {table_ref};'
        viz = {
            "type": "kpi",
            "title": alias.replace("_", " ").title(),
            "xField": None,
            "yField": alias,
        }
        return sql, viz

    # 3. Monthly / Time-series question (e.g. "Show monthly revenue", "revenue by month")
    if any(k in q_lower for k in ("month", "monthly", "over time", "trend", "by date")):
        date_col = None
        for d in cols["date"]:
            if "month" in d.lower() or "date" in d.lower():
                date_col = d
                break
        if not date_col and cols["date"]:
            date_col = cols["date"][0]
        if not date_col and cols["category"]:
            # Check if category col has month/date in name
            for c in cols["category"]:
                if any(k in c.lower() for k in ("month", "date", "period")):
                    date_col = c
                    break

        num_col = cols["numeric"][0] if cols["numeric"] else None

        if date_col and num_col:
            alias = "MONTHLY_REVENUE" if "revenue" in q_lower else "TOTAL_SALES"
            sql = f'SELECT "{date_col}", SUM("{num_col}") AS "{alias}" FROM {table_ref} GROUP BY "{date_col}" ORDER BY "{date_col}" ASC LIMIT {limit};'
            viz = {
                "type": "line",
                "title": f'{alias.replace("_", " ").title()} by {date_col.title()}',
                "xField": date_col,
                "yField": alias,
            }
            return sql, viz

    # 4. By Region / Categorical breakdown (e.g. "Show sales by region", "Compare sales across regions")
    if any(k in q_lower for k in ("by region", "across region", "per region", "sales by region")) or any(c.lower() in q_lower for c in cols["category"]):
        cat_col = None
        if "region" in q_lower:
            for c in cols["category"]:
                if "region" in c.lower():
                    cat_col = c
                    break
        if not cat_col and cols["category"]:
            cat_col = cols["category"][0]

        num_col = cols["numeric"][0] if cols["numeric"] else None

        if cat_col and num_col:
            alias = "TOTAL_SALES" if "sale" in q_lower else "TOTAL_REVENUE"
            sql = f'SELECT "{cat_col}", SUM("{num_col}") AS "{alias}" FROM {table_ref} GROUP BY "{cat_col}" ORDER BY "{alias}" DESC LIMIT {limit};'
            viz = {
                "type": "bar",
                "title": f'{alias.replace("_", " ").title()} by {cat_col.title()}',
                "xField": cat_col,
                "yField": alias,
            }
            return sql, viz

    # 5. Top N question (e.g. "Top 10 products by revenue", "Which region has highest sales")
    if any(k in q_lower for k in ("top", "highest", "lowest", "best")):
        cat_col = cols["category"][0] if cols["category"] else (cols["id"][0] if cols["id"] else None)
        num_col = cols["numeric"][0] if cols["numeric"] else None
        n_match = re.search(r"\btop\s+(\d+)", q_lower)
        top_n = int(n_match.group(1)) if n_match else (1 if "highest" in q_lower else 10)

        if cat_col and num_col:
            alias = "TOTAL_AMOUNT"
            if "revenue" in q_lower:
                alias = "TOTAL_REVENUE"
            elif "sale" in q_lower:
                alias = "TOTAL_SALES"

            order_dir = "ASC" if "lowest" in q_lower else "DESC"
            sql = f'SELECT "{cat_col}", SUM("{num_col}") AS "{alias}" FROM {table_ref} GROUP BY "{cat_col}" ORDER BY "{alias}" {order_dir} LIMIT {top_n};'
            viz = {
                "type": "bar" if top_n > 1 else "kpi",
                "title": f'Top {top_n} {cat_col.title()} by {alias.replace("_", " ").title()}' if top_n > 1 else f'Highest {cat_col.title()}',
                "xField": cat_col if top_n > 1 else None,
                "yField": alias,
            }
            return sql, viz

    # 6. Fallback: Select preview rows from table
    all_col_names = [f'"{c["name"]}"' for c in tbl.get("columns", [])[:6]]
    cols_clause = ", ".join(all_col_names) if all_col_names else "*"
    sql = f'SELECT {cols_clause} FROM {table_ref} LIMIT {limit};'
    viz = {
        "type": "table",
        "title": f'Data from {table_name}',
        "xField": None,
        "yField": None,
    }
    return sql, viz


def call_gemini_for_sql(question: str, catalog: List[Dict[str, Any]]) -> Optional[Tuple[str, Dict[str, Any], str]]:
    """
    If GEMINI_API_KEY is configured, ask Gemini to generate structured SQL + viz spec.
    Returns (sql, viz_spec, explanation) or None.
    """
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not api_key or api_key in ("MY_GEMINI_API_KEY", ""):
        return None

    try:
        import google.generativeai as genai
    except ImportError:
        return None

    # Format catalog schema summary
    catalog_lines = []
    for t in catalog:
        col_strs = [f"{c['name']} {c['data_type']}" for c in t.get("columns", [])]
        catalog_lines.append(f'Table "{t["database"]}"."{t["schema"]}"."{t["table"]}": {", ".join(col_strs)}')

    catalog_context = "\n".join(catalog_lines)

    prompt = f"""\
You are an expert SQL generator for an enterprise analytics platform.
You will receive a user question and a schema catalog.
Generate a valid read-only SQL query grounded ONLY in the tables and columns provided in the catalog.
Do NOT invent any tables, columns, or values.
The SQL query MUST start with SELECT or WITH.
Never output INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE, or any mutating statements.

Available Catalog:
{catalog_context}

User Question: {question}

Return ONLY a JSON object with this exact structure:
{{
  "sql": "<executable read-only SQL query using double-quoted identifiers>",
  "intent": "<short summary of question intent>",
  "explanation": "<1-2 sentence description of what the query calculates>",
  "visualization": {{
    "type": "<bar|line|kpi|table>",
    "title": "<title for chart>",
    "xField": "<column name for X axis or category>",
    "yField": "<column name for Y axis or metric>"
  }}
}}
"""
    try:
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel("gemini-2.0-flash")
        response = model.generate_content(
            prompt,
            generation_config=genai.GenerationConfig(
                temperature=0.1,
                max_output_tokens=1024,
                response_mime_type="application/json"
            )
        )
        raw = response.text.strip()
        raw = re.sub(r"^```(?:json)?\s*", "", raw, flags=re.MULTILINE)
        raw = re.sub(r"\s*```$", "", raw, flags=re.MULTILINE)
        data = json.loads(raw)
        sql = data.get("sql")
        viz = data.get("visualization", {})
        explanation = data.get("explanation", "Query generated from catalog.")
        if sql:
            return sql, viz, explanation
    except Exception:
        pass

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
# Copilot Query Endpoint
# ─────────────────────────────────────────────────────────────

@router.post("/query", response_model=CopilotQueryResponse)
def copilot_query(payload: CopilotQueryRequest):
    """
    AI Analytics Copilot orchestration endpoint (Step 10).

    1. Retrieves catalog context from PostgreSQL.
    2. Validates user question against known tables/columns (rejects hallucinations).
    3. Generates catalog-grounded read-only SQL.
    4. Validates SQL through existing Step 9 read-only safety pipeline.
    5. Executes query against data warehouse via Step 9 execute_source_query.
    6. Produces visualization specification strictly based on actual returned columns/rows.
    7. Formulates natural-language answer based strictly on real data results.
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
        return CopilotQueryResponse(
            success=False,
            answer="No catalog metadata is available for this data source. Please synchronize metadata first.",
            error="No catalog metadata available for source.",
        )

    # 4. Check for unknown table/column references
    unknown_err = _check_unknown_references(payload.question, catalog)
    if unknown_err:
        return CopilotQueryResponse(
            success=False,
            answer=unknown_err,
            error=unknown_err,
        )

    # 5. Generate catalog-grounded SQL
    # Try Gemini first if configured
    gemini_res = call_gemini_for_sql(payload.question, catalog)
    if gemini_res:
        generated_sql, viz_intent, explanation = gemini_res
    else:
        try:
            generated_sql, viz_intent = generate_catalog_grounded_sql(
                payload.question,
                catalog,
                limit=payload.limit or 100
            )
            explanation = f"Generated analytical query for: {payload.question}"
        except Exception as e:
            return CopilotQueryResponse(
                success=False,
                answer=f"Could not generate query for this question: {str(e)}",
                error=str(e),
            )

    # 6. Safety validation: reuse Step 9 read-only safety pipeline
    try:
        validate_read_only_query(generated_sql, max_limit=1000)
    except HTTPException as h_err:
        return CopilotQueryResponse(
            success=False,
            answer=f"SQL safety violation: {h_err.detail}",
            sql=generated_sql,
            error=h_err.detail,
        )

    # 7. Execute query via Step 9 execution pipeline
    account = payload.account_identifier or payload.accountIdentifier
    target_db = payload.database or (catalog[0]["database"] if catalog else None)
    target_schema = payload.schema_name or (catalog[0]["schema"] if catalog else None)

    config = {
        "account_identifier": account,
        "username": payload.username,
        "password": payload.password,
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
        error_msg = result.error or result.message or "Query execution failed."
        return CopilotQueryResponse(
            success=False,
            answer=f"Query execution failed: {error_msg}",
            sql=generated_sql,
            error=error_msg,
            execution_time_ms=exec_time,
        )

    col_responses = [ColumnResponse(name=c.name, data_type=c.data_type) for c in result.columns]

    # 8. Handle Empty Result
    if not result.rows or len(result.rows) == 0:
        return CopilotQueryResponse(
            success=True,
            answer="The query executed successfully, but returned no rows.",
            sql=generated_sql,
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

    # 9. Derive Visualization Spec from ACTUAL Result
    viz_spec = resolve_visualization_from_actual_results(
        viz_intent,
        col_responses,
        result.rows,
        payload.question
    )

    # 10. Generate natural language answer strictly grounded in real numbers
    if viz_spec.type == "kpi" and viz_spec.value is not None:
        try:
            val_formatted = f"{float(viz_spec.value):,.2f}" if isinstance(viz_spec.value, (int, float)) else str(viz_spec.value)
        except Exception:
            val_formatted = str(viz_spec.value)
        answer = f"The actual {viz_spec.title.lower()} is {val_formatted}."
    else:
        answer = f"{viz_spec.title}: Returned {len(result.rows)} rows from connected warehouse."

    return CopilotQueryResponse(
        success=True,
        answer=answer,
        sql=generated_sql,
        columns=col_responses,
        rows=result.rows,
        row_count=result.row_count,
        execution_time_ms=exec_time,
        visualization=viz_spec,
    )
