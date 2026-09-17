import os
import sys
import unittest
from unittest.mock import MagicMock, patch
from typing import Dict, Any

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
BACKEND_DIR = os.path.join(PROJECT_ROOT, "backend")
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from sqlalchemy import text
from fastapi import HTTPException

from connectors.base import ConnectionTestResult
from connectors.snowflake import SnowflakeConnector
from connectors import test_source_connection
from backend.app.database import engine
from backend.app.routes import sources
from backend.app.routes.sources import ConnectionTestPayload


class Step7ConnectionTestTests(unittest.TestCase):
    """
    Automated test suite covering Step 7 Connection Testing for existing and unsaved sources:
    - Verifies real Snowflake connector dispatch
    - Verifies missing parameter handling
    - Verifies sanitized error reporting
    - Verifies non-sensitive telemetry (version, warehouse, database)
    - Verifies unsupported source handling (Salesforce)
    - Verifies zero credential persistence in PostgreSQL
    """

    @classmethod
    def setUpClass(cls):
        """Ensure isolated test data source exists for testing."""
        with engine.begin() as conn:
            result = conn.execute(
                text("SELECT id FROM data_sources WHERE name = 'Step7_Test_Snowflake_Source'")
            ).fetchone()
            if result:
                cls.test_source_id = result[0]
            else:
                ins = conn.execute(
                    text("""
                        INSERT INTO data_sources (name, source_type, created_at)
                        VALUES ('Step7_Test_Snowflake_Source', 'snowflake', CURRENT_TIMESTAMP)
                        RETURNING id
                    """)
                ).fetchone()
                cls.test_source_id = ins[0]

            # Also create a test Salesforce source if not present
            sf_result = conn.execute(
                text("SELECT id FROM data_sources WHERE name = 'Step7_Test_Salesforce_Source'")
            ).fetchone()
            if sf_result:
                cls.test_sf_source_id = sf_result[0]
            else:
                ins_sf = conn.execute(
                    text("""
                        INSERT INTO data_sources (name, source_type, created_at)
                        VALUES ('Step7_Test_Salesforce_Source', 'salesforce', CURRENT_TIMESTAMP)
                        RETURNING id
                    """)
                ).fetchone()
                cls.test_sf_source_id = ins_sf[0]

    @classmethod
    def tearDownClass(cls):
        """Clean up test data sources."""
        with engine.begin() as conn:
            conn.execute(
                text("DELETE FROM data_sources WHERE id IN (:sid, :sf_id)"),
                {"sid": cls.test_source_id, "sf_id": cls.test_sf_source_id}
            )

    # 1. Connection test success with mocked Snowflake connector
    @patch("snowflake.connector.connect")
    def test_01_snowflake_test_connection_success(self, mock_connect):
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_connect.return_value = mock_conn
        mock_conn.cursor.return_value.__enter__.return_value = mock_cursor

        # Mock SELECT CURRENT_VERSION(), CURRENT_WAREHOUSE(), CURRENT_DATABASE()
        mock_cursor.fetchone.return_value = ("8.14.2", "COMPUTE_WH", "RETAIL_ANALYTICS")

        payload = ConnectionTestPayload(
            account_identifier="xy94821.us-east-1",
            username="test_user",
            password="test_password_123",
            warehouse="COMPUTE_WH",
            database="RETAIL_ANALYTICS",
            role="DATA_ROLE",
        )

        response = sources.test_existing_source_connection(
            source_id=self.test_source_id,
            payload=payload
        )

        self.assertTrue(response["success"])
        self.assertEqual(response["source_id"], self.test_source_id)
        self.assertEqual(response["source_type"], "snowflake")
        self.assertIn("details", response)
        self.assertEqual(response["details"]["snowflake_version"], "8.14.2")
        self.assertEqual(response["details"]["warehouse"], "COMPUTE_WH")
        self.assertEqual(response["details"]["database"], "RETAIL_ANALYTICS")

    # 2. Missing credentials return required parameters error
    def test_02_missing_credentials_returns_error(self):
        payload = ConnectionTestPayload(
            warehouse="COMPUTE_WH",
            database="RETAIL_ANALYTICS",
        )

        response = sources.test_existing_source_connection(
            source_id=self.test_source_id,
            payload=payload
        )

        self.assertFalse(response["success"])
        self.assertIn("Required connection parameters were not supplied", response.get("error", ""))

    # 3. Invalid credentials produce sanitized failure
    @patch("snowflake.connector.connect")
    def test_03_invalid_credentials_sanitized_error(self, mock_connect):
        mock_connect.side_effect = Exception("250001 (08001): Authentication failed for user bad_user with password: secret_password_here")

        payload = ConnectionTestPayload(
            account_identifier="xy94821.us-east-1",
            username="bad_user",
            password="wrong_password",
        )

        response = sources.test_existing_source_connection(
            source_id=self.test_source_id,
            payload=payload
        )

        self.assertFalse(response["success"])
        # Verify secret_password_here was masked / sanitized
        self.assertNotIn("secret_password_here", response.get("error", ""))
        self.assertIn("Authentication failed", response.get("error", ""))

    # 4. Nonexistent source ID returns 404
    def test_04_nonexistent_source_id_returns_404(self):
        with self.assertRaises(HTTPException) as ctx:
            sources.test_existing_source_connection(
                source_id=99999999,
                payload=None
            )
        self.assertEqual(ctx.exception.status_code, 404)

    # 5. Salesforce source returns not yet supported
    def test_05_salesforce_testing_unsupported(self):
        response = sources.test_existing_source_connection(
            source_id=self.test_sf_source_id,
            payload=ConnectionTestPayload(username="sf_user", password="sf_password")
        )

        self.assertFalse(response["success"])
        self.assertIn("not yet supported", response.get("message", "").lower())

    # 6. Zero persistence: Verify no passwords or credentials were saved to PostgreSQL
    def test_06_zero_credential_persistence(self):
        with engine.connect() as conn:
            columns = [
                c[0] for c in conn.execute(
                    text("SELECT column_name FROM information_schema.columns WHERE table_name = 'data_sources'")
                )
            ]
            self.assertNotIn("password", columns)
            self.assertNotIn("secret", columns)
            self.assertNotIn("token", columns)

            row = conn.execute(
                text("SELECT name, source_type FROM data_sources WHERE id = :sid"),
                {"sid": self.test_source_id}
            ).fetchone()
            self.assertIsNotNone(row)
            self.assertEqual(row.name, "Step7_Test_Snowflake_Source")


if __name__ == "__main__":
    unittest.main()
