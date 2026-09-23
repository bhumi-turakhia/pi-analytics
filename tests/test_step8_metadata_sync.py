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

from connectors.base import ColumnMetadata, TableMetadata, MetadataDiscoveryResult
from connectors.snowflake import SnowflakeConnector
from connectors import discover_source_metadata
from backend.app.database import engine
from backend.app.routes import sources, datasets, pipeline_runs
from backend.app.routes.sources import ConnectionTestPayload


class Step8MetadataSyncTests(unittest.TestCase):
    """
    Automated test suite covering all 18 requirements of Step 8:
    Real Snowflake Metadata & Catalog Ingestion.
    """

    @classmethod
    def setUpClass(cls):
        """Ensure test data source exists for testing."""
        with engine.begin() as conn:
            # Check or create a dedicated test data source
            result = conn.execute(
                text("SELECT id FROM data_sources WHERE name = 'Step8_Test_Snowflake_Source'")
            ).fetchone()
            if result:
                cls.test_source_id = result[0]
            else:
                ins = conn.execute(
                    text("""
                        INSERT INTO data_sources (name, source_type, created_at)
                        VALUES ('Step8_Test_Snowflake_Source', 'snowflake', CURRENT_TIMESTAMP)
                        RETURNING id
                    """)
                ).fetchone()
                cls.test_source_id = ins[0]

    @classmethod
    def tearDownClass(cls):
        """Clean up any isolated test datasets created during testing.
        The source may have already been deleted by test_18, so we use
        IF EXISTS / tolerant deletes."""
        with engine.begin() as conn:
            # Delete catalog_columns and datasets (may already be gone via cascade)
            conn.execute(
                text("DELETE FROM datasets WHERE source_id = :sid"),
                {"sid": cls.test_source_id}
            )
            # Delete pipeline runs for this source
            conn.execute(
                text("DELETE FROM pipeline_runs WHERE source_id = :sid"),
                {"sid": cls.test_source_id}
            )
            # Delete the test data source itself (no-op if test_18 already deleted it)
            conn.execute(
                text("DELETE FROM data_sources WHERE id = :sid"),
                {"sid": cls.test_source_id}
            )

    # 1. Metadata discovery success with mocked Snowflake connector
    @patch("snowflake.connector.connect")
    def test_01_metadata_discovery_success_mocked(self, mock_connect):
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_connect.return_value = mock_conn
        mock_conn.cursor.return_value.__enter__.return_value = mock_cursor

        # Mock TABLES query
        tables_data = [
            ("TEST_DB", "PUBLIC", "ORDERS", "BASE TABLE", 1500, 1048576, "Orders table"),
        ]
        # Mock COLUMNS query
        columns_data = [
            ("TEST_DB", "PUBLIC", "ORDERS", "ORDER_ID", "NUMBER(38,0)", "NO", 1, "Order primary key"),
            ("TEST_DB", "PUBLIC", "ORDERS", "AMOUNT", "FLOAT", "YES", 2, "Order total amount"),
        ]

        mock_cursor.fetchall.side_effect = [tables_data, columns_data]

        config = {
            "account_identifier": "mock.account",
            "username": "mock_user",
            "password": "mock_password",
            "database": "TEST_DB",
            "warehouse": "COMPUTE_WH",
        }

        result = SnowflakeConnector.discover_metadata(config)
        self.assertTrue(result.success)
        self.assertEqual(result.tables_discovered, 1)
        self.assertEqual(result.columns_discovered, 2)
        self.assertEqual(result.tables[0].name, "ORDERS")
        self.assertEqual(len(result.tables[0].columns), 2)

    # 2. Snowflake connection failure
    @patch("snowflake.connector.connect")
    def test_02_snowflake_connection_failure(self, mock_connect):
        mock_connect.side_effect = Exception("250001 (08001): Could not connect to Snowflake backend")

        config = {
            "account_identifier": "invalid.account",
            "username": "bad_user",
            "password": "bad_password",
        }

        result = SnowflakeConnector.discover_metadata(config)
        self.assertFalse(result.success)
        self.assertIn("Could not connect to Snowflake backend", result.error)

    # 3. Missing credentials
    def test_03_missing_credentials(self):
        result = SnowflakeConnector.discover_metadata({})
        self.assertFalse(result.success)
        self.assertIn("Missing required Snowflake credentials", result.message)

    # 4. Invalid/nonexistent source ID -> 404
    def test_04_invalid_source_id_returns_404(self):
        with self.assertRaises(HTTPException) as ctx:
            sources.sync_source_metadata(source_id=99999999, payload=None)
        self.assertEqual(ctx.exception.status_code, 404)

    # 5. Unsupported source type
    def test_05_unsupported_source_type(self):
        result = discover_source_metadata("salesforce", {})
        self.assertFalse(result.success)
        self.assertTrue(
            "not yet supported" in result.message.lower() or "only supported" in result.message.lower()
        )

    # 6. Successful metadata synchronization
    @patch("backend.app.routes.sources.discover_source_metadata")
    def test_06_successful_metadata_synchronization(self, mock_discover):
        mock_discover.return_value = MetadataDiscoveryResult(
            success=True,
            databases_discovered=1,
            schemas_discovered=1,
            tables_discovered=1,
            columns_discovered=2,
            tables=[
                TableMetadata(
                    database="SNOWFLAKE_TEST",
                    schema="ANALYTICS",
                    name="CUSTOMERS",
                    table_type="TABLE",
                    row_count=250,
                    bytes=8192,
                    comment="Test Customers table",
                    columns=[
                        ColumnMetadata(name="CUSTOMER_ID", data_type="INTEGER", is_nullable=False, ordinal_position=1, comment="Customer PK"),
                        ColumnMetadata(name="EMAIL", data_type="VARCHAR(255)", is_nullable=True, ordinal_position=2, comment="Customer email"),
                    ]
                )
            ],
            message="Discovery complete"
        )

        payload = ConnectionTestPayload(
            account_identifier="mock.account",
            username="mock_user",
            password="ephemeral_password",
        )

        response = sources.sync_source_metadata(source_id=self.test_source_id, payload=payload)
        self.assertTrue(response["success"])
        self.assertEqual(response["tables_discovered"], 1)
        self.assertEqual(response["columns_discovered"], 2)

    # 7. Dataset metadata is persisted
    def test_07_dataset_metadata_persisted(self):
        with engine.connect() as conn:
            ds = conn.execute(
                text("""
                    SELECT id, database_name, schema_name, table_name, table_type, row_count, size_bytes
                    FROM datasets
                    WHERE source_id = :sid AND table_name = 'CUSTOMERS'
                """),
                {"sid": self.test_source_id}
            ).fetchone()
            self.assertIsNotNone(ds)
            self.assertEqual(ds.database_name, "SNOWFLAKE_TEST")
            self.assertEqual(ds.schema_name, "ANALYTICS")
            self.assertEqual(ds.row_count, 250)
            self.assertEqual(ds.size_bytes, 8192)

    # 8. Column metadata is persisted
    def test_08_column_metadata_persisted(self):
        with engine.connect() as conn:
            cols = conn.execute(
                text("""
                    SELECT c.column_name, c.data_type, c.is_nullable, c.ordinal_position, c.comment
                    FROM catalog_columns c
                    JOIN datasets d ON c.dataset_id = d.id
                    WHERE d.source_id = :sid AND d.table_name = 'CUSTOMERS'
                    ORDER BY c.ordinal_position
                """),
                {"sid": self.test_source_id}
            ).fetchall()
            self.assertEqual(len(cols), 2)
            self.assertEqual(cols[0].column_name, "CUSTOMER_ID")
            self.assertFalse(cols[0].is_nullable)
            self.assertEqual(cols[1].column_name, "EMAIL")
            self.assertTrue(cols[1].is_nullable)

    # 9. Running metadata sync twice does not create duplicates (idempotency)
    @patch("backend.app.routes.sources.discover_source_metadata")
    def test_09_metadata_sync_idempotency_no_duplicates(self, mock_discover):
        mock_discover.return_value = MetadataDiscoveryResult(
            success=True,
            databases_discovered=1,
            schemas_discovered=1,
            tables_discovered=1,
            columns_discovered=2,
            tables=[
                TableMetadata(
                    database="SNOWFLAKE_TEST",
                    schema="ANALYTICS",
                    name="CUSTOMERS",
                    table_type="TABLE",
                    row_count=250,
                    bytes=8192,
                    comment="Test Customers table",
                    columns=[
                        ColumnMetadata(name="CUSTOMER_ID", data_type="INTEGER", is_nullable=False, ordinal_position=1, comment="Customer PK"),
                        ColumnMetadata(name="EMAIL", data_type="VARCHAR(255)", is_nullable=True, ordinal_position=2, comment="Customer email"),
                    ]
                )
            ],
            message="Discovery complete"
        )

        # Run sync a second time
        response = sources.sync_source_metadata(source_id=self.test_source_id, payload=None)
        self.assertTrue(response["success"])

        # Verify exact counts in PostgreSQL
        with engine.connect() as conn:
            ds_count = conn.execute(
                text("SELECT COUNT(*) FROM datasets WHERE source_id = :sid AND table_name = 'CUSTOMERS'"),
                {"sid": self.test_source_id}
            ).scalar()
            self.assertEqual(ds_count, 1)

            col_count = conn.execute(
                text("""
                    SELECT COUNT(*) FROM catalog_columns c
                    JOIN datasets d ON c.dataset_id = d.id
                    WHERE d.source_id = :sid AND d.table_name = 'CUSTOMERS'
                """),
                {"sid": self.test_source_id}
            ).scalar()
            self.assertEqual(col_count, 2)

    # 10. Existing metadata is updated rather than duplicated
    @patch("backend.app.routes.sources.discover_source_metadata")
    def test_10_existing_metadata_updated_on_re_sync(self, mock_discover):
        # Update row count and add comment
        mock_discover.return_value = MetadataDiscoveryResult(
            success=True,
            databases_discovered=1,
            schemas_discovered=1,
            tables_discovered=1,
            columns_discovered=2,
            tables=[
                TableMetadata(
                    database="SNOWFLAKE_TEST",
                    schema="ANALYTICS",
                    name="CUSTOMERS",
                    table_type="TABLE",
                    row_count=5000,
                    bytes=1048576,
                    comment="Updated Customers table comment",
                    columns=[
                        ColumnMetadata(name="CUSTOMER_ID", data_type="BIGINT", is_nullable=False, ordinal_position=1, comment="Updated PK"),
                        ColumnMetadata(name="EMAIL", data_type="VARCHAR(320)", is_nullable=False, ordinal_position=2, comment="Verified email"),
                    ]
                )
            ],
            message="Discovery complete"
        )

        response = sources.sync_source_metadata(source_id=self.test_source_id, payload=None)
        self.assertTrue(response["success"])

        with engine.connect() as conn:
            ds = conn.execute(
                text("SELECT row_count, size_bytes FROM datasets WHERE source_id = :sid AND table_name = 'CUSTOMERS'"),
                {"sid": self.test_source_id}
            ).fetchone()
            self.assertEqual(ds.row_count, 5000)
            self.assertEqual(ds.size_bytes, 1048576)

            col = conn.execute(
                text("""
                    SELECT c.data_type, c.is_nullable, c.comment
                    FROM catalog_columns c
                    JOIN datasets d ON c.dataset_id = d.id
                    WHERE d.source_id = :sid AND d.table_name = 'CUSTOMERS' AND c.column_name = 'EMAIL'
                """),
                {"sid": self.test_source_id}
            ).fetchone()
            self.assertEqual(col.data_type, "VARCHAR(320)")
            self.assertFalse(col.is_nullable)
            self.assertEqual(col.comment, "Verified email")

    # 11. Credentials are not persisted in database
    def test_11_credentials_not_persisted(self):
        with engine.connect() as conn:
            if conn.engine.dialect.name == "sqlite":
                col_names = [c[1].lower() for c in conn.execute(text("PRAGMA table_info(data_sources)")).fetchall()]
            else:
                cols = conn.execute(
                    text("""
                        SELECT table_name, column_name
                        FROM information_schema.columns
                        WHERE table_name IN ('data_sources', 'datasets', 'catalog_columns')
                    """)
                ).fetchall()
                col_names = [c.column_name.lower() for c in cols]
            self.assertNotIn("password", col_names)
            self.assertNotIn("secret", col_names)
            self.assertNotIn("token", col_names)

    # 12. Credentials are not returned in API responses
    @patch("backend.app.routes.sources.discover_source_metadata")
    def test_12_credentials_not_returned_in_api_responses(self, mock_discover):
        mock_discover.return_value = MetadataDiscoveryResult(
            success=True,
            databases_discovered=1,
            schemas_discovered=1,
            tables_discovered=1,
            columns_discovered=1,
            tables=[],
            message="OK"
        )

        payload = ConnectionTestPayload(
            account_identifier="test.account",
            username="test_user",
            password="super_secret_password_123",
        )

        res = sources.sync_source_metadata(source_id=self.test_source_id, payload=payload)
        res_str = str(res)
        self.assertNotIn("super_secret_password_123", res_str)
        self.assertNotIn("password", res)

    # 13. GET /api/datasets/ still works
    def test_13_get_datasets_works(self):
        res = datasets.get_datasets(source_id=self.test_source_id)
        self.assertIsInstance(res, list)
        self.assertGreaterEqual(len(res), 1)
        first = res[0]
        self.assertIn("columns", first)
        self.assertIn("table_name", first)
        self.assertIn("database_name", first)

    # 14. GET /api/datasets/{id} works
    def test_14_get_dataset_by_id_works(self):
        # Fetch an existing dataset id
        with engine.connect() as conn:
            ds_id = conn.execute(
                text("SELECT id FROM datasets WHERE source_id = :sid LIMIT 1"),
                {"sid": self.test_source_id}
            ).scalar()

        res = datasets.get_dataset(dataset_id=ds_id)
        self.assertEqual(res["id"], ds_id)
        self.assertIn("columns", res)
        self.assertIsInstance(res["columns"], list)

    # 15. Existing source endpoints still work
    def test_15_existing_source_endpoints_work(self):
        # GET /api/sources/
        all_sources = sources.get_sources()
        self.assertIsInstance(all_sources, list)
        self.assertTrue(any(s["id"] == self.test_source_id for s in all_sources))

        # POST /api/sources/{id}/sync
        sync_res = sources.sync_source(source_id=self.test_source_id)
        self.assertEqual(sync_res["status"], "healthy")
        self.assertIsNotNone(sync_res["last_sync_at"])

        # POST /api/sources/{id}/test-connection
        test_conn_res = sources.test_existing_source_connection(
            source_id=self.test_source_id,
            payload=None
        )
        self.assertIn("success", test_conn_res)
        self.assertEqual(test_conn_res["source_id"], self.test_source_id)

    # 16. Existing pipeline-run endpoints still work
    def test_16_existing_pipeline_runs_work(self):
        runs = pipeline_runs.get_pipeline_runs()
        self.assertIsInstance(runs, list)
        self.assertGreaterEqual(len(runs), 1)
        self.assertTrue(any(r["source_id"] == self.test_source_id for r in runs))

    # 17. Existing disconnect/delete lifecycle still works
    def test_17_disconnect_delete_lifecycle_works(self):
        # Create an isolated temporary source
        with engine.begin() as conn:
            temp_id = conn.execute(
                text("INSERT INTO data_sources (name, source_type, created_at) VALUES ('Temp_Lifecycle_Test', 'snowflake', CURRENT_TIMESTAMP) RETURNING id")
            ).scalar()

        # Disconnect it
        disc_res = sources.disconnect_source(source_id=temp_id)
        self.assertEqual(disc_res["status"], "disconnected")

        # Delete it (no child datasets, so delete succeeds)
        del_res = sources.delete_source(source_id=temp_id)
        self.assertEqual(del_res["status"], "success")

    # 18. Cascade deletion: deleting a source also removes its datasets and pipeline_runs
    def test_18_cascade_delete_removes_dependents(self):
        """
        Deleting a data source that has referencing datasets and pipeline_runs
        must now succeed by cascade-deleting all dependent app metadata records.
        Real Snowflake data is never touched.
        """
        # Create an isolated source with a dataset and pipeline run
        with engine.begin() as conn:
            cascade_id = conn.execute(
                text("""
                    INSERT INTO data_sources (name, source_type, created_at)
                    VALUES ('Temp_Cascade_Delete_Test', 'snowflake', CURRENT_TIMESTAMP)
                    RETURNING id
                """)
            ).scalar()

            conn.execute(
                text("""
                    INSERT INTO datasets (source_id, database_name, schema_name, table_name, table_type)
                    VALUES (:sid, 'TEST_DB', 'PUBLIC', 'ORDERS', 'TABLE')
                """),
                {"sid": cascade_id}
            )

            conn.execute(
                text("""
                    INSERT INTO pipeline_runs (source_id, status, started_at, completed_at, rows_processed)
                    VALUES (:sid, 'SUCCESS', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1)
                """),
                {"sid": cascade_id}
            )

        # Deletion must succeed (not raise 409)
        del_res = sources.delete_source(source_id=cascade_id)
        self.assertEqual(del_res["status"], "success")
        self.assertIn("cleaned_up", del_res)
        self.assertEqual(del_res["cleaned_up"]["datasets_deleted"], 1)
        self.assertEqual(del_res["cleaned_up"]["pipeline_runs_deleted"], 1)

        # Verify source no longer exists in PostgreSQL
        with engine.connect() as conn:
            remaining = conn.execute(
                text("SELECT id FROM data_sources WHERE id = :sid"),
                {"sid": cascade_id}
            ).fetchone()
            self.assertIsNone(remaining)

            # Verify datasets were removed
            ds_remaining = conn.execute(
                text("SELECT COUNT(*) FROM datasets WHERE source_id = :sid"),
                {"sid": cascade_id}
            ).scalar()
            self.assertEqual(ds_remaining, 0)

            # Verify pipeline_runs were removed
            runs_remaining = conn.execute(
                text("SELECT COUNT(*) FROM pipeline_runs WHERE source_id = :sid"),
                {"sid": cascade_id}
            ).scalar()
            self.assertEqual(runs_remaining, 0)


if __name__ == "__main__":
    unittest.main()
