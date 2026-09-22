"""
tests/eval/test_eval_harness.py

Pytest test wrapper for the Pi Analytics Copilot Evaluation Harness.
Runs evaluation benchmark across 120 questions and asserts >90% benchmark accuracy.
"""

import os
import sys
import unittest

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from tests.eval.eval_harness import run_evaluation_benchmark, BENCHMARK_QUESTIONS


class EvalHarnessTests(unittest.TestCase):
    """Automated evaluation harness unit tests."""

    def test_benchmark_suite(self):
        """Execute all 120 benchmark questions across 3 datasets and assert high accuracy."""
        summary = run_evaluation_benchmark(BENCHMARK_QUESTIONS)
        
        self.assertEqual(summary["total_questions"], 120)
        self.assertGreaterEqual(summary["overall_accuracy_pct"], 90.0)
        self.assertLess(summary["latency_ms"]["p50"], 50.0) # Local deterministic latency < 50ms
        
        # Verify all 3 datasets are evaluated
        self.assertIn("PI_ANALYTICS", summary["by_dataset"])
        self.assertIn("FINTECH", summary["by_dataset"])
        self.assertIn("WORKFORCE", summary["by_dataset"])

        # Verify all 3 tiers are present
        self.assertEqual(summary["by_tier"]["basic"]["total"], 45)
        self.assertEqual(summary["by_tier"]["medium"]["total"], 45)
        self.assertEqual(summary["by_tier"]["tricky"]["total"], 30)

        # Ensure no unexpected error outcomes
        self.assertEqual(summary["outcome_rates"]["ERROR"]["count"], 0)


if __name__ == "__main__":
    unittest.main()
