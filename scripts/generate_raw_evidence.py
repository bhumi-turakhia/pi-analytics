import json
import os
import sys

# Ensure backend in path
sys.path.insert(0, os.path.abspath("."))

from backend.app.services.copilot.resolver import resolve_analytical_intent
from backend.app.services.copilot.compiler import compile_intent_to_sql
from backend.app.services.copilot.validator import validate_sql_against_intent

# Sample live catalog with Sales, Customers, Channels, and Dates
sample_catalog = [
    {
        "database": "ANALYTICS_DB",
        "schema": "PUBLIC",
        "table": "SALES",
        "columns": [
            {"name": "SALE_ID", "data_type": "NUMBER"},
            {"name": "CUSTOMER_ID", "data_type": "NUMBER"},
            {"name": "CHANNEL_ID", "data_type": "NUMBER"},
            {"name": "REGION", "data_type": "VARCHAR"},
            {"name": "REVENUE", "data_type": "NUMBER"},
            {"name": "UNITS_SOLD", "data_type": "NUMBER"},
            {"name": "SALE_DATE", "data_type": "DATE"},
        ],
    },
    {
        "database": "ANALYTICS_DB",
        "schema": "PUBLIC",
        "table": "CUSTOMERS",
        "columns": [
            {"name": "CUSTOMER_ID", "data_type": "NUMBER"},
            {"name": "CUSTOMER_NAME", "data_type": "VARCHAR"},
            {"name": "SEGMENT", "data_type": "VARCHAR"},
        ],
    },
    {
        "database": "ANALYTICS_DB",
        "schema": "PUBLIC",
        "table": "CHANNELS",
        "columns": [
            {"name": "CHANNEL_ID", "data_type": "NUMBER"},
            {"name": "CHANNEL_NAME", "data_type": "VARCHAR"},
            {"name": "TARGET_REVENUE", "data_type": "NUMBER"},
        ],
    },
]

questions = [
    "What share of revenue comes from the West?",
    "Compare revenue in the first and second half of the year",
    "Which channel is underperforming?",
]

def run():
    import time
    for idx, q in enumerate(questions, 1):
        if idx > 1:
            time.sleep(5)
        print(f"\n==================================================")
        print(f"QUESTION {idx}: {q}")
        print(f"==================================================")
        intent, resolver_path, debug_trace = resolve_analytical_intent(q, sample_catalog, return_debug=True)
        
        print("\n--- 1. RESOLVER PATH & SERVER LOG ---")
        print(f"resolver_path: {resolver_path}")
        model_used = debug_trace.get("model_called") or "none (fallback)"
        print(f"server_log: [COPILOT SERVER LOG] question='{q}' resolver_path='{resolver_path}' model='{model_used}'")

        print("\n--- 2. FULL LLM REQUEST & MODEL DETAILS ---")
        req = debug_trace.get("raw_llm_request") or {}
        print(f"Model Called: {debug_trace.get('model_called')}")
        print(f"Structured JSON Mode: {debug_trace.get('structured_json_mode')}")
        print(f"System Prompt: {req.get('system_prompt')}")
        print(f"Catalog Context:\n{req.get('catalog_context')}")
        print(f"User Question: {q}")

        print("\n--- 3. RAW LLM RESPONSE & POST-PROCESSING ---")
        raw_resp = debug_trace.get("raw_llm_response")
        print(f"Raw LLM Response:\n{raw_resp}")
        print(f"\nIntent Before Post-Processing:\n{json.dumps(debug_trace.get('intent_before_post_processing'), indent=2)}")
        print(f"\nModifications / Overrides Applied: {debug_trace.get('modifications_applied')}")
        
        dict_intent = {
            "intent_type": intent.intent_type,
            "dataset": intent.dataset,
            "metrics": [{"field": m.field, "aggregation": m.aggregation.value, "alias": m.alias} for m in intent.metrics],
            "calculated_metrics": [
                {
                    "name": cm.name,
                    "numerator_field": cm.numerator_field,
                    "denominator_field": cm.denominator_field,
                    "semantics": cm.semantics,
                    "group_filter": cm.group_filter,
                    "alias": cm.alias,
                }
                for cm in intent.calculated_metrics
            ],
            "dimensions": intent.dimensions,
            "time_dimension": intent.time_dimension,
            "temporal_grain": intent.temporal_grain.value,
            "filters": [{"column": f.column, "operator": f.operator, "value": f.value} for f in intent.filters],
            "ranking_direction": intent.ranking_direction,
            "limit": intent.limit,
            "needs_clarification": intent.needs_clarification,
            "clarification_question": intent.clarification_question,
            "unsupported_reason": intent.unsupported_reason,
            "interpretation_statement": intent.interpretation_statement,
        }
        print(f"\nFinal Post-Processed Intent JSON:\n{json.dumps(dict_intent, indent=2)}")

        print("\n--- 4. COMPILED SQL & VALIDATION ---")
        try:
            sql = compile_intent_to_sql(intent)
            print(f"Compiled SQL:\n{sql}")
            val_err = validate_sql_against_intent(intent, sql, sample_catalog)
            print(f"AST Validation Result: {'VALID' if val_err is None else val_err}")
        except Exception as e:
            print(f"Compilation Error: {e}")

if __name__ == "__main__":
    run()
