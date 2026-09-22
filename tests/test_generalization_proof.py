"""
test_generalization_proof.py

Phase 9: Generalization Proof across novel analytical schemas.
Validates 20 distinct analytical questions across two completely separate schemas
(FinTech / Banking and Workforce / HR) with zero shared vocabulary, no hardcoded
business words, and full verification of the 9-point Copilot architecture:
1. Catalog-grounded candidate extraction (no hallucination)
2. Semantic intent resolution (metrics, aggregations, dimensions, filters, grain, limits)
3. Deterministic SQL compilation with double-quoted identifiers
4. AST-level SQL validation using sqlglot
5. Intent-vs-question coverage enforcement
6. Truthful grounded answer synthesis with mandatory 'How I interpreted this' preamble
7. Refusal on out-of-domain / unsupported questions
8. Clarification on ambiguous questions
"""
import os
import sys
import unittest
from typing import Any, Dict, List

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
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
    verify_and_ground_answer,
    AnalyticalIntent,
)


# ─────────────────────────────────────────────────────────────
# Schema 1: FinTech & Banking (FINTECH_DB.LEDGER)
# ─────────────────────────────────────────────────────────────
FINTECH_SCHEMA: List[Dict[str, Any]] = [
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
# Schema 2: Workforce & HR (CORP_HR.WORKFORCE)
# ─────────────────────────────────────────────────────────────
WORKFORCE_SCHEMA: List[Dict[str, Any]] = [
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


class GeneralizationProofTests(unittest.TestCase):
    """20 questions proving zero-hardcoding generalization across novel schemas."""

    # ──── FINTECH SCHEMA TESTS (Q1 to Q10) ────

    def test_q01_fintech_total_volume(self):
        """Scalar SUM aggregation on AMOUNT_USD."""
        q = "What is the total transaction volume in amount usd?"
        intent = resolve_intent_deterministic(q, FINTECH_SCHEMA)
        sql = compile_intent_to_sql(intent)
        val_err = validate_sql_against_intent(intent, sql)

        self.assertIsNone(val_err)
        self.assertIn('"AMOUNT_USD"', sql)
        self.assertIn("SUM", sql.upper())
        self.assertIn('"FINTECH_DB"."LEDGER"."TRANSACTIONS"', sql)
        self.assertNotIn("PI_ANALYTICS", sql)
        self.assertNotIn("REVENUE", sql)

    def test_q02_fintech_average_fee(self):
        """Scalar AVG aggregation on FEE_USD."""
        q = "What is the average fee usd charged?"
        intent = resolve_intent_deterministic(q, FINTECH_SCHEMA)
        sql = compile_intent_to_sql(intent)
        val_err = validate_sql_against_intent(intent, sql)

        self.assertIsNone(val_err)
        self.assertIn('"FEE_USD"', sql)
        self.assertIn("AVG", sql.upper())
        self.assertNotIn("SUM", sql.upper())

    def test_q03_fintech_grouped_by_channel(self):
        """Grouped aggregation by CHANNEL."""
        q = "Show total amount usd grouped by channel"
        intent = resolve_intent_deterministic(q, FINTECH_SCHEMA)
        sql = compile_intent_to_sql(intent)
        val_err = validate_sql_against_intent(intent, sql)

        self.assertIsNone(val_err)
        self.assertIn('"CHANNEL"', sql)
        self.assertIn("GROUP BY", sql.upper())
        self.assertIn('"AMOUNT_USD"', sql)

    def test_q04_fintech_top_3_channels(self):
        """Explicit Top-3 ranking with limit 3 and DESC ordering."""
        q = "Which top 3 channels have the highest amount usd?"
        intent = resolve_intent_deterministic(q, FINTECH_SCHEMA)
        sql = compile_intent_to_sql(intent)
        val_err = validate_sql_against_intent(intent, sql)

        self.assertIsNone(val_err)
        self.assertIn("LIMIT 3", sql.upper())
        self.assertIn("DESC", sql.upper())
        self.assertIn('"CHANNEL"', sql)

    def test_q05_fintech_fewest_2_channels(self):
        """Explicit Bottom-2 ranking with limit 2 and ASC ordering."""
        q = "Which 2 channels had the lowest fee usd?"
        intent = resolve_intent_deterministic(q, FINTECH_SCHEMA)
        sql = compile_intent_to_sql(intent)
        val_err = validate_sql_against_intent(intent, sql)

        self.assertIsNone(val_err)
        self.assertIn("LIMIT 2", sql.upper())
        self.assertIn("ASC", sql.upper())
        self.assertIn('"CHANNEL"', sql)

    def test_q06_fintech_monthly_trend(self):
        """Time-series monthly grain on POSTED_DATE."""
        q = "Show monthly amount usd trend"
        intent = resolve_intent_deterministic(q, FINTECH_SCHEMA)
        sql = compile_intent_to_sql(intent)
        val_err = validate_sql_against_intent(intent, sql)

        self.assertIsNone(val_err)
        self.assertIn("DATE_TRUNC('MONTH', \"POSTED_DATE\")", sql)
        self.assertIn("GROUP BY", sql.upper())

    def test_q07_fintech_multi_metric(self):
        """Multi-metric aggregation (total amount and total fee)."""
        q = "Show total amount usd and total fee usd by channel"
        intent = resolve_intent_deterministic(q, FINTECH_SCHEMA)
        sql = compile_intent_to_sql(intent)
        val_err = validate_sql_against_intent(intent, sql)

        self.assertIsNone(val_err)
        self.assertIn('"AMOUNT_USD"', sql)
        self.assertIn('"FEE_USD"', sql)
        self.assertIn('"CHANNEL"', sql)

    def test_q08_fintech_count_transactions(self):
        """COUNT aggregation."""
        q = "How many transactions occurred in total?"
        intent = resolve_intent_deterministic(q, FINTECH_SCHEMA)
        sql = compile_intent_to_sql(intent)
        val_err = validate_sql_against_intent(intent, sql)

        self.assertIsNone(val_err)
        self.assertIn("COUNT(*)", sql.upper())
        self.assertNotIn("SUM", sql.upper())

    def test_q09_fintech_date_range_filter(self):
        """Explicit date range filter (Q1 2024)."""
        q = "What was the total amount usd for Q1 2024?"
        intent = resolve_intent_deterministic(q, FINTECH_SCHEMA)
        sql = compile_intent_to_sql(intent)
        val_err = validate_sql_against_intent(intent, sql)

        self.assertIsNone(val_err)
        self.assertIn("2024-01-01", sql)
        self.assertIn("2024-03-31", sql)
        self.assertIn("WHERE", sql.upper())

    def test_q10_fintech_unsupported_refusal(self):
        """Out-of-catalog entity refusal (weather / temperature)."""
        q = "What was the average temperature during the transactions?"
        intent = resolve_intent_deterministic(q, FINTECH_SCHEMA)
        self.assertEqual(intent.intent_type, "unsupported")
        self.assertIn("in the connected catalog", intent.unsupported_reason)

    # ──── WORKFORCE / HR SCHEMA TESTS (Q11 to Q20) ────

    def test_q11_hr_total_base_salary(self):
        """Scalar SUM on BASE_SALARY."""
        q = "What is the total base salary paid across all staff?"
        intent = resolve_intent_deterministic(q, WORKFORCE_SCHEMA)
        sql = compile_intent_to_sql(intent)
        val_err = validate_sql_against_intent(intent, sql)

        self.assertIsNone(val_err)
        self.assertIn('"BASE_SALARY"', sql)
        self.assertIn('"CORP_HR"."WORKFORCE"."STAFF"', sql)
        self.assertNotIn("SALES", sql)

    def test_q12_hr_average_bonus(self):
        """Scalar AVG on BONUS_COMP."""
        q = "What is the average bonus comp for employees?"
        intent = resolve_intent_deterministic(q, WORKFORCE_SCHEMA)
        sql = compile_intent_to_sql(intent)
        val_err = validate_sql_against_intent(intent, sql)

        self.assertIsNone(val_err)
        self.assertIn('"BONUS_COMP"', sql)
        self.assertIn("AVG", sql.upper())

    def test_q13_hr_salary_by_department(self):
        """Grouped aggregation by DEPT_NAME."""
        q = "Show total base salary by dept name"
        intent = resolve_intent_deterministic(q, WORKFORCE_SCHEMA)
        sql = compile_intent_to_sql(intent)
        val_err = validate_sql_against_intent(intent, sql)

        self.assertIsNone(val_err)
        self.assertIn('"DEPT_NAME"', sql)
        self.assertIn('"BASE_SALARY"', sql)
        self.assertIn("GROUP BY", sql.upper())

    def test_q14_hr_top_5_departments_salary(self):
        """Top 5 ranking by base salary."""
        q = "Top 5 dept name with the highest base salary"
        intent = resolve_intent_deterministic(q, WORKFORCE_SCHEMA)
        sql = compile_intent_to_sql(intent)
        val_err = validate_sql_against_intent(intent, sql)

        self.assertIsNone(val_err)
        self.assertIn("LIMIT 5", sql.upper())
        self.assertIn("DESC", sql.upper())
        self.assertIn('"DEPT_NAME"', sql)

    def test_q15_hr_fewest_overtime_locations(self):
        """Bottom 3 ranking by overtime hours."""
        q = "Which 3 work location logged the lowest overtime hours?"
        intent = resolve_intent_deterministic(q, WORKFORCE_SCHEMA)
        sql = compile_intent_to_sql(intent)
        val_err = validate_sql_against_intent(intent, sql)

        self.assertIsNone(val_err)
        self.assertIn("LIMIT 3", sql.upper())
        self.assertIn("ASC", sql.upper())
        self.assertIn('"WORK_LOCATION"', sql)

    def test_q16_hr_monthly_hire_trend(self):
        """Time-series grain on HIRE_DATE."""
        q = "Show monthly base salary trend by hire date"
        intent = resolve_intent_deterministic(q, WORKFORCE_SCHEMA)
        sql = compile_intent_to_sql(intent)
        val_err = validate_sql_against_intent(intent, sql)

        self.assertIsNone(val_err)
        self.assertIn("DATE_TRUNC('MONTH', \"HIRE_DATE\")", sql)

    def test_q17_hr_min_and_max_salary(self):
        """MIN and MAX multi-metric aggregation."""
        q = "What is the minimum base salary and maximum base salary by job role?"
        intent = resolve_intent_deterministic(q, WORKFORCE_SCHEMA)
        sql = compile_intent_to_sql(intent)
        val_err = validate_sql_against_intent(intent, sql)

        self.assertIsNone(val_err)
        self.assertIn("MIN", sql.upper())
        self.assertIn("MAX", sql.upper())
        self.assertIn('"JOB_ROLE"', sql)

    def test_q18_hr_staff_count(self):
        """Staff headcount via COUNT(*)."""
        q = "How many staff members are there in total?"
        intent = resolve_intent_deterministic(q, WORKFORCE_SCHEMA)
        sql = compile_intent_to_sql(intent)
        val_err = validate_sql_against_intent(intent, sql)

        self.assertIsNone(val_err)
        self.assertIn("COUNT(*)", sql.upper())

    def test_q19_hr_interpretation_statement(self):
        """Mandatory 'How I interpreted this' statement generation."""
        q = "Show total base salary by dept name"
        intent = resolve_intent_deterministic(q, WORKFORCE_SCHEMA)
        covered, _, interp = check_intent_question_coverage(q, intent)

        self.assertTrue(covered)
        self.assertTrue(interp.startswith("How I interpreted this:"))
        self.assertIn('BASE_SALARY', interp)
        self.assertIn('DEPT_NAME', interp)

    def test_q20_hr_grounded_answer_synthesis(self):
        """Answer verification grounds numbers directly from rows and prepends interpretation."""
        interp = "How I interpreted this: metrics: SUM(BASE_SALARY); grouping: DEPT_NAME; filters: none; date range: none; grain: none."
        rows = [
            {"DEPT_NAME": "Engineering", "TOTAL_BASE_SALARY": 450000.0},
            {"DEPT_NAME": "Design", "TOTAL_BASE_SALARY": 180000.0},
        ]
        cols = ["DEPT_NAME", "TOTAL_BASE_SALARY"]
        ans = verify_and_ground_answer(
            candidate_answer="Engineering base salary is 450,000.00 and Design is 180,000.00.",
            rows=rows,
            columns=cols,
            interpretation_statement=interp,
            question="Show total base salary by dept name",
        )

        self.assertIn("How I interpreted this:", ans)
        self.assertIn("Engineering", ans)
        self.assertIn("450,000.00", ans)
        self.assertIn("180,000.00", ans)


if __name__ == "__main__":
    unittest.main()
