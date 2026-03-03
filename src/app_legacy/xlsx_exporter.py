from openpyxl import Workbook
from io import BytesIO
from typing import List, Dict, Any

def generate_xlsx(itemized_rows: List[Dict[str, Any]], scope_summary: Dict[str, Any]) -> BytesIO:
    wb = Workbook()

    # Sheet 1: Items
    ws1 = wb.active
    ws1.title = "Items"
    if itemized_rows:
        headers = list(itemized_rows[0].keys())
        ws1.append(headers)
        for row in itemized_rows:
            ws1.append([row.get(h, "") for h in headers])
    else:
        ws1.append(["No items parsed."])

    # Sheet 2: Scope Summary
    ws2 = wb.create_sheet(title="Scope Summary")
    if scope_summary:
        for k, v in scope_summary.items():
            ws2.append([k, v])
    else:
        ws2.append(["No summary."])

    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf
