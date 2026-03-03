# app/routes/parse_plans.py
from __future__ import annotations

import io
import json
import tempfile
from typing import Any, Dict, List

import pdfplumber
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status

from app.deps.gate import gate
from app.services.ocr import ocr_if_needed

router = APIRouter(prefix="/analyze", tags=["analyze"])


# -----------------------
# Helpers
# -----------------------
def _probe_has_text(pdf_bytes: bytes, sample_pages: int = 5) -> bool:
    """
    Quick probe for a text layer in the first few pages.
    """
    try:
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            for page in pdf.pages[:sample_pages]:
                txt = (page.extract_text() or "").strip()
                if txt:
                    return True
        return False
    except Exception:
        # If probing fails, treat as no text to trigger OCR
        return False


def _basic_pdf_stats(pdf_bytes: bytes) -> Dict[str, Any]:
    """
    Return lightweight stats useful for debugging & UX.
    """
    stats: Dict[str, Any] = {
        "page_count": 0,
        "pages_with_text": 0,
        "first_page_text_len": 0,
        "sample_first_page_text": "",
    }
    try:
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            stats["page_count"] = len(pdf.pages)
            pages_with_text = 0
            if pdf.pages:
                first_txt = (pdf.pages[0].extract_text() or "")
                stats["first_page_text_len"] = len(first_txt)
                stats["sample_first_page_text"] = first_txt[:1000]
            for p in pdf.pages:
                t = (p.extract_text() or "").strip()
                if t:
                    pages_with_text += 1
            stats["pages_with_text"] = pages_with_text
    except Exception as e:
        stats["error"] = f"Failed to open/read PDF for stats: {e}"
    return stats


def _parse_trades(trades_json: str) -> List[str]:
    try:
        trades = json.loads(trades_json or "[]")
        if not isinstance(trades, list) or not all(isinstance(x, str) for x in trades):
            raise ValueError("trades_json must be a JSON array of strings")
        return trades
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid trades_json: {e}",
        )


def _validate_upload(file: UploadFile, raw: bytes, max_mb: int = 40) -> None:
    if file.content_type != "application/pdf":
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Only application/pdf is supported",
        )
    if len(raw) > max_mb * 1024 * 1024:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"PDF too large (max {max_mb} MB)",
        )


# -----------------------
# Routes
# -----------------------
@router.post("/parse_plans")
async def parse_plans(
    file: UploadFile = File(...),
    trades_json: str = Form("[]"),
    gate_ctx: dict = Depends(gate),  # <- header gate (X-Plan, X-User-Id) or anon via ALLOW_ANON
):
    """
    GATED route. Use Swagger 'Authorize' (apiKey headers) or send headers from your client:
      - X-Plan: free|pro|...
      - X-User-Id: <user-id>

    Body (multipart/form-data):
      - file: PDF
      - trades_json: JSON array of strings, e.g. ["Millwork","Doors"]
    """
    raw = await file.read()
    _validate_upload(file, raw)
    trades = _parse_trades(trades_json)

    # Probe, OCR if needed, then parse
    had_text_before = _probe_has_text(raw)
    try:
        ocrd = ocr_if_needed(raw)  # resilient: returns original bytes if text already present
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=f"OCR error: {e}")

    has_text_after = _probe_has_text(ocrd)
    if not has_text_after:
        raise HTTPException(
            status_code=400,
            detail="PDF has no extractable text even after OCR. Please try a clearer scan.",
        )

    stats = _basic_pdf_stats(ocrd)

    # ---- Stub extraction (replace with your LLM/table/regex pipeline as you build it) ----
    # For now, we just echo minimal structure so the UI can render something deterministic.
    extracted: Dict[str, Any] = {
        "scopes": [
            {
                "trade": t,
                "items": [],  # to be populated by your real extractor
            }
            for t in trades
        ]
    }
    # --------------------------------------------------------------------------------------

    return {
        "meta": {
            "file_name": file.filename,
            "size_bytes": len(raw),
            "content_type": file.content_type,
            "user": gate_ctx.get("user"),
            "plan": gate_ctx.get("plan"),
            "had_text_before": had_text_before,
            "has_text_after": has_text_after,
        },
        "stats": stats,
        "extracted": extracted,
    }


@router.post("/parse_plans_v2")
async def parse_plans_v2(
    file: UploadFile = File(...),
    trades_json: str = Form("[]"),
):
    """
    UNGATED test route (no headers required).

    Body (multipart/form-data):
      - file: PDF
      - trades_json: JSON array of strings, e.g. ["Millwork","Doors"]
    """
    raw = await file.read()
    _validate_upload(file, raw)
    trades = _parse_trades(trades_json)

    had_text_before = _probe_has_text(raw)
    try:
        ocrd = ocr_if_needed(raw)
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=f"OCR error: {e}")

    has_text_after = _probe_has_text(ocrd)
    if not has_text_after:
        raise HTTPException(
            status_code=400,
            detail="PDF has no extractable text even after OCR. Please try a clearer scan.",
        )

    stats = _basic_pdf_stats(ocrd)

    # ---- Same stub extraction payload as gated route ----
    extracted: Dict[str, Any] = {
        "scopes": [
            {
                "trade": t,
                "items": [],
            }
            for t in trades
        ]
    }

    return {
        "meta": {
            "file_name": file.filename,
            "size_bytes": len(raw),
            "content_type": file.content_type,
            "had_text_before": had_text_before,
            "has_text_after": has_text_after,
        },
        "stats": stats,
        "extracted": extracted,
    }
