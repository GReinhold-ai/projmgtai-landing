from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from openai import OpenAI

router = APIRouter(tags=["classify"])
client = OpenAI()  # uses OPENAI_API_KEY from environment


# ----------------------------
# Models
# ----------------------------

class ClassifyRequest(BaseModel):
    rows: List[Dict[str, Any]] = Field(default_factory=list)


class Update(BaseModel):
    key: str
    trade: str
    category: str


class ClassifyResult(BaseModel):
    updates: List[Update]


# ----------------------------
# Helpers
# ----------------------------

def _row_key(row: Dict[str, Any], idx: int) -> str:
    rid = row.get("id")
    if rid is not None and str(rid).strip():
        return str(rid).strip()
    return f"idx:{idx}"


def _row_text(row: Dict[str, Any]) -> str:
    # Give the model the best semantics without dumping the full dict
    parts: List[str] = []
    for k in ("description", "remarks", "item", "name", "notes"):
        v = row.get(k)
        if isinstance(v, str) and v.strip():
            parts.append(f"{k}: {v.strip()}")
    if not parts:
        parts.append("description: (missing)")
    return " | ".join(parts)


# ----------------------------
# Route
# ----------------------------

@router.post("/classify")
def classify(req: ClassifyRequest) -> Dict[str, Any]:
    if not req.rows:
        return {"rows": []}

    compact_rows = []
    for i, row in enumerate(req.rows):
        compact_rows.append(
            {
                "key": _row_key(row, i),
                "text": _row_text(row),
                "existing_trade": (row.get("trade") or "").strip(),
                "existing_category": (row.get("category") or "").strip(),
            }
        )

    system = (
        "You are a construction estimating assistant.\n"
        "Task: Classify ONLY Trade and Category for each WBS row.\n"
        "Rules:\n"
        "- Return an update for every input row (same count).\n"
        "- Do NOT add/remove rows.\n"
        "- Do NOT change qty/uom/description/remarks.\n"
        "- If trade/category are already good, repeat them.\n"
        "- If uncertain, choose the best reasonable trade/category based on text.\n"
        "Output must match the provided schema exactly."
    )

    user = (
        "Classify each row into:\n"
        "- trade: short trade label (e.g., MILLWORK, CASEWORK, FINISH CARPENTRY)\n"
        "- category: short category label (e.g., CABINETS, COUNTERTOPS, HARDWARE, INSTALL)\n\n"
        f"Rows:\n{compact_rows}"
    )

    try:
        resp = client.responses.parse(
            model="gpt-4o-mini",
            input=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            text_format=ClassifyResult,
            temperature=0,
        )
        parsed: ClassifyResult = resp.output_parsed  # type: ignore[attr-defined]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Classification failed: {e}")

    updates_by_key = {u.key: u for u in parsed.updates}

    merged_rows: List[Dict[str, Any]] = []
    for i, row in enumerate(req.rows):
        key = _row_key(row, i)
        upd = updates_by_key.get(key)

        # Fail-soft: if something is missing, keep row unchanged
        if upd is None:
            merged_rows.append(row)
            continue

        new_row = dict(row)
        new_row["trade"] = upd.trade
        new_row["category"] = upd.category
        merged_rows.append(new_row)

    return {"rows": merged_rows}
