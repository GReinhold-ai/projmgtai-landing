/**
 * TOON: Tabular-Object Optimized Notation
 * Lightweight, column-ordered rows with a tiny header.
 *
 * Format:
 *   #TOON v=1 sep=; cols=item,qty,length,width,room
 *   Upper cabinet;4;36;12;Breakroom 204
 *   Base cabinet;2;48;24;Breakroom 204
 *
 * - First line starts with "#TOON" and declares version, separator, and column order.
 * - Fields are joined with the chosen separator (default ";").
 * - If a field contains separator/newline/#/quote, it is wrapped with double quotes,
 *   and quotes inside are doubled (" -> "").
 */

export type ToonRow = Record<string, string | number | boolean | null | undefined>;
export type ToonSchema = string[]; // ordered list of fields

const DEFAULT_SEP = ";";

/** Escape a single field for TOON */
function escapeField(raw: unknown, sep = DEFAULT_SEP): string {
  const s = raw === null || raw === undefined ? "" : String(raw);
  const needsQuote =
    s.includes(sep) ||
    s.includes("\n") ||
    s.includes("\r") ||
    s.includes('"') ||
    s.startsWith("#");

  if (!needsQuote) return s;
  return `"${s.replace(/"/g, '""')}"`;
}

/** Unescape a single TOON field back to plain string */
function unescapeField(s: string): string {
  if (s.startsWith('"') && s.endsWith('"')) {
    return s.slice(1, -1).replace(/""/g, '"');
  }
  return s;
}

/**
 * JSON[] -> TOON string
 *
 * @param rows   Array of row objects
 * @param schema Ordered list of keys (columns)
 * @param sep    Column separator (default ";")
 */
export function encodeToon(rows: ToonRow[], schema: ToonSchema, sep = DEFAULT_SEP): string {
  const header = `#TOON v=1 sep=${sep} cols=${schema.join(",")}`;
  const body = rows
    .map((r) => schema.map((k) => escapeField(r[k], sep)).join(sep))
    .join("\n");
  return `${header}\n${body}`;
}

/**
 * TOON string -> JSON[]
 *
 * Throws if the header is missing/invalid.
 */
export function decodeToon(toon: string): ToonRow[] {
  const lines = toon.replace(/\r/g, "").split("\n");
  if (lines.length === 0 || !lines[0].startsWith("#TOON")) {
    throw new Error("Invalid TOON header");
  }

  const header = lines[0];
  const colsMatch = header.match(/cols=([^\s]+)/);
  const sepMatch = header.match(/sep=([^\s]+)/);
  if (!colsMatch || !sepMatch) {
    throw new Error("Malformed TOON header");
  }

  const schema = colsMatch[1].split(",");
  const sep = sepMatch[1];

  // Split a line into fields, respecting quotes and escaped quotes
  function splitLine(line: string): string[] {
    const out: string[] = [];
    let cur = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const c = line[i];

      if (inQuotes) {
        if (c === '"') {
          if (line[i + 1] === '"') {
            cur += '"';
            i++; // skip escaped quote
          } else {
            inQuotes = false;
          }
        } else {
          cur += c;
        }
        continue;
      }

      if (c === '"') {
        inQuotes = true;
        continue;
      }

      // NOTE: sep currently assumed 1 char (e.g. ";")
      if (sep.length === 1 && c === sep) {
        out.push(cur);
        cur = "";
      } else {
        cur += c;
      }
    }

    out.push(cur);
    return out.map(unescapeField);
  }

  const rows: ToonRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const parts = splitLine(line);
    const obj: ToonRow = {};
    for (let j = 0; j < schema.length; j++) {
      obj[schema[j]] = parts[j] ?? "";
    }
    rows.push(obj);
  }

  return rows;
}

/**
 * Helper guardrail:
 * Check that a returned TOON string starts with the EXACT expected header.
 *
 * Use this right after an LLM call before trusting / decoding the output.
 */
export function isValidToon(toon: string, expectedHeader: string): boolean {
  if (!toon) return false;
  const firstLine = toon.replace(/\r/g, "").split("\n")[0]!.trim();
  return firstLine === expectedHeader.trim();
}

/**
 * Rough token-savings estimator (chars as proxy).
 * Not perfect, but good enough to see the win.
 */
export function estimateSavings(
  jsonRows: ToonRow[],
  schema: ToonSchema
): { jsonChars: number; toonChars: number; savedPct: number } {
  const json = JSON.stringify(jsonRows);
  const toon = encodeToon(jsonRows, schema);
  const jsonChars = json.length;
  const toonChars = toon.length;
  const savedPct = jsonChars
    ? Math.max(0, Math.round((1 - toonChars / jsonChars) * 100))
    : 0;

  return { jsonChars, toonChars, savedPct };
}
