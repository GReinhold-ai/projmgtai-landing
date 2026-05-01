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
  const first500 = text.substring(0, 500).toUpperCase();
  // Original 3-rule detection: header keyword combinations
  if (
    /ITEM\s*NO\.?\s*SPECIFICATION/i.test(first500) ||
    /ARCHITECTURAL\s*FINISH/i.test(first500) ||
    (/FINISH\s*SCHEDULE/i.test(first500) &&
      /ROOM\s*NAME/i.test(first500) &&
      /WALLS/i.test(first500) &&
      /MILLWOR/i.test(first500))
  ) {
    return true;
  }

  // [v14.9.41] continuation page detection: header doesn't repeat
  // on pages 2/3 of multi-page schedules. Detect by content shape:
  // 3+ room-number anchors each followed by a finish code within
  // 200 chars (v14.10.8: was 80; widened to handle tile-heavy rows
  // like restrooms where wall-tile codes push millwork codes past
  // position 130).
  // [v14.9.42] phantom-room guard: legend pages have lots of
  // 'CODE-N MFR:' patterns that look like our anchor pattern,
  // so they were being misclassified as continuation pages.
  // Bail out early if this page tests positive as a legend page.
  if (isFinishLegendPage(text)) return false;

  const normalized = text.replace(/\s+/g, " ");
  const roomAnchorRe = /(?:^|[\s;])(\d{2,4}[A-Z]?|S\d+|VESTIBULE|ELEVATORS)\s+(?=[A-Z])/g;
  const codeProbeRe = /\b(?:AF|RC|PL|FM|QZ|SS|GR|LVP|CPT|VCT|MR|VB|CM)-\d/; // v14.10.7: dropped CT|PT|WD|WC|ST -- too generic, false-pos on plan pages
  let validAnchorHits = 0;
  let m: RegExpExecArray | null;
  while ((m = roomAnchorRe.exec(normalized)) !== null) {
    const window = normalized.substring(m.index, m.index + 200);  // v14.10.8: widened from 80
    if (codeProbeRe.test(window)) {
      validAnchorHits++;
      if (validAnchorHits >= 3) return true;
    }
  }

  return false;
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
  // v14.9.40c: Room-number-based row splitter.
  // Works on both pypdf (newline-separated) and pdf.js (space-concatenated) text.
  //
  // Strategy: normalize all whitespace to single spaces, then locate every
  // room-number pattern and split the text at those anchor points. Each
  // chunk [anchor, next-anchor) is a full row (room# + name + codes + notes).

  // Normalize: collapse all whitespace runs to single space
  const normalized = text.replace(/\s+/g, " ").trim();

  // Room-number anchor: digits+optional letter, preceded by space or start,
  // followed by space + UPPERCASE word (room name starts with a capital word).
  // Examples that match: " 101 GREAT", " 101B RECEPTION", " S1 STAIR", " VESTIBULE "
  //
  // Two anchor patterns combined:
  //  (a) digit-based rooms: \b\d{2,4}[A-Z]?\s+[A-Z] ...
  //  (b) special tokens: VESTIBULE, ELEVATORS, S\d (stair numbering)
  const anchorRe = /(?:^|[\s;])(\d{2,4}[A-Z]?|S\d+|VESTIBULE|ELEVATORS)\s+(?=[A-Z])/g;

  // Find all anchor positions
  const anchors: { roomNum: string; startIdx: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = anchorRe.exec(normalized)) !== null) {
    // m.index points to the leading whitespace OR start of string.
    // The actual room-num token starts at m.index + (m[0].length - m[1].length - trailing space)
    // Simpler: compute based on the full match.
    const fullMatch = m[0];
    const leading = fullMatch.length - m[1].length - 1;  // " " + roomNum + " " but last space is in lookahead
    // Account for anchor at start of string (no leading whitespace)
    const roomNumStart = m.index + (fullMatch.startsWith(m[1]) ? 0 : leading);
    anchors.push({ roomNum: m[1], startIdx: roomNumStart });
  }

  // Filter out false-positive anchors.
  // Valid row-anchor must satisfy:
  //   (1) Within 200 chars there's a finish code like AF-1, RC-1, etc.
  //       (v14.10.8: widened from 80; tile-heavy rooms like restrooms
  //       have CT-2/CT-3/CT-4/CT-5 wall codes pushing the millwork
  //       codes SS-1 and RC-1 past position 130. Probe regex itself
  //       is the false-positive defense, not the window size.)
  //   (2) No OTHER anchor appears before that code in the window.
  // This rejects things like "7100 Northland Circle" (no code) and
  // "2019 PROJECT 101 GREAT ROOM CT-1..." (101 appears before CT-1).
  const codeProbeRe = /\b(?:AF|RC|PL|FM|QZ|SS|GR|LVP|CPT|VCT|MR|VB|CM)-\d/; // v14.10.7: dropped CT|PT|WD|WC|ST -- too generic, false-pos on plan pages
  const anchorProbeRe = /(?:^|[\s;])(\d{2,4}[A-Z]?|S\d+|VESTIBULE|ELEVATORS)\s+(?=[A-Z])/g;
  const validAnchors = anchors.filter(a => {
    const window = normalized.substring(a.startIdx, a.startIdx + 200);  // v14.10.8: widened from 80
    const codeMatch = codeProbeRe.exec(window);
    if (!codeMatch) return false;
    const preCodeText = window.substring(0, codeMatch.index);
    const otherAnchors = Array.from(preCodeText.matchAll(anchorProbeRe));
    return otherAnchors.length <= 1;  // only our own self-anchor is allowed
  });

  // Build rows by slicing between validated anchors
  const rows: string[] = [];
  for (let i = 0; i < validAnchors.length; i++) {
    const start = validAnchors[i].startIdx;
    const end = i + 1 < validAnchors.length ? validAnchors[i + 1].startIdx : normalized.length;
    const rowText = normalized.substring(start, end).trim();
    if (rowText.length > 0) rows.push(rowText);
  }

  console.log(`[v14.9.40c] Page ${pageNum}: extracted ${rows.length} rows from ${normalized.length} chars (${anchors.length} raw anchors, ${validAnchors.length} validated)`);

  if (rows.length > 0) {
    for (const r of rows.slice(0, 3)) {
      console.log(`[v14.9.40c]   > ${r.substring(0, 120)}`);
    }
  }

  const parsed: FinishScheduleRoom[] = [];
  for (const row of rows) {
    const p = parseRow(row, pageNum);
    if (p) parsed.push(p);
  }
  console.log(`[v14.9.40c] Page ${pageNum}: parseRow produced ${parsed.length} rooms`);
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

  for (const { pageNum, text } of pages) {
    // v14.10.9: check legend FIRST — schedule detector also matches "ITEM NO."
    // and "ARCHITECTURAL FINISH" keywords that legend pages have, so without
    // this ordering legend pages get misclassified as schedule pages.
    const legCheck = isFinishLegendPage(text);
    const fsCheck = !legCheck && isFinishSchedulePage(text);
    if (legCheck) {
      legendPages.push(pageNum);
      const pageEntries = parseFinishLegendPage(text);
      legend.push(...pageEntries);
    } else if (fsCheck) {
      schedulePages.push(pageNum);
      const pageRooms = parseFinishSchedulePage(text, pageNum);
      rooms.push(...pageRooms);
    }
  }

  // v14.10.7: FS-density safety check.
  // If fewer than 2 schedule pages found, OR under 10 percent of pages
  // tested positive, treat the result as a false positive (likely the
  // page detector misfired on plan-page detail callouts). Return empty.
  // The call site should also gate by filename, but this is belt-and-suspenders.
  // 10 percent threshold: Menifee has ~3 FS pages of 19 (15.8 percent), so this
  // gives margin for continuation-detector misses without re-letting plan files through.
  const totalPages = pages.length;
  const fsRatio = totalPages > 0 ? schedulePages.length / totalPages : 0;
  if (totalPages > 0 && (schedulePages.length < 2 || fsRatio < 0.10)) {
    console.log(
      `[v14.10.7] FS-density check FAILED: ${schedulePages.length}/${totalPages} pages (${(fsRatio * 100).toFixed(0)}%). ` +
      `Need >=2 pages and >=10%. Discarding ${rooms.length} suspect rooms.`
    );
    return { rooms: [], legend, schedulePages: [], legendPages };
  }
  if (totalPages > 0) {
    console.log(
      `[v14.10.7] FS-density check PASSED: ${schedulePages.length}/${totalPages} pages (${(fsRatio * 100).toFixed(0)}%), ` +
      `${rooms.length} rooms, ${legend.length} legend entries.`
    );
  }
  return { rooms, legend, schedulePages, legendPages };
}

// ─────────────────────────────────────────────────────────────────
// Convert finish-schedule rooms into item rows for the Excel
// ─────────────────────────────────────────────────────────────────

export function buildFinishScheduleItems(fs: FinishScheduleResult): ParsedItem[] {
  // v14.10.7: instrumentation to demystify the rooms-to-items ratio.
  // Rooms with zero counter+millwork codes legitimately produce zero items
  // (their row only had floor/wall/ceiling finishes, no millwork-relevant codes).
  // Log the breakdown so the previous '166 rooms -> 82 items' mystery is
  // visible as expected behavior, not a dedupe bug.
  const roomsWithMillwork = fs.rooms.filter(r => r.counters.length + r.millwork.length > 0).length;
  const roomsWithoutMillwork = fs.rooms.length - roomsWithMillwork;
  console.log(
    `[v14.10.7] buildFinishScheduleItems: ${fs.rooms.length} total rooms, ` +
    `${roomsWithMillwork} have millwork/counter codes, ${roomsWithoutMillwork} have only finish/wall codes (will produce 0 items each).`
  );
  // Bug 2 (carry-over): legend entries return 0 on multi-column legend layouts.
  // parseFinishLegendPage uses a line-anchored regex that requires CODE on its
  // own line OR followed only by MFR:. Multi-column PDF text breaks that.
  // Fix lives in the multi-column legend P0 (server-side pdfplumber).
  const legendMap = new Map<string, FinishLegendEntry>();
  for (const e of fs.legend) legendMap.set(e.code, e);

  const describeCode = (code: string): string => {
    const e = legendMap.get(code);
    if (!e) return code;
    const parts: string[] = [];
    if (e.manufacturer) parts.push(e.manufacturer);
    if (e.pattern) parts.push(e.pattern);
    if (e.color) parts.push(e.color);
    return parts.length ? parts.join(" / ") : code;
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


// === v14.10.9: Coordinate-based legend parser ===
//
// Replaces the line-anchored regex approach with column-clustering on word
// coordinates. The old parseFinishLegendPage stays as fallback when items
// arent available (e.g., tests, or upstream callers that pass only text).
//
// Algorithm validated locally against Menifee Lakes Finish Keys (FS.4-FS.6):
// 71 entries / 7-of-7 spot checks pass / no title-block bleed.
// Test harness: tests/test-legend-coords.mjs
//
// pdf.js coordinate source: page.getTextContent().items[].transform = [a,b,c,d,x,y]
// where (x,y) is the baseline origin. We compute upright = (transform[0] > 0 && transform[3] > 0).

export interface PdfTextItem {
  str: string;
  x0: number;
  x1: number;
  top: number;
  bottom: number;
  upright: boolean;
}

const COORD_LABEL_KEYWORDS = new Set([
  "MFR:", "CONTACT:", "PATTERN:", "COLOR:", "SIZE:", "MATERIAL:",
  "WIDTH:", "TYPE:", "REPEAT:", "GAUGE:", "INSTALLED:", "INSTALLATION:",
  "FINISH:", "BACKING:", "GROUT", "GRADE:", "EDGE:",
  "WEARLAYER:", "CLOSURES:", "INTERIORS:", "HARDWARE:", "PROFILE:",
  "APPLICATION:", "COMPOSITION:", "SUBSTRATE:", "SUBTRATE:",
  "PILE", "FIRE",
]);

const COORD_CODE_RE = /^([A-Z]{1,4})-?(\d+[A-Z]?)$/;

function coordIsCode(text: string): boolean {
  if (!text) return false;
  if (text === "EPOXY" || text === "FRP" || text === "SC") return true;
  const m = text.match(COORD_CODE_RE);
  if (!m) return false;
  return CODE_PREFIXES.includes(m[1] as any);
}

interface ColumnGroup {
  minX: number;
  maxX: number;
  words: PdfTextItem[];
  peakX: number;
  peakCount: number;
  fallback?: boolean;
}

function clusterColumns(
  words: PdfTextItem[],
  pageHeight: number,
  opts: { minCount?: number; columnRadius?: number; bucketSize?: number; pageRightEdge?: number; titleBlockCutoffRatio?: number } = {}
): ColumnGroup[] {
  const minCount = opts.minCount ?? 3;
  const columnRadius = opts.columnRadius ?? 500;
  const bucketSize = opts.bucketSize ?? 10;
  const pageRightEdge = opts.pageRightEdge ?? 2700;
  const titleBlockCutoffRatio = opts.titleBlockCutoffRatio ?? 0.85;

  if (words.length === 0) return [];

  // Drop rotated words (title-block fragments running vertically)
  const upright_words = words.filter(w => w.upright !== false);

  // Drop words near page bottom (catches upright SCHEDULE/DATE in revision band)
  const cutoff = pageHeight > 0 ? pageHeight * titleBlockCutoffRatio : Infinity;
  const filtered_words = upright_words.filter(w => w.top < cutoff);

  // Histogram x0 buckets
  const buckets = new Map<number, number>();
  for (const w of filtered_words) {
    const b = Math.floor(w.x0 / bucketSize) * bucketSize;
    buckets.set(b, (buckets.get(b) || 0) + 1);
  }
  const peaks = [...buckets.entries()]
    .filter(([, n]) => n >= minCount)
    .map(([x, n]) => ({ x, n }))
    .sort((a, b) => a.x - b.x);

  // Merge adjacent peaks within columnRadius (intra-column label positions)
  const colStarts: { startX: number; totalN: number }[] = [];
  for (const peak of peaks) {
    const last = colStarts[colStarts.length - 1];
    if (last && peak.x - last.startX < columnRadius) {
      last.totalN += peak.n;
    } else {
      colStarts.push({ startX: peak.x, totalN: peak.n });
    }
  }

  // Drop right-edge stragglers
  const filtered = colStarts.filter(c => c.startX < pageRightEdge);

  // Sparse-page fallback: if no columns found but page has codes, treat as one column
  if (filtered.length === 0) {
    const hasCodes = filtered_words.some(w => coordIsCode(w.str));
    if (hasCodes) {
      return [{
        minX: 0,
        maxX: Infinity,
        words: filtered_words,
        peakX: 0,
        peakCount: filtered_words.length,
        fallback: true,
      }];
    }
    return [];
  }

  const cols: ColumnGroup[] = filtered.map((cs, i) => {
    const minX = cs.startX - bucketSize;
    const maxX = i + 1 < filtered.length ? filtered[i + 1].startX - bucketSize : Infinity;
    return { minX, maxX, words: [], peakX: cs.startX, peakCount: cs.totalN };
  });

  for (const w of filtered_words) {
    const col = cols.find(c => w.x0 >= c.minX && w.x0 < c.maxX);
    if (col) col.words.push(w);
  }

  return cols.filter(c => c.words.some(w => coordIsCode(w.str)));
}

function groupByLine(colWords: PdfTextItem[], lineGap: number = 8): PdfTextItem[][] {
  const sorted = [...colWords].sort((a, b) => a.top - b.top || a.x0 - b.x0);
  const lines: PdfTextItem[][] = [];
  for (const w of sorted) {
    if (lines.length === 0) { lines.push([w]); continue; }
    const lastLine = lines[lines.length - 1];
    const lastTop = lastLine[lastLine.length - 1].top;
    if (Math.abs(w.top - lastTop) <= lineGap) lastLine.push(w);
    else lines.push([w]);
  }
  return lines.map(line => line.sort((a, b) => a.x0 - b.x0));
}

function parseColumnEntries(colWords: PdfTextItem[], sourcePage: number): FinishLegendEntry[] {
  const lines = groupByLine(colWords);
  const entries: FinishLegendEntry[] = [];
  let current: FinishLegendEntry | null = null;

  const closeCurrent = () => {
    if (current && current.code) entries.push(current);
    current = null;
  };

  for (const line of lines) {
    let i = 0;
    while (i < line.length) {
      const tok = line[i];

      if (coordIsCode(tok.str)) {
        closeCurrent();
        const m = tok.str.match(COORD_CODE_RE);
        const codeNorm = m && !tok.str.includes("-") ? `${m[1]}-${m[2]}` : tok.str;
        current = {
          code: codeNorm,
          manufacturer: "",
          pattern: "",
          color: "",
          size: "",
          material: "",
          raw: "",
        };
        i++;
        // Inline MFR: handler when "<CODE> MFR: <vals>" all on one line
        if (i < line.length && line[i].str === "MFR:") {
          i++;
          const valTokens: string[] = [];
          while (i < line.length && !COORD_LABEL_KEYWORDS.has(line[i].str.toUpperCase()) && !coordIsCode(line[i].str)) {
            valTokens.push(line[i].str);
            i++;
          }
          if (current) current.manufacturer = valTokens.join(" ").trim();
        }
        continue;
      }

      const tokStr = tok.str.toUpperCase();
      if (COORD_LABEL_KEYWORDS.has(tokStr)) {
        if (!current) { i++; continue; }
        i++;
        const valTokens: string[] = [];
        while (i < line.length && !COORD_LABEL_KEYWORDS.has(line[i].str.toUpperCase()) && !coordIsCode(line[i].str)) {
          valTokens.push(line[i].str);
          i++;
        }
        const value = valTokens.join(" ").trim();
        if (current) {
          if (tokStr === "MFR:" && !current.manufacturer) current.manufacturer = value;
          else if (tokStr === "PATTERN:" && !current.pattern) current.pattern = value;
          else if (tokStr === "COLOR:" && !current.color) current.color = value;
          else if (tokStr === "SIZE:" && !current.size) current.size = value;
          else if (tokStr === "MATERIAL:" && !current.material) current.material = value;
        }
        continue;
      }

      i++;
    }
  }
  closeCurrent();
  return entries.filter(e => e.manufacturer);
}

export function parseFinishLegendPageByCoords(items: PdfTextItem[], pageNum: number, pageHeight: number): FinishLegendEntry[] {
  // v14.10.9-debug: dump coordinate diagnostics so we can compare browser pdf.js
  // values against the local pdfplumber fixture that the algorithm was tuned on.
  if (items.length > 0) {
    const xs = items.map(it => it.x0).sort((a, b) => a - b);
    const ys = items.map(it => it.top).sort((a, b) => a - b);
    const upright_n = items.filter(it => it.upright).length;
    const sample = items.slice(0, 8).map(it => `{str:"${it.str}",x0:${it.x0.toFixed(1)},top:${it.top.toFixed(1)},upright:${it.upright}}`).join(", ");
    console.log(`[v14.10.9-debug] page ${pageNum} h=${pageHeight.toFixed(0)} items=${items.length} upright=${upright_n} x0 range=[${xs[0].toFixed(1)},${xs[xs.length-1].toFixed(1)}] top range=[${ys[0].toFixed(1)},${ys[ys.length-1].toFixed(1)}]`);
    console.log(`[v14.10.9-debug] page ${pageNum} first 8 items: ${sample}`);
  }
  const cols = clusterColumns(items, pageHeight);
  const entries: FinishLegendEntry[] = [];
  for (const col of cols) {
    entries.push(...parseColumnEntries(col.words, pageNum));
  }
  console.log(`[v14.10.9] FS legend coord-parse page ${pageNum}: ${cols.length} cols, ${entries.length} entries`);
  return entries;
}

// === v14.10.9 wrapper for parseFinishSchedule ===
// Accepts optional per-page coordinate items. When provided for a page detected
// as a legend page, uses the new coord-based parser. Falls back to the old
// line-anchored parser when coords aren't supplied.

export interface PageItems {
  pageNum: number;
  pageHeight: number;
  items: PdfTextItem[];
}

export function parseFinishScheduleWithCoords(
  allPageText: string,
  pageItemsArr: PageItems[]
): FinishScheduleResult {
  // Run normal parse first to get rooms + page detection
  const result = parseFinishSchedule(allPageText);

  // If we have coordinate data, replace the legend with coord-parsed entries
  if (pageItemsArr.length > 0) {
    const itemsByPage = new Map<number, PageItems>();
    for (const pi of pageItemsArr) itemsByPage.set(pi.pageNum, pi);

    const coordLegend: FinishLegendEntry[] = [];
    for (const pageNum of result.legendPages) {
      const pi = itemsByPage.get(pageNum);
      if (!pi) continue;
      coordLegend.push(...parseFinishLegendPageByCoords(pi.items, pi.pageNum, pi.pageHeight));
    }

    // Also try pages that werent classified as legend but are FS-adjacent
    // (sometimes legend pages are bundled with schedule pages). Skip if the
    // page already has coord-parsed entries.
    const coordCodes = new Set(coordLegend.map(e => e.code));
    for (const pi of pageItemsArr) {
      if (result.legendPages.includes(pi.pageNum)) continue;
      if (result.schedulePages.includes(pi.pageNum)) continue;
      // Probe: does this page have lots of MFR: tokens? If so, try parsing.
      const mfrCount = pi.items.filter(it => it.str === "MFR:").length;
      if (mfrCount >= 3) {
        const extras = parseFinishLegendPageByCoords(pi.items, pi.pageNum, pi.pageHeight);
        for (const e of extras) {
          if (!coordCodes.has(e.code)) {
            coordLegend.push(e);
            coordCodes.add(e.code);
          }
        }
      }
    }

    if (coordLegend.length > 0) {
      console.log(`[v14.10.9] FS legend coord-parse: replacing ${result.legend.length} text-only entries with ${coordLegend.length} coord-parsed entries`);
      return { ...result, legend: coordLegend };
    }
  }

  return result;
}
