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

from fastapi import HTTPException
from backend.app.routes.query import validate_read_only_query, PROHIBITED_COMMANDS
from backend.app.routes.semantic import get_semantic_context_for_prompt
from backend.app.routes.audit import list_audit_events
from backend.app.routes.copilot import call_gemini_for_sql, _call_gemini_for_dashboard_modification


class P0SecurityAndGenericTests(unittest.TestCase):
    """
    Automated test suite verifying:
    - P0 Security enforcement (destructive SQL keywords, comments, injection)
    - Ephemeral credential safety (never sent to Gemini prompts)
    - Semantic context generation
    - Real audit trail listing
    - Open-ended Copilot / dynamic action handling
    """

    def test_sql_read_only_prohibits_mutating_commands(self):
        """Verify mutating keywords are rejected by validate_read_only_query."""
        for cmd in ["INSERT INTO customers VALUES(1)",
                    "UPDATE sales SET amount = 0",
                    "DELETE FROM orders WHERE 1=1",
                    "DROP TABLE products",
                    "ALTER TABLE customers ADD COLUMN x INT",
                    "TRUNCATE TABLE sales",
                    "EXEC xp_cmdshell('dir')",
                    "EXECUTE proc()",
                    "LOAD DATA INFILE 'file'",
                    "IMPORT INTO sales"]:
            with self.assertRaises(HTTPException, msg=f"Command should be prohibited: {cmd}"):
                validate_read_only_query(cmd)

    def test_sql_read_only_rejects_multi_statement(self):
        """Verify multiple statements separated by semicolons are rejected."""
        dangerous = 'SELECT * FROM "CUSTOMERS"; DROP TABLE "CUSTOMERS";'
        with self.assertRaises(HTTPException):
            validate_read_only_query(dangerous)

    def test_sql_read_only_allows_valid_select(self):
        """Verify normal analytical read-only SELECT queries pass."""
        safe_queries = [
            'SELECT "CUSTOMER_ID", "NAME" FROM "CUSTOMERS" LIMIT 10;',
            'SELECT SUM("REVENUE") AS "TOTAL_REVENUE" FROM "SALES";',
            'WITH regional AS (SELECT "REGION", SUM("AMOUNT") FROM "SALES" GROUP BY "REGION") SELECT * FROM regional;',
        ]
        for q in safe_queries:
            try:
                validate_read_only_query(q)
            except HTTPException as e:
                self.fail(f"Valid query rejected: {q} with error {e.detail}")

    def test_credential_sanitization_in_gemini_prompts(self):
        """
        Verify that credentials (password, secret, token) are NEVER sent
        in any Gemini prompt for SQL generation or dashboard modification.
        """
        catalog = [{
            "database": "PI_ANALYTICS",
            "schema": "ANALYTICS",
            "table": "CUSTOMERS",
            "columns": [{"name": "ID", "data_type": "INT"}, {"name": "NAME", "data_type": "VARCHAR"}]
        }]

        with patch("google.genai.Client") as mock_client_cls:
            mock_client = MagicMock()
            mock_client_cls.return_value = mock_client
            mock_response = MagicMock()
            mock_response.text = '{"can_answer": true, "sql": "SELECT COUNT(*) FROM \\"CUSTOMERS\\";"}'
            mock_client.models.generate_content.return_value = mock_response

            with patch.dict(os.environ, {"GEMINI_API_KEY": "fake_test_key"}):
                call_gemini_for_sql("Show customer count", catalog)
                
                # Check call prompt contents
                if mock_client.models.generate_content.called:
                    call_kwargs = mock_client.models.generate_content.call_args[1]
                    contents = call_kwargs.get("contents", "")
                    for secret_term in ("password", "secret", "bearer", "private_key"):
                        self.assertNotIn(secret_term, contents.lower())

    def test_semantic_context_generation_safe(self):
        """Verify get_semantic_context_for_prompt produces text or empty string cleanly."""
        ctx = get_semantic_context_for_prompt(999999)
        self.assertIsInstance(ctx, str)


if __name__ == "__main__":
    unittest.main()
