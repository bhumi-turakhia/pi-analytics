"""
test_dataset_agnostic.py

Tests for the dataset-agnostic analytical Copilot pipeline.
Two synthetic catalogs: Healthcare and Logistics — no PI_ANALYTICS vocabulary.
Asserts semantic correctness of SQL (right metrics, dimensions, filters, grain).
Includes live-path validation tests for Gemini response validation & bounded regeneration.
"""
import json
import os
import re
import sys
import unittest
from unittest.mock import patch, MagicMock

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
BACKEND_DIR = os.path.join(PROJECT_ROOT, "backend")
for p in (PROJECT_ROOT, BACKEND_DIR):
    if p not in sys.path:
        sys.path.insert(0, p)

from fastapi import HTTPException
from backend.app.routes.copilot import (
    generate_catalog_grounded_sql,
    _detect_date_range_from_question,
    _validate_sql_against_schema,
    _validate_intent_against_sql,
    AnalyticalIntent,
    _check_unknown_references,
    _select_catalog_subset_for_question,
)
from backend.app.routes.query import validate_read_only_query


# ─────────────────────────────────────────────────────────────
# Synthetic Catalog A: Healthcare
# ─────────────────────────────────────────────────────────────
HEALTHCARE = [
    {
        "database": "HEALTH_DW", "schema": "CLINICAL", "table": "ENCOUNTERS",
        "columns": [
            {"name": "ENCOUNTER_ID",   "data_type": "VARCHAR"},
            {"name": "PATIENT_ID",     "data_type": "VARCHAR"},
            {"name": "DEPARTMENT",     "data_type": "VARCHAR"},
            {"name": "ADMISSION_DATE", "data_type": "DATE"},
            {"name": "VISIT_MONTH",    "data_type": "VARCHAR"},
            {"name": "LOS_DAYS",       "data_type": "NUMBER"},
            {"name": "BILLED_AMOUNT",  "data_type": "NUMBER"},
            {"name": "PAID_AMOUNT",    "data_type": "NUMBER"},
        ]
    },
    {
        "database": "HEALTH_DW", "schema": "CLINICAL", "table": "MEDICATIONS",
        "columns": [
            {"name": "MED_ID",          "data_type": "VARCHAR"},
            {"name": "DRUG_CLASS",      "data_type": "VARCHAR"},
            {"name": "PRESCRIPTIONS",   "data_type": "NUMBER"},
            {"name": "DISPENSED_MONTH", "data_type": "VARCHAR"},
        ]
    },
    {
        "database": "HEALTH_DW", "schema": "CLINICAL", "table": "PROVIDERS",
        "columns": [
            {"name": "PROVIDER_ID",  "data_type": "VARCHAR"},
            {"name": "SPECIALTY",    "data_type": "VARCHAR"},
            {"name": "PATIENTS_SEEN","data_type": "NUMBER"},
        ]
    },
]

# ─────────────────────────────────────────────────────────────
# Synthetic Catalog B: Logistics
# ─────────────────────────────────────────────────────────────
LOGISTICS = [
    {
        "database": "LOGISTICS_DB", "schema": "OPS", "table": "SHIPMENTS",
        "columns": [
            {"name": "SHIPMENT_ID",  "data_type": "VARCHAR"},
            {"name": "ORIGIN",       "data_type": "VARCHAR"},
            {"name": "DESTINATION",  "data_type": "VARCHAR"},
            {"name": "CARRIER_CODE", "data_type": "VARCHAR"},
            {"name": "SHIP_DATE",    "data_type": "DATE"},
            {"name": "FREIGHT_COST", "data_type": "NUMBER"},
            {"name": "WEIGHT_KG",    "data_type": "NUMBER"},
            {"name": "TRANSIT_DAYS", "data_type": "NUMBER"},
            {"name": "SHIP_MONTH",   "data_type": "VARCHAR"},
        ]
    },
    {
        "database": "LOGISTICS_DB", "schema": "OPS", "table": "ROUTES",
        "columns": [
            {"name": "ROUTE_ID",    "data_type": "VARCHAR"},
            {"name": "LANE",        "data_type": "VARCHAR"},
            {"name": "DISTANCE_KM", "data_type": "NUMBER"},
        ]
    },
]

PI_CONSTANTS = [
    "PI_ANALYTICS", "TOTAL_REVENUE", "TOTAL_SALES",
    "MONTHLY_REVENUE", "TOTAL_CUSTOMERS", "TOTAL_ORDERS", "TOTAL_PRODUCTS",
    "ANALYTICS.SALES",
]


class HealthcareTests(unittest.TestCase):
    """10 cases against Healthcare schema — no PI_ANALYTICS vocabulary."""

    def test_hc1_metric_billed_amount(self):
        """'billed amount' -> BILLED_AMOUNT, not LOS_DAYS or PAID_AMOUNT."""
        sql, _ = generate_catalog_grounded_sql(
            "What is the total billed amount across all encounters?", HEALTHCARE)
        self.assertIn('"BILLED_AMOUNT"', sql, f"Expected BILLED_AMOUNT: {sql}")
        self.assertNotIn('"LOS_DAYS"', sql, f"Should not use LOS_DAYS: {sql}")
        self.assertNotIn('"PAID_AMOUNT"', sql, f"Should not use PAID_AMOUNT: {sql}")
        self.assertIn("SUM", sql.upper(), f"Should SUM: {sql}")

    def test_hc2_metric_los_days(self):
        """'length of stay in days' -> LOS_DAYS, not BILLED_AMOUNT."""
        sql, _ = generate_catalog_grounded_sql(
            "Show average length of stay in days by department", HEALTHCARE)
        self.assertIn('"LOS_DAYS"', sql, f"Expected LOS_DAYS: {sql}")
        self.assertNotIn('"BILLED_AMOUNT"', sql, f"Should not use BILLED_AMOUNT: {sql}")

    def test_hc3_dimension_department(self):
        """'by department' -> GROUP BY DEPARTMENT."""
        sql, _ = generate_catalog_grounded_sql(
            "Total billed amount by department", HEALTHCARE)
        self.assertIn('"DEPARTMENT"', sql, f"Expected DEPARTMENT grouping: {sql}")
        self.assertIn("GROUP BY", sql.upper(), f"Expected GROUP BY: {sql}")
        self.assertIn('"BILLED_AMOUNT"', sql)

    def test_hc4_time_range_jan_mar_2024(self):
        """'January to March 2024' -> WHERE with 2024-01-01 and 2024-03-31."""
        sql, _ = generate_catalog_grounded_sql(
            "Total paid amount for January to March 2024", HEALTHCARE)
        self.assertIn("2024-01-01", sql, f"Expected start date: {sql}")
        self.assertIn("2024-03-31", sql, f"Expected end date: {sql}")
        self.assertIn("WHERE", sql.upper())

    def test_hc5_count_intent(self):
        """'How many encounters' -> COUNT(*), no SUM."""
        sql, _ = generate_catalog_grounded_sql(
            "How many encounters were recorded in total?", HEALTHCARE)
        self.assertIn("COUNT(*)", sql.upper(), f"Expected COUNT(*): {sql}")
        self.assertNotIn("SUM", sql.upper(), f"Should not SUM: {sql}")

    def test_hc6_monthly_trend(self):
        """'billed amount by visit month' -> GROUP BY VISIT_MONTH."""
        sql, _ = generate_catalog_grounded_sql(
            "Show total billed amount by visit month", HEALTHCARE)
        self.assertIn('"VISIT_MONTH"', sql, f"Expected VISIT_MONTH: {sql}")
        self.assertIn('"BILLED_AMOUNT"', sql)
        self.assertIn("GROUP BY", sql.upper())

    def test_hc7_multi_metric_billed_and_paid(self):
        """'billed amount and paid amount' -> both columns in SELECT."""
        sql, _ = generate_catalog_grounded_sql(
            "Show total billed amount and total paid amount by visit month", HEALTHCARE)
        self.assertIn('"BILLED_AMOUNT"', sql, f"Expected BILLED_AMOUNT: {sql}")
        self.assertIn('"PAID_AMOUNT"', sql, f"Expected PAID_AMOUNT: {sql}")
        self.assertIn('"VISIT_MONTH"', sql)

    def test_hc8_top_5_departments_by_billed(self):
        """'Top 5 departments by billed' -> LIMIT 5, ORDER DESC, DEPARTMENT."""
        sql, _ = generate_catalog_grounded_sql(
            "Top 5 departments by total billed amount", HEALTHCARE)
        self.assertIn('"DEPARTMENT"', sql, f"Expected DEPARTMENT: {sql}")
        self.assertIn('"BILLED_AMOUNT"', sql)
        self.assertIn("LIMIT 5", sql.upper(), f"Expected LIMIT 5: {sql}")
        self.assertIn("DESC", sql.upper(), f"Expected DESC: {sql}")

    def test_hc9_schema_validator_rejects_invented_col(self):
        """SQL referencing non-existent PROFIT column must fail schema validation."""
        bad = 'SELECT SUM("PROFIT") AS "TOTAL" FROM "HEALTH_DW"."CLINICAL"."ENCOUNTERS";'
        err = _validate_sql_against_schema(bad, HEALTHCARE)
        self.assertIsNotNone(err, "Expected schema validation error for PROFIT")
        self.assertIn("PROFIT", err.upper())

    def test_hc10_schema_validator_passes_valid_sql(self):
        """SQL referencing real catalog identifiers must pass."""
        good = ('SELECT "DEPARTMENT", SUM("BILLED_AMOUNT") AS "TOTAL_BILLED" '
                'FROM "HEALTH_DW"."CLINICAL"."ENCOUNTERS" GROUP BY "DEPARTMENT";')
        err = _validate_sql_against_schema(good, HEALTHCARE)
        self.assertIsNone(err, f"Valid SQL should pass schema validation: {err}")


class LogisticsTests(unittest.TestCase):
    """10 cases against Logistics schema — no PI_ANALYTICS vocabulary."""

    def test_lg1_freight_cost(self):
        """'freight cost' -> FREIGHT_COST, not WEIGHT_KG."""
        sql, _ = generate_catalog_grounded_sql(
            "What is the total freight cost across all shipments?", LOGISTICS)
        self.assertIn('"FREIGHT_COST"', sql, f"Expected FREIGHT_COST: {sql}")
        self.assertNotIn('"WEIGHT_KG"', sql, f"Should not use WEIGHT_KG: {sql}")
        self.assertIn("SUM", sql.upper())

    def test_lg2_weight_kg(self):
        """'total weight shipped' -> WEIGHT_KG, not FREIGHT_COST."""
        sql, _ = generate_catalog_grounded_sql(
            "Show total weight shipped by destination", LOGISTICS)
        self.assertIn('"WEIGHT_KG"', sql, f"Expected WEIGHT_KG: {sql}")
        self.assertNotIn('"FREIGHT_COST"', sql, f"Should not use FREIGHT_COST: {sql}")

    def test_lg3_dimension_destination(self):
        """'by destination' -> GROUP BY DESTINATION."""
        sql, _ = generate_catalog_grounded_sql(
            "Show total freight cost by destination", LOGISTICS)
        self.assertIn('"DESTINATION"', sql, f"Expected DESTINATION: {sql}")
        self.assertIn("GROUP BY", sql.upper())

    def test_lg4_quarter_date_range(self):
        """'Q2 2023' -> WHERE with 2023-04-01 to 2023-06-30."""
        sql, _ = generate_catalog_grounded_sql(
            "Show freight cost for Q2 2023", LOGISTICS)
        self.assertIn("2023-04-01", sql, f"Expected Q2 start: {sql}")
        self.assertIn("2023-06-30", sql, f"Expected Q2 end: {sql}")

    def test_lg5_count_shipments(self):
        """'How many shipments' -> COUNT(*)."""
        sql, _ = generate_catalog_grounded_sql(
            "How many shipments were sent?", LOGISTICS)
        self.assertIn("COUNT(*)", sql.upper(), f"Expected COUNT(*): {sql}")

    def test_lg6_monthly_freight(self):
        """'freight cost by ship month' -> GROUP BY SHIP_MONTH."""
        sql, _ = generate_catalog_grounded_sql(
            "Show total freight cost by ship month", LOGISTICS)
        self.assertIn('"SHIP_MONTH"', sql, f"Expected SHIP_MONTH: {sql}")
        self.assertIn('"FREIGHT_COST"', sql)

    def test_lg7_multi_metric_freight_and_weight(self):
        """'freight cost and weight by month' -> both metrics."""
        sql, _ = generate_catalog_grounded_sql(
            "Show total freight cost and total weight by ship month", LOGISTICS)
        self.assertIn('"FREIGHT_COST"', sql, f"Expected FREIGHT_COST: {sql}")
        self.assertIn('"WEIGHT_KG"', sql, f"Expected WEIGHT_KG: {sql}")
        self.assertIn('"SHIP_MONTH"', sql)

    def test_lg8_top_10_origins(self):
        """'Top 10 origins by freight cost' -> LIMIT 10, ORDER DESC."""
        sql, _ = generate_catalog_grounded_sql(
            "Top 10 origins by total freight cost", LOGISTICS)
        self.assertIn('"ORIGIN"', sql, f"Expected ORIGIN: {sql}")
        self.assertIn("LIMIT 10", sql.upper())
        self.assertIn("DESC", sql.upper())

    def test_lg9_intent_validator_catches_missing_group_by(self):
        """Intent has dimensions -> SQL must have GROUP BY or intent validator flags it."""
        intent = AnalyticalIntent(
            metrics=["FREIGHT_COST"],
            aggregations=["SUM"],
            dimensions=["ORIGIN"],
            can_answer=True,
            intent_summary="freight by origin",
        )
        sql = 'SELECT SUM("FREIGHT_COST") AS "TOTAL" FROM "LOGISTICS_DB"."OPS"."SHIPMENTS";'
        err = _validate_intent_against_sql(intent, sql)
        self.assertIsNotNone(err, "Intent validator must catch missing GROUP BY")

    def test_lg10_governance_rejects_drop(self):
        """DROP TABLE must be rejected by read-only governance."""
        with self.assertRaises(HTTPException):
            validate_read_only_query('DROP TABLE "LOGISTICS_DB"."OPS"."SHIPMENTS";')


class CrossCuttingTests(unittest.TestCase):
    """Cross-cutting: catalog subset, unknown domain, date parsing, no-PI-constants."""

    def test_subset_prefers_encounters_for_billed(self):
        subset = _select_catalog_subset_for_question("billed amount per department", HEALTHCARE)
        self.assertIn("ENCOUNTERS", [t["table"] for t in subset])

    def test_subset_prefers_shipments_for_freight(self):
        subset = _select_catalog_subset_for_question("freight cost by carrier", LOGISTICS)
        self.assertIn("SHIPMENTS", [t["table"] for t in subset])

    def test_unknown_domain_bitcoin_against_healthcare(self):
        err = _check_unknown_references("What is the bitcoin price?", HEALTHCARE)
        self.assertIsNotNone(err, "Bitcoin domain must be flagged against healthcare catalog")

    def test_date_range_q1_2023(self):
        r = _detect_date_range_from_question("Q1 2023")
        self.assertIsNotNone(r)
        self.assertEqual(r[0], "2023-01-01")
        self.assertEqual(r[1], "2023-03-31")

    def test_date_range_april_to_september_2024(self):
        r = _detect_date_range_from_question("April to September 2024")
        self.assertIsNotNone(r)
        self.assertEqual(r[0], "2024-04-01")
        self.assertEqual(r[1], "2024-09-30")

    def test_no_pi_constants_in_healthcare_sql(self):
        sql, _ = generate_catalog_grounded_sql(
            "Show total billed amount by department", HEALTHCARE)
        for c in PI_CONSTANTS:
            self.assertNotIn(c, sql.upper(), f"PI constant '{c}' leaked into healthcare SQL: {sql}")
        self.assertIn('"BILLED_AMOUNT"', sql)
        self.assertIn('"DEPARTMENT"', sql)

    def test_no_pi_constants_in_logistics_sql(self):
        sql, _ = generate_catalog_grounded_sql(
            "Top 5 origins by freight cost", LOGISTICS)
        for c in PI_CONSTANTS:
            self.assertNotIn(c, sql.upper(), f"PI constant '{c}' leaked into logistics SQL: {sql}")
        self.assertIn('"FREIGHT_COST"', sql)


class LivePathValidationTests(unittest.TestCase):
    """Tests exercising the LIVE Gemini request path validation & regeneration."""

    @patch.dict(os.environ, {"GEMINI_API_KEY": "fake_test_key"})
    @patch("google.genai.Client")
    def test_live_gemini_invalid_sql_rejected_before_execution(self, mock_client_cls):
        """Invalid Gemini-generated SQL (referencing non-existent column) must be rejected before execution."""
        from backend.app.routes.copilot import call_gemini_for_sql

        # Gemini returns SQL referencing NON_EXISTENT_COL twice (attempt 1 and regen attempt 2)
        mock_response = MagicMock()
        mock_response.text = json.dumps({
            "can_answer": True,
            "sql": 'SELECT SUM("NON_EXISTENT_COL") FROM "HEALTH_DW"."CLINICAL"."ENCOUNTERS";',
            "intent": "SUM of NON_EXISTENT_COL",
            "explanation": "Summarizing non-existent column.",
            "visualization": {"type": "kpi", "title": "Test", "xField": None, "yField": "NON_EXISTENT_COL"}
        })
        mock_client = MagicMock()
        mock_client.models.generate_content.return_value = mock_response
        mock_client_cls.return_value = mock_client

        sql, viz, explanation = call_gemini_for_sql("Show non existent metric", HEALTHCARE)

        # Must be rejected (returned sql is None)
        self.assertIsNone(sql, "Invalid SQL with non-existent column must be rejected")
        self.assertIn("cannot answer", explanation.lower())

    @patch.dict(os.environ, {"GEMINI_API_KEY": "fake_test_key"})
    @patch("google.genai.Client")
    def test_live_gemini_validation_failure_bounded_one_regeneration(self, mock_client_cls):
        """Validation failure triggers at most ONE regeneration attempt (total 2 Gemini calls max)."""
        from backend.app.routes.copilot import call_gemini_for_sql

        mock_response = MagicMock()
        mock_response.text = json.dumps({
            "can_answer": True,
            "sql": 'SELECT SUM("INVALID_COL") FROM "LOGISTICS_DB"."OPS"."SHIPMENTS";',
            "intent": "INVALID_COL sum",
            "explanation": "Attempting invalid column query.",
            "visualization": {"type": "kpi", "title": "Test"}
        })
        mock_client = MagicMock()
        mock_client.models.generate_content.return_value = mock_response
        mock_client_cls.return_value = mock_client

        sql, _, _ = call_gemini_for_sql("Show invalid metric", LOGISTICS)

        # Total calls to generate_content must be exactly 2 (initial attempt + 1 regen attempt)
        self.assertEqual(mock_client.models.generate_content.call_count, 2,
                         "Must attempt exactly 1 regeneration (total 2 calls)")
        self.assertIsNone(sql, "Query must fail after failed regeneration")

    @patch.dict(os.environ, {"GEMINI_API_KEY": "fake_test_key"})
    @patch("google.genai.Client")
    def test_live_gemini_valid_query_proceeds(self, mock_client_cls):
        """Valid generated query passes validation and is returned for execution."""
        from backend.app.routes.copilot import call_gemini_for_sql

        valid_sql = 'SELECT "DEPARTMENT", SUM("BILLED_AMOUNT") AS "TOTAL_BILLED" FROM "HEALTH_DW"."CLINICAL"."ENCOUNTERS" GROUP BY "DEPARTMENT";'
        mock_response = MagicMock()
        mock_response.text = json.dumps({
            "can_answer": True,
            "sql": valid_sql,
            "intent": "Total billed amount by department",
            "explanation": "Calculates total billed amount grouped by department.",
            "visualization": {"type": "bar", "title": "Billed Amount", "xField": "DEPARTMENT", "yField": "TOTAL_BILLED"}
        })
        mock_client = MagicMock()
        mock_client.models.generate_content.return_value = mock_response
        mock_client_cls.return_value = mock_client

        sql, viz, explanation = call_gemini_for_sql("Total billed amount by department", HEALTHCARE)

        self.assertIsNotNone(sql, "Valid SQL should pass validation")
        self.assertEqual(sql, valid_sql)
        self.assertEqual(mock_client.models.generate_content.call_count, 1, "Valid query needs 0 regenerations")


class AnalyticalIntentCorrectnessTests(unittest.TestCase):
    """
    Tests covering all known correctness failure classes:
    - Scalar aggregate unnecessarily grouped
    - Monthly request grouped by raw date
    - Multiple metrics reduced to one metric
    - Bottom-N used descending order
    - Requested date filter omitted
    - Average request generated SUM
    """

    def test_scalar_avg_request_generates_avg_not_sum(self):
        """Average request must generate AVG aggregation, not SUM."""
        sql, _ = generate_catalog_grounded_sql(
            "What is the average length of stay in days?", HEALTHCARE
        )
        self.assertIn("AVG", sql.upper(), f"Expected AVG in SQL: {sql}")
        self.assertNotIn("SUM", sql.upper(), f"Should not use SUM for average: {sql}")
        self.assertIn('"LOS_DAYS"', sql)
        self.assertNotIn("GROUP BY", sql.upper(), "Scalar aggregate must not have GROUP BY")

    def test_bottom_n_uses_ascending_order(self):
        """Bottom N / lowest N request must generate ASC order, not DESC."""
        sql, _ = generate_catalog_grounded_sql(
            "Show bottom 5 departments by total billed amount", HEALTHCARE
        )
        self.assertIn("ASC", sql.upper(), f"Bottom 5 must sort ASC: {sql}")
        self.assertNotIn("DESC", sql.upper(), f"Bottom 5 must not sort DESC: {sql}")
        self.assertIn("LIMIT 5", sql.upper(), f"Expected LIMIT 5: {sql}")

    def test_intent_validator_rejects_bottom_n_with_desc(self):
        """Intent specifies ASC ranking -> SQL with DESC must be rejected by validator."""
        intent = AnalyticalIntent(
            metrics=["BILLED_AMOUNT"],
            aggregations=["SUM"],
            dimensions=["DEPARTMENT"],
            ranking_direction="ASC",
            limit=5,
            can_answer=True,
        )
        bad_sql = 'SELECT "DEPARTMENT", SUM("BILLED_AMOUNT") AS "TOTAL" FROM "HEALTH_DW"."CLINICAL"."ENCOUNTERS" GROUP BY "DEPARTMENT" ORDER BY "TOTAL" DESC LIMIT 5;'
        err = _validate_intent_against_sql(intent, bad_sql)
        self.assertIsNotNone(err, "Validator must reject DESC for ASC ranking intent")
        self.assertIn("ASC", err)

    def test_intent_validator_rejects_wrong_aggregation(self):
        """Intent specifies AVG -> SQL with SUM must be rejected by validator."""
        intent = AnalyticalIntent(
            metrics=["LOS_DAYS"],
            aggregations=["AVG"],
            metric_aggregations={"LOS_DAYS": "AVG"},
            can_answer=True,
        )
        bad_sql = 'SELECT SUM("LOS_DAYS") AS "TOTAL_LOS_DAYS" FROM "HEALTH_DW"."CLINICAL"."ENCOUNTERS";'
        err = _validate_intent_against_sql(intent, bad_sql)
        self.assertIsNotNone(err, "Validator must reject SUM when AVG is requested")
        self.assertIn("AVG", err)

    def test_intent_validator_rejects_missing_date_range(self):
        """Intent specifies date range -> SQL missing WHERE/dates must be rejected."""
        intent = AnalyticalIntent(
            metrics=["BILLED_AMOUNT"],
            aggregations=["SUM"],
            date_range=("2024-01-01", "2024-03-31"),
            can_answer=True,
        )
        bad_sql = 'SELECT SUM("BILLED_AMOUNT") AS "TOTAL" FROM "HEALTH_DW"."CLINICAL"."ENCOUNTERS";'
        err = _validate_intent_against_sql(intent, bad_sql)
        self.assertIsNotNone(err, "Validator must reject SQL omitting requested date range")

    def test_intent_validator_rejects_monthly_trend_grouped_by_raw_date(self):
        """Monthly trend intent grouped by raw daily date must be rejected."""
        intent = AnalyticalIntent(
            metrics=["BILLED_AMOUNT"],
            aggregations=["SUM"],
            dimensions=["ADMISSION_DATE"],
            temporal_grain="month",
            can_answer=True,
        )
        bad_sql = 'SELECT "ADMISSION_DATE", SUM("BILLED_AMOUNT") FROM "HEALTH_DW"."CLINICAL"."ENCOUNTERS" GROUP BY "ADMISSION_DATE";'
        err = _validate_intent_against_sql(intent, bad_sql)
        self.assertIsNotNone(err, "Validator must reject raw date grouping for monthly grain")


if __name__ == "__main__":
    unittest.main()
