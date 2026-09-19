import os
import sys
import unittest
from unittest.mock import MagicMock, patch
from typing import Dict, Any

# Ensure project root and backend are on sys.path
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
BACKEND_DIR = os.path.join(PROJECT_ROOT, "backend")
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from sqlalchemy import text
from fastapi import HTTPException

from connectors.base import (
    QueryResultColumn,
    QueryExecutionResult,
)
from backend.app.database import engine, init_db_schema
from backend.app.routes import copilot, dashboards
from backend.app.routes.copilot import (
    CopilotQueryRequest,
    copilot_query,
    get_catalog_metadata,
    generate_catalog_grounded_sql,
    _check_unknown_references,
    resolve_visualization_from_actual_results,
)
from backend.app.routes.query import ColumnResponse, validate_read_only_query
from backend.app.routes.dashboards import (
    DashboardCreatePayload,
    WidgetCreatePayload,
    create_dashboard,
    get_dashboard,
    add_widget,
    delete_widget,
    delete_dashboard,
    list_dashboards,
)


class Step10CopilotAndDashboardTests(unittest.TestCase):
    """
    Automated test suite covering all 20 required scenarios for Step 10:
    AI Analytics Copilot + Dynamic Dashboard Builder.
    """

    @classmethod
    def setUpClass(cls):
        """Seed test database with catalog metadata and test data source."""
        init_db_schema()

        with engine.begin() as conn:
            # 1. Create dedicated test source
            src = conn.execute(
                text("SELECT id FROM data_sources WHERE name = 'Step10_Test_Snowflake_Source'")
            ).fetchone()
            if src:
                cls.test_source_id = src[0]
            else:
                ins = conn.execute(
                    text("""
                        INSERT INTO data_sources (name, source_type, created_at)
                        VALUES ('Step10_Test_Snowflake_Source', 'snowflake', CURRENT_TIMESTAMP)
                        RETURNING id
                    """)
                ).fetchone()
                cls.test_source_id = ins[0]

            # 2. Seed test catalog tables: SALES and CUSTOMERS
            conn.execute(
                text("DELETE FROM datasets WHERE source_id = :sid"),
                {"sid": cls.test_source_id}
            )

            ds_sales = conn.execute(
                text("""
                    INSERT INTO datasets (source_id, database_name, schema_name, table_name, table_type, row_count)
                    VALUES (:sid, 'ANALYTICS', 'PUBLIC', 'SALES', 'TABLE', 5000)
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
                        (:ds_id, 'REVENUE', 'NUMBER', 4),
                        (:ds_id, 'CUSTOMER_ID', 'VARCHAR', 5),
                        (:ds_id, 'PRODUCT_NAME', 'VARCHAR', 6)
                """),
                {"ds_id": cls.sales_dataset_id}
            )

            ds_cust = conn.execute(
                text("""
                    INSERT INTO datasets (source_id, database_name, schema_name, table_name, table_type, row_count)
                    VALUES (:sid, 'ANALYTICS', 'PUBLIC', 'CUSTOMERS', 'TABLE', 1200)
                    RETURNING id
                """),
                {"sid": cls.test_source_id}
            ).fetchone()
            cls.cust_dataset_id = ds_cust[0]

            conn.execute(
                text("""
                    INSERT INTO catalog_columns (dataset_id, column_name, data_type, ordinal_position)
                    VALUES 
                        (:ds_id, 'CUSTOMER_ID', 'VARCHAR', 1),
                        (:ds_id, 'NAME', 'VARCHAR', 2),
                        (:ds_id, 'REGION', 'VARCHAR', 3)
                """),
                {"ds_id": cls.cust_dataset_id}
            )

    # 1. Copilot request validation
    def test_01_copilot_request_validation(self):
        # Empty question should raise HTTP 400
        req = CopilotQueryRequest(question="", source_id=self.test_source_id)
        with self.assertRaises(HTTPException) as ctx:
            copilot_query(req)
        self.assertEqual(ctx.exception.status_code, 400)

        # Invalid source_id should raise HTTP 404
        req_bad_src = CopilotQueryRequest(question="Show sales", source_id=999999)
        with self.assertRaises(HTTPException) as ctx:
            copilot_query(req_bad_src)
        self.assertEqual(ctx.exception.status_code, 404)

    # 2. Catalog context retrieval
    def test_02_catalog_context_retrieval(self):
        catalog = get_catalog_metadata(self.test_source_id)
        self.assertGreaterEqual(len(catalog), 2)
        table_names = [t["table"].upper() for t in catalog]
        self.assertIn("SALES", table_names)
        self.assertIn("CUSTOMERS", table_names)

        sales_tbl = next(t for t in catalog if t["table"].upper() == "SALES")
        col_names = [c["name"].upper() for c in sales_tbl["columns"]]
        self.assertIn("REGION", col_names)
        self.assertIn("REVENUE", col_names)

    # 3. Known table and column handling
    def test_03_known_table_and_column_handling(self):
        catalog = get_catalog_metadata(self.test_source_id)
        sql, viz = generate_catalog_grounded_sql("Show sales by region", catalog)
        self.assertIn("REGION", sql.upper())
        self.assertIn("SALES", sql.upper())
        self.assertIn("SUM", sql.upper())
        self.assertIn("GROUP BY", sql.upper())

    # 4. Unknown table rejection
    def test_04_unknown_table_rejection(self):
        catalog = get_catalog_metadata(self.test_source_id)
        err = _check_unknown_references("Show revenue from secret_table", catalog)
        self.assertIsNotNone(err)
        self.assertIn("I couldn't find a dataset or column in the connected catalog", err)

        req = CopilotQueryRequest(question="Show revenue from secret_table", source_id=self.test_source_id)
        res = copilot_query(req)
        self.assertFalse(res.success)
        self.assertIn("I couldn't find a dataset or column in the connected catalog", res.answer)

    # 5. Unknown column rejection
    def test_05_unknown_column_rejection(self):
        catalog = get_catalog_metadata(self.test_source_id)
        err = _check_unknown_references("Show secret_column from customers", catalog)
        self.assertIsNotNone(err)
        self.assertIn("I couldn't find a dataset or column in the connected catalog", err)

    # 6. SQL generation structured
    def test_06_sql_generation_structured(self):
        catalog = get_catalog_metadata(self.test_source_id)
        sql, viz = generate_catalog_grounded_sql("Show monthly revenue", catalog)
        self.assertTrue(sql.strip().upper().startswith("SELECT"))
        self.assertIn("MONTH", sql.upper())
        self.assertIn("REVENUE", sql.upper())
        self.assertEqual(viz["type"], "line")

    # 7. SQL safety validation
    def test_07_sql_safety_validation(self):
        safe_sql = 'SELECT "REGION", SUM("REVENUE") FROM "ANALYTICS"."PUBLIC"."SALES" GROUP BY "REGION";'
        # Should not raise
        validate_read_only_query(safe_sql)

    # 8. Destructive SQL rejection
    def test_08_destructive_sql_rejection(self):
        destructive_queries = [
            "DROP TABLE SALES;",
            "DELETE FROM SALES WHERE REGION = 'North';",
            "INSERT INTO SALES VALUES ('North', 100);",
            "UPDATE SALES SET REVENUE = 0;",
            "ALTER TABLE SALES DROP COLUMN REVENUE;",
            "TRUNCATE TABLE SALES;",
        ]
        for bad_sql in destructive_queries:
            with self.assertRaises(HTTPException):
                validate_read_only_query(bad_sql)

    # 9. Query execution pipeline
    @patch("backend.app.routes.copilot.execute_source_query")
    def test_09_query_execution_pipeline(self, mock_exec):
        mock_exec.return_value = QueryExecutionResult(
            success=True,
            columns=[QueryResultColumn("REGION", "VARCHAR"), QueryResultColumn("TOTAL_SALES", "NUMBER")],
            rows=[{"REGION": "North", "TOTAL_SALES": 50000}, {"REGION": "South", "TOTAL_SALES": 42000}],
            row_count=2,
            execution_time_ms=45,
        )

        req = CopilotQueryRequest(question="Show sales by region", source_id=self.test_source_id)
        res = copilot_query(req)

        self.assertTrue(res.success)
        self.assertEqual(len(res.rows), 2)
        self.assertEqual(res.rows[0]["REGION"], "North")
        self.assertEqual(res.visualization.type, "bar")
        self.assertEqual(res.visualization.xField, "REGION")
        self.assertEqual(res.visualization.yField, "TOTAL_SALES")

    # 10. Query execution failure handling (no fake data)
    @patch("backend.app.routes.copilot.execute_source_query")
    def test_10_query_execution_failure_handling(self, mock_exec):
        mock_exec.return_value = QueryExecutionResult(
            success=False,
            columns=[],
            rows=[],
            row_count=0,
            execution_time_ms=12,
            error="Snowflake error: Warehouse 'COMPUTE_WH' is suspended.",
        )

        req = CopilotQueryRequest(question="Show sales by region", source_id=self.test_source_id)
        res = copilot_query(req)

        self.assertFalse(res.success)
        self.assertIn("Snowflake error", res.answer)
        self.assertEqual(len(res.rows), 0)

    # 11. Empty results handling (says no data, doesn't invent numbers)
    @patch("backend.app.routes.copilot.execute_source_query")
    def test_11_empty_results_handling(self, mock_exec):
        mock_exec.return_value = QueryExecutionResult(
            success=True,
            columns=[QueryResultColumn("REGION", "VARCHAR"), QueryResultColumn("TOTAL_SALES", "NUMBER")],
            rows=[],
            row_count=0,
            execution_time_ms=18,
        )

        req = CopilotQueryRequest(question="Show sales by region", source_id=self.test_source_id)
        res = copilot_query(req)

        self.assertTrue(res.success)
        self.assertEqual(res.row_count, 0)
        self.assertIn("returned no rows", res.answer)
        self.assertEqual(len(res.rows), 0)

    # 12. Visualization type selection
    def test_12_visualization_selection(self):
        # 1. Single aggregate numeric result -> KPI
        kpi_spec = resolve_visualization_from_actual_results(
            {"type": "kpi", "title": "Total Revenue"},
            [ColumnResponse(name="TOTAL_REVENUE", data_type="NUMBER")],
            [{"TOTAL_REVENUE": 1500000}],
            "What is total revenue?"
        )
        self.assertEqual(kpi_spec.type, "kpi")
        self.assertEqual(kpi_spec.value, 1500000)

        # 2. Date + numeric -> LINE
        line_spec = resolve_visualization_from_actual_results(
            {"type": "line", "title": "Monthly Revenue"},
            [ColumnResponse(name="MONTH", data_type="VARCHAR"), ColumnResponse(name="REVENUE", data_type="NUMBER")],
            [{"MONTH": "2026-01", "REVENUE": 10000}, {"MONTH": "2026-02", "REVENUE": 12000}],
            "Show monthly revenue"
        )
        self.assertEqual(line_spec.type, "line")

        # 3. Category + numeric -> BAR
        bar_spec = resolve_visualization_from_actual_results(
            {"type": "bar", "title": "Sales by Region"},
            [ColumnResponse(name="REGION", data_type="VARCHAR"), ColumnResponse(name="TOTAL_SALES", data_type="NUMBER")],
            [{"REGION": "North", "TOTAL_SALES": 5000}, {"REGION": "South", "TOTAL_SALES": 4000}],
            "Show sales by region"
        )
        self.assertEqual(bar_spec.type, "bar")

    # 13. Actual result field mapping
    def test_13_actual_result_mapping(self):
        # Even if intent requested non-existent fields, resolution aligns strictly to returned columns
        spec = resolve_visualization_from_actual_results(
            {"type": "bar", "title": "Custom", "xField": "NON_EXISTENT_X", "yField": "NON_EXISTENT_Y"},
            [ColumnResponse(name="ACTUAL_CAT", data_type="VARCHAR"), ColumnResponse(name="ACTUAL_NUM", data_type="NUMBER")],
            [{"ACTUAL_CAT": "A", "ACTUAL_NUM": 10}],
            "custom question"
        )
        self.assertEqual(spec.xField, "ACTUAL_CAT")
        self.assertEqual(spec.yField, "ACTUAL_NUM")

    # 14. No invented values enforcement
    @patch("backend.app.routes.copilot.execute_source_query")
    def test_14_no_invented_values(self, mock_exec):
        real_data = [
            {"REGION": "East", "TOTAL_SALES": 12345},
            {"REGION": "West", "TOTAL_SALES": 67890},
        ]
        mock_exec.return_value = QueryExecutionResult(
            success=True,
            columns=[QueryResultColumn("REGION", "VARCHAR"), QueryResultColumn("TOTAL_SALES", "NUMBER")],
            rows=real_data,
            row_count=2,
            execution_time_ms=30,
        )

        req = CopilotQueryRequest(question="Show sales by region", source_id=self.test_source_id)
        res = copilot_query(req)

        # Values returned must match real_data exactly
        self.assertEqual(res.rows[0]["TOTAL_SALES"], 12345)
        self.assertEqual(res.rows[1]["TOTAL_SALES"], 67890)

    # 15. Dashboard creation
    def test_15_dashboard_creation(self):
        payload = DashboardCreatePayload(name="Q3 Executive Dashboard", sourceId=self.test_source_id)
        d = create_dashboard(payload)
        self.assertIsNotNone(d["id"])
        self.assertEqual(d["name"], "Q3 Executive Dashboard")
        self.assertEqual(d["source_id"], self.test_source_id)

    # 16. Widget creation & persistence
    def test_16_widget_creation(self):
        # Create dashboard
        d = create_dashboard(DashboardCreatePayload(name="Widget Test Dashboard", sourceId=self.test_source_id))
        d_id = d["id"]

        w_payload = WidgetCreatePayload(
            title="Sales by Region",
            widgetType="bar",
            sourceId=self.test_source_id,
            sqlQuery='SELECT "REGION", SUM("REVENUE") FROM "ANALYTICS"."PUBLIC"."SALES" GROUP BY "REGION";',
            visualizationSpec={"type": "bar", "title": "Sales by Region", "xField": "REGION", "yField": "REVENUE"},
        )
        w = add_widget(d_id, w_payload)

        self.assertIsNotNone(w["id"])
        self.assertEqual(w["dashboard_id"], d_id)
        self.assertEqual(w["title"], "Sales by Region")
        self.assertEqual(w["visualization_spec"]["type"], "bar")

    # 17. Widget deletion
    def test_17_widget_deletion(self):
        d = create_dashboard(DashboardCreatePayload(name="Delete Test Dashboard", sourceId=self.test_source_id))
        w = add_widget(d["id"], WidgetCreatePayload(
            title="Temporary Widget",
            widgetType="table",
            sqlQuery='SELECT * FROM "ANALYTICS"."PUBLIC"."SALES" LIMIT 10;',
            visualizationSpec={"type": "table", "title": "Temporary"},
        ))
        w_id = w["id"]

        # Delete widget
        delete_widget(d["id"], w_id)

        # Retrieve dashboard and ensure widget is gone
        d_detail = get_dashboard(d["id"])
        self.assertEqual(len(d_detail["widgets"]), 0)

    # 18. Dashboard retrieval with widgets
    def test_18_dashboard_retrieval(self):
        d = create_dashboard(DashboardCreatePayload(name="Retrieval Dashboard", sourceId=self.test_source_id))
        add_widget(d["id"], WidgetCreatePayload(
            title="Widget 1",
            widgetType="bar",
            sqlQuery='SELECT "REGION", SUM("REVENUE") FROM "ANALYTICS"."PUBLIC"."SALES" GROUP BY "REGION";',
            visualizationSpec={"type": "bar", "title": "Widget 1"},
        ))
        add_widget(d["id"], WidgetCreatePayload(
            title="Widget 2",
            widgetType="line",
            sqlQuery='SELECT "MONTH", SUM("REVENUE") FROM "ANALYTICS"."PUBLIC"."SALES" GROUP BY "MONTH";',
            visualizationSpec={"type": "line", "title": "Widget 2"},
        ))

        detail = get_dashboard(d["id"])
        self.assertEqual(len(detail["widgets"]), 2)
        titles = [widget["title"] for widget in detail["widgets"]]
        self.assertIn("Widget 1", titles)
        self.assertIn("Widget 2", titles)

    # 19. Credential non-persistence verification
    def test_19_credential_non_persistence(self):
        d = create_dashboard(DashboardCreatePayload(name="Security Audit Dashboard", sourceId=self.test_source_id))
        w = add_widget(d["id"], WidgetCreatePayload(
            title="Secure Widget",
            widgetType="kpi",
            sqlQuery='SELECT COUNT(*) FROM "ANALYTICS"."PUBLIC"."CUSTOMERS";',
            visualizationSpec={"type": "kpi", "title": "Customers"},
        ))

        with engine.connect() as conn:
            # Inspect table columns for dashboards and dashboard_widgets
            if conn.engine.dialect.name == "sqlite":
                dash_cols = [c[1] for c in conn.execute(text("PRAGMA table_info(dashboards)")).fetchall()]
                widget_cols = [c[1] for c in conn.execute(text("PRAGMA table_info(dashboard_widgets)")).fetchall()]
            else:
                dash_cols = [c[0] for c in conn.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name = 'dashboards'")).fetchall()]
                widget_cols = [c[0] for c in conn.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name = 'dashboard_widgets'")).fetchall()]

            for forbidden in ("password", "secret", "token", "api_key", "credential"):
                self.assertNotIn(forbidden, dash_cols)
                self.assertNotIn(forbidden, widget_cols)

            # Check persisted widget row content
            w_row = conn.execute(text("SELECT * FROM dashboard_widgets WHERE id = :id"), {"id": w["id"]}).fetchone()
            w_dict = dict(w_row._mapping)
            for k, v in w_dict.items():
                val_str = str(v).lower()
                self.assertNotIn("password", val_str)
                self.assertNotIn("secret", val_str)

    # 20. AI provider fallback/failure handling
    @patch.dict(os.environ, {"GEMINI_API_KEY": ""}, clear=True)
    @patch("backend.app.routes.copilot.execute_source_query")
    def test_20_ai_provider_failure_fallback(self, mock_exec):
        # Even with no GEMINI_API_KEY, the catalog-grounded generator handles analytics queries cleanly
        mock_exec.return_value = QueryExecutionResult(
            success=True,
            columns=[QueryResultColumn("TOTAL_REVENUE", "NUMBER")],
            rows=[{"TOTAL_REVENUE": 987654}],
            row_count=1,
            execution_time_ms=25,
        )

        req = CopilotQueryRequest(question="What is total revenue?", source_id=self.test_source_id)
        res = copilot_query(req)

        self.assertTrue(res.success)
        self.assertIn("987,654", res.answer)
        self.assertEqual(res.visualization.type, "kpi")
        self.assertEqual(res.rows[0]["TOTAL_REVENUE"], 987654)


if __name__ == "__main__":
    unittest.main()
