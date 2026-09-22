from enum import Enum
from typing import Any, Dict, List, Literal, Optional, Tuple
from pydantic import BaseModel, Field


class AggregationType(str, Enum):
    SUM = "SUM"
    AVG = "AVG"
    MIN = "MIN"
    MAX = "MAX"
    COUNT = "COUNT"
    COUNT_DISTINCT = "COUNT_DISTINCT"


class TemporalGrain(str, Enum):
    none = "none"
    day = "day"
    week = "week"
    month = "month"
    quarter = "quarter"
    half_year = "half_year"
    year = "year"


class MetricIntent(BaseModel):
    field: str
    aggregation: AggregationType
    alias: Optional[str] = None
    source_phrase: Optional[str] = None
    resolution_confidence: float = 1.0
    resolved_from: Optional[str] = "catalog"


class CalculatedMetricIntent(BaseModel):
    name: str
    numerator_field: str
    denominator_field: Optional[str] = None
    semantics: Literal["ratio_of_sums", "sum_of_ratios", "percent_of_total", "growth"] = "ratio_of_sums"
    group_filter: Optional[Dict[str, Any]] = None
    alias: Optional[str] = None
    source_phrase: Optional[str] = None


class ComparisonIntent(BaseModel):
    comparison_type: Literal["period_over_period", "year_over_year", "previous_period"]
    grain: TemporalGrain
    metric: str
    source_phrase: Optional[str] = None


class FilterIntent(BaseModel):
    column: str
    operator: Literal["=", "!=", ">", ">=", "<", "<=", "LIKE", "ILIKE", "IN", "BETWEEN"]
    value: Any
    source_phrase: Optional[str] = None


class JoinIntent(BaseModel):
    left_table: str
    right_table: str
    left_key: str
    right_key: str
    join_type: Literal["INNER", "LEFT"] = "INNER"
    fan_out_safe: bool = True


class AnalyticalIntent(BaseModel):
    intent_type: Literal[
        "scalar",
        "grouped",
        "timeseries",
        "ranking",
        "raw_records",
        "comparison",
        "clarification",
        "unsupported",
    ] = "scalar"
    dataset: str
    database: Optional[str] = None
    schema_name: Optional[str] = None
    metrics: List[MetricIntent] = []
    calculated_metrics: List[CalculatedMetricIntent] = []
    comparison: Optional[ComparisonIntent] = None
    dimensions: List[str] = []
    joins: List[JoinIntent] = []
    filters: List[FilterIntent] = []
    date_range: Optional[Tuple[str, str]] = None
    time_dimension: Optional[str] = None
    temporal_grain: TemporalGrain = TemporalGrain.none
    ranking_direction: Optional[Literal["ASC", "DESC"]] = None
    limit: Optional[int] = None
    sort_field: Optional[str] = None
    sort_direction: Optional[Literal["ASC", "DESC"]] = None
    visualization: Optional[str] = None
    needs_clarification: bool = False
    clarification_question: Optional[str] = None
    unsupported_reason: Optional[str] = None
    consumed_phrases: List[str] = []
    unconsumed_phrases: List[str] = []
    interpretation_statement: Optional[str] = None

    def build_interpretation_statement(self) -> str:
        if self.interpretation_statement:
            return self.interpretation_statement
        metrics_str = ", ".join(f"{m.aggregation.value}(\"{m.field}\")" for m in self.metrics) or "All rows"
        dims_str = f" grouped by {', '.join(self.dimensions)}" if self.dimensions else ""
        grain_str = f" at {self.temporal_grain.value} grain" if self.temporal_grain != TemporalGrain.none else ""
        date_str = f" between {self.date_range[0]} and {self.date_range[1]}" if self.date_range else ""
        filters_str = f" filtered by {', '.join(f'{f.column} {f.operator} {f.value}' for f in self.filters)}" if self.filters else ""
        extra_str = f" {' '.join(self.unconsumed_phrases)}" if self.unconsumed_phrases else ""
        return f"How I interpreted this: {metrics_str}{dims_str}{grain_str}{date_str}{filters_str}.{extra_str}".strip()
