import re
from typing import List, Optional, Tuple, Set
from backend.app.services.copilot.models import (
    AnalyticalIntent,
    AggregationType,
    TemporalGrain,
)


def generate_interpretation_statement(intent: AnalyticalIntent) -> str:
    """
    Generate a standardized one-line 'How I interpreted this' statement
    listing metrics + aggregations, grouping, filters, date range, and grain.
    Renders Top N (highest) vs Bottom N (lowest) correctly and qualifies table names.
    """
    if intent.intent_type in ("clarification", "unsupported") or intent.needs_clarification:
        return intent.unsupported_reason or intent.clarification_question or "Could not interpret analytical intent."

    tbl = intent.dataset

    # Helper to qualify column string with table
    def qual(col: str) -> str:
        if "." in col:
            return col
        return f"{tbl}.{col}"

    # Metrics + Aggregations
    metric_strs = []
    for m in intent.metrics:
        f_ref = qual(m.field) if m.field != "*" else "*"
        metric_strs.append(f"{m.aggregation.value}({f_ref})")
    for cm in intent.calculated_metrics:
        metric_strs.append(f"{cm.name}=SUM({qual(cm.numerator_field)})/SUM({qual(cm.denominator_field)})")
    metrics_display = ", ".join(metric_strs) if metric_strs else "(none)"

    # Grouping / Dimensions
    dim_strs = [qual(d) for d in intent.dimensions]
    grouping_display = ", ".join(dim_strs) if dim_strs else "Overall (no breakdown)"

    # Filters
    filter_strs = [f'{qual(f.column)} {f.operator} {f.value}' for f in intent.filters]
    filters_display = ", ".join(filter_strs) if filter_strs else "None"

    # Date Range
    if intent.date_range and intent.time_dimension:
        date_display = f'{qual(intent.time_dimension)} between {intent.date_range[0]} and {intent.date_range[1]}'
    else:
        date_display = "All time"

    # Grain
    grain_display = intent.temporal_grain.value if intent.temporal_grain != TemporalGrain.none else "none"

    # Limit / Ranking
    if intent.limit and intent.ranking_direction:
        if intent.ranking_direction.upper() == "ASC":
            limit_display = f"Bottom {intent.limit} (lowest)"
        else:
            limit_display = f"Top {intent.limit} (highest)"
    elif intent.limit:
        limit_display = f"Limit {intent.limit}"
    else:
        limit_display = "None"

    return (
        f"How I interpreted this: Table: \"{intent.dataset}\" | "
        f"Metrics: {metrics_display} | "
        f"Grouped by: {grouping_display} | "
        f"Grain: {grain_display} | "
        f"Filters: {filters_display} | "
        f"Date Range: {date_display} | "
        f"Ranking: {limit_display}"
    )


def check_intent_question_coverage(question: str, intent: AnalyticalIntent) -> Tuple[bool, Optional[str], str]:
    """
    Intent-vs-Question coverage check.
    Verifies that every aggregation cue, ranking/limit number, temporal-grain cue,
    and filter phrase in the question is consumed by the intent.
    Unconsumed phrases trigger clarification or refusal, never silent dropping.
    Returns (is_covered, unconsumed_reason, interpretation_statement).
    """
    q_lower = question.lower()
    interpretation = generate_interpretation_statement(intent)

    if intent.intent_type in ("clarification", "unsupported") or intent.needs_clarification:
        return False, intent.unsupported_reason or intent.clarification_question, interpretation

    unconsumed: List[str] = []
    consumed: List[str] = []

    # 1. Aggregation Cues
    # Check for simultaneous MIN and MAX
    has_min = bool(re.search(r"\b(minimum|min|lowest value|smallest)\b", q_lower))
    has_max = bool(re.search(r"\b(maximum|max|highest value|largest)\b", q_lower))
    has_avg = bool(re.search(r"\b(average|avg|mean)\b", q_lower))
    has_sum = bool(re.search(r"\b(total|sum of|how much|overall)\b", q_lower))
    has_count = bool(re.search(r"\b(how many|count of|number of)\b", q_lower))

    present_aggs = {m.aggregation for m in intent.metrics}

    if has_min and has_max:
        if AggregationType.MIN in present_aggs and AggregationType.MAX in present_aggs:
            consumed.extend(["minimum", "maximum"])
        else:
            unconsumed.append("both minimum and maximum aggregations requested, but only one or none was provided")
    elif has_min and not any(k in q_lower for k in ("lowest 2", "lowest 1", "lowest 3", "lowest 5", "bottom")):
        if AggregationType.MIN in present_aggs:
            consumed.append("minimum")
        else:
            unconsumed.append("minimum aggregation requested but omitted from intent")
    elif has_max and not any(k in q_lower for k in ("highest 2", "highest 1", "highest 3", "highest 5", "top")):
        if AggregationType.MAX in present_aggs:
            consumed.append("maximum")
        else:
            unconsumed.append("maximum aggregation requested but omitted from intent")

    if has_avg:
        if AggregationType.AVG in present_aggs or any(cm.semantics for cm in intent.calculated_metrics):
            consumed.append("average")
        else:
            unconsumed.append("average aggregation requested but omitted from intent")

    # 2. Ranking & Limit Cues
    rank_match = (
        re.search(r"\b(?:top|bottom|lowest|highest|fewest|most|best|worst|first|last)\s+(\d+)\b", q_lower)
        or re.search(r"\b(?:which|show|find|list|get)\s+(\d+)\b", q_lower)
        or re.search(r"\b(\d+)\s+[a-z0-9_]+\s+.*?\b(most|fewest|highest|lowest|best|worst|top|bottom)\b", q_lower)
    )
    if rank_match:
        expected_n = int(rank_match.group(1))
        if intent.limit == expected_n:
            consumed.append(f"rank limit {expected_n}")
        else:
            unconsumed.append(f"ranking limit '{rank_match.group(0)}' requested ({expected_n}) but intent limit is {intent.limit}")

    # Ranking direction
    if any(k in q_lower for k in ("fewest", "least", "bottom", "worst", "lowest")):
        if rank_match or intent.limit:
            if intent.ranking_direction == "ASC":
                consumed.append("bottom ranking ASC")
            else:
                unconsumed.append("bottom-N ranking requested (ASC) but intent specified DESC or none")

    # 3. Temporal Grain Cues
    has_month_grain = bool(re.search(r"\b(monthly|month to month|from month to month|per month|each month|by month)\b", q_lower))
    has_year_grain = bool(re.search(r"\b(yearly|annual|annually|per year|year over year)\b", q_lower))
    has_quarter_grain = bool(re.search(r"\b(quarterly|per quarter|each quarter)\b", q_lower))
    has_day_grain = bool(re.search(r"\b(daily|per day|day by day)\b", q_lower))

    if has_month_grain:
        if intent.temporal_grain == TemporalGrain.month:
            consumed.append("monthly grain")
        else:
            unconsumed.append("month-to-month grain requested but temporal grain is not 'month'")
    elif has_year_grain:
        if intent.temporal_grain == TemporalGrain.year:
            consumed.append("yearly grain")
        else:
            unconsumed.append("yearly grain requested but temporal grain is not 'year'")
    elif has_quarter_grain:
        if intent.temporal_grain == TemporalGrain.quarter:
            consumed.append("quarterly grain")
        else:
            unconsumed.append("quarterly grain requested but temporal grain is not 'quarter'")
    elif has_day_grain:
        if intent.temporal_grain == TemporalGrain.day:
            consumed.append("daily grain")
        else:
            unconsumed.append("daily grain requested but temporal grain is not 'day'")

    # 4. Multi-metric phrase check
    # If the question contains phrases like 'total revenue, total units sold, and average unit price'
    # we expect at least 3 metrics
    and_separated_count = len(re.findall(r"\b(and|,)\b", q_lower))
    if ("total" in q_lower or "revenue" in q_lower or "units" in q_lower or "sales" in q_lower or "price" in q_lower) and and_separated_count >= 2:
        # Check if question asked for multiple metrics
        metric_tokens = ["revenue", "units", "quantity", "price", "amount", "cost", "sales", "volume"]
        matched_tokens = [t for t in metric_tokens if t in q_lower]
        if len(matched_tokens) >= 3 and len(intent.metrics) < 3:
            unconsumed.append(f"Multiple metrics requested ({', '.join(matched_tokens)}), but only {len(intent.metrics)} compiled into intent")

    # Share/percentage/ratio cue check
    has_share_cue = bool(re.search(r"\b(share|percentage|percent|pct|proportion|ratio)\b", q_lower))
    if has_share_cue:
        has_calc_share = any(cm.semantics in ("percent_of_total", "ratio_of_sums") for cm in intent.calculated_metrics)
        if has_calc_share or any(m.aggregation == AggregationType.SUM for m in intent.metrics):
            consumed.append("share/percentage cue")
        else:
            unconsumed.append("share/percentage cue requested but no percent_of_total calculated metric or sum metric provided")

    # Half-year grain check
    has_half_year_cue = bool(re.search(r"\b(half|first half|second half|half year|h1|h2)\b", q_lower))
    if has_half_year_cue:
        if intent.temporal_grain == TemporalGrain.half_year or intent.temporal_grain == TemporalGrain.quarter or intent.date_range or any(f.column for f in intent.filters if "date" in f.column.lower() or "year" in f.column.lower()):
            consumed.append("half-year cue")
        else:
            unconsumed.append("half-year/half of year cue requested but temporal grain is not 'half_year'")

    intent.consumed_phrases = consumed
    intent.unconsumed_phrases = unconsumed
    intent.interpretation_statement = interpretation

    if unconsumed:
        return False, "; ".join(unconsumed), interpretation

    return True, None, interpretation
