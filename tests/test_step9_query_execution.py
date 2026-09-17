import os
import sys
import unittest
import datetime
import decimal
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
from connectors.snowflake import SnowflakeConnector
from connectors import execute_source_query
from backend.app.database import engine
from backend.app.routes import sources, datasets, pipeline_runs, query
from backend.app.routes.query import QueryExecutePayload, validate_read_only_query


class Step9QueryExecutionTests(unittest.TestCase):
    """
    Automated test suite covering all 24 requirements of Step 9:
    Real Data Explorer / Query Execution.
    """

    @classmethod
    def setUpClass(cls):
        """Ensure test data sources and test datasets exist for query testing."""
        with engine.begin() as conn:
            # 1. Create or get dedicated test Snowflake source
            src = conn.execute(
                text("SELECT id FROM data_sources WHERE name = 'Step9_Test_Snowflake_Source'")
            ).fetchone()
            if src:
                cls.test_source_id = src[0]
            else:
                ins = conn.execute(
                    text("""
                        INSERT INTO data_sources (name, source_type, created_at)
                        VALUES ('Step9_Test_Snowflake_Source', 'snowflake', CURRENT_TIMESTAMP)
                        RETURNING id
                    """)
                ).fetchone()
                cls.test_source_id = ins[0]

            # 2. Create or get unsupported data source (e.g. salesforce)
            unsupported_src = conn.execute(
                text("SELECT id FROM data_sources WHERE name = 'Step9_Test_Salesforce_Source'")
            ).fetchone()
            if unsupported_src:
                cls.unsupported_source_id = unsupported_src[0]
            else:
                ins_unsup = conn.execute(
                    text("""
                        INSERT INTO data_sources (name, source_type, created_at)
                        VALUES ('Step9_Test_Salesforce_Source', 'salesforce', CURRENT_TIMESTAMP)
                        RETURNING id
                    """)
                ).fetchone()
                cls.unsupported_source_id = ins_unsup[0]

            # 3. Create a test dataset and column for catalog table selection testing
            ds = conn.execute(
                text("""
                    INSERT INTO datasets (source_id, database_name, schema_name, table_name, table_type, row_count, size_bytes)
                    VALUES (:sid, 'RETAIL_ANALYTICS', 'SALES', 'ORDER_FACT', 'TABLE', 500, 16384)
                    ON CONFLICT (source_id, database_name, schema_name, table_name)
                    DO UPDATE SET row_count = 500
                    RETURNING id
                """),
                {"sid": cls.test_source_id}
            ).fetchone()
            cls.test_dataset_id = ds[0]

            conn.execute(
                text("""
                    INSERT INTO catalog_columns (dataset_id, column_name, data_type, is_nullable, ordinal_position)
                    VALUES (:ds_id, 'ORDER_ID', 'NUMBER(38,0)', FALSE, 1)
                    ON CONFLICT (dataset_id, column_name) DO NOTHING
                """),
                {"ds_id": cls.test_dataset_id}
            )

    @classmethod
    def tearDownClass(cls):
        """Clean up isolated test records created during testing."""
        with engine.begin() as conn:
            conn.execute(
                text("DELETE FROM catalog_columns WHERE dataset_id = :did"),
                {"did": cls.test_dataset_id}
            )
            conn.execute(
                text("DELETE FROM datasets WHERE source_id = :sid"),
                {"sid": cls.test_source_id}
            )
            conn.execute(
                text("DELETE FROM pipeline_runs WHERE source_id IN (:s1, :s2)"),
                {"s1": cls.test_source_id, "s2": cls.unsupported_source_id}
            )
            conn.execute(
                text("DELETE FROM data_sources WHERE id IN (:s1, :s2)"),
                {"s1": cls.test_source_id, "s2": cls.unsupported_source_id}
            )

    # 1. Valid Snowflake read query with mocked connector
    @patch("snowflake.connector.connect")
    def test_01_valid_snowflake_read_query_mocked(self, mock_connect):
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_connect.return_value = mock_conn
        mock_conn.cursor.return_value.__enter__.return_value = mock_cursor

        mock_cursor.description = [
            ("ORDER_ID", 0, None, None, None, None, False),
            ("ORDER_NUMBER", 2, None, None, None, None, True),
            ("TOTAL_AMOUNT", 0, None, None, None, None, True),
        ]
        mock_cursor.fetchmany.return_value = [
            (1001, "ORD-2026-001", 149.99),
            (1002, "ORD-2026-002", 89.50),
        ]
        mock_cursor.sfqid = "mock-sfqid-012345"

        config = {
            "account_identifier": "mock.snowflake.account",
            "username": "mock_analyst",
            "password": "mock_password",
            "warehouse": "COMPUTE_WH",
        }

        result = SnowflakeConnector.execute_read_query(
            config=config,
            query="SELECT ORDER_ID, ORDER_NUMBER, TOTAL_AMOUNT FROM ORDERS LIMIT 50;",
            limit=50
        )

        self.assertTrue(result.success)
        self.assertEqual(result.row_count, 2)
        self.assertEqual(len(result.columns), 3)
        self.assertEqual(result.query_id, "mock-sfqid-012345")
        mock_cursor.fetchmany.assert_called_with(50)

    # 2. Query result mapping
    @patch("snowflake.connector.connect")
    def test_02_query_result_mapping(self, mock_connect):
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_connect.return_value = mock_conn
        mock_conn.cursor.return_value.__enter__.return_value = mock_cursor

        test_dt = datetime.datetime(2026, 9, 17, 10, 30, 0)
        test_dec = decimal.Decimal("250.75")

        mock_cursor.description = [
            ("ID", 0),
            ("CREATED_AT", 4),
            ("PRICE", 0),
            ("RAW_DATA", 11),
        ]
        mock_cursor.fetchmany.return_value = [
            (42, test_dt, test_dec, b"binary_test"),
        ]

        config = {
            "account_identifier": "mock.snowflake.account",
            "username": "mock_analyst",
            "password": "mock_password",
        }

        result = SnowflakeConnector.execute_read_query(
            config=config,
            query="SELECT ID, CREATED_AT, PRICE, RAW_DATA FROM TEST LIMIT 10;"
        )

        self.assertTrue(result.success)
        self.assertEqual(len(result.rows), 1)
        row = result.rows[0]
        self.assertEqual(row["ID"], 42)
        self.assertEqual(row["CREATED_AT"], "2026-09-17T10:30:00")
        self.assertEqual(row["PRICE"], 250.75)
        self.assertEqual(row["RAW_DATA"], "binary_test")

    # 3. Column metadata mapping
    @patch("snowflake.connector.connect")
    def test_03_column_metadata_mapping(self, mock_connect):
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_connect.return_value = mock_conn
        mock_conn.cursor.return_value.__enter__.return_value = mock_cursor

        mock_cursor.description = [
            ("CUSTOMER_ID", 0),
            ("EMAIL", 2),
            ("ACTIVE", 13),
        ]
        mock_cursor.fetchmany.return_value = []

        config = {
            "account_identifier": "mock.account",
            "username": "mock_user",
            "password": "mock_password",
        }

        result = SnowflakeConnector.execute_read_query(
            config=config,
            query="SELECT CUSTOMER_ID, EMAIL, ACTIVE FROM CUSTOMERS;"
        )

        self.assertTrue(result.success)
        self.assertEqual(len(result.columns), 3)
        self.assertEqual(result.columns[0].name, "CUSTOMER_ID")
        self.assertEqual(result.columns[0].data_type, "NUMBER")
        self.assertEqual(result.columns[1].name, "EMAIL")
        self.assertEqual(result.columns[1].data_type, "TEXT")
        self.assertEqual(result.columns[2].name, "ACTIVE")
        self.assertEqual(result.columns[2].data_type, "BOOLEAN")

    # 4. Row limit enforcement
    @patch("snowflake.connector.connect")
    def test_04_row_limit_enforcement(self, mock_connect):
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_connect.return_value = mock_conn
        mock_conn.cursor.return_value.__enter__.return_value = mock_cursor

        mock_cursor.description = [("ID", 0)]
        mock_cursor.fetchmany.return_value = [(i,) for i in range(25)]

        config = {
            "account_identifier": "mock.account",
            "username": "mock_user",
            "password": "mock_password",
        }

        result = SnowflakeConnector.execute_read_query(
            config=config,
            query="SELECT ID FROM NUMS;",
            limit=25
        )

        self.assertTrue(result.success)
        mock_cursor.fetchmany.assert_called_with(25)

    # 5. Maximum row limit enforcement
    def test_05_maximum_row_limit_enforcement(self):
        # A. Payload limit exceeds 1000
        payload = QueryExecutePayload(
            source_id=self.test_source_id,
            sqlQuery="SELECT 1;",
            limit=2500
        )
        with self.assertRaises(HTTPException) as ctx:
            query.execute_query(payload)
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("exceeds maximum allowed limit of 1000", ctx.exception.detail)

        # B. SQL embedded LIMIT exceeds 1000
        payload_sql = QueryExecutePayload(
            source_id=self.test_source_id,
            sqlQuery="SELECT * FROM table LIMIT 5000;"
        )
        with self.assertRaises(HTTPException) as ctx2:
            query.execute_query(payload_sql)
        self.assertEqual(ctx2.exception.status_code, 400)
        self.assertIn("exceeds maximum allowed limit of 1000", ctx2.exception.detail)

    # 6. Query timeout handling
    @patch("snowflake.connector.connect")
    def test_06_query_timeout_handling(self, mock_connect):
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_connect.return_value = mock_conn
        mock_conn.cursor.return_value.__enter__.return_value = mock_cursor

        mock_cursor.execute.side_effect = Exception("000604: Statement reached its execution timeout of 30 seconds and was cancelled.")

        config = {
            "account_identifier": "mock.account",
            "username": "mock_user",
            "password": "mock_password",
        }

        result = SnowflakeConnector.execute_read_query(
            config=config,
            query="SELECT * FROM very_large_table;",
            timeout_seconds=30
        )

        self.assertFalse(result.success)
        self.assertIn("timed out", result.error.lower())

    # 7. Invalid source ID -> 404
    def test_07_invalid_source_id_returns_404(self):
        payload = QueryExecutePayload(
            source_id=99999999,
            sqlQuery="SELECT 1;"
        )
        with self.assertRaises(HTTPException) as ctx:
            query.execute_query(payload)
        self.assertEqual(ctx.exception.status_code, 404)
        self.assertIn("not found", ctx.exception.detail.lower())

    # 8. Unsupported source type
    def test_08_unsupported_source_type(self):
        payload = QueryExecutePayload(
            source_id=self.unsupported_source_id,
            sqlQuery="SELECT 1;"
        )
        with self.assertRaises(HTTPException) as ctx:
            query.execute_query(payload)
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("unsupported", ctx.exception.detail.lower())

    # 9. Missing credentials
    def test_09_missing_credentials(self):
        result = SnowflakeConnector.execute_read_query(
            config={},
            query="SELECT 1;"
        )
        self.assertFalse(result.success)
        self.assertIn("Missing required Snowflake credentials", result.message)

    # 10. Snowflake connection failure
    @patch("snowflake.connector.connect")
    def test_10_snowflake_connection_failure(self, mock_connect):
        mock_connect.side_effect = Exception("250001 (08001): Could not connect to Snowflake host")

        config = {
            "account_identifier": "invalid.account",
            "username": "bad_user",
            "password": "bad_password",
        }

        result = SnowflakeConnector.execute_read_query(
            config=config,
            query="SELECT 1;"
        )
        self.assertFalse(result.success)
        self.assertIn("Could not connect to Snowflake", result.error)

    # 11. SELECT query succeeds
    @patch("backend.app.routes.query.execute_source_query")
    def test_11_select_query_succeeds(self, mock_exec):
        mock_exec.return_value = QueryExecutionResult(
            success=True,
            columns=[QueryResultColumn("ORDER_ID", "NUMBER")],
            rows=[{"ORDER_ID": 101}],
            row_count=1,
            execution_time_ms=45,
            query_id="sf-query-ok-11",
            message="Query executed successfully"
        )

        payload = QueryExecutePayload(
            source_id=self.test_source_id,
            sqlQuery="SELECT ORDER_ID FROM \"RETAIL_ANALYTICS\".\"SALES\".\"ORDER_FACT\" WHERE STATUS = 'DELETED';",
            limit=50
        )

        response = query.execute_query(payload)
        self.assertTrue(response.success)
        self.assertEqual(response.row_count, 1)
        self.assertEqual(response.rows[0]["ORDER_ID"], 101)

    # 12. INSERT is rejected
    def test_12_insert_is_rejected(self):
        payload = QueryExecutePayload(
            source_id=self.test_source_id,
            sqlQuery="INSERT INTO orders (id, name) VALUES (1, 'Test');"
        )
        with self.assertRaises(HTTPException) as ctx:
            query.execute_query(payload)
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("INSERT", ctx.exception.detail)
        self.assertIn("prohibited", ctx.exception.detail.lower())

    # 13. UPDATE is rejected
    def test_13_update_is_rejected(self):
        payload = QueryExecutePayload(
            source_id=self.test_source_id,
            sqlQuery="UPDATE orders SET status = 'CANCELLED' WHERE id = 1;"
        )
        with self.assertRaises(HTTPException) as ctx:
            query.execute_query(payload)
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("UPDATE", ctx.exception.detail)
        self.assertIn("prohibited", ctx.exception.detail.lower())

    # 14. DELETE is rejected
    def test_14_delete_is_rejected(self):
        payload = QueryExecutePayload(
            source_id=self.test_source_id,
            sqlQuery="DELETE FROM orders WHERE id = 1;"
        )
        with self.assertRaises(HTTPException) as ctx:
            query.execute_query(payload)
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("DELETE", ctx.exception.detail)
        self.assertIn("prohibited", ctx.exception.detail.lower())

    # 15. DROP is rejected
    def test_15_drop_is_rejected(self):
        payload = QueryExecutePayload(
            source_id=self.test_source_id,
            sqlQuery="DROP TABLE orders;"
        )
        with self.assertRaises(HTTPException) as ctx:
            query.execute_query(payload)
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("DROP", ctx.exception.detail)
        self.assertIn("prohibited", ctx.exception.detail.lower())

    # 16. ALTER is rejected
    def test_16_alter_is_rejected(self):
        payload = QueryExecutePayload(
            source_id=self.test_source_id,
            sqlQuery="ALTER TABLE orders ADD COLUMN extra_info VARCHAR;"
        )
        with self.assertRaises(HTTPException) as ctx:
            query.execute_query(payload)
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("ALTER", ctx.exception.detail)
        self.assertIn("prohibited", ctx.exception.detail.lower())

    # 17. TRUNCATE is rejected
    def test_17_truncate_is_rejected(self):
        payload = QueryExecutePayload(
            source_id=self.test_source_id,
            sqlQuery="TRUNCATE TABLE orders;"
        )
        with self.assertRaises(HTTPException) as ctx:
            query.execute_query(payload)
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("TRUNCATE", ctx.exception.detail)
        self.assertIn("prohibited", ctx.exception.detail.lower())

    # 18. MERGE is rejected
    def test_18_merge_is_rejected(self):
        payload = QueryExecutePayload(
            source_id=self.test_source_id,
            sqlQuery="MERGE INTO target USING source ON target.id = source.id WHEN MATCHED THEN UPDATE SET x = 1;"
        )
        with self.assertRaises(HTTPException) as ctx:
            query.execute_query(payload)
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("MERGE", ctx.exception.detail)
        self.assertIn("prohibited", ctx.exception.detail.lower())

    # 19. Credentials are not persisted
    @patch("backend.app.routes.query.execute_source_query")
    def test_19_credentials_are_not_persisted(self, mock_exec):
        mock_exec.return_value = QueryExecutionResult(
            success=True,
            columns=[QueryResultColumn("ID", "NUMBER")],
            rows=[{"ID": 1}],
            row_count=1,
            execution_time_ms=10
        )

        ephemeral_pw = "super_secret_ephemeral_pw_9999"

        payload = QueryExecutePayload(
            source_id=self.test_source_id,
            sqlQuery="SELECT 1;",
            password=ephemeral_pw
        )

        query.execute_query(payload)

        # Query PostgreSQL tables to verify ephemeral_pw is nowhere in DB
        with engine.connect() as conn:
            ds_check = conn.execute(text("SELECT COUNT(*) FROM data_sources WHERE name LIKE :pw"), {"pw": f"%{ephemeral_pw}%"}).scalar()
            self.assertEqual(ds_check, 0)

            tbl_check = conn.execute(text("SELECT COUNT(*) FROM datasets WHERE table_name LIKE :pw"), {"pw": f"%{ephemeral_pw}%"}).scalar()
            self.assertEqual(tbl_check, 0)

            col_check = conn.execute(text("SELECT COUNT(*) FROM catalog_columns WHERE column_name LIKE :pw"), {"pw": f"%{ephemeral_pw}%"}).scalar()
            self.assertEqual(col_check, 0)

            run_check = conn.execute(text("SELECT COUNT(*) FROM pipeline_runs WHERE status LIKE :pw"), {"pw": f"%{ephemeral_pw}%"}).scalar()
            self.assertEqual(run_check, 0)

    # 20. Credentials are not returned
    @patch("backend.app.routes.query.execute_source_query")
    def test_20_credentials_are_not_returned(self, mock_exec):
        mock_exec.return_value = QueryExecutionResult(
            success=True,
            columns=[QueryResultColumn("ID", "NUMBER")],
            rows=[{"ID": 1}],
            row_count=1,
            execution_time_ms=12
        )

        payload = QueryExecutePayload(
            source_id=self.test_source_id,
            sqlQuery="SELECT 1;",
            username="ephemeral_user",
            password="ephemeral_password_hidden"
        )

        res = query.execute_query(payload)
        res_dict = res.model_dump()

        self.assertNotIn("password", res_dict)
        self.assertNotIn("ephemeral_password_hidden", str(res_dict))
        self.assertNotIn("username", res_dict)

    # 21. Existing Catalog endpoints still work
    def test_21_existing_catalog_endpoints_still_work(self):
        all_datasets = datasets.get_datasets()
        self.assertIsInstance(all_datasets, list)

        filtered = datasets.get_datasets(source_id=self.test_source_id)
        self.assertIsInstance(filtered, list)
        self.assertTrue(any(d["id"] == self.test_dataset_id for d in filtered))

        single = datasets.get_dataset(self.test_dataset_id)
        self.assertEqual(single["id"], self.test_dataset_id)
        self.assertEqual(single["table_name"], "ORDER_FACT")
        self.assertIn("columns", single)

    # 22. Existing metadata sync still works
    @patch("backend.app.routes.sources.discover_source_metadata")
    def test_22_existing_metadata_sync_still_works(self, mock_discover):
        from connectors.base import MetadataDiscoveryResult, TableMetadata, ColumnMetadata
        mock_discover.return_value = MetadataDiscoveryResult(
            success=True,
            databases_discovered=1,
            schemas_discovered=1,
            tables_discovered=1,
            columns_discovered=1,
            tables=[
                TableMetadata(
                    database="RETAIL_ANALYTICS",
                    schema="SALES",
                    name="ORDER_FACT",
                    table_type="TABLE",
                    row_count=500,
                    bytes=16384,
                    columns=[
                        ColumnMetadata(name="ORDER_ID", data_type="NUMBER(38,0)", is_nullable=False, ordinal_position=1)
                    ]
                )
            ],
            message="Discovery complete"
        )

        response = sources.sync_source_metadata(source_id=self.test_source_id, payload=None)
        self.assertTrue(response["success"])
        self.assertEqual(response["tables_discovered"], 1)

    # 23. Existing source lifecycle still works
    def test_23_existing_source_lifecycle_still_works(self):
        all_sources = sources.get_sources()
        self.assertIsInstance(all_sources, list)
        self.assertTrue(any(s["id"] == self.test_source_id for s in all_sources))

        # Test disconnect
        disc_res = sources.disconnect_source(self.test_source_id)
        self.assertEqual(disc_res["status"], "disconnected")

    # 24. Existing pipeline endpoints still work
    def test_24_existing_pipeline_endpoints_still_work(self):
        runs = pipeline_runs.get_pipeline_runs()
        self.assertIsInstance(runs, list)
