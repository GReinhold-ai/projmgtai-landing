# app/toon.py
import re
from typing import List, Dict, Any, Tuple


ToonRow = Dict[str, Any]
ToonSchema = List[str]

DEFAULT_SEP = ";"


def _escape_field(raw: Any, sep: str = DEFAULT_SEP) -> str:
    """Escape a single field for TOON."""
    s = "" if raw is None else str(raw)
    needs_quote = (
        sep in s
        or "\n" in s
        or "\r" in s
        or '"' in s
        or s.startswith("#")
    )
    if not needs_quote:
        return s
    return '"' + s.replace('"', '""') + '"'


def _unescape_field(s: str) -> str:
    """Unescape a single TOON field back to plain string."""
    if len(s) >= 2 and s.startswith('"') and s.endswith('"'):
        inner = s[1:-1]
        return inner.replace('""', '"')
    return s


def encode_toon(rows: List[ToonRow], schema: ToonSchema, sep: str = DEFAULT_SEP) -> str:
    """
    JSON[] -> TOON string

    Header format:
        #TOON v=1 sep=; cols=item,qty,length,width,room
    """
    header = f"#TOON v=1 sep={sep} cols={','.join(schema)}"
    body_lines: List[str] = []
    for row in rows:
        parts = [_escape_field(row.get(k), sep) for k in schema]
        body_lines.append(sep.join(parts))
    return header + "\n" + "\n".join(body_lines)


def _parse_header(header: str) -> Tuple[ToonSchema, str]:
    """
    Parse header line into (schema, sep).

    Example header:
        #TOON v=1 sep=; cols=item,qty,length,width,room
    """
    cols_match = re.search(r"cols=([^\s]+)", header)
    sep_match = re.search(r"sep=([^\s]+)", header)
    if not cols_match or not sep_match:
        raise ValueError("Malformed TOON header")
    schema_str = cols_match.group(1)
    sep = sep_match.group(1)
    schema = schema_str.split(",")
    return schema, sep


def _split_line(line: str, sep: str) -> List[str]:
    """
    Split a line into fields, respecting quotes and escaped quotes.
    Assumes 1-character separator (e.g. ';').
    """
    fields: List[str] = []
    cur = []
    in_quotes = False
    i = 0
    while i < len(line):
        c = line[i]
        if in_quotes:
            if c == '"':
                # possible escaped quote
                if i + 1 < len(line) and line[i + 1] == '"':
                    cur.append('"')
                    i += 1
                else:
                    in_quotes = False
            else:
                cur.append(c)
            i += 1
            continue

        if c == '"':
            in_quotes = True
            i += 1
            continue

        if len(sep) == 1 and c == sep:
            fields.append("".join(cur))
            cur = []
        else:
            cur.append(c)
        i += 1

    fields.append("".join(cur))
    return [_unescape_field(f) for f in fields]


def decode_toon(toon: str) -> List[ToonRow]:
    """
    TOON string -> JSON[]

    Raises ValueError if header is missing/invalid.
    """
    if not toon:
        raise ValueError("Empty TOON string")

    lines = toon.replace("\r", "").split("\n")
    if not lines or not lines[0].startswith("#TOON"):
        raise ValueError("Invalid TOON header")

    header = lines[0]
    schema, sep = _parse_header(header)

    rows: List[ToonRow] = []
    for line in lines[1:]:
        line = line.strip()
        if not line:
            continue
        parts = _split_line(line, sep)
        obj: ToonRow = {}
        for i, key in enumerate(schema):
            obj[key] = parts[i] if i < len(parts) else ""
        rows.append(obj)

    return rows


def is_valid_toon(toon: str, expected_header: str) -> bool:
    """
    Guardrail: check that a TOON string starts with EXACT expected header.
    """
    if not toon:
        return False
    first_line = toon.replace("\r", "").split("\n")[0].strip()
    return first_line == expected_header.strip()


def estimate_savings(rows: List[ToonRow], schema: ToonSchema) -> Dict[str, Any]:
    """
    Rough token-savings estimator (characters as proxy).
    """
    import json
    json_str = json.dumps(rows)
    toon_str = encode_toon(rows, schema)
    json_chars = len(json_str)
    toon_chars = len(toon_str)
    saved_pct = 0
    if json_chars > 0:
        saved_pct = max(0, round((1 - toon_chars / json_chars) * 100))
    return {
        "jsonChars": json_chars,
        "toonChars": toon_chars,
        "savedPct": saved_pct,
    }
