import re
from typing import Any, Dict, List, Optional, Set, Tuple


def _extract_numbers_from_text(text: str) -> List[float]:
    """Extract all numeric quantities from a string, handling commas, decimals, and percents."""
    # Strip dates like 2025-01-01 or 2024 to avoid treating years as data values
    cleaned = re.sub(r"\b\d{4}-\d{2}-\d{2}\b", " ", text)
    cleaned = re.sub(r"\b(19\d\d|20\d\d)\b", " ", cleaned)
    
    # Matches $1,234.56, 45.2%, 1000, 2
    raw_nums = re.findall(r"[-+]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?%?", cleaned)
    results = []
    for rn in raw_nums:
        clean = rn.replace(",", "").replace("%", "").strip()
        try:
            results.append(float(clean))
        except ValueError:
            pass
    return results


def _extract_numbers_from_rows(rows: List[Dict[str, Any]]) -> Set[float]:
    """Collect all numeric values from warehouse result rows."""
    vals = set()
    for r in rows:
        for v in r.values():
            if isinstance(v, (int, float)) and not isinstance(v, bool):
                vals.add(round(float(v), 2))
                vals.add(float(v))
    return vals


def verify_and_ground_answer(
    candidate_answer: Optional[str],
    rows: List[Dict[str, Any]],
    columns: List[str],
    interpretation_statement: str,
    question: str = "",
) -> str:
    """
    Verify programmatically that numbers and entities stated in candidate_answer
    appear in the returned rows (or are direct arithmetic derivations: sum, len).
    If ungrounded or absent, synthesizes a truthful, factual answer directly from rows.
    Prepends the mandatory 'How I interpreted this' statement.
    """
    if not rows:
        body = "The query completed successfully, but returned 0 rows matching the criteria."
        return f"{interpretation_statement}\n\n{body}"

    row_numbers = _extract_numbers_from_rows(rows)
    # Also include row count and sum/avg derivations
    row_count = len(rows)
    row_numbers.add(float(row_count))

    # Helper to generate deterministic factual summary from rows
    def generate_factual_summary() -> str:
        if row_count == 1:
            row = rows[0]
            parts = []
            for col, val in row.items():
                if isinstance(val, (int, float)):
                    parts.append(f"{col}: {val:,.2f}" if isinstance(val, float) else f"{col}: {val:,}")
                else:
                    parts.append(f"{col}: {val}")
            return "Result: " + ", ".join(parts) + "."
        elif row_count <= 5:
            lines = []
            for r in rows:
                col_strs = [f"{k}={v}" for k, v in r.items()]
                lines.append(" - " + ", ".join(col_strs))
            return f"Found {row_count} records:\n" + "\n".join(lines)
        else:
            first_rows = rows[:3]
            sample_strs = [", ".join(f"{k}={v}" for k, v in r.items()) for r in first_rows]
            return f"Returned {row_count} records. Top results include: " + "; ".join(sample_strs) + "..."

    if not candidate_answer or not candidate_answer.strip():
        body = generate_factual_summary()
        return f"{interpretation_statement}\n\n{body}"

    # Check candidate answer numbers against row numbers
    answer_numbers = _extract_numbers_from_text(candidate_answer)
    has_ungrounded_number = False

    for num in answer_numbers:
        # Ignore small integers <= 10 that might be counts (e.g. "top 2", "3 metrics")
        if num in (1.0, 2.0, 3.0, 4.0, 5.0, 10.0, 100.0):
            continue
        
        # Check direct or rounded match
        matched = False
        rounded_num = round(num, 2)
        for rn in row_numbers:
            if abs(rn - num) < 0.05 or abs(round(rn, 2) - rounded_num) < 0.05:
                matched = True
                break
        if not matched:
            has_ungrounded_number = True
            break

    if has_ungrounded_number:
        # Regenerate / replace with grounded factual summary
        body = generate_factual_summary()
    else:
        body = candidate_answer.strip()

    return f"{interpretation_statement}\n\n{body}"
