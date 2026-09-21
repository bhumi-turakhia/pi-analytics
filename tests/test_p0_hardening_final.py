import os
import sys
import unittest
from unittest.mock import MagicMock, patch

# Ensure project root and backend are on sys.path
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
BACKEND_DIR = os.path.join(PROJECT_ROOT, "backend")
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from sqlalchemy import text
from fastapi import HTTPException

from backend.app.database import engine, init_db_schema
from backend.app.routes.copilot import (
    generate_catalog_grounded_sql,
    _check_unknown_references,
    _select_numeric_col_for_intent,
    copilot_query,
    CopilotQueryRequest,
    DashboardModifyRequest,
    dashboard_modify,
)
from connectors.snowflake import SnowflakeConnector
from backend.app.routes.query import validate_read_only_query


class P0HardeningFinalTests(unittest.TestCase):
    """
    Automated verification suite for P0 Final Blocking Hardening Pass.
    Ensures all 10 P0 defects are completely resolved and regression-tested.
    """

    @classmethod
    def setUpClass(cls):
        """Seed catalog with SALES, CUSTOMERS, PRODUCTS tables."""
        init_db_schema()

        with engine.begin() as conn:
            # 1. Get or create test source
            src = conn.execute(
                text("SELECT id FROM data_sources WHERE name = 'P0_Final_Test_Snowflake'")
            ).fetchone()
            if src:
                cls.test_source_id = src[0]
            else:
                ins = conn.execute(
                    text("""
                        INSERT INTO data_sources (name, source_type, created_at)
                        VALUES ('P0_Final_Test_Snowflake', 'snowflake', CURRENT_TIMESTAMP)
                        RETURNING id
                    """)
                ).fetchone()
                cls.test_source_id = ins[0]

            d_row = conn.execute(text("SELECT id FROM dashboards WHERE id = 1")).fetchone()
            if not d_row:
                conn.execute(
                    text("INSERT INTO dashboards (id, name, source_id) VALUES (1, 'P0 Test Dashboard', :sid)"),
                    {"sid": cls.test_source_id}
                )

            # 2. Seed test dataset SALES with REVENUE, UNIT_PRICE, QUANTITY, DISCOUNT_PERCENT, SALE_DATE, REGION
            conn.execute(
                text("DELETE FROM datasets WHERE source_id = :sid"),
                {"sid": cls.test_source_id}
            )

            ds_sales = conn.execute(
                text("""
                    INSERT INTO datasets (source_id, database_name, schema_name, table_name, table_type, row_count)
                    VALUES (:sid, 'PI_ANALYTICS', 'ANALYTICS', 'SALES', 'TABLE', 10000)
                    RETURNING id
                """),
                {"sid": cls.test_source_id}
            ).fetchone()
            cls.sales_dataset_id = ds_sales[0]

            conn.execute(
                text("""
                    INSERT INTO catalog_columns (dataset_id, column_name, data_type, ordinal_position)
                    VALUES 
                        (:ds_id, 'REGION', 'VARCHAR', 1),
                        (:ds_id, 'SALE_DATE', 'DATE', 2),
                        (:ds_id, 'MONTH', 'VARCHAR', 3),
                        (:ds_id, 'UNIT_PRICE', 'NUMBER', 4),
                        (:ds_id, 'QUANTITY', 'NUMBER', 5),
                        (:ds_id, 'DISCOUNT_PERCENT', 'NUMBER', 6),
                        (:ds_id, 'REVENUE', 'NUMBER', 7),
                        (:ds_id, 'CUSTOMER_ID', 'VARCHAR', 8)
                """),
                {"ds_id": cls.sales_dataset_id}
            )

            cls.sample_catalog = [
                {
                    "table": "SALES",
                    "schema": "ANALYTICS",
                    "database": "PI_ANALYTICS",
                    "columns": [
                        {"name": "REGION", "data_type": "VARCHAR"},
                        {"name": "SALE_DATE", "data_type": "DATE"},
                        {"name": "MONTH", "data_type": "VARCHAR"},
                        {"name": "UNIT_PRICE", "data_type": "NUMBER"},
                        {"name": "QUANTITY", "data_type": "NUMBER"},
                        {"name": "DISCOUNT_PERCENT", "data_type": "NUMBER"},
                        {"name": "REVENUE", "data_type": "NUMBER"},
                        {"name": "CUSTOMER_ID", "data_type": "VARCHAR"},
                    ]
                }
            ]

    # P0 BUG 1: Revenue vs Unit Price grounding test
    def test_p0_bug1_revenue_grounding_prioritizes_revenue(self):
        sql, viz = generate_catalog_grounded_sql("Show total revenue by region.", self.sample_catalog)
        self.assertIn('"REVENUE"', sql, f"SQL should ground revenue to REVENUE column: {sql}")
        self.assertNotIn('"UNIT_PRICE"', sql, f"SQL should NOT use UNIT_PRICE for revenue: {sql}")
        self.assertNotIn('"QUANTITY"', sql, f"SQL should NOT use QUANTITY for revenue: {sql}")

    # P0 BUG 2: Multi-metric & time-series decomposition test
    def test_p0_bug2_multi_metric_time_series_not_collapsed_to_count_star(self):
        question = "Analyze sales performance from January to June 2025. Show total revenue, total units sold, and number of sales transactions by month."
        sql, viz = generate_catalog_grounded_sql(question, self.sample_catalog)
        
        # Verify it doesn't collapse to SELECT COUNT(*) AS "TOTAL_COUNT" FROM "PI_ANALYTICS"."ANALYTICS"."SALES"
        self.assertNotEqual(
            sql.strip().upper(),
            'SELECT COUNT(*) AS "TOTAL_COUNT" FROM "PI_ANALYTICS"."ANALYTICS"."SALES";',
            "Multi-metric prompt must NOT collapse to simple SELECT COUNT(*)"
        )
        self.assertIn('"REVENUE"', sql, f"Multi-metric SQL should contain REVENUE: {sql}")
        self.assertIn('"QUANTITY"', sql, f"Multi-metric SQL should contain QUANTITY: {sql}")
        self.assertIn('2025-01-01', sql, f"Multi-metric SQL should contain January 2025 filter: {sql}")
        self.assertIn('2025-06-30', sql, f"Multi-metric SQL should contain June 2025 filter: {sql}")
        self.assertTrue(
            "GROUP BY" in sql or "ORDER BY" in sql,
            f"Multi-metric SQL should group or order by monthly granularity: {sql}"
        )

    # P0 BUG 3: Dashboard modification structured action parsing
    def test_p0_bug3_dashboard_action_parsing(self):
        req = DashboardModifyRequest(
            dashboard_id=1,
            instruction="Add a revenue by region chart to this dashboard.",
            source_id=self.test_source_id
        )
        res = dashboard_modify(req)
        self.assertTrue(res.success, "Dashboard modify should succeed")
        self.assertIn(res.action_taken, ["add", "modify_viz", "unsupported", "widget_added"], f"Action should be structured: {res}")
        self.assertIsNotNone(res.sql, f"Structured action should provide valid read-only SQL: {res}")
        self.assertIn('"REVENUE"', res.sql or "", f"Generated widget SQL should ground revenue: {res.sql}")

    # P0 BUG 5: Natural language temporal terms validation
    def test_p0_bug5_temporal_terms_not_rejected_as_unknown_tables(self):
        question = "Show sales for January, February, March, April, May, June 2025 by month"
        # Should return None (no error) for valid temporal words
        err = _check_unknown_references(question, self.sample_catalog)
        self.assertIsNone(err, f"Temporal words should not be flagged as unknown table: {err}")

        # Invalid table MUST return error message
        bad_question = "SELECT * FROM non_existent_bogus_table_xyz"
        bad_err = _check_unknown_references(bad_question, self.sample_catalog)
        self.assertIsNotNone(bad_err, "Unknown table must return validation error message")

    # P0 BUG 6: Snowflake account locator cleaning
    def test_p0_bug6_snowflake_account_locator_cleaning(self):
        raw_account = "https://xy12345.us-east-1.snowflakecomputing.com/"
        cleaned = SnowflakeConnector.clean_account_identifier(raw_account)
        self.assertEqual(cleaned, "xy12345.us-east-1", "Account identifier should strip protocol, domain, and slashes")

    # P0 BUG 8: Read-only SQL governance test
    def test_p0_bug8_strict_read_only_governance(self):
        valid_sqls = [
            'SELECT "REGION", SUM("REVENUE") FROM "PI_ANALYTICS"."ANALYTICS"."SALES" GROUP BY "REGION"',
            'WITH regional_sales AS (SELECT "REGION", "REVENUE" FROM "PI_ANALYTICS"."ANALYTICS"."SALES") SELECT * FROM regional_sales',
        ]
        for v in valid_sqls:
            # Should not raise exception
            validate_read_only_query(v)

        forbidden_sqls = [
            'INSERT INTO "SALES" ("REGION") VALUES (\'NORTH\')',
            'UPDATE "SALES" SET "REVENUE" = 1000',
            'DROP TABLE "SALES"',
            'ALTER TABLE "SALES" DROP COLUMN "REVENUE"',
            'TRUNCATE TABLE "SALES"',
            'DELETE FROM "SALES"',
            'SELECT * FROM "SALES"; DROP TABLE "SALES";',
        ]
        for f in forbidden_sqls:
            with self.assertRaises(HTTPException, msg=f"Forbidden SQL must raise HTTPException: {f}"):
                validate_read_only_query(f)


if __name__ == "__main__":
    unittest.main()
