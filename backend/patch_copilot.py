from pathlib import Path

path = Path(r".\app\routes\copilot.py")
text = path.read_text(encoding="utf-8")

needle = '    if is_time_series and (len(detected_metrics) > 1 or (detected_metrics and is_count_intent)):'

insert = '''    # Explicit raw-record intent must always return a table.
    if is_record_request:
        all_col_names = [f'"{c["name"]}"' for c in tbl.get("columns", [])[:6]]
        cols_clause = ", ".join(all_col_names) if all_col_names else "*"
        return (
            f'SELECT {cols_clause} FROM {table_ref} LIMIT {limit};',
            {"type": "table", "title": f"Data from {table_name}", "xField": None, "yField": None}
        )

    # Count-by-dimension intent must use GROUP BY rather than scalar COUNT.
    if is_count_breakdown:
        mentioned_cat = _find_best_category_col(
            question,
            cols["category"] + cols["date"]
        )

        if mentioned_cat:
            alias = f"TOTAL_{table_name.upper()}_COUNT"
            sql = (
                f'SELECT "{mentioned_cat}", COUNT(*) AS "{alias}" '
                f'FROM {table_ref} '
                f'GROUP BY "{mentioned_cat}" '
                f'ORDER BY "{alias}" DESC LIMIT {limit};'
            )
            return (
                sql,
                {
                    "type": "bar",
                    "title": f'{table_name} Count by {mentioned_cat.replace("_", " ").title()}',
                    "xField": mentioned_cat,
                    "yField": alias,
                }
            )

'''

if needle not in text:
    raise SystemExit("ERROR: target time-series line not found")

text = text.replace(needle, insert + needle, 1)

path.write_text(text, encoding="utf-8")
print("Intent branches inserted successfully.")
