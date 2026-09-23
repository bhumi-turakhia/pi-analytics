from typing import List, Optional, Tuple
from backend.app.services.copilot.models import (
    AnalyticalIntent,
    AggregationType,
    TemporalGrain,
    MetricIntent,
    CalculatedMetricIntent,
    FilterIntent,
    JoinIntent,
)


def compile_intent_to_sql(intent: AnalyticalIntent) -> str:
    """
    Deterministically compile an AnalyticalIntent into a read-only Snowflake SQL query.
    Takes the structured intent as the ONLY source of truth.
    Does NOT guess, re-parse or inspect user question text.
    """
    if intent.intent_type in ("clarification", "unsupported") or intent.needs_clarification:
        raise ValueError(
            intent.unsupported_reason
            or intent.clarification_question
            or "Intent cannot be compiled into executable SQL."
        )

    db = intent.database
    sch = intent.schema_name
    tbl = intent.dataset

    # Base table qualification
    if db and sch:
        base_from = f'"{db}"."{sch}"."{tbl}"'
    elif sch:
        base_from = f'"{sch}"."{tbl}"'
    else:
        base_from = f'"{tbl}"'

    select_items: List[str] = []
    group_by_items: List[str] = []
    order_by_items: List[str] = []

    # Helper to qualify column
    def col_ref(col: str) -> str:
        if "." in col:
            parts = col.split(".")
            return ".".join(f'"{p.strip().strip(chr(34))}"' for p in parts)
        if intent.joins:
            return f'"{tbl}"."{col.strip().strip(chr(34))}"'
        return f'"{col.strip().strip(chr(34))}"'

    # 1. Dimensions
    for dim in intent.dimensions:
        c_ref = col_ref(dim)
        select_items.append(c_ref)
        group_by_items.append(c_ref)

    # 2. Temporal Grain Expression
    temporal_trunc_expr: Optional[str] = None
    temporal_alias: Optional[str] = None
    if (
        intent.temporal_grain != TemporalGrain.none
        and intent.time_dimension
    ):
        grain_str = intent.temporal_grain.value.upper()
        time_ref = col_ref(intent.time_dimension)
        # Unique non-colliding alias, e.g. "SALE_DATE_MONTH"
        clean_time_name = intent.time_dimension.split(".")[-1].strip().strip('"')
        temporal_alias = f"{clean_time_name}_{grain_str}"
        if intent.temporal_grain == TemporalGrain.half_year:
            temporal_trunc_expr = f"CASE WHEN EXTRACT(MONTH FROM {time_ref}) <= 6 THEN 'H1' ELSE 'H2' END"
        else:
            temporal_trunc_expr = f"DATE_TRUNC('{grain_str}', {time_ref})"
        
        select_items.append(f'{temporal_trunc_expr} AS "{temporal_alias}"')
        group_by_items.append(temporal_trunc_expr)

    # 3. Standard Metrics
    metric_aliases: List[str] = []
    for idx, m in enumerate(intent.metrics):
        agg = m.aggregation.value
        field_ref = col_ref(m.field) if m.field != "*" else "*"
        clean_field = m.field.split(".")[-1].strip().strip('"')
        
        if m.alias:
            alias = m.alias.strip().strip('"')
        else:
            if agg == "COUNT" and m.field == "*":
                alias = "TOTAL_COUNT"
            else:
                alias = f"{agg}_{clean_field}"

        metric_aliases.append(alias)
        
        if agg == "COUNT_DISTINCT":
            select_items.append(f'COUNT(DISTINCT {field_ref}) AS "{alias}"')
        elif agg == "COUNT" and m.field == "*":
            select_items.append(f'COUNT(*) AS "{alias}"')
        else:
            select_items.append(f'{agg}({field_ref}) AS "{alias}"')

    # 4. Calculated Metrics (Ratio of Sums, Percent of Total, Growth)
    for cm in intent.calculated_metrics:
        num_ref = col_ref(cm.numerator_field) if cm.numerator_field else None
        den_ref = col_ref(cm.denominator_field) if cm.denominator_field else None
        alias = cm.alias or cm.name
        metric_aliases.append(alias)
        if cm.semantics == "percent_of_total":
            if cm.group_filter and "value" in cm.group_filter:
                filter_val = str(cm.group_filter["value"]).replace("'", "''")
                filter_col = col_ref(cm.group_filter.get("column", "REGION"))
                select_items.append(
                    f'(SUM(CASE WHEN {filter_col} ILIKE \'%{filter_val}%\' THEN {num_ref} ELSE 0 END) * 100.0 / NULLIF(SUM({num_ref}), 0)) AS "{alias}"'
                )
            else:
                select_items.append(
                    f'(SUM({num_ref}) * 100.0 / NULLIF(SUM(SUM({num_ref})) OVER(), 0)) AS "{alias}"'
                )
        elif cm.semantics == "ratio_of_sums":
            select_items.append(
                f'(SUM({num_ref}) / NULLIF(SUM({den_ref}), 0)) AS "{alias}"'
            )
        else:
            select_items.append(
                f'AVG({num_ref} / NULLIF({den_ref}, 0)) AS "{alias}"'
            )

    # If raw records query and no metrics/dimensions were specified
    if intent.intent_type == "raw_records" and not select_items:
        select_clause = "*"
    else:
        select_clause = ", ".join(select_items) if select_items else "*"

    # 5. Joins
    from_clause = base_from
    for j in intent.joins:
        j_type = j.join_type.upper()
        l_ref = col_ref(f"{j.left_table}.{j.left_key}")
        r_ref = col_ref(f"{j.right_table}.{j.right_key}")
        from_clause += f' {j_type} JOIN "{j.right_table}" ON {l_ref} = {r_ref}'

    # 6. WHERE (Filters + Date Range)
    where_conditions: List[str] = []
    if intent.date_range:
        time_col = intent.time_dimension or "HIRE_DATE"
        start_d, end_d = intent.date_range
        time_ref = col_ref(time_col)
        where_conditions.append(f"{time_ref} >= '{start_d}' AND {time_ref} <= '{end_d}'")

    for flt in intent.filters:
        c_ref = col_ref(flt.column)
        op = flt.operator.upper()
        val = flt.value
        if isinstance(val, (int, float)):
            where_conditions.append(f"{c_ref} {op} {val}")
        elif isinstance(val, list):
            formatted_vals = ", ".join(f"'{v}'" if isinstance(v, str) else str(v) for v in val)
            where_conditions.append(f"{c_ref} IN ({formatted_vals})")
        else:
            escaped_val = str(val).replace("'", "''")
            where_conditions.append(f"{c_ref} {op} '{escaped_val}'")

    where_clause = f" WHERE {' AND '.join(where_conditions)}" if where_conditions else ""

    # 7. GROUP BY
    # Scalar queries MUST NEVER have a GROUP BY
    group_by_clause = ""
    if intent.intent_type in ("grouped", "timeseries", "ranking", "comparison"):
        if group_by_items:
            group_by_clause = f" GROUP BY {', '.join(group_by_items)}"

    # 8. ORDER BY
    if intent.intent_type == "timeseries" and temporal_trunc_expr:
        order_by_items.append(f"{temporal_trunc_expr} ASC")
    elif intent.intent_type == "ranking":
        sort_target = intent.sort_field or (f'"{metric_aliases[0]}"' if metric_aliases else None)
        direction = (intent.ranking_direction or intent.sort_direction or "DESC").upper()
        if sort_target:
            if not sort_target.startswith('"') and "." not in sort_target:
                sort_target = f'"{sort_target}"'
            order_by_items.append(f"{sort_target} {direction}")
            # Deterministic tie-breaker on the first dimension if present
            if intent.dimensions:
                first_dim_ref = col_ref(intent.dimensions[0])
                if first_dim_ref != sort_target:
                    order_by_items.append(f"{first_dim_ref} ASC")
    elif intent.sort_field:
        direction = (intent.sort_direction or "ASC").upper()
        s_field = intent.sort_field.strip().strip('"')
        if s_field in metric_aliases or any(s_field == (m.alias or "").strip().strip('"') for m in intent.metrics) or any(s_field == (cm.alias or "").strip().strip('"') for cm in intent.calculated_metrics):
            s_ref = f'"{s_field}"'
        else:
            s_ref = col_ref(intent.sort_field)
        order_by_items.append(f"{s_ref} {direction}")

    order_by_clause = f" ORDER BY {', '.join(order_by_items)}" if order_by_items else ""

    # 9. LIMIT
    limit_clause = ""
    if intent.limit is not None:
        limit_clause = f" LIMIT {intent.limit}"
    elif intent.intent_type == "raw_records":
        limit_clause = " LIMIT 100"

    sql = f"SELECT {select_clause} FROM {from_clause}{where_clause}{group_by_clause}{order_by_clause}{limit_clause};"
    return sql
