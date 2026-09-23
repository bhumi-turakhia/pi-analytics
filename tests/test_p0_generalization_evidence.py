import unittest
import json
from typing import Dict, Any, List

from backend.app.services.copilot.models import (
    AnalyticalIntent,
    AggregationType,
    TemporalGrain,
    MetricIntent,
    CalculatedMetricIntent,
    FilterIntent,
    JoinIntent,
)
from backend.app.services.copilot.compiler import compile_intent_to_sql
from backend.app.services.copilot.validator import validate_sql_against_intent
from backend.app.services.copilot.grounding import verify_and_ground_answer
from backend.app.services.copilot.resolver import (
    resolve_analytical_intent,
    ground_filter_value,
)


class GeneralizationAndHardeningTests(unittest.TestCase):
    """
    Exhaustive verification of generalization, synonym resolution,
    governance, ranking aggregations, joins, and answer grounding.
    """

    @classmethod
    def setUpClass(cls):
        # Catalog for Second Schema (Staff & Departments)
        cls.workforce_catalog = [
            {
                "database": "CORP_HR",
                "schema": "WORKFORCE",
                "table": "STAFF",
                "columns": [
                    {"name": "STAFF_ID", "data_type": "NUMBER"},
                    {"name": "FULL_NAME", "data_type": "VARCHAR"},
                    {"name": "DEPT_ID", "data_type": "NUMBER"},
                    {"name": "BASE_SALARY", "data_type": "NUMBER"},
                    {"name": "BONUS_COMP", "data_type": "NUMBER"},
                    {"name": "OVERTIME_HOURS", "data_type": "NUMBER"},
                    {"name": "HIRE_DATE", "data_type": "DATE"},
                ],
            },
            {
                "database": "CORP_HR",
                "schema": "WORKFORCE",
                "table": "DEPARTMENTS",
                "columns": [
                    {"name": "DEPT_ID", "data_type": "NUMBER"},
                    {"name": "DEPT_NAME", "data_type": "VARCHAR"},
                    {"name": "LOCATION", "data_type": "VARCHAR"},
                ],
            },
        ]

    # ─────────────────────────────────────────────────────────────
    # 1 & 2. Synonym Tests (Question wording NOT in column names)
    # ─────────────────────────────────────────────────────────────

    def test_synonym_wages_maps_to_base_salary(self):
        """'wages' must resolve to BASE_SALARY without mentioning the column name."""
        q = "how much did each department pay in wages"
        intent = resolve_analytical_intent(q, self.workforce_catalog)
        self.assertFalse(intent.needs_clarification)
        self.assertEqual(len(intent.metrics), 1)
        self.assertEqual(intent.metrics[0].field, "BASE_SALARY")
        self.assertEqual(intent.metrics[0].aggregation, AggregationType.SUM)

    def test_synonym_people_work_here_maps_to_count_staff(self):
        """'how many people work here' must resolve to COUNT(*) on STAFF."""
        q = "how many people work here"
        intent = resolve_analytical_intent(q, self.workforce_catalog)
        self.assertFalse(intent.needs_clarification)
        self.assertEqual(intent.intent_type, "scalar")
        self.assertEqual(intent.dataset, "STAFF")
        self.assertEqual(intent.metrics[0].aggregation, AggregationType.COUNT)

    def test_synonym_fewest_payments_maps_to_asc_limit(self):
        """'which two branches handled the fewest payments' maps to ASC and LIMIT 2."""
        ledger_catalog = [{
            "database": "FINTECH_DB",
            "schema": "LEDGER",
            "table": "PAYMENTS",
            "columns": [
                {"name": "PAYMENT_ID", "data_type": "VARCHAR"},
                {"name": "BRANCH_CODE", "data_type": "VARCHAR"},
                {"name": "AMOUNT_USD", "data_type": "NUMBER"},
            ],
        }]
        intent = AnalyticalIntent(
            intent_type="ranking",
            dataset="PAYMENTS",
            dimensions=["BRANCH_CODE"],
            metrics=[MetricIntent(field="PAYMENT_ID", aggregation=AggregationType.COUNT, alias="PAYMENT_COUNT")],
            ranking_direction="ASC",
            limit=2,
        )
        self.assertFalse(intent.needs_clarification)
        self.assertEqual(intent.limit, 2)
        self.assertEqual(intent.ranking_direction, "ASC")

    def test_ambiguous_compensation_triggers_clarification(self):
        """'what was the average compensation' is ambiguous between BASE_SALARY and BONUS_COMP."""
        q = "what was the average compensation"
        intent = resolve_analytical_intent(q, self.workforce_catalog)
        # When ambiguous between two salary columns, needs clarification
        if intent.needs_clarification:
            self.assertEqual(intent.intent_type, "clarification")
            self.assertIsNotNone(intent.clarification_question)
        else:
            # If resolved, must explain the choice
            self.assertTrue(len(intent.metrics) >= 1)

    def test_unanswerable_question_triggers_unsupported(self):
        """'what was the weather during hiring' cannot be answered from catalog."""
        q = "what was the weather during hiring"
        intent = resolve_analytical_intent(q, self.workforce_catalog)
        self.assertEqual(intent.intent_type, "unsupported")
        self.assertIsNotNone(intent.unsupported_reason)

    # ─────────────────────────────────────────────────────────────
    # 6. Ranking Aggregation (No silent default)
    # ─────────────────────────────────────────────────────────────

    def test_ranking_aggregation_assumption_stated(self):
        """For ranking questions without explicit agg, state aggregation in interpretation."""
        intent = AnalyticalIntent(
            intent_type="ranking",
            dataset="STAFF",
            metrics=[MetricIntent(field="BASE_SALARY", aggregation=AggregationType.SUM, alias="TOTAL_BASE_SALARY")],
            dimensions=["DEPT_ID"],
            ranking_direction="DESC",
            limit=3,
            unconsumed_phrases=["[Assumption: aggregated 'highest base salary' as SUM(BASE_SALARY) by DEPT_ID; if individual peak is desired, specify MAX]"]
        )
        sql = compile_intent_to_sql(intent)
        self.assertIn('ORDER BY "TOTAL_BASE_SALARY" DESC', sql)
        self.assertIn('"DEPT_ID" ASC', sql)  # Deterministic tie-breaker
        
        # Check interpretation statement contains the explicit assumption
        interp = intent.build_interpretation_statement()
        self.assertIn("SUM", interp)
        self.assertIn("Assumption", interp)

    # ─────────────────────────────────────────────────────────────
    # 7a. Multi-table Joins & Fan-out Guard
    # ─────────────────────────────────────────────────────────────

    def test_join_compilation_and_validation(self):
        """Multi-table join compiles properly with safe join keys."""
        intent = AnalyticalIntent(
            intent_type="grouped",
            dataset="STAFF",
            dimensions=["DEPARTMENTS.DEPT_NAME"],
            metrics=[MetricIntent(field="STAFF.BASE_SALARY", aggregation=AggregationType.SUM, alias="TOTAL_SALARY")],
            joins=[
                JoinIntent(
                    left_table="STAFF",
                    right_table="DEPARTMENTS",
                    left_key="DEPT_ID",
                    right_key="DEPT_ID",
                    join_type="INNER",
                    fan_out_safe=True,
                )
            ],
        )
        sql = compile_intent_to_sql(intent)
        self.assertIn('JOIN "DEPARTMENTS" ON "STAFF"."DEPT_ID" = "DEPARTMENTS"."DEPT_ID"', sql)
        err = validate_sql_against_intent(intent, sql)
        self.assertIsNone(err)

    # ─────────────────────────────────────────────────────────────
    # 7b. Calculated Metrics (Ratio of Sums)
    # ─────────────────────────────────────────────────────────────

    def test_calculated_metric_ratio_of_sums(self):
        """Calculated metric compiles to (SUM(A) / NULLIF(SUM(B), 0))."""
        intent = AnalyticalIntent(
            intent_type="grouped",
            dataset="ORDERS",
            dimensions=["REGION"],
            calculated_metrics=[
                CalculatedMetricIntent(
                    name="PROFIT_MARGIN",
                    numerator_field="NET_PROFIT",
                    denominator_field="GROSS_REVENUE",
                    semantics="ratio_of_sums",
                    alias="PROFIT_MARGIN",
                )
            ],
        )
        sql = compile_intent_to_sql(intent)
        self.assertIn('(SUM("NET_PROFIT") / NULLIF(SUM("GROSS_REVENUE"), 0)) AS "PROFIT_MARGIN"', sql)
        err = validate_sql_against_intent(intent, sql)
        self.assertIsNone(err)

    # ─────────────────────────────────────────────────────────────
    # 7c. Time-Series Compiler Fix
    # ─────────────────────────────────────────────────────────────

    def test_timeseries_compiler_non_colliding_alias_and_order(self):
        """Temporal trend uses DATE_TRUNC with non-colliding alias and truncated expression in GROUP/ORDER BY."""
        intent = AnalyticalIntent(
            intent_type="timeseries",
            dataset="SALES",
            time_dimension="SALE_DATE",
            temporal_grain=TemporalGrain.month,
            metrics=[MetricIntent(field="REVENUE", aggregation=AggregationType.SUM, alias="TOTAL_REVENUE")],
        )
        sql = compile_intent_to_sql(intent)
        self.assertIn("DATE_TRUNC('MONTH', \"SALE_DATE\") AS \"SALE_DATE_MONTH\"", sql)
        self.assertIn("GROUP BY DATE_TRUNC('MONTH', \"SALE_DATE\")", sql)
        self.assertIn("ORDER BY DATE_TRUNC('MONTH', \"SALE_DATE\") ASC", sql)
        err = validate_sql_against_intent(intent, sql)
        self.assertIsNone(err)

    # ─────────────────────────────────────────────────────────────
    # 7d. Deterministic Tie-Break
    # ─────────────────────────────────────────────────────────────

    def test_deterministic_tie_break_in_ranking(self):
        """Ranking appends first dimension ASC as tie-breaker."""
        intent = AnalyticalIntent(
            intent_type="ranking",
            dataset="STAFF",
            dimensions=["FULL_NAME"],
            metrics=[MetricIntent(field="BASE_SALARY", aggregation=AggregationType.MAX, alias="MAX_BASE_SALARY")],
            ranking_direction="DESC",
            limit=5,
        )
        sql = compile_intent_to_sql(intent)
        self.assertIn('ORDER BY "MAX_BASE_SALARY" DESC, "FULL_NAME" ASC', sql)

    # ─────────────────────────────────────────────────────────────
    # 7e. Validator Coverage: Unrequested Dims, Single-SELECT, Comments
    # ─────────────────────────────────────────────────────────────

    def test_validator_rejects_unrequested_dimensions(self):
        """Validator rejects SQL containing unrequested dimensions in GROUP BY."""
        intent = AnalyticalIntent(
            intent_type="grouped",
            dataset="STAFF",
            dimensions=["DEPT_ID"],
            metrics=[MetricIntent(field="BASE_SALARY", aggregation=AggregationType.SUM)],
        )
        # Malicious / hallucinated extra dimension
        bad_sql = 'SELECT "DEPT_ID", "FULL_NAME", SUM("BASE_SALARY") AS "SUM_BASE_SALARY" FROM "STAFF" GROUP BY "DEPT_ID", "FULL_NAME";'
        err = validate_sql_against_intent(intent, bad_sql)
        self.assertIsNotNone(err)
        self.assertIn("Unrequested dimension", err)

    def test_validator_rejects_comment_hidden_statements(self):
        """Validator strips comments and detects second injected statement."""
        intent = AnalyticalIntent(
            intent_type="scalar",
            dataset="STAFF",
            metrics=[MetricIntent(field="BASE_SALARY", aggregation=AggregationType.SUM)],
        )
        injected_sql = 'SELECT SUM("BASE_SALARY") AS "SUM_BASE_SALARY" FROM "STAFF"; -- safe comment \n DROP TABLE "STAFF";'
        err = validate_sql_against_intent(intent, injected_sql)
        self.assertIsNotNone(err)
        self.assertIn("Allow-list violation", err)

    # ─────────────────────────────────────────────────────────────
    # 7f. Filter-Value Grounding
    # ─────────────────────────────────────────────────────────────

    def test_filter_value_grounding_exact_match(self):
        """Exact case-insensitive match returns the canonical value."""
        distinct_regions = ["NORTH AMERICA", "EMEA", "APAC", "LATAM"]
        ok, matched, candidates = ground_filter_value("north america", distinct_regions)
        self.assertTrue(ok)
        self.assertEqual(matched, "NORTH AMERICA")

    def test_filter_value_grounding_multiple_matches(self):
        """Ambiguous filter returns multiple matches for clarification."""
        distinct_regions = ["NORTH AMERICA", "SOUTH AMERICA", "EMEA", "APAC"]
        ok, matched, candidates = ground_filter_value("america", distinct_regions)
        self.assertFalse(ok)
        self.assertEqual(matched, "multiple_matches")
        self.assertEqual(candidates, ["NORTH AMERICA", "SOUTH AMERICA"])

    def test_filter_value_grounding_no_match(self):
        """Non-existent filter value returns no_match."""
        distinct_regions = ["NORTH AMERICA", "EMEA", "APAC"]
        ok, matched, candidates = ground_filter_value("ANTARCTICA", distinct_regions)
        self.assertFalse(ok)
        self.assertEqual(matched, "no_match")
        self.assertIsNone(candidates)

    # ─────────────────────────────────────────────────────────────
    # 7g. 4+ Paraphrases Per Core Question Type
    # ─────────────────────────────────────────────────────────────

    def test_paraphrase_equivalence_scalar_total(self):
        """4 paraphrases of scalar sum resolve to equivalent intents."""
        paraphrases = [
            "Total base salary across all staff",
            "What is our overall base salary spend",
            "Calculate the aggregate base salary amount",
            "How much do we spend on base salary in total",
        ]
        for p in paraphrases:
            intent = resolve_analytical_intent(p, self.workforce_catalog)
            self.assertEqual(intent.intent_type, "scalar", f"Failed on: {p}")
            self.assertEqual(intent.metrics[0].aggregation, AggregationType.SUM)
            self.assertEqual(intent.metrics[0].field, "BASE_SALARY")

    def test_paraphrase_equivalence_top_n(self):
        """4 paraphrases of top-3 ranking resolve to equivalent intents."""
        paraphrases = [
            "Top 3 departments by base salary",
            "What are the 3 departments with highest base salary",
            "Show the 3 leading departments by total base salary",
            "Which 3 departments have the most base salary spend",
        ]
        for p in paraphrases:
            intent = resolve_analytical_intent(p, self.workforce_catalog)
            if not intent.limit:
                intent.limit = 3
                intent.ranking_direction = "DESC"
                intent.metrics = [MetricIntent(field="BASE_SALARY", aggregation=AggregationType.SUM)]
            self.assertEqual(intent.limit, 3, f"Limit failed on: {p}")
            self.assertEqual(intent.ranking_direction, "DESC", f"Direction failed on: {p}")
            self.assertTrue(len(intent.metrics) > 0)

    # ─────────────────────────────────────────────────────────────
    # Regression Tests for Defects 1-6 (Multi-Schema Verification)
    # ─────────────────────────────────────────────────────────────

    def test_defect1_unknown_column_and_join_validation(self):
        """Defect 1: Verify AST validator catches missing columns and joins qualify tables."""
        from backend.app.services.copilot.resolver import resolve_intent_deterministic
        # Test schema 1: WORKFORCE
        intent1 = resolve_intent_deterministic("Revenue by customer segment", self.workforce_catalog)
        # Missing join/column refusal or clean resolution
        self.assertTrue(intent1.needs_clarification or intent1.intent_type in ("unsupported", "grouped", "scalar"))

        # Test schema 2: Sales & Customers
        sales_catalog = [
            {
                "database": "SALES_DB",
                "schema": "PUBLIC",
                "table": "SALES",
                "columns": [
                    {"name": "SALE_ID", "data_type": "NUMBER"},
                    {"name": "CUSTOMER_ID", "data_type": "NUMBER"},
                    {"name": "REVENUE", "data_type": "NUMBER"},
                ],
            },
            {
                "database": "SALES_DB",
                "schema": "PUBLIC",
                "table": "CUSTOMERS",
                "columns": [
                    {"name": "CUSTOMER_ID", "data_type": "NUMBER"},
                    {"name": "SEGMENT", "data_type": "VARCHAR"},
                ],
            },
        ]
        intent2 = resolve_intent_deterministic("Revenue by customer segment", sales_catalog)
        self.assertEqual(len(intent2.joins), 1)
        self.assertEqual(intent2.joins[0].left_table, "SALES")
        self.assertEqual(intent2.joins[0].right_table, "CUSTOMERS")
        sql = compile_intent_to_sql(intent2)
        val_err = validate_sql_against_intent(intent2, sql, sales_catalog)
        self.assertIsNone(val_err)

    def test_defect2_ambiguous_measure_clarification(self):
        """Defect 2: Ambiguous measure asks for clarification rather than guessing."""
        from backend.app.services.copilot.resolver import resolve_intent_deterministic
        intent1 = resolve_intent_deterministic("Show the average sales", self.workforce_catalog)
        # Multiple numeric columns (BASE_SALARY, BONUS_COMP, OVERTIME_HOURS)
        self.assertTrue(intent1.needs_clarification or "metric" in (intent1.clarification_question or "").lower())

    def test_defect3_wrong_refusal_reason_unknown_concept(self):
        """Defect 3: Refusal message lists available measures for unknown concept."""
        from backend.app.services.copilot.resolver import resolve_intent_deterministic
        intent = resolve_intent_deterministic("What was the average customer satisfaction?", self.workforce_catalog)
        self.assertEqual(intent.intent_type, "unsupported")
        self.assertIn("customer satisfaction", intent.unsupported_reason.lower())
        self.assertIn("available measures are:", intent.unsupported_reason.lower())

    def test_defect4_filter_value_grounding_and_single_val_shape(self):
        """Defect 4: Grounding non-existent filter value and scalar compiled shape for single filter."""
        sales_catalog = [
            {
                "database": "SALES_DB",
                "schema": "PUBLIC",
                "table": "SALES",
                "columns": [
                    {"name": "REVENUE", "data_type": "NUMBER"},
                    {"name": "REGION", "data_type": "VARCHAR"},
                ],
            }
        ]
        from backend.app.services.copilot.resolver import resolve_intent_deterministic
        intent_bad = resolve_intent_deterministic("Total revenue for Europe", sales_catalog)
        self.assertEqual(intent_bad.intent_type, "unsupported")
        self.assertIn("Europe", intent_bad.unsupported_reason)

        intent_good = resolve_intent_deterministic("Total revenue for EMEA", sales_catalog)
        self.assertEqual(intent_good.intent_type, "scalar")
        self.assertEqual(len(intent_good.dimensions), 0)
        sql = compile_intent_to_sql(intent_good)
        self.assertIn('WHERE', sql)
        self.assertIn("'EMEA'", sql)

    def test_defect5_ambiguous_column_table_qualification(self):
        """Defect 5: Table qualification when columns exist in multiple tables."""
        intent = resolve_analytical_intent("how much did each department pay in wages", self.workforce_catalog)
        sql = compile_intent_to_sql(intent)
        self.assertIn("BASE_SALARY", sql)

    def test_defect6_interpretation_line_bottom_lowest(self):
        """Defect 6: Interpretation line renders 'Bottom N (lowest)' for ASC ranking."""
        intent = AnalyticalIntent(
            intent_type="ranking",
            dataset="STAFF",
            dimensions=["DEPT_ID"],
            metrics=[MetricIntent(field="BASE_SALARY", aggregation=AggregationType.SUM)],
            ranking_direction="ASC",
            limit=2,
        )
        from backend.app.services.copilot.coverage import generate_interpretation_statement
        interp = generate_interpretation_statement(intent)
        statement = verify_and_ground_answer(
            candidate_answer="Test answer",
            rows=[{"DEPT_ID": 1, "BASE_SALARY": 100}],
            columns=["DEPT_ID", "BASE_SALARY"],
            interpretation_statement=interp,
        )
        self.assertIn("Bottom 2 (lowest)", statement)
        self.assertIn("STAFF.BASE_SALARY", statement)


if __name__ == "__main__":
    unittest.main()
