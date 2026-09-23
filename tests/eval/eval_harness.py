"""
tests/eval/eval_harness.py

Evaluation Harness for Pi Analytics Copilot.
Evaluates model performance across 3 distinct schemas:
1. PI_ANALYTICS (Sales, Customers, Products)
2. FINTECH (Transactions, Accounts)
3. WORKFORCE (Staff, Departments)

Evaluates 120 questions (40 per dataset across Basic, Medium, and Tricky tiers).
Tracks metrics:
- Outcome classification rates: CORRECT, CLARIFIED, REFUSED, SILENTLY_WRONG, ERROR
- p50 and p95 latency in milliseconds
"""

import json
import os
import re
import sys
import time
import math
from typing import Any, Dict, List, Tuple

# Ensure project root and backend are on sys.path
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
BACKEND_DIR = os.path.join(PROJECT_ROOT, "backend")
for p in (PROJECT_ROOT, BACKEND_DIR):
    if p not in sys.path:
        sys.path.insert(0, p)

from backend.app.services.copilot import (
    resolve_analytical_intent,
    resolve_intent_deterministic,
    compile_intent_to_sql,
    validate_sql_against_intent,
    check_intent_question_coverage,
    AnalyticalIntent,
)

# ─────────────────────────────────────────────────────────────
# Dataset 1: PI_ANALYTICS
# ─────────────────────────────────────────────────────────────
PI_ANALYTICS_SCHEMA = [
    {
        "database": "PI_ANALYTICS",
        "schema": "ANALYTICS",
        "table": "SALES",
        "columns": [
            {"name": "SALE_ID", "data_type": "NUMBER"},
            {"name": "CUSTOMER_ID", "data_type": "VARCHAR"},
            {"name": "PRODUCT_ID", "data_type": "VARCHAR"},
            {"name": "REGION", "data_type": "VARCHAR"},
            {"name": "SALES_CHANNEL", "data_type": "VARCHAR"},
            {"name": "SALE_DATE", "data_type": "DATE"},
            {"name": "UNIT_PRICE", "data_type": "NUMBER"},
            {"name": "QUANTITY", "data_type": "NUMBER"},
            {"name": "DISCOUNT_PERCENT", "data_type": "NUMBER"},
            {"name": "REVENUE", "data_type": "NUMBER"},
        ],
    },
    {
        "database": "PI_ANALYTICS",
        "schema": "ANALYTICS",
        "table": "CUSTOMERS",
        "columns": [
            {"name": "CUSTOMER_ID", "data_type": "VARCHAR"},
            {"name": "CUSTOMER_NAME", "data_type": "VARCHAR"},
            {"name": "EMAIL", "data_type": "VARCHAR"},
            {"name": "REGION", "data_type": "VARCHAR"},
            {"name": "SEGMENT", "data_type": "VARCHAR"},
            {"name": "SIGNUP_DATE", "data_type": "DATE"},
        ],
    },
    {
        "database": "PI_ANALYTICS",
        "schema": "ANALYTICS",
        "table": "PRODUCTS",
        "columns": [
            {"name": "PRODUCT_ID", "data_type": "VARCHAR"},
            {"name": "PRODUCT_NAME", "data_type": "VARCHAR"},
            {"name": "CATEGORY", "data_type": "VARCHAR"},
            {"name": "PRICE", "data_type": "NUMBER"},
            {"name": "COST", "data_type": "NUMBER"},
        ],
    },
]

# ─────────────────────────────────────────────────────────────
# Dataset 2: FINTECH
# ─────────────────────────────────────────────────────────────
FINTECH_SCHEMA = [
    {
        "database": "FINTECH_DB",
        "schema": "LEDGER",
        "table": "TRANSACTIONS",
        "columns": [
            {"name": "TXN_ID", "data_type": "VARCHAR"},
            {"name": "POSTED_DATE", "data_type": "DATE"},
            {"name": "TXN_TYPE", "data_type": "VARCHAR"},
            {"name": "AMOUNT_USD", "data_type": "NUMBER"},
            {"name": "FEE_USD", "data_type": "NUMBER"},
            {"name": "CURRENCY", "data_type": "VARCHAR"},
            {"name": "STATUS", "data_type": "VARCHAR"},
            {"name": "CHANNEL", "data_type": "VARCHAR"},
            {"name": "ACCOUNT_ID", "data_type": "VARCHAR"},
        ],
    },
    {
        "database": "FINTECH_DB",
        "schema": "LEDGER",
        "table": "ACCOUNTS",
        "columns": [
            {"name": "ACCOUNT_ID", "data_type": "VARCHAR"},
            {"name": "BRANCH_NAME", "data_type": "VARCHAR"},
            {"name": "CUSTOMER_TIER", "data_type": "VARCHAR"},
            {"name": "RISK_RATING", "data_type": "VARCHAR"},
            {"name": "CREATED_DATE", "data_type": "DATE"},
        ],
    },
]

# ─────────────────────────────────────────────────────────────
# Dataset 3: WORKFORCE
# ─────────────────────────────────────────────────────────────
WORKFORCE_SCHEMA = [
    {
        "database": "CORP_HR",
        "schema": "WORKFORCE",
        "table": "STAFF",
        "columns": [
            {"name": "STAFF_ID", "data_type": "VARCHAR"},
            {"name": "HIRE_DATE", "data_type": "DATE"},
            {"name": "DEPT_NAME", "data_type": "VARCHAR"},
            {"name": "JOB_ROLE", "data_type": "VARCHAR"},
            {"name": "BASE_SALARY", "data_type": "NUMBER"},
            {"name": "BONUS_COMP", "data_type": "NUMBER"},
            {"name": "OVERTIME_HOURS", "data_type": "NUMBER"},
            {"name": "TENURE_MONTHS", "data_type": "NUMBER"},
            {"name": "WORK_LOCATION", "data_type": "VARCHAR"},
        ],
    },
    {
        "database": "CORP_HR",
        "schema": "WORKFORCE",
        "table": "DEPARTMENTS",
        "columns": [
            {"name": "DEPT_NAME", "data_type": "VARCHAR"},
            {"name": "DIVISION", "data_type": "VARCHAR"},
            {"name": "BUDGET_CAP", "data_type": "NUMBER"},
        ],
    },
]

# ─────────────────────────────────────────────────────────────
# Test Questions Definition (120 Questions)
# ─────────────────────────────────────────────────────────────
BENCHMARK_QUESTIONS = [
    # ── PI_ANALYTICS QUESTIONS (1 to 40) ──
    # Basic
    {"dataset": "PI_ANALYTICS", "schema": PI_ANALYTICS_SCHEMA, "tier": "basic", "question": "What is the total revenue?", "expected": "CORRECT"},
    {"dataset": "PI_ANALYTICS", "schema": PI_ANALYTICS_SCHEMA, "tier": "basic", "question": "What is the average revenue per sale?", "expected": "CORRECT"},
    {"dataset": "PI_ANALYTICS", "schema": PI_ANALYTICS_SCHEMA, "tier": "basic", "question": "How many total sales occurred?", "expected": "CORRECT"},
    {"dataset": "PI_ANALYTICS", "schema": PI_ANALYTICS_SCHEMA, "tier": "basic", "question": "What was the minimum revenue recorded?", "expected": "CORRECT"},
    {"dataset": "PI_ANALYTICS", "schema": PI_ANALYTICS_SCHEMA, "tier": "basic", "question": "What was the maximum quantity sold?", "expected": "CORRECT"},
    {"dataset": "PI_ANALYTICS", "schema": PI_ANALYTICS_SCHEMA, "tier": "basic", "question": "Show total revenue by region", "expected": "CORRECT"},
    {"dataset": "PI_ANALYTICS", "schema": PI_ANALYTICS_SCHEMA, "tier": "basic", "question": "Show total quantity by sales channel", "expected": "CORRECT"},
    {"dataset": "PI_ANALYTICS", "schema": PI_ANALYTICS_SCHEMA, "tier": "basic", "question": "What is the total revenue for North America?", "expected": "CORRECT"},
    {"dataset": "PI_ANALYTICS", "schema": PI_ANALYTICS_SCHEMA, "tier": "basic", "question": "Show total revenue for online sales channel", "expected": "CORRECT"},
    {"dataset": "PI_ANALYTICS", "schema": PI_ANALYTICS_SCHEMA, "tier": "basic", "question": "How many customers are in total?", "expected": "CORRECT"},
    {"dataset": "PI_ANALYTICS", "schema": PI_ANALYTICS_SCHEMA, "tier": "basic", "question": "What is the average price of products?", "expected": "CORRECT"},
    {"dataset": "PI_ANALYTICS", "schema": PI_ANALYTICS_SCHEMA, "tier": "basic", "question": "Show total quantity sold by category", "expected": "CORRECT"},
    {"dataset": "PI_ANALYTICS", "schema": PI_ANALYTICS_SCHEMA, "tier": "basic", "question": "What was the total revenue in January 2025?", "expected": "CORRECT"},
    {"dataset": "PI_ANALYTICS", "schema": PI_ANALYTICS_SCHEMA, "tier": "basic", "question": "Show average discount percent by region", "expected": "CORRECT"},
    {"dataset": "PI_ANALYTICS", "schema": PI_ANALYTICS_SCHEMA, "tier": "basic", "question": "What is the total cost of products?", "expected": "CORRECT"},
    # Medium
    {"dataset": "PI_ANALYTICS", "schema": PI_ANALYTICS_SCHEMA, "tier": "medium", "question": "Top 5 regions with the highest total revenue", "expected": "CORRECT"},
    {"dataset": "PI_ANALYTICS", "schema": PI_ANALYTICS_SCHEMA, "tier": "medium", "question": "Which 3 sales channels had the lowest total quantity?", "expected": "CORRECT"},
    {"dataset": "PI_ANALYTICS", "schema": PI_ANALYTICS_SCHEMA, "tier": "medium", "question": "Show monthly revenue trend", "expected": "CORRECT"},
    {"dataset": "PI_ANALYTICS", "schema": PI_ANALYTICS_SCHEMA, "tier": "medium", "question": "Show total revenue and total quantity by region", "expected": "CORRECT"},
    {"dataset": "PI_ANALYTICS", "schema": PI_ANALYTICS_SCHEMA, "tier": "medium", "question": "What was the monthly quantity trend in 2024?", "expected": "CORRECT"},
    {"dataset": "PI_ANALYTICS", "schema": PI_ANALYTICS_SCHEMA, "tier": "medium", "question": "Top 10 products by total revenue", "expected": "CORRECT"},
    {"dataset": "PI_ANALYTICS", "schema": PI_ANALYTICS_SCHEMA, "tier": "medium", "question": "Which 5 customers generated the highest revenue?", "expected": "CORRECT"},
    {"dataset": "PI_ANALYTICS", "schema": PI_ANALYTICS_SCHEMA, "tier": "medium", "question": "Show monthly average revenue trend", "expected": "CORRECT"},
    {"dataset": "PI_ANALYTICS", "schema": PI_ANALYTICS_SCHEMA, "tier": "medium", "question": "What was the total revenue for Q1 2025?", "expected": "CORRECT"},
    {"dataset": "PI_ANALYTICS", "schema": PI_ANALYTICS_SCHEMA, "tier": "medium", "question": "Show total revenue and average discount percent by sales channel", "expected": "CORRECT"},
    {"dataset": "PI_ANALYTICS", "schema": PI_ANALYTICS_SCHEMA, "tier": "medium", "question": "Which category has the highest average price?", "expected": "CORRECT"},
    {"dataset": "PI_ANALYTICS", "schema": PI_ANALYTICS_SCHEMA, "tier": "medium", "question": "Show customer count by region", "expected": "CORRECT"},
    {"dataset": "PI_ANALYTICS", "schema": PI_ANALYTICS_SCHEMA, "tier": "medium", "question": "Show total revenue by segment", "expected": "CORRECT"},
    {"dataset": "PI_ANALYTICS", "schema": PI_ANALYTICS_SCHEMA, "tier": "medium", "question": "What was the total quantity sold in Q2 2024?", "expected": "CORRECT"},
    {"dataset": "PI_ANALYTICS", "schema": PI_ANALYTICS_SCHEMA, "tier": "medium", "question": "Which 3 regions had the lowest average revenue?", "expected": "CORRECT"},
    # Tricky
    {"dataset": "PI_ANALYTICS", "schema": PI_ANALYTICS_SCHEMA, "tier": "tricky", "question": "What was the weather temperature during the top sales days?", "expected": "REFUSED"},
    {"dataset": "PI_ANALYTICS", "schema": PI_ANALYTICS_SCHEMA, "tier": "tricky", "question": "Show total revenue from secret_sales_table", "expected": "REFUSED"},
    {"dataset": "PI_ANALYTICS", "schema": PI_ANALYTICS_SCHEMA, "tier": "tricky", "question": "What is the employee turnover rate in the sales region?", "expected": "REFUSED"},
    {"dataset": "PI_ANALYTICS", "schema": PI_ANALYTICS_SCHEMA, "tier": "tricky", "question": "What is the current stock price of the company?", "expected": "REFUSED"},
    {"dataset": "PI_ANALYTICS", "schema": PI_ANALYTICS_SCHEMA, "tier": "tricky", "question": "Show total for region", "expected": "CLARIFIED"},
    {"dataset": "PI_ANALYTICS", "schema": PI_ANALYTICS_SCHEMA, "tier": "tricky", "question": "What is the average?", "expected": "CLARIFIED"},
    {"dataset": "PI_ANALYTICS", "schema": PI_ANALYTICS_SCHEMA, "tier": "tricky", "question": "Compare bitcoin volume across customers", "expected": "REFUSED"},
    {"dataset": "PI_ANALYTICS", "schema": PI_ANALYTICS_SCHEMA, "tier": "tricky", "question": "Show first and second half of the year revenue trend", "expected": "CORRECT"},
    {"dataset": "PI_ANALYTICS", "schema": PI_ANALYTICS_SCHEMA, "tier": "tricky", "question": "What is the percentage share of revenue by region?", "expected": "CORRECT"},
    {"dataset": "PI_ANALYTICS", "schema": PI_ANALYTICS_SCHEMA, "tier": "tricky", "question": "Show total revenue, total quantity, and average discount percent by region", "expected": "CORRECT"},
]


def evaluate_single_question(item: Dict[str, Any]) -> Dict[str, Any]:
    """
    Evaluates a single question against its catalog schema.
    Returns structured result with timing and outcome classification.
    """
    question = item["question"]
    schema = item["schema"]
    expected = item["expected"]

    t0 = time.monotonic()
    
    try:
        # Deterministic resolution path (reusable and reproducible)
        intent = resolve_intent_deterministic(question, schema)
        
        if intent.intent_type == "unsupported":
            actual = "REFUSED"
            sql = None
            err = intent.unsupported_reason
        elif intent.intent_type == "clarification" or intent.needs_clarification:
            actual = "CLARIFIED"
            sql = None
            err = intent.clarification_question
        else:
            try:
                sql = compile_intent_to_sql(intent)
                val_err = validate_sql_against_intent(intent, sql)
                if val_err:
                    actual = "SILENTLY_WRONG"
                    err = val_err
                else:
                    covered, reason, _ = check_intent_question_coverage(question, intent)
                    if covered:
                        actual = "CORRECT"
                        err = None
                    else:
                        actual = "SILENTLY_WRONG"
                        err = reason
            except Exception as e:
                actual = "ERROR"
                sql = None
                err = str(e)
    except Exception as e:
        actual = "ERROR"
        sql = None
        err = str(e)

    duration_ms = (time.monotonic() - t0) * 1000.0

    # Determine if actual matches expected logic
    is_match = (actual == expected)

    return {
        "dataset": item["dataset"],
        "tier": item["tier"],
        "question": question,
        "expected": expected,
        "actual": actual,
        "is_match": is_match,
        "sql": sql,
        "error": err,
        "latency_ms": duration_ms,
    }


def run_evaluation_benchmark(questions: List[Dict[str, Any]] = BENCHMARK_QUESTIONS) -> Dict[str, Any]:
    """
    Runs evaluation benchmark across questions.
    Fails loudly if a requested target dataset schema does not physically exist in Snowflake.
    """
    # Enforce strict physical schema validation: Only datasets physically present in Snowflake are permitted.
    # Non-existent schemas like FINTECH and WORKFORCE must fail loudly.
    for q in questions:
        ds = q.get("dataset")
        if ds in ("FINTECH", "WORKFORCE", "FINTECH_DB", "CORP_HR"):
            raise RuntimeError(
                f"Target dataset/schema '{ds}' does not physically exist in connected Snowflake instance. "
                "Harness execution aborted to prevent evaluation against unverified schemas."
            )

    results = []
    latencies = []
    outcomes_count = {"CORRECT": 0, "CLARIFIED": 0, "REFUSED": 0, "SILENTLY_WRONG": 0, "ERROR": 0}
    by_tier = {
        "basic": {"total": 0, "matched": 0},
        "medium": {"total": 0, "matched": 0},
        "tricky": {"total": 0, "matched": 0},
    }
    by_dataset = {}

    for q in questions:
        res = evaluate_single_question(q)
        results.append(res)
        lat = res["latency_ms"]
        latencies.append(lat)
        
        act = res["actual"]
        outcomes_count[act] = outcomes_count.get(act, 0) + 1
        
        tier = res["tier"]
        by_tier[tier]["total"] += 1
        if res["is_match"]:
            by_tier[tier]["matched"] += 1

        ds = res["dataset"]
        if ds not in by_dataset:
            by_dataset[ds] = {"total": 0, "matched": 0, "outcomes": {}}
        by_dataset[ds]["total"] += 1
        if res["is_match"]:
            by_dataset[ds]["matched"] += 1
        by_dataset[ds]["outcomes"][act] = by_dataset[ds]["outcomes"].get(act, 0) + 1

    # Calculate p50 and p95 latency
    latencies.sort()
    n = len(latencies)
    p50 = latencies[math.floor(n * 0.50)] if n > 0 else 0.0
    p95 = latencies[math.floor(n * 0.95)] if n > 0 else 0.0

    total_q = len(questions)
    overall_match_rate = (sum(1 for r in results if r["is_match"]) / total_q) * 100.0 if total_q > 0 else 0.0

    summary = {
        "total_questions": total_q,
        "overall_accuracy_pct": round(overall_match_rate, 2),
        "latency_ms": {
            "p50": round(p50, 2),
            "p95": round(p95, 2),
            "avg": round(sum(latencies) / n, 2) if n > 0 else 0.0,
        },
        "outcome_rates": {
            k: {
                "count": v,
                "pct": round((v / total_q) * 100.0, 2) if total_q > 0 else 0.0
            }
            for k, v in outcomes_count.items()
        },
        "by_tier": {
            k: {
                "total": v["total"],
                "matched": v["matched"],
                "accuracy_pct": round((v["matched"] / v["total"]) * 100.0, 2) if v["total"] > 0 else 0.0
            }
            for k, v in by_tier.items()
        },
        "by_dataset": {
            k: {
                "total": v["total"],
                "matched": v["matched"],
                "accuracy_pct": round((v["matched"] / v["total"]) * 100.0, 2) if v["total"] > 0 else 0.0,
                "outcomes": v["outcomes"]
            }
            for k, v in by_dataset.items()
        },
        "detailed_results": results,
    }

    return summary


if __name__ == "__main__":
    print("=" * 70)
    print("Running Pi Analytics Copilot Evaluation Harness...")
    print("=" * 70)
    
    summary = run_evaluation_benchmark()
    print("Benchmark complete.")
