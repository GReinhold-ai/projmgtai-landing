# app/services/ocr.py
"""
Auto-OCR helper for scanned PDFs.

Primary behavior:
- Quickly probe whether a PDF already has extractable text.
- If not, run OCR with ocrmypdf (pdfium backend is Windows-friendly).
- Return OCR'd bytes (or the original bytes if OCR not needed).

Requirements (install in your venv):
    pip install ocrmypdf pdfium-binaries pikepdf pdfplumber pypdf

Notes:
- We intentionally use the `--use-pdfium` switch to avoid external Ghostscript deps.
- If `ocrmypdf` is not installed or fails, we raise a clear RuntimeError.
"""

from __future__ import annotations

import io
import os
import shutil
import subprocess
import tempfile
from typing import Optional

import pdfplumber


def _has_text(path_or_bytes: str | bytes, sample_pages: int = 5) -> bool:
    """
    Probe the first few pages for extractable text.
    Accepts either a filesystem path (str) or raw PDF bytes (bytes).
    """
    try:
        if isinstance(path_or_bytes, bytes):
            fp = io.BytesIO(path_or_bytes)
            should_close = True
        else:
            fp = path_or_bytes  # type: ignore[assignment]
            should_close = False

        with pdfplumber.open(fp) as pdf:
            for page in pdf.pages[:sample_pages]:
                txt = (page.extract_text() or "").strip()
                if txt:
                    return True
        return False
    except Exception:
        # If probing fails for any reason, err on the side of forcing OCR later
        return False
    finally:
        # BytesIO will be closed by context manager; file path handled by pdfplumber
        pass


def _ensure_ocrmypdf_available() -> Optional[str]:
    """
    Verify that 'ocrmypdf' is available on PATH.
    Returns the absolute path if found; otherwise None.
    """
    return shutil.which("ocrmypdf")


def ocr_if_needed(src_bytes: bytes, timeout_sec: int = 300) -> bytes:
    """
    If the PDF has no text layer, run OCR with ocrmypdf and return the OCR'd bytes.
    Otherwise, return the original bytes unchanged.

    Raises:
        RuntimeError: when OCR is required but ocrmypdf is missing or fails.
    """
    # Fast path: already has text?
    if _has_text(src_bytes):
        return src_bytes

    ocrmypdf_path = _ensure_ocrmypdf_available()
    if not ocrmypdf_path:
        raise RuntimeError(
            "ocrmypdf is not installed or not on PATH. "
            "Install with: pip install ocrmypdf pdfium-binaries pikepdf"
        )

    # Work in a temp dir to avoid disk clutter
    with tempfile.TemporaryDirectory() as td:
        src = os.path.join(td, "in.pdf")
        dst = os.path.join(td, "out.pdf")

        with open(src, "wb") as f:
            f.write(src_bytes)

        # Build command:
        # --skip-text: don't OCR pages that already contain text
        # --force-ocr: ensure OCR layer is produced on scanned pages
        # --use-pdfium: Windows-friendly rasterization backend
        # --optimize 0: keep it fast; adjust later if needed
        cmd = [
            ocrmypdf_path,
            "--skip-text",
            "--force-ocr",
            "--use-pdfium",
            "--optimize", "0",
            "--quiet",
            src,
            dst,
        ]

        try:
            res = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=timeout_sec,
                check=False,
            )
        except subprocess.TimeoutExpired:
            raise RuntimeError(f"OCR timed out after {timeout_sec}s")

        if res.returncode != 0 or not os.path.exists(dst):
            # Surface any stderr/stdout for debugging
            msg = res.stderr.strip() or res.stdout.strip() or "unknown error"
            raise RuntimeError(f"OCR failed: {msg}")

        with open(dst, "rb") as f:
            out_bytes = f.read()

    # Sanity-check that OCR helped (don’t fail hard if not; upstream route will re-probe)
    # If for some reason OCR didn’t add text but produced a valid PDF, we still return it.
    return out_bytes
