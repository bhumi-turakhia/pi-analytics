import re
from typing import Any, Dict, List, Optional, Set
import sqlglot
from sqlglot import exp

from backend.app.services.copilot.models import (
    AnalyticalIntent,
    AggregationType,
    TemporalGrain,
)


class SQLValidationError(ValueError):
    pass


def validate_sql_against_intent(
    intent: AnalyticalIntent,
    sql: str,
    catalog: Optional[List[Dict[str, Any]]] = None,
) -> Optional[str]:
    """
    Validate the generated SQL AST against the full AnalyticalIntent using sqlglot.
    Verifies that EVERY referenced column in the SQL AST exists in the live catalog before execution.
    Returns None if valid, or an error string describing the exact discrepancy.
    """
    if not sql or not sql.strip():
        return "Generated SQL is empty."

    # 1. Allow-list rule: parse statements and ensure exactly ONE SELECT statement
    # Strip SQL comments to prevent hidden statement injection via comments
    cleaned_sql = re.sub(r"--.*?$", "", sql, flags=re.MULTILINE)
    cleaned_sql = re.sub(r"/\*.*?\*/", "", cleaned_sql, flags=re.DOTALL).strip()
    
    try:
        statements = sqlglot.parse(cleaned_sql, read="snowflake")
    except Exception as e:
        return f"SQL syntax error: {str(e)}"

    # Filter out empty statements (e.g. trailing semicolons)
    statements = [s for s in statements if s is not None]
    if len(statements) != 1:
        return f"Allow-list violation: Expected exactly 1 SQL statement, got {len(statements)}."

    stmt = statements[0]
    if not isinstance(stmt, exp.Select):
        return f"Allow-list violation: Only SELECT queries are permitted, got {stmt.key.upper()}."

    # Check for prohibited statements / mutations anywhere in AST
    prohibited_types = (
        exp.Insert,
        exp.Update,
        exp.Delete,
        exp.Drop,
        exp.Alter,
        exp.Command,
        exp.Create,
        exp.Merge,
        exp.Grant,
        exp.Revoke,
    )
    for node in stmt.walk():
        if isinstance(node, prohibited_types):
            return f"Security violation: Prohibited statement or operation detected ({node.key.upper()})."

    # 2. Table and Join Validation
    tables = [t.name.upper() for t in stmt.find_all(exp.Table) if t.name]
    if not tables:
        return "No source table found in SQL query."

    primary_table = intent.dataset.upper()
    if primary_table not in tables:
        return f"Table mismatch: Expected '{primary_table}', but SQL references {tables}."

    expected_tables = {primary_table}
    for j in intent.joins:
        expected_tables.add(j.right_table.upper())
        expected_tables.add(j.left_table.upper())

    unexpected_tables = set(tables) - expected_tables
    if unexpected_tables:
        return f"Unrequested join/table detected: {unexpected_tables} not in intent."

    # 2b. Strict Catalog Column Existence Verification (Rule 1a)
    if catalog:
        # Build lookup map: TABLE_NAME -> Set[COLUMN_NAMES]
        catalog_table_cols: Dict[str, Set[str]] = {}
        for t in catalog:
            t_name = t["table"].upper()
            catalog_table_cols[t_name] = {c["name"].upper() for c in t.get("columns", [])}

        # Collect SELECT aliases
        select_aliases = {alias.alias_or_name.upper() for alias in stmt.find_all(exp.Alias)}

        # Check every column node in the AST
        for col_node in stmt.find_all(exp.Column):
            col_name = col_node.name.upper()
            if col_name == "*" or col_name in select_aliases:
                continue
            
            # Determine table qualification
            table_qual = col_node.table.upper() if col_node.table else None
            
            if table_qual:
                if table_qual not in catalog_table_cols:
                    return f"Column validation error: Table '{table_qual}' referenced by column '{col_name}' is not in catalog."
                if col_name not in catalog_table_cols[table_qual]:
                    return f"Column validation error: Column '{col_name}' does not exist on table '{table_qual}' in catalog. Available columns on {table_qual}: {sorted(list(catalog_table_cols[table_qual]))}."
            else:
                # Unqualified column name: verify it exists on at least one referenced table or is a SELECT alias
                found_in_any = False
                for t_name in tables:
                    if t_name in catalog_table_cols and col_name in catalog_table_cols[t_name]:
                        found_in_any = True
                        break
                if not found_in_any:
                    all_cols = []
                    for t_name in tables:
                        if t_name in catalog_table_cols:
                            all_cols.extend(sorted(list(catalog_table_cols[t_name])))
                    return f"Column validation error: Column '{col_name}' does not exist on table '{primary_table}' in catalog. Available columns: {all_cols}."

    # 3. Scalar vs Grouped Shape
    group = stmt.args.get("group")
    if intent.intent_type == "scalar":
        if group is not None:
            return "Shape mismatch: Scalar query must not contain a GROUP BY clause."
    elif intent.intent_type in ("grouped", "timeseries", "ranking", "comparison"):
        if intent.dimensions or (intent.temporal_grain != TemporalGrain.none and intent.time_dimension):
            if group is None:
                return "Shape mismatch: Grouped/timeseries query requires a GROUP BY clause."

    # 4. Metrics and Aggregations Validation
    select_exprs = stmt.expressions
    ast_aggregates = []
    for expr in stmt.find_all(exp.AggFunc):
        agg_name = expr.key.upper()
        # Find column inside agg
        cols = [c.name.upper() for c in expr.find_all(exp.Column) if c.name]
        is_star = bool(list(expr.find_all(exp.Star)))
        ast_aggregates.append({
            "agg": agg_name,
            "columns": cols,
            "is_star": is_star,
        })

    # Verify each MetricIntent is satisfied
    for m in intent.metrics:
        expected_agg = "COUNT" if m.aggregation in (AggregationType.COUNT, AggregationType.COUNT_DISTINCT) else m.aggregation.value
        expected_col = m.field.upper()
        
        matched = False
        for a in ast_aggregates:
            if a["agg"] == expected_agg:
                if expected_col == "*" and (a["is_star"] or not a["columns"]):
                    matched = True
                    break
                elif expected_col in a["columns"] or (expected_col.split(".")[-1] in a["columns"]):
                    matched = True
                    break
        if not matched:
            return f"Metric mismatch: Expected {m.aggregation.value}(\"{m.field}\") in SQL projection."

    # No unrequested metrics check (allowing calculated metrics)
    cm_agg_count = 0
    for cm in intent.calculated_metrics:
        sem = getattr(cm, "semantics", "ratio_of_sums")
        if sem == "percent_of_total":
            if getattr(cm, "group_filter", None):
                cm_agg_count += 2
            else:
                cm_agg_count += 3
        elif sem == "ratio_of_sums":
            cm_agg_count += 2
        else:
            cm_agg_count += 1

    expected_metric_count = len(intent.metrics) + cm_agg_count
    if intent.intent_type != "raw_records" and len(ast_aggregates) > expected_metric_count:
        return f"Unrequested metric: SQL has {len(ast_aggregates)} aggregations, expected {expected_metric_count}."

    # 5. Dimensions and Group By Validation
    if group is not None:
        group_col_names = set()
        for g_expr in group.expressions:
            for c in g_expr.find_all(exp.Column):
                group_col_names.add(c.name.upper())

        for dim in intent.dimensions:
            dim_clean = dim.split(".")[-1].upper()
            if dim_clean not in group_col_names:
                return f"Dimension mismatch: Expected '{dim}' in GROUP BY clause."

        # Check for unrequested dimensions
        expected_dims = {d.split(".")[-1].upper() for d in intent.dimensions}
        if intent.temporal_grain != TemporalGrain.none and intent.time_dimension:
            expected_dims.add(intent.time_dimension.split(".")[-1].upper())
        unexpected_dims = group_col_names - expected_dims
        if unexpected_dims:
            return f"Unrequested dimension in GROUP BY: {unexpected_dims}."

    # 6. Temporal Grain Validation
    if intent.temporal_grain != TemporalGrain.none and intent.time_dimension:
        grain_upper = intent.temporal_grain.value.upper()
        sql_str_upper = str(stmt).upper()
        # Check that DATE_TRUNC appears with matching grain, or CASE expression for HALF_YEAR
        found_trunc = False
        if grain_upper == "HALF_YEAR" and ("EXTRACT(MONTH" in sql_str_upper or "'H1'" in sql_str_upper or "MONTH" in sql_str_upper):
            found_trunc = True
        else:
            for node in stmt.find_all((exp.TimestampTrunc, exp.DateTrunc, exp.Anonymous)):
                unit_str = str(node.args.get("unit", "")).strip("'\"").upper()
                if grain_upper in unit_str:
                    found_trunc = True
                    break
                if isinstance(node, exp.Anonymous) and node.this.upper() == "DATE_TRUNC":
                    trunc_args = [str(a).strip("'\"").upper() for a in node.expressions]
                    if grain_upper in trunc_args:
                        found_trunc = True
                        break
        if not found_trunc:
            return f"Temporal grain mismatch: Expected DATE_TRUNC('{grain_upper}', \"{intent.time_dimension}\") in SQL."

    # 7. Filters and Date Range Validation
    where = stmt.args.get("where")
    if intent.filters or intent.date_range:
        if where is None:
            return "Filter mismatch: Expected WHERE clause with specified filters / date range."
        where_cols = {c.name.upper() for c in where.find_all(exp.Column) if c.name}
        if intent.date_range and intent.time_dimension:
            expected_time_col = intent.time_dimension.split(".")[-1].upper()
            if expected_time_col not in where_cols:
                return f"Filter mismatch: Expected date filter on '{intent.time_dimension}'."
        for flt in intent.filters:
            clean_flt_col = flt.column.split(".")[-1].upper()
            if clean_flt_col not in where_cols:
                return f"Filter mismatch: Expected filter on '{flt.column}' in WHERE clause."

    # 8. Limit Validation
    limit_node = stmt.args.get("limit")
    if intent.limit is not None:
        if limit_node is None:
            return f"Limit mismatch: Expected LIMIT {intent.limit} in SQL."
        try:
            limit_val = int(limit_node.expression.this)
            if limit_val != intent.limit:
                return f"Limit mismatch: Expected LIMIT {intent.limit}, got LIMIT {limit_val}."
        except Exception:
            return f"Limit mismatch: Unable to verify LIMIT {intent.limit} in AST."

    # 9. Order By and Ranking Direction Validation
    order_node = stmt.args.get("order")
    if intent.ranking_direction:
        if order_node is None:
            return f"Ranking mismatch: Expected ORDER BY ... {intent.ranking_direction}."
        first_order = order_node.expressions[0]
        is_desc = isinstance(first_order, exp.Ordered) and first_order.args.get("desc") is True
        expected_desc = (intent.ranking_direction == "DESC")
        if is_desc != expected_desc:
            return f"Ranking direction mismatch: Expected {intent.ranking_direction} order."

    return None
