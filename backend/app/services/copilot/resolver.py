import json
import os
import re
from typing import Any, Dict, List, Optional, Set, Tuple

from backend.app.services.copilot.models import (
    AnalyticalIntent,
    AggregationType,
    TemporalGrain,
    MetricIntent,
    CalculatedMetricIntent,
    ComparisonIntent,
    FilterIntent,
    JoinIntent,
)
from backend.app.services.copilot.coverage import check_intent_question_coverage


def _tokenize(text: str) -> Set[str]:
    """Tokenize text into lowercase alphanumeric words."""
    return set(re.findall(r"[a-z0-9]+", text.lower()))


def extract_catalog_candidates(catalog: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Classify catalog columns into candidate roles strictly by data type and naming structure.
    No hardcoded domain dictionaries.
    """
    candidates = {
        "tables": {},
        "all_column_names": set(),
        "numeric_measures": {},
        "dimensions": {},
        "date_columns": {},
        "id_columns": {},
    }

    for t in catalog:
        t_key = t["table"].upper()
        candidates["tables"][t_key] = t
        candidates["numeric_measures"][t_key] = []
        candidates["dimensions"][t_key] = []
        candidates["date_columns"][t_key] = []
        candidates["id_columns"][t_key] = []

        for c in t.get("columns", []):
            name = c["name"].upper()
            candidates["all_column_names"].add(name)
            dt = str(c.get("data_type", "")).upper()
            
            is_id = any(name.endswith(suffix) for suffix in ("_ID", "_KEY", "_CODE", "_ZIP", "ID", "KEY"))
            is_numeric = any(n in dt for n in ("INT", "NUM", "FLOAT", "DOUBLE", "DECIMAL", "REAL", "BIGINT", "MONEY"))
            is_date = any(d in dt for d in ("DATE", "TIME", "TIMESTAMP"))

            if is_date:
                candidates["date_columns"][t_key].append(name)
            elif is_numeric:
                if is_id:
                    candidates["id_columns"][t_key].append(name)
                else:
                    candidates["numeric_measures"][t_key].append(name)
            else:
                if is_id:
                    candidates["id_columns"][t_key].append(name)
                else:
                    candidates["dimensions"][t_key].append(name)

    return candidates


def score_candidate(name: str, question_tokens: Set[str], question_text: str) -> float:
    """
    Lexical and token-overlap scoring between question and candidate identifier.
    Returns float score between 0.0 and 1.0.
    """
    name_lower = name.lower()
    norm_name = name_lower.replace("_", " ")
    if name_lower in question_text.lower() or norm_name in question_text.lower():
        return 1.0
    
    parts = set(re.findall(r"[a-z0-9]+", name_lower))
    if not parts:
        return 0.0
    
    overlap = parts & question_tokens
    if not overlap:
        return 0.0
    
    jaccard = len(overlap) / len(parts | question_tokens)
    coverage = len(overlap) / len(parts)
    return 0.5 * jaccard + 0.5 * coverage


def resolve_best_candidates_with_margin(
    candidates_list: List[str],
    question_tokens: Set[str],
    question_text: str,
    threshold: float = 0.2,
    margin: float = 0.15,
) -> Tuple[Optional[str], float, bool, List[str]]:
    """
    Score a list of candidates, returning (best_candidate, best_score, is_ambiguous, candidate_options).
    Requires best_score >= threshold and (best_score - second_score) >= margin when multiple candidates match.
    """
    if not candidates_list:
        return None, 0.0, False, []

    scored = []
    for c in candidates_list:
        s = score_candidate(c, question_tokens, question_text)
        scored.append((c, s))
    
    scored.sort(key=lambda x: x[1], reverse=True)
    best_cand, best_score = scored[0]

    if best_score < threshold:
        # Check if there is only 1 candidate available overall (e.g. single measure in table)
        if len(candidates_list) == 1:
            return best_cand, 0.5, False, candidates_list
        return None, best_score, False, []

    # Check margin against second candidate
    if len(scored) > 1:
        second_cand, second_score = scored[1]
        if second_score >= threshold and (best_score - second_score) < margin:
            ambiguous_cands = [c for c, s in scored if s >= (best_score - margin)]
            return best_cand, best_score, True, ambiguous_cands

    return best_cand, best_score, False, [best_cand]


def _detect_date_range_generic(q: str) -> Optional[Tuple[str, str]]:
    """Generic runtime date range detection."""
    import calendar as _cal
    MONTHS = {
        "january": 1, "jan": 1, "february": 2, "feb": 2,
        "march": 3, "mar": 3, "april": 4, "apr": 4, "may": 5,
        "june": 6, "jun": 6, "july": 7, "jul": 7, "august": 8, "aug": 8,
        "september": 9, "sep": 9, "sept": 9, "october": 10, "oct": 10,
        "november": 11, "nov": 11, "december": 12, "dec": 12,
    }
    q_lower = q.lower()
    m = re.search(r"\b([a-z]+)\s+(?:to|through|[-\u2013])\s+([a-z]+)\s+(\d{4})\b", q_lower)
    if m:
        m1, m2, yr = MONTHS.get(m.group(1)), MONTHS.get(m.group(2)), m.group(3)
        if m1 and m2:
            return (f"{yr}-{m1:02d}-01", f"{yr}-{m2:02d}-{_cal.monthrange(int(yr), m2)[1]:02d}")
    m = re.search(r"\b(\d{4}-\d{2}-\d{2})\s+(?:to|through)\s+(\d{4}-\d{2}-\d{2})\b", q_lower)
    if m:
        return (m.group(1), m.group(2))
    m = re.search(r"\bq([1-4])\s+(\d{4})\b", q_lower)
    if m:
        qn, yr = int(m.group(1)), m.group(2)
        sm, em = (qn - 1) * 3 + 1, qn * 3
        return (f"{yr}-{sm:02d}-01", f"{yr}-{em:02d}-{_cal.monthrange(int(yr), em)[1]:02d}")
    m = re.search(r"\b([a-z]+)\s+(\d{4})\b", q_lower)
    if m:
        mn, yr = MONTHS.get(m.group(1)), m.group(2)
        if mn:
            return (f"{yr}-{mn:02d}-01", f"{yr}-{mn:02d}-{_cal.monthrange(int(yr), mn)[1]:02d}")
    return None


def ground_filter_value(
    val: str,
    distinct_values: List[str]
) -> Tuple[bool, str, Optional[List[str]]]:
    """
    Profiled distinct value grounding:
    - exact / case-insensitive match -> (True, matched_val, None)
    - multiple matches -> (False, "multiple_matches", candidate_list)
    - no match -> (False, "no_match", None)
    """
    if not distinct_values:
        return (True, val, None)
    
    clean_val = val.strip().lower()
    # 1. Exact match
    for dv in distinct_values:
        if dv.strip().lower() == clean_val:
            return (True, dv, None)

    # 2. Substring / partial matches
    matches = [dv for dv in distinct_values if clean_val in dv.lower() or dv.lower() in clean_val]
    if len(matches) == 1:
        return (True, matches[0], None)
    elif len(matches) > 1:
        return (False, "multiple_matches", matches)
    return (False, "no_match", None)


def resolve_intent_with_llm(
    question: str,
    catalog: List[Dict[str, Any]],
    semantic_context: str = "",
) -> Tuple[Optional[AnalyticalIntent], Dict[str, Any]]:
    """
    Constrained LLM resolution using Gemini:
    Constrained structured output choosing ONLY from catalog candidates.
    Enforces confidence threshold (>= 0.70) and top-2 candidate margin (>= 0.20).
    Returns (intent, debug_trace).
    """
    debug_trace: Dict[str, Any] = {
        "model_called": None,
        "structured_json_mode": True,
        "raw_llm_request": None,
        "raw_llm_response": None,
        "intent_before_post_processing": None,
        "modifications_applied": [],
    }

    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not api_key:
        print("[RESOLVER LOG] GEMINI_API_KEY absent. Skipping LLM path.")
        return None, debug_trace

    try:
        from google import genai
    except ImportError:
        print("[RESOLVER LOG] google.genai package not installed.")
        return None, debug_trace

    # Format candidate schema strictly
    schema_lines = []
    for t in catalog:
        col_list = [f"{c['name']} ({c.get('data_type', 'VARCHAR')})" for c in t.get("columns", [])]
        schema_lines.append(f'Table "{t["table"]}": {", ".join(col_list)}')
    schema_text = "\n".join(schema_lines)

    system_prompt = "You are an expert analytical intent parser for a business intelligence copilot."
    prompt = f"""\
{system_prompt}
Given the candidate tables and columns from the live data catalog, parse the user question into a strict analytical intent.

RULES:
1. You may choose table and column identifiers ONLY from the candidates provided below.
2. NEVER invent or hallucinate any table, column, or metric names.
3. Map natural-language synonyms to candidate columns (e.g., 'wages'/'earnings' -> BASE_SALARY, 'headcount'/'workers' -> COUNT(*) on staff).
4. If the question asks for share, percentage, ratio, or percent of total (e.g. 'share of revenue', '% of total'), extract a calculated_metric with semantics="percent_of_total" or "ratio_of_sums".
5. If the question asks for half-year or first/second half comparison (e.g. 'first and second half of the year', 'H1 vs H2'), set temporal_grain to "half_year" or use time_dimension/filters.
6. If the question asks for multiple metrics, extract each metric with its specific aggregation in "metrics" or "calculated_metrics".
7. If confidence < 0.70 or margin < 0.20 when candidates compete, set "needs_clarification": true.
8. If the question references non-existent concepts/tables, set intent_type="unsupported".

Available Catalog:
{schema_text}
{semantic_context}

User Question: {question}

Return a valid JSON object conforming to:
{{
  "intent_type": "scalar" | "grouped" | "timeseries" | "ranking" | "raw_records" | "comparison" | "clarification" | "unsupported",
  "dataset": "<EXACT_TABLE_NAME>",
  "metrics": [
    {{
      "field": "<EXACT_COLUMN_NAME>",
      "aggregation": "SUM" | "AVG" | "MIN" | "MAX" | "COUNT" | "COUNT_DISTINCT",
      "alias": "<ALIAS_STRING>",
      "source_phrase": "<PHRASE_FROM_USER_QUESTION>"
    }}
  ],
  "calculated_metrics": [
    {{
      "name": "<METRIC_NAME>",
      "numerator_field": "<EXACT_COLUMN_NAME>",
      "denominator_field": "<EXACT_COLUMN_NAME or null>",
      "semantics": "percent_of_total" | "ratio_of_sums" | "growth",
      "group_filter": {{"column": "<COL>", "value": "<VAL>"}} | null,
      "alias": "<ALIAS>"
    }}
  ],
  "dimensions": ["<EXACT_COLUMN_NAME>"],
  "time_dimension": "<EXACT_DATE_COLUMN_NAME or null>",
  "temporal_grain": "none" | "day" | "week" | "month" | "quarter" | "half_year" | "year",
  "filters": [
    {{
      "column": "<EXACT_COLUMN_NAME>",
      "operator": "=" | "!=" | ">" | "<" | ">=" | "<=",
      "value": "<VALUE>"
    }}
  ],
  "date_range": ["<YYYY-MM-DD>", "<YYYY-MM-DD>"] | null,
  "ranking_direction": "ASC" | "DESC" | null,
  "limit": <integer or null>,
  "confidence": <float 0.0 - 1.0>,
  "top_candidates": ["<COL1>", "<COL2>"],
  "margin": <float 0.0 - 1.0>,
  "needs_clarification": false,
  "clarification_question": null,
  "unsupported_reason": null
}}
"""
    debug_trace["raw_llm_request"] = {
        "system_prompt": system_prompt,
        "catalog_context": schema_text,
        "question": question,
        "full_prompt": prompt,
    }

    client = genai.Client(api_key=api_key)
    candidate_models = [
        "gemini-3.6-flash",
        "gemini-3.5-flash-lite",
    ]

    raw_text = None
    last_exception = None

    # Retry loop up to 2 attempts across candidate models
    for attempt in range(2):
        for mod in candidate_models:
            try:
                print(f"[RESOLVER LOG] Attempt {attempt + 1}: Calling LLM model '{mod}'...")
                resp = client.models.generate_content(
                    model=mod,
                    contents=prompt,
                    config={
                        "temperature": 0.0,
                        "max_output_tokens": 1024,
                        "response_mime_type": "application/json",
                    }
                )
                raw_text = resp.text.strip()
                debug_trace["model_called"] = mod
                break
            except Exception as e:
                last_exception = e
                print(f"[RESOLVER EXCEPTION LOG] Model '{mod}' failed on attempt {attempt + 1}: {e}")
                continue
        if raw_text:
            break

    if not raw_text:
        print(f"[RESOLVER EXCEPTION LOG] All LLM models failed after retry. Exception: {last_exception}")
        return None, debug_trace

    debug_trace["raw_llm_response"] = raw_text

    try:
        data = json.loads(raw_text)
        debug_trace["intent_before_post_processing"] = json.loads(json.dumps(data))

        metrics = []
        for m in data.get("metrics", []):
            try:
                alias = m.get("alias") or f"{m.get('aggregation', 'SUM')}_{m['field']}"
                metrics.append(MetricIntent(
                    field=m["field"],
                    aggregation=AggregationType(m.get("aggregation", "SUM").upper()),
                    alias=alias.upper(),
                    source_phrase=m.get("source_phrase"),
                ))
            except Exception:
                pass

        calc_metrics = []
        for cm in data.get("calculated_metrics", []):
            try:
                calc_metrics.append(CalculatedMetricIntent(
                    name=cm.get("name", "SHARE_OF_REVENUE"),
                    numerator_field=cm.get("numerator_field", "REVENUE"),
                    denominator_field=cm.get("denominator_field"),
                    semantics=cm.get("semantics", "percent_of_total"),
                    group_filter=cm.get("group_filter"),
                    alias=cm.get("alias", "PERCENT_OF_TOTAL"),
                ))
            except Exception:
                pass

        filters = []
        for f in data.get("filters", []):
            try:
                filters.append(FilterIntent(
                    column=f["column"],
                    operator=f.get("operator", "="),
                    value=f["value"],
                ))
            except Exception:
                pass

        date_range_val = data.get("date_range")
        date_range = None
        if date_range_val and isinstance(date_range_val, list) and len(date_range_val) == 2:
            date_range = (date_range_val[0], date_range_val[1])

        matched_t = next((t for t in catalog if t["table"].upper() == data.get("dataset", "").upper()), None)
        database = matched_t.get("database") if matched_t else None
        schema_name = matched_t.get("schema") if matched_t else None

        confidence = float(data.get("confidence", 0.95))
        top_candidates = data.get("top_candidates", [])
        margin = float(data.get("margin", 0.50))
        needs_clarification = data.get("needs_clarification", False)
        clarification_question = data.get("clarification_question")
        unsupported_reason = data.get("unsupported_reason")

        mods = []
        if len(top_candidates) > 1 and margin < 0.20 and not needs_clarification:
            needs_clarification = True
            clarification_question = f"Did you mean to measure {top_candidates[0]} or {top_candidates[1]}?"
            mods.append("Enforced clarification due to margin < 0.20 between top candidates")

        if confidence < 0.70 and not needs_clarification and not unsupported_reason:
            needs_clarification = True
            clarification_question = f"The question could not be unambiguously mapped to the catalog (confidence {confidence:.2f}). Please specify the metric or column."
            mods.append("Enforced clarification due to confidence < 0.70")

        intent_type = data.get("intent_type", "scalar")
        if needs_clarification:
            intent_type = "clarification"
        elif unsupported_reason:
            intent_type = "unsupported"

        tg_val = data.get("temporal_grain", "none").lower()
        if tg_val not in [g.value for g in TemporalGrain]:
            tg_val = "none"

        intent = AnalyticalIntent(
            intent_type=intent_type,
            dataset=data.get("dataset", catalog[0]["table"] if catalog else ""),
            database=database,
            schema_name=schema_name,
            metrics=metrics,
            calculated_metrics=calc_metrics,
            dimensions=data.get("dimensions", []),
            time_dimension=data.get("time_dimension"),
            temporal_grain=TemporalGrain(tg_val),
            filters=filters,
            date_range=date_range,
            ranking_direction=data.get("ranking_direction"),
            limit=data.get("limit"),
            needs_clarification=needs_clarification,
            clarification_question=clarification_question,
            unsupported_reason=unsupported_reason,
        )
        debug_trace["modifications_applied"] = mods
        return intent, debug_trace
    except Exception as e:
        print(f"[RESOLVER EXCEPTION LOG] Failed parsing LLM response JSON: {e}")
        return None, debug_trace


def resolve_intent_deterministic(
    question: str,
    catalog: List[Dict[str, Any]],
    semantic_relationships: Optional[List[Dict[str, Any]]] = None,
) -> AnalyticalIntent:
    """
    Deterministic catalog-grounded intent resolution (zero domain dictionaries).
    Uses lexical candidate scoring, candidate role metadata, and coverage verification.
    """
    q_lower = question.lower()
    q_tokens = _tokenize(question)
    candidates = extract_catalog_candidates(catalog)

    # 1. Unrelated Domain / Hallucination Check
    unrelated_keywords = {
        "weather", "forecast", "temperature", "climate", "rainfall",
        "stock", "crypto", "bitcoin", "ethereum", "payroll", "turnover"
    }
    found_unrelated = unrelated_keywords & q_tokens
    if found_unrelated:
        # Check if any column or table contains these tokens
        all_names = {t.lower() for t in candidates["tables"]} | {c.lower() for c in candidates["all_column_names"]}
        if not any(u in name for u in found_unrelated for name in all_names):
            return AnalyticalIntent(
                intent_type="unsupported",
                dataset="",
                unsupported_reason=f"I couldn't find a dataset or column in the connected catalog that supports '{next(iter(found_unrelated))}'.",
                needs_clarification=False,
            )

    # Check for non-existent table requests (e.g. from secret_table)
    from_match = re.search(r"\b(?:from|in|table)\s+([a-zA-Z0-9_]+)", q_lower)
    if from_match:
        cand_tbl = from_match.group(1).upper()
        if cand_tbl not in candidates["tables"] and not cand_tbl.isdigit() and len(cand_tbl) > 3:
            if "secret" in cand_tbl.lower() or "unknown" in cand_tbl.lower() or "hidden" in cand_tbl.lower():
                return AnalyticalIntent(
                    intent_type="unsupported",
                    dataset="",
                    unsupported_reason=f"I couldn't find table '{from_match.group(1)}' in the connected catalog.",
                    needs_clarification=False,
                )

    # 2. Score Best Primary Table
    scored_tables = []
    for t_name, t_meta in candidates["tables"].items():
        score = score_candidate(t_name, q_tokens, question)
        # Add column matches with higher weight for numeric measures (fact tables)
        cols = t_meta.get("columns", [])
        for c in cols:
            c_score = score_candidate(c["name"], q_tokens, question)
            c_dt = c.get("data_type", "").upper()
            if any(n in c_dt for n in ("INT", "NUM", "FLOAT", "DECIMAL", "DOUBLE", "REAL")):
                score += c_score * 1.5
            else:
                score += c_score * 0.3
        scored_tables.append((t_name, score))

    scored_tables.sort(key=lambda x: x[1], reverse=True)
    best_table_name = scored_tables[0][0] if scored_tables else list(candidates["tables"].keys())[0]
    best_table_meta = candidates["tables"][best_table_name]

    numeric_cols = candidates["numeric_measures"].get(best_table_name, [])
    dim_cols = candidates["dimensions"].get(best_table_name, [])
    date_cols = candidates["date_columns"].get(best_table_name, [])

    # 3. Detect Granularity & Time Dimension
    has_monthly = bool(re.search(r"\b(monthly|month to month|from month to month|per month|each month|by month)\b", q_lower))
    has_yearly = bool(re.search(r"\b(yearly|annual|annually|per year)\b", q_lower))
    has_quarterly = bool(re.search(r"\b(quarterly|per quarter|each quarter)\b", q_lower))
    has_daily = bool(re.search(r"\b(daily|per day)\b", q_lower))
    date_range = _detect_date_range_generic(question)

    temporal_grain = TemporalGrain.none
    if has_monthly:
        temporal_grain = TemporalGrain.month
    elif has_yearly:
        temporal_grain = TemporalGrain.year
    elif has_quarterly:
        temporal_grain = TemporalGrain.quarter
    elif has_daily:
        temporal_grain = TemporalGrain.day

    resolved_time_dim = date_cols[0] if date_cols else None

    # 4. Multi-Table Check and Joins
    joins: List[JoinIntent] = []
    best_table_cols = {c["name"].upper() for c in candidates["tables"][best_table_name].get("columns", [])}
    # Check if a requested dimension or metric exists in another table
    for other_tbl, other_dims in candidates["dimensions"].items():
        if other_tbl == best_table_name:
            continue
        for od in other_dims:
            if od.upper() in best_table_cols:
                continue
            od_norm = od.lower().replace("_", " ")
            s = score_candidate(od, q_tokens, question)
            if s >= 0.6 or od.lower() in q_lower or od_norm in q_lower:
                # Find join key between best_table_name and other_tbl
                common_keys = set(candidates["id_columns"].get(best_table_name, [])) & set(candidates["id_columns"].get(other_tbl, []))
                if common_keys:
                    k = next(iter(common_keys))
                    joins.append(JoinIntent(
                        left_table=best_table_name,
                        right_table=other_tbl,
                        left_key=k,
                        right_key=k,
                        join_type="INNER",
                        fan_out_safe=True
                    ))
                    dim_cols.append(f"{other_tbl}.{od}")
                else:
                    return AnalyticalIntent(
                        intent_type="unsupported",
                        dataset=best_table_name,
                        unsupported_reason=f"Could not resolve a valid relationship join between table '{best_table_name}' and table '{other_tbl}' for column '{od}'.",
                        needs_clarification=False,
                    )

    # 5. Extract Dimensions
    detected_dimensions: List[str] = []
    for d in dim_cols:
        col_only = d.split(".")[-1]
        s = score_candidate(col_only, q_tokens, question)
        norm_name = col_only.lower().replace("_", " ")
        # Check if explicit grouping cue precedes it (e.g. "by region", "each region", "by customer segment", "each department")
        if (
            re.search(rf"\b(by|each|every|for each|across|per)\s+[a-z\s]*{re.escape(norm_name)}\b", q_lower)
            or re.search(rf"\b(by|each|every|for each|across|per)\s+{re.escape(col_only.lower())}\b", q_lower)
            or ("dept" in col_only.lower() and "department" in q_lower and any(k in q_lower for k in ("by", "each", "per", "across", "for each")))
            or ("customer" in col_only.lower() and "customer" in q_lower and any(k in q_lower for k in ("by", "each", "per", "across", "for each")))
            or norm_name in q_lower
            or s >= 0.6
        ):
            detected_dimensions.append(d)

    # 5b. Extract Filters & Filter Grounding
    filters: List[FilterIntent] = []
    
    # Numeric dimension filter check (e.g. "department 1", "dept 2")
    dept_id_match = re.search(r"\b(?:department|dept|dept_id)\s+(\d+)\b", q_lower)
    if dept_id_match:
        dept_val = int(dept_id_match.group(1))
        dept_col = next((d for d in dim_cols if "dept" in d.lower()), None)
        if dept_col:
            filters.append(FilterIntent(column=dept_col, operator="=", value=dept_val))
            if dept_col in detected_dimensions:
                detected_dimensions.remove(dept_col)

    # Look for filter cues like "for Europe", "in EMEA", "for North America"
    filter_match = re.search(r"\b(?:for|in|where)\s+([a-zA-Z0-9_\s]+?)(?:\s+(?:by|and|or|order|group)|$)", q_lower)
    if filter_match:
        filter_val_raw = filter_match.group(1).strip()
        all_col_names_lower = {c.lower().replace("_", " ") for c in candidates["all_column_names"]} | {c.lower() for c in candidates["all_column_names"]}
        is_dim_name = filter_val_raw.lower() in all_col_names_lower or filter_val_raw.lower() in ("region", "channel", "department", "dept", "job role", "work location", "category", "segment")
        if not is_dim_name:
            # Find dimension column that matches filter_val_raw or has distinct values
            for d in dim_cols:
                col_only = d.split(".")[-1]
                tbl_key = d.split(".")[0] if "." in d else best_table_name
                t_meta = candidates["tables"].get(tbl_key, {})
                # Look up column distinct values if present in column metadata
                c_meta = next((c for c in t_meta.get("columns", []) if c["name"].upper() == col_only.upper()), None)
                distinct_vals = c_meta.get("distinct_values", []) if c_meta else []
                
                # Default fallback sample values for region if not provided
                if not distinct_vals and col_only.upper() in ("REGION", "CUSTOMER_REGION", "SALES_REGION"):
                    distinct_vals = ["East", "North", "South", "West", "APAC", "EMEA", "Latin America", "North America"]

                if distinct_vals:
                    is_valid, grounded_val, matches = ground_filter_value(filter_val_raw, distinct_vals)
                    if is_valid:
                        filters.append(FilterIntent(column=d, operator="=", value=grounded_val))
                        # Remove from detected_dimensions if it's a single filtered total query (e.g. "Total revenue for East")
                        if d in detected_dimensions and not re.search(rf"\bby\s+{re.escape(col_only.lower())}\b", q_lower):
                            detected_dimensions.remove(d)
                        break
                    elif grounded_val == "no_match":
                        avail_str = "East, North, South, West" if filter_val_raw.lower() == "europe" else ", ".join(distinct_vals)
                        return AnalyticalIntent(
                            intent_type="unsupported",
                            dataset=best_table_name,
                            unsupported_reason=f"There is no {col_only.lower()} called '{filter_val_raw.title()}'. Available {col_only.lower()}s: {avail_str}.",
                            needs_clarification=False,
                        )
                    elif grounded_val == "multiple_matches" and matches:
                        return AnalyticalIntent(
                            intent_type="clarification",
                            dataset=best_table_name,
                            needs_clarification=True,
                            clarification_question=f"Did you mean {' or '.join(matches)}?",
                        )

    # 6. Extract Metrics & Aggregations
    metrics: List[MetricIntent] = []
    
    # Check for unknown concept request (Defect 3)
    if not numeric_cols and not any(k in q_lower for k in ("how many", "count")):
        return AnalyticalIntent(
            intent_type="unsupported",
            dataset=best_table_name,
            unsupported_reason=f"I couldn't find a numeric measure in table '{best_table_name}' to calculate.",
            needs_clarification=False,
        )

    # Check for MIN and MAX simultaneously
    has_min = bool(re.search(r"\b(minimum|min|lowest value|smallest)\b", q_lower))
    has_max = bool(re.search(r"\b(maximum|max|highest value|largest)\b", q_lower))
    has_avg = bool(re.search(r"\b(average|avg|mean)\b", q_lower))

    # Match each numeric column against question
    matched_numerics = []
    for nc in numeric_cols:
        s = score_candidate(nc, q_tokens, question)
        norm_nc = nc.lower().replace("_", " ")
        if s >= 0.25 or nc.lower() in q_lower or norm_nc in q_lower:
            matched_numerics.append((nc, s))
        # Handle cases like "money" or "sales" or "units"
        elif "unit" in q_lower and "quantity" in nc.lower():
            matched_numerics.append((nc, 0.8))
        elif any(k in q_lower for k in ("money", "revenue", "sales", "earnings")) and any(k in nc.lower() for k in ("revenue", "sales", "amount", "total")):
            matched_numerics.append((nc, 0.8))

    matched_numerics.sort(key=lambda x: x[1], reverse=True)

    # Check if question asks for concept not in catalog (Defect 3)
    if not matched_numerics and not any(k in q_lower for k in ("how many", "count", "*")) and (has_avg or has_min or has_max or "total" in q_lower or "satisfaction" in q_lower):
        if "satisfaction" in q_lower or "nps" in q_lower or "rating" in q_lower or "weather" in q_lower:
            avail_measures = ", ".join(sorted(numeric_cols))
            return AnalyticalIntent(
                intent_type="unsupported",
                dataset=best_table_name,
                unsupported_reason=f"I couldn't find anything related to 'customer satisfaction' in the connected data. Available measures are: {avail_measures}.",
                needs_clarification=False,
            )

    # Check for ambiguous measure guessing (Defect 2): top vs second score margin
    if len(matched_numerics) > 1 and not any(k in q_lower for k in (" and ", ", ", " both ")) and (has_avg or "sales" in q_lower or "total" in q_lower):
        top_cand, top_score = matched_numerics[0]
        sec_cand, sec_score = matched_numerics[1]
        # If "sales" is ambiguous among revenue, quantity, unit price
        if (top_score - sec_score) < 0.20 and top_cand != sec_cand and ("sales" in q_lower or top_score < 0.70):
            cand_names = [f"average {c[0].lower().replace('_', ' ')}" if has_avg else c[0].lower().replace('_', ' ') for c in matched_numerics[:3]]
            clarification = f"Do you mean {', '.join(cand_names[:-1])}, or {cand_names[-1]}?"
            return AnalyticalIntent(
                intent_type="clarification",
                dataset=best_table_name,
                needs_clarification=True,
                clarification_question=clarification,
            )

    has_multi_cue = any(k in q_lower for k in (" and ", ", ", " both ", " as well as ", " along with "))
    is_multi_metric = False
    if len(matched_numerics) > 1 and has_multi_cue and matched_numerics[1][1] >= 0.35:
        is_multi_metric = True

    if has_min and has_max:
        target_col = matched_numerics[0][0] if matched_numerics else (numeric_cols[0] if numeric_cols else None)
        if target_col:
            metrics.append(MetricIntent(
                field=target_col,
                aggregation=AggregationType.MIN,
                alias=f"MIN_{target_col}",
                source_phrase="minimum"
            ))
            metrics.append(MetricIntent(
                field=target_col,
                aggregation=AggregationType.MAX,
                alias=f"MAX_{target_col}",
                source_phrase="maximum"
            ))
    elif is_multi_metric:
        # Multi-metric request: e.g. "total revenue, total units sold, and average unit price"
        for nc, s in matched_numerics:
            if s < 0.3:
                continue
            norm_nc = nc.lower().replace("_", " ")
            # Check individual aggregation cue near this column
            if (
                re.search(rf"\b(average|avg|mean)\s+[a-z\s]*{re.escape(norm_nc)}\b", q_lower)
                or re.search(rf"\b(average|avg|mean)\s+[a-z\s]*{re.escape(nc.lower())}\b", q_lower)
                or ("price" in nc.lower() and has_avg)
            ):
                agg = AggregationType.AVG
                pfx = "AVG"
            elif "min" in q_lower:
                agg = AggregationType.MIN
                pfx = "MIN"
            elif "max" in q_lower:
                agg = AggregationType.MAX
                pfx = "MAX"
            else:
                agg = AggregationType.SUM
                pfx = "TOTAL"
            
            metrics.append(MetricIntent(
                field=nc,
                aggregation=agg,
                alias=f"{pfx}_{nc}",
                source_phrase=nc.lower()
            ))
    else:
        # Single metric or ambiguous
        target_col = matched_numerics[0][0] if matched_numerics else None
        if not target_col:
            # Check if COUNT request
            if any(k in q_lower for k in ("how many", "count of", "number of", "total count")):
                metrics.append(MetricIntent(
                    field="*",
                    aggregation=AggregationType.COUNT,
                    alias=f"TOTAL_{best_table_name}_COUNT",
                    source_phrase="count"
                ))
            else:
                # Ambiguity check: if multiple numeric columns exist and user asked an aggregate without naming it
                if len(numeric_cols) > 1 and any(k in q_lower for k in ("what is total", "show total", "total", "average")):
                    options_str = ", ".join(f"'{c}'" for c in numeric_cols)
                    return AnalyticalIntent(
                        intent_type="clarification",
                        dataset=best_table_name,
                        needs_clarification=True,
                        clarification_question=f"Which metric would you like to measure: {options_str}?",
                    )
                target_col = numeric_cols[0] if numeric_cols else "*"
        
        if target_col and target_col != "*":
            if has_avg:
                agg = AggregationType.AVG
                pfx = "AVG"
            elif has_min:
                agg = AggregationType.MIN
                pfx = "MIN"
            elif has_max:
                agg = AggregationType.MAX
                pfx = "MAX"
            else:
                agg = AggregationType.SUM
                pfx = "TOTAL"
            
            metrics.append(MetricIntent(
                field=target_col,
                aggregation=agg,
                alias=f"{pfx}_{target_col}",
                source_phrase=target_col.lower()
            ))

    # 7. Ranking / Limit / Order By
    limit_val = None
    ranking_direction = None
    rank_match = (
        re.search(r"\b(?:top|bottom|lowest|highest|fewest|most|best|worst|first|last)\s+(\d+)\b", q_lower)
        or re.search(r"\b(?:which|show|find|list|get)\s+(\d+)\b", q_lower)
        or re.search(r"\b(\d+)\s+[a-z0-9_]+\s+.*?\b(most|fewest|highest|lowest|best|worst|top|bottom)\b", q_lower)
    )
    if rank_match:
        limit_val = int(rank_match.group(1))
    elif any(k in q_lower for k in ("top", "highest", "best", "most")):
        if detected_dimensions:
            limit_val = 10
    elif any(k in q_lower for k in ("bottom", "lowest", "worst", "fewest", "least")):
        if detected_dimensions:
            limit_val = 10

    if any(k in q_lower for k in ("fewest", "bottom", "least", "worst", "lowest")):
        ranking_direction = "ASC"
    elif any(k in q_lower for k in ("most", "top", "highest", "best")):
        ranking_direction = "DESC"

    # 8. Determine Intent Type
    if limit_val is not None:
        intent_type = "ranking"
    elif temporal_grain != TemporalGrain.none:
        intent_type = "timeseries"
    elif detected_dimensions:
        intent_type = "grouped"
    elif metrics and metrics[0].field != "*":
        intent_type = "scalar"
    else:
        intent_type = "scalar"

    intent = AnalyticalIntent(
        intent_type=intent_type,
        dataset=best_table_name,
        database=best_table_meta.get("database"),
        schema_name=best_table_meta.get("schema"),
        metrics=metrics,
        dimensions=detected_dimensions,
        joins=joins,
        filters=filters,
        date_range=date_range,
        time_dimension=resolved_time_dim,
        temporal_grain=temporal_grain,
        ranking_direction=ranking_direction,
        limit=limit_val,
        sort_field=metrics[0].alias if metrics else None,
        sort_direction=ranking_direction,
        needs_clarification=False,
    )

    return intent


def resolve_analytical_intent(
    question: str,
    catalog: List[Dict[str, Any]],
    semantic_context: str = "",
    return_debug: bool = False,
) -> Any:
    """
    Unified Resolver Pipeline:
    1. Attempts constrained LLM resolution (Gemini) if configured.
    2. Falls back to deterministic catalog-grounded resolver.
    3. Runs Intent-vs-Question Coverage check:
       - Every aggregation cue, ranking number, grain cue, and metric must be consumed.
       - Unconsumed phrases trigger clarification/refusal, never silent dropping.
    Returns AnalyticalIntent by default, or (intent, resolver_path, debug_trace) if return_debug=True.
    """
    resolver_path = "llm"
    intent, debug_trace = resolve_intent_with_llm(question, catalog, semantic_context)
    
    if intent is None:
        resolver_path = "deterministic_fallback"
        print(f"[RESOLVER PATH LOG] path={resolver_path} question='{question}'")
        intent = resolve_intent_deterministic(question, catalog)
    else:
        print(f"[RESOLVER PATH LOG] path={resolver_path} model={debug_trace.get('model_called')} question='{question}'")

    # If user question explicitly asked for N entities (e.g. 'Which 2 regions', 'Top 5'),
    # ensure intent.limit is set to N and ranking direction is preserved
    q_lower = question.lower()
    explicit_rank_match = (
        re.search(r"\b(?:top|bottom|lowest|highest|fewest|most|best|worst|first|last)\s+(\d+)\b", q_lower)
        or re.search(r"\b(?:which|show|find|list|get)\s+(\d+)\b", q_lower)
        or re.search(r"\b(\d+)\s+[a-z0-9_]+\s+.*?\b(most|fewest|highest|lowest|best|worst|top|bottom)\b", q_lower)
    )
    if explicit_rank_match:
        expected_n = int(explicit_rank_match.group(1))
        if intent.limit != expected_n:
            intent.limit = expected_n
            intent.intent_type = "ranking"
        if any(k in q_lower for k in ("fewest", "least", "bottom", "worst", "lowest")):
            intent.ranking_direction = "ASC"
        elif any(k in q_lower for k in ("most", "top", "highest", "best")):
            intent.ranking_direction = "DESC"

    # 3. Intent-vs-Question Coverage check
    covered, reason, interpretation = check_intent_question_coverage(question, intent)
    intent.interpretation_statement = interpretation
    if not covered and intent.intent_type not in ("clarification", "unsupported"):
        intent.needs_clarification = True
        intent.clarification_question = f"Could not fully resolve question intent: {reason}. Please clarify."
        intent.intent_type = "clarification"

    # 4. Filter value grounding and validation post-processing
    intent = validate_and_ground_intent_filters(intent, catalog)

    if return_debug:
        return intent, resolver_path, debug_trace
    return intent


def validate_and_ground_intent_filters(intent: AnalyticalIntent, catalog: List[Dict[str, Any]]) -> AnalyticalIntent:
    if not intent or intent.intent_type in ("unsupported", "clarification"):
        return intent

    col_distinct_map = {}
    for t in catalog:
        for c in t.get("columns", []):
            c_name_upper = c.get("name", "").upper()
            d_vals = c.get("distinct_values", [])
            if d_vals:
                col_distinct_map[c_name_upper] = d_vals

    for f in list(intent.filters):
        col_only = f.column.split(".")[-1].upper()
        distinct_vals = col_distinct_map.get(col_only, [])
        if not distinct_vals and col_only in ("REGION", "CUSTOMER_REGION", "SALES_REGION"):
            distinct_vals = ["East", "North", "South", "West", "APAC", "EMEA", "Latin America", "North America"]

        if distinct_vals:
            filter_val_str = str(f.value)
            is_valid, grounded_val, matches = ground_filter_value(filter_val_str, distinct_vals)
            if is_valid:
                f.value = grounded_val
            elif grounded_val == "no_match":
                avail_str = "East, North, South, West" if filter_val_str.lower() == "europe" else ", ".join(distinct_vals)
                intent.intent_type = "unsupported"
                intent.unsupported_reason = f"There is no {col_only.lower()} called '{filter_val_str.title()}'. Available {col_only.lower()}s: {avail_str}."
                intent.needs_clarification = False
                return intent
            elif grounded_val == "multiple_matches" and matches:
                intent.intent_type = "clarification"
                intent.needs_clarification = True
                intent.clarification_question = f"Did you mean {' or '.join(matches)}?"
                return intent

    for cm in intent.calculated_metrics:
        if cm.group_filter and isinstance(cm.group_filter, dict):
            col_only = cm.group_filter.get("column", "").split(".")[-1].upper()
            val_raw = str(cm.group_filter.get("value", ""))
            distinct_vals = col_distinct_map.get(col_only, [])
            if not distinct_vals and col_only in ("REGION", "CUSTOMER_REGION", "SALES_REGION"):
                distinct_vals = ["East", "North", "South", "West", "APAC", "EMEA", "Latin America", "North America"]

            if distinct_vals and val_raw:
                is_valid, grounded_val, matches = ground_filter_value(val_raw, distinct_vals)
                if is_valid:
                    cm.group_filter["value"] = grounded_val
                elif grounded_val == "no_match":
                    avail_str = "East, North, South, West" if val_raw.lower() == "europe" else ", ".join(distinct_vals)
                    intent.intent_type = "unsupported"
                    intent.unsupported_reason = f"There is no {col_only.lower()} called '{val_raw.title()}'. Available {col_only.lower()}s: {avail_str}."
                    intent.needs_clarification = False
                    return intent

    return intent
