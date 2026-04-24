// app/scope-extractor/finish-schedule-parser.ts
//
// v14.9.x addition — Finish Schedule Parser
//
// Extracts structured millwork scope from architectural Finish Schedule pages
// (typically sheets FS.1, FS.2, FS.3 in commercial/senior-living projects).
//
// Finish schedules list every room with finish codes per surface (Floor/Base/Walls/
// Counters/Millwork/Ceilings). These pages contain a massive portion of the project's
// millwork scope in structured tabular form — far more than can be extracted from
// individual elevation sheets.
//
// Also extracts the finish legend (material spec pages, typically FS.4, FS.5) to
// cross-reference codes to their manufacturer/product/color details.
//
// Tested against: 24HR Fitness Ventura, 24HR Fitness Navajo, Menifee Lakes Well Quest.
//
// USAGE (standalone, no external dependencies):
//   import { parseFinishSchedule, buildFinishScheduleItems } from "./finish-schedule-parser";
//   const fs = parseFinishSchedule(allPageText);    // returns rooms + legend
//   const items = buildFinishScheduleItems(fs);     // returns item rows for Excel merge

// ─────────────────────────────────────────────────────────────────
// Code prefix catalog — expanded vs v14.9.31 material legend regex
// ─────────────────────────────────────────────────────────────────
// v14.9.31 only recognized: PL, SS, FB, 3F, WD, GL, RB, MEL, ALM, WC, ST, MR, QZ, GR, COR, LN
// Expanded here to cover senior-living and multifamily finishes:
//   Floor: LVP, CPT, CT, VCT, EPOXY, SC, SV, RF, SF, WD
//   Base: WD, VB, CT
//   Walls: PT, WC, FRP, ST, CT, CM, CH
//   Counters: QZ, SS, GR
//   Millwork: AF, RC, PL, FM, WD
//   Ceilings: PT, AF, CM
//   Hardware: HW, PF
//   Stain/finish: STA
//   Wallbase: MR (mirror)

const CODE_PREFIXES = [
  // Hyphenated-code prefixes (must be followed by -digit+optional letter)
  "LVP", "CPT", "VCT", "STA",
  "WC", "AF", "RC", "PL",
  "CT", "PT", "WD", "QZ", "SS", "GR", "CM", "CH",
  "MR", "FM", "ST", "SV", "VB", "HW", "SF", "PF",
] as const;

// Bare codes (no hyphen, full word) — EPOXY, FRP, SC (sealed concrete)
// And WD without hyphen is also used as bare wood-base.
const CODE_RE = new RegExp(
  "(?:" + CODE_PREFIXES.join("|") + ")" +
  "-\\d+(?:[A-Z](?=[^A-Z]|$))?" +  // hyphen+digit(s)+optional single letter
  "|EPOXY|FRP|SC(?=\\b)|WD(?!-)",  // bare codes
  "g"
);

// Room number at start of row: "101", "101B" (with trailing space), "103A", "S1", "VESTIBULE", "ELEVATORS"
const ROOM_NUM_RE = /^(\d+[A-Z](?=\s)|\d+|S\d+|VESTIBULE|ELEVATORS)/;

// Category prefixes — drives downstream item_type assignment
const COUNTER_PREFIXES = new Set(["QZ", "SS", "GR"]);
const MILLWORK_PREFIXES = new Set(["AF", "RC", "PL", "FM"]);

// Header lines we want to skip while merging continuation lines
const HEADER_KEYWORDS = [
  "FINISH SCHEDULE", "ROOM NAME", "FIRST FLOOR", "SECOND FLOOR", "THIRD FLOOR",
  "FOURTH FLOOR", "FIFTH FLOOR", "AL UNITS", "MC UNITS", "IL UNITS",
  "NORTH =", "COUNTER", "MILLWOR", "CEILINGS", "NOTES", "FLOOR BASE",
  "KEY", "GENERAL NOTES", "KCEILINGS", "ITEM NO", "SPECIFICATION",
  "ARCHITECTURAL FINISH",
];

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

export interface FinishScheduleRoom {
  roomNum: string;
  roomName: string;
  allCodes: string[];
  counters: string[];   // QZ/SS/GR codes seen in this row
  millwork: string[];   // AF/RC/PL/FM codes
  notes: string;
  sourcePage: number;
}

export interface FinishLegendEntry {
  code: string;        // e.g. "AF-3"
  manufacturer: string;
  pattern?: string;
  color?: string;
  size?: string;
  material?: string;
  raw: string;         // full block text from legend
}

export interface FinishScheduleResult {
  rooms: FinishScheduleRoom[];
  legend: FinishLegendEntry[];
  schedulePages: number[];   // page numbers that looked like FS pages
  legendPages: number[];     // page numbers that looked like legend pages
}

export interface ParsedItem {
  room: string;              // "101 GREAT ROOM"
  item_type: string;
  description: string;
  section_id: string;
  qty: number;
  unit: string;
  material_code: string;
  material: string;
  sheet_ref: string;
  confidence: string;
  notes: string;
  _source: "finish_schedule";
}

// ─────────────────────────────────────────────────────────────────
// Page detection
// ─────────────────────────────────────────────────────────────────

function isFinishSchedulePage(text: string): boolean {
  // Case A: first page of a finish schedule — has the schedule header
  const first500 = text.substring(0, 500).toUpperCase();
  const hasHeader =
    /FINISH\s*SCHEDULE/i.test(first500) &&
    /ROOM\s*NAME/i.test(first500);
  if (hasHeader) return true;

  // Case B: continuation page — starts with a floor tag (e.g. "FIRST FLOOR - MC",
  // "SECOND FLOOR - AL", "THIRD FLOOR - AL") AND has many room-schedule-style rows
  const firstLines = text.substring(0, 200).toUpperCase();
  const hasFloorTag = /\b(FIRST|SECOND|THIRD|FOURTH|FIFTH)\s*FLOOR\s*-/.test(firstLines);
  if (!hasFloorTag) return false;

  // Count rows matching: "<room#> <ROOM NAME><codes...>"
  // Need at least 8 such rows to confidently call this a finish schedule page
  const lines = text.split("\n");
  let rowCount = 0;
  for (const line of lines) {
    // Room row pattern: starts with digits + optional letter, then caps, then a code
    if (/^(\d+[A-Z]?|S\d+)\s*[A-Z][A-Z&\/\s']+(?:LVP|CPT|VCT|CT|PT|WD|WC|AF|RC|PL|QZ|SS|EPOXY|FRP|SC)/.test(line.trim())) {
      rowCount++;
    }
  }
  return rowCount >= 8;
}

function isFinishLegendPage(text: string): boolean {
  const first500 = text.substring(0, 500).toUpperCase();
  // Legend pages start with "ITEM NO. SPECIFICATION" OR have consecutive "CODE\nMFR:" patterns
  return (
    /ITEM\s*NO\.?\s*SPECIFICATION/i.test(first500) ||
    /ARCHITECTURAL\s*FINISH/i.test(first500) ||
    (text.match(/\b(?:AF|RC|PL|CT|PT|WC|LVP|CPT)-?\d+[A-Z]?\s*MFR:/g) || []).length >= 3
  );
}

// ─────────────────────────────────────────────────────────────────
// Parse one finish-schedule row
// ─────────────────────────────────────────────────────────────────

function parseRow(row: string, sourcePage: number): FinishScheduleRoom | null {
  const m = row.match(ROOM_NUM_RE);
  if (!m) return null;

  const roomNum = m[1];
  const rest = row.substring(m[0].length);

  // Reset the regex state (global flag)
  CODE_RE.lastIndex = 0;
  const codeMatches: RegExpExecArray[] = [];
  let cm: RegExpExecArray | null;
  while ((cm = CODE_RE.exec(rest)) !== null) {
    codeMatches.push(cm);
  }
  if (codeMatches.length === 0) return null;

  const firstCodeStart = codeMatches[0].index;
  const roomName = rest.substring(0, firstCodeStart).trim();
  if (!roomName) return null;

  const allCodes = codeMatches.map(m => m[0]);

  // Trailing notes: after the last code
  const lastCode = codeMatches[codeMatches.length - 1];
  const afterLast = rest.substring(lastCode.index + lastCode[0].length);
  let notes = "";
  const notesMatch = afterLast.match(/^[\s/]*(\d+(?:\s*,\s*\d+)*)\s*$/);
  if (notesMatch) notes = notesMatch[1];

  // Categorize codes
  const counters: string[] = [];
  const millwork: string[] = [];
  for (const c of allCodes) {
    const prefix = c.includes("-") ? c.split("-")[0] : c;
    if (COUNTER_PREFIXES.has(prefix)) {
      if (!counters.includes(c)) counters.push(c);
    } else if (MILLWORK_PREFIXES.has(prefix)) {
      if (!millwork.includes(c)) millwork.push(c);
    }
  }

  return { roomNum, roomName, allCodes, counters, millwork, notes, sourcePage };
}

// ─────────────────────────────────────────────────────────────────
// Parse an entire finish schedule page
// ─────────────────────────────────────────────────────────────────

function parseFinishSchedulePage(text: string, pageNum: number): FinishScheduleRoom[] {
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);

  // Merge continuation lines (non-header lines that don't start with a room number)
  const rows: string[] = [];
  let current: string | null = null;

  for (const line of lines) {
    const upper = line.toUpperCase().substring(0, 30);
    const isHeader = HEADER_KEYWORDS.some(h => upper.includes(h));
    const startsWithRoomNum = ROOM_NUM_RE.test(line);

    if (startsWithRoomNum && !isHeader) {
      if (current) rows.push(current);
      current = line;
    } else if (current && !isHeader) {
      // Only merge if line looks like a continuation (starts with code or non-upper text)
      if (!/^[A-Z]{2,}/.test(line) || /^(?:PT|CT|WC|AF|RC|PL|LVP|CPT|QZ|SS|WD|VB|VCT)-/.test(line)) {
        current += " " + line;
      }
    }
  }
  if (current) rows.push(current);

  const parsed: FinishScheduleRoom[] = [];
  for (const row of rows) {
    const p = parseRow(row, pageNum);
    if (p) parsed.push(p);
  }
  return parsed;
}

// ─────────────────────────────────────────────────────────────────
// Parse finish legend entries (pages FS.4, FS.5)
// ─────────────────────────────────────────────────────────────────

function parseFinishLegendPage(text: string): FinishLegendEntry[] {
  // Legend structure:  CODE\nMFR:...\nCONTACT:...\nPATTERN:...\nCOLOR:...\n
  // Entries separated by next CODE on its own line
  // Also codes can be inline like "AF-1MFR:..." (no newline between code and MFR:)

  const entries: FinishLegendEntry[] = [];

  // Pattern 1: CODE followed by MFR: on same line or next
  // Use a regex that captures code + whole entry block (lazy until next code or EOL)
  const entryRe = /\b([A-Z]{1,4}-?\d+[A-Z]?|EPOXY|FRP|SC)(?=MFR:|\s*\nMFR:)\s*\nMFR:/gm;

  // Simpler approach: find all lines that look like "CODE" or "CODEMFR:"
  // then collect text until next code.
  const lines = text.split("\n");
  const codeHeaderRe = /^([A-Z]{1,4}-\d+[A-Z]?|EPOXY|FRP|SC)(MFR:.*)?$/;

  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    const m = line.match(codeHeaderRe);
    if (m && CODE_PREFIXES.includes(m[1].split("-")[0] as any)) {
      const code = m[1];
      const blockLines: string[] = [];
      if (m[2]) blockLines.push(m[2]);  // MFR:... inline
      i++;
      // Collect until next code-header
      while (i < lines.length) {
        const next = lines[i].trim();
        if (codeHeaderRe.test(next) && CODE_PREFIXES.includes(next.split("-")[0] as any)) break;
        if (next) blockLines.push(next);
        i++;
      }

      const raw = blockLines.join("\n");
      const entry: FinishLegendEntry = {
        code,
        manufacturer: (raw.match(/MFR:\s*([^\n]+?)(?=\s*CONTACT|\s*PATTERN|\s*COLOR|\s*$)/) || [])[1]?.trim() || "",
        pattern: (raw.match(/PATTERN:\s*([^\n]+)/) || [])[1]?.trim(),
        color: (raw.match(/COLOR:\s*([^\n]+)/) || [])[1]?.trim(),
        size: (raw.match(/SIZE:\s*([^\n]+)/) || [])[1]?.trim(),
        material: (raw.match(/MATERIAL:\s*([^\n]+)/) || [])[1]?.trim(),
        raw,
      };
      if (entry.manufacturer) entries.push(entry);
    } else {
      i++;
    }
  }

  return entries;
}

// ─────────────────────────────────────────────────────────────────
// Main entry: parse entire project text, find FS pages and legend
// ─────────────────────────────────────────────────────────────────

export function parseFinishSchedule(allPageText: string): FinishScheduleResult {
  // allPageText contains pages delimited by "--- PAGE N ---" or "--- PAGE N [TAG] ---"
  const pageSplitRe = /---\s*PAGE\s*(\d+)(?:\s*\[[^\]]*\])?\s*---/gi;

  const pages: { pageNum: number; text: string }[] = [];
  const splits = allPageText.split(pageSplitRe);
  // splits = ["", pageNum1, pageText1, pageNum2, pageText2, ...]
  for (let i = 1; i < splits.length; i += 2) {
    const pageNum = parseInt(splits[i], 10);
    const text = splits[i + 1] || "";
    if (pageNum && text.trim().length > 20) {
      pages.push({ pageNum, text });
    }
  }

  const rooms: FinishScheduleRoom[] = [];
  const legend: FinishLegendEntry[] = [];
  const schedulePages: number[] = [];
  const legendPages: number[] = [];

  console.log(`[FS-DIAG] pageSplitRe matched ${pages.length} pages`);
  if (pages.length === 0) {
    console.log(`[FS-DIAG] No pages matched. Input length=${allPageText.length}, `
      + `first 300 chars: ${allPageText.substring(0, 300).replace(/\n/g, '\\n')}`);
  } else {
    console.log(`[FS-DIAG] First page sample: page ${pages[0].pageNum}, `
      + `text length ${pages[0].text.length}, `
      + `first 200 chars: ${pages[0].text.substring(0, 200).replace(/\n/g, '\\n')}`);
  }

  for (const { pageNum, text } of pages) {
    const fsCheck = isFinishSchedulePage(text);
    const legCheck = isFinishLegendPage(text);
    if (!fsCheck && !legCheck) {
      // Show why — check which keywords were present in first 500 chars
      const first500 = text.substring(0, 500).toUpperCase();
      const flags = {
        FS: /FINISH\s*SCHEDULE/i.test(first500),
        RN: /ROOM\s*NAME/i.test(first500),
        WL: /WALLS/i.test(first500),
        MW: /MILLWOR/i.test(first500),
        IN: /ITEM\s*NO\.?\s*SPECIFICATION/i.test(first500),
        AF: /ARCHITECTURAL\s*FINISH/i.test(first500),
      };
      const preview = first500.substring(0, 120).replace(/\s+/g, ' ');
      console.log(`[FS-DIAG] Page ${pageNum} REJECTED: ${JSON.stringify(flags)} | ${preview}`);
    } else {
      console.log(`[FS-DIAG] Page ${pageNum} MATCHED: ${fsCheck ? 'schedule' : 'legend'}`);
    }
    if (fsCheck) {
      schedulePages.push(pageNum);
      const pageRooms = parseFinishSchedulePage(text, pageNum);
      rooms.push(...pageRooms);
    } else if (legCheck) {
      legendPages.push(pageNum);
      const pageEntries = parseFinishLegendPage(text);
      legend.push(...pageEntries);
    }
  }

  return { rooms, legend, schedulePages, legendPages };
}

// ─────────────────────────────────────────────────────────────────
// Convert finish-schedule rooms into item rows for the Excel
// ─────────────────────────────────────────────────────────────────

export function buildFinishScheduleItems(fs: FinishScheduleResult): ParsedItem[] {
  const legendMap = new Map<string, FinishLegendEntry>();
  for (const e of fs.legend) legendMap.set(e.code, e);

  const describeCode = (code: string): string => {
    const e = legendMap.get(code);
    if (!e) return code;
    const parts: string[] = [];
    if (e.manufacturer) parts.push(e.manufacturer);
    if (e.pattern) parts.push(e.pattern);
    if (e.color) parts.push(e.color);
    return parts.length ? `${code} — ${parts.join(" ")}` : code;
  };

  // item_type heuristic by prefix
  const itemTypeForCode = (code: string, role: "counter" | "millwork"): string => {
    const prefix = code.split("-")[0];
    if (role === "counter") return "countertop";
    // Millwork role:
    if (prefix === "RC") return "base_cabinet";    // RC = Residential Cabinet
    if (prefix === "PL") return "base_cabinet";    // PL = Plastic Laminate cabinet  
    if (prefix === "AF") return "decorative_panel"; // AF = Architectural Finish
    if (prefix === "FM") return "decorative_panel"; // FM = Framed Mirror
    return "decorative_panel";
  };

  const items: ParsedItem[] = [];
  for (const r of fs.rooms) {
    const roomLabel = `${r.roomNum} ${r.roomName}`.trim();
    const sheetRef = `FS.${fs.schedulePages.indexOf(r.sourcePage) + 1}`;

    // Countertop items
    for (const code of r.counters) {
      items.push({
        room: roomLabel,
        item_type: itemTypeForCode(code, "counter"),
        description: describeCode(code),
        section_id: "",
        qty: 1,
        unit: "EA",
        material_code: code,
        material: legendMap.get(code)?.manufacturer || "",
        sheet_ref: sheetRef,
        confidence: "medium",
        notes: r.notes ? `Per finish schedule; notes ${r.notes}` : "Per finish schedule",
        _source: "finish_schedule",
      });
    }

    // Millwork items
    for (const code of r.millwork) {
      items.push({
        room: roomLabel,
        item_type: itemTypeForCode(code, "millwork"),
        description: describeCode(code),
        section_id: "",
        qty: 1,
        unit: "EA",
        material_code: code,
        material: legendMap.get(code)?.manufacturer || "",
        sheet_ref: sheetRef,
        confidence: "medium",
        notes: r.notes ? `Per finish schedule; notes ${r.notes}` : "Per finish schedule",
        _source: "finish_schedule",
      });
    }
  }
  return items;
}
