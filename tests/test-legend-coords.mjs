// tests/test-legend-coords.mjs  v5
//
// v5 changes:
// - Filter words by upright=true (drops rotated/reversed title-block fragments).
//   pdfplumber tags rotated text as upright=false. pdf.js exposes the same
//   information via item.transform[0]/[3] (rotation matrix) — port to TS will
//   compute upright from those.

import { readFileSync } from "node:fs";

const VERBOSE = process.argv.includes("--verbose");

const CODE_PREFIXES = new Set([
  "LVP","CPT","VCT","STA",
  "WC","AF","RC","PL",
  "CT","PT","WD","QZ","SS","GR","CM","CH",
  "MR","FM","ST","SV","VB","HW","SF","PF",
  "EPOXY","FRP","SC",
]);

const LABEL_KEYWORDS = new Set([
  "MFR:", "CONTACT:", "PATTERN:", "COLOR:", "SIZE:", "MATERIAL:",
  "WIDTH:", "TYPE:", "REPEAT:", "GAUGE:", "INSTALLED:", "INSTALLATION:",
  "FINISH:", "BACKING:", "GROUT", "GRADE:", "EDGE:",
  "WEARLAYER:", "CLOSURES:", "INTERIORS:", "HARDWARE:", "PROFILE:",
  "APPLICATION:", "COMPOSITION:", "SUBSTRATE:", "SUBTRATE:",
  "PILE", "FIRE",
]);

const CODE_RE = /^([A-Z]{1,4})-?(\d+[A-Z]?)$/;

function isCode(text) {
  if (!text) return false;
  if (text === "EPOXY" || text === "FRP" || text === "SC") return true;
  const m = text.match(CODE_RE);
  if (!m) return false;
  return CODE_PREFIXES.has(m[1]);
}

function clusterColumns(words, opts = {}) {
  const minCount = opts.minCount ?? 3;
  const columnRadius = opts.columnRadius ?? 500;
  const bucketSize = opts.bucketSize ?? 10;
  const pageRightEdge = opts.pageRightEdge ?? 2700;
  const pageHeight = opts.pageHeight ?? 0;
  const titleBlockCutoffRatio = opts.titleBlockCutoffRatio ?? 0.85;

  if (words.length === 0) return [];

  // v5: drop rotated/reversed text. Title-block fragments running vertically
  // up the page edge get rendered as upright=false by pdfplumber (and as
  // non-identity transform matrices by pdf.js).
  const upright_words = words.filter(w => w.upright !== false);

  // v4: also filter title-block words near page bottom (catches DATE/SCHEDULE
  // that sit at the bottom of the right-edge revision band)
  const cutoff = pageHeight > 0 ? pageHeight * titleBlockCutoffRatio : Infinity;
  const filtered_words = upright_words.filter(w => w.top < cutoff);

  // bucket
  const buckets = new Map();
  for (const w of filtered_words) {
    const b = Math.floor(w.x0 / bucketSize) * bucketSize;
    buckets.set(b, (buckets.get(b) || 0) + 1);
  }
  const peaks = [...buckets.entries()]
    .filter(([_, n]) => n >= minCount)
    .map(([x, n]) => ({ x, n }))
    .sort((a, b) => a.x - b.x);

  // merge peaks within columnRadius
  const colStarts = [];
  for (const peak of peaks) {
    const last = colStarts[colStarts.length - 1];
    if (last && peak.x - last.startX < columnRadius) {
      last.totalN += peak.n;
    } else {
      colStarts.push({ startX: peak.x, totalN: peak.n });
    }
  }

  // drop right-edge stragglers
  const filtered = colStarts.filter(c => c.startX < pageRightEdge);

  // sparse-page fallback
  if (filtered.length === 0) {
    const hasCodes = filtered_words.some(w => isCode(w.str));
    if (hasCodes) {
      return [{ minX: 0, maxX: Infinity, words: filtered_words, peakX: 0, peakCount: filtered_words.length, fallback: true }];
    }
    return [];
  }

  const cols = filtered.map((cs, i) => {
    const minX = cs.startX - bucketSize;
    const maxX = i + 1 < filtered.length ? filtered[i + 1].startX - bucketSize : Infinity;
    return { minX, maxX, words: [], peakX: cs.startX, peakCount: cs.totalN };
  });

  for (const w of filtered_words) {
    const col = cols.find(c => w.x0 >= c.minX && w.x0 < c.maxX);
    if (col) col.words.push(w);
  }

  const withCodes = cols.filter(c => c.words.some(w => isCode(w.str)));
  return withCodes;
}

function groupByLine(colWords, lineGap = 8) {
  const sorted = [...colWords].sort((a, b) => a.top - b.top || a.x0 - b.x0);
  const lines = [];
  for (const w of sorted) {
    if (lines.length === 0) { lines.push([w]); continue; }
    const lastLine = lines[lines.length - 1];
    const lastTop = lastLine[lastLine.length - 1].top;
    if (Math.abs(w.top - lastTop) <= lineGap) lastLine.push(w);
    else lines.push([w]);
  }
  return lines.map(line => line.sort((a, b) => a.x0 - b.x0));
}

function parseColumnEntries(colWords, sourcePage, debug = false) {
  const lines = groupByLine(colWords);
  const entries = [];
  let current = null;

  if (debug) console.log(`    [debug] column has ${colWords.length} words, ${lines.length} lines`);

  const closeCurrent = () => {
    if (current && current.code) entries.push(current);
    current = null;
  };

  for (const line of lines) {
    let i = 0;
    while (i < line.length) {
      const tok = line[i];

      if (isCode(tok.str)) {
        closeCurrent();
        const m = tok.str.match(CODE_RE);
        const codeNorm = m && !tok.str.includes("-") ? `${m[1]}-${m[2]}` : tok.str;
        current = {
          code: codeNorm,
          manufacturer: "",
          pattern: "",
          color: "",
          size: "",
          material: "",
          sourcePage,
        };
        i++;
        if (debug) console.log(`    [debug] OPEN ${codeNorm} on line top=${tok.top}`);
        if (i < line.length && line[i].str === "MFR:") {
          i++;
          const valTokens = [];
          while (i < line.length && !LABEL_KEYWORDS.has(line[i].str.toUpperCase()) && !isCode(line[i].str)) {
            valTokens.push(line[i].str);
            i++;
          }
          if (current) current.manufacturer = valTokens.join(" ").trim();
          if (debug) console.log(`    [debug]   inline MFR: "${current?.manufacturer}"`);
        }
        continue;
      }

      const tokStr = tok.str.toUpperCase();
      if (LABEL_KEYWORDS.has(tokStr)) {
        if (!current) { i++; continue; }
        i++;
        const valTokens = [];
        while (i < line.length && !LABEL_KEYWORDS.has(line[i].str.toUpperCase()) && !isCode(line[i].str)) {
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
          if (debug && value) console.log(`    [debug]   ${tokStr} "${value}"`);
        }
        continue;
      }

      i++;
    }
  }
  closeCurrent();
  return entries.filter(e => e.manufacturer);
}

function parseFinishLegendPageByCoords(items, pageNum, pageHeight = 0, debug = false) {
  const cols = clusterColumns(items, { pageHeight });
  const entries = [];
  for (let ci = 0; ci < cols.length; ci++) {
    if (debug) console.log(`  [debug] column ${ci} peakX=${cols[ci].peakX} count=${cols[ci].peakCount} words=${cols[ci].words.length}${cols[ci].fallback ? " (fallback)" : ""}`);
    entries.push(...parseColumnEntries(cols[ci].words, pageNum, debug));
  }
  return entries;
}

// ---------------------------------------------------------------------------

const fixture = JSON.parse(readFileSync("tests/fixtures/menifee_legend_words.json", "utf8"));

const expectedSpotChecks = [
  { code: "AF-1", manufacturerContains: "Faux Wood Beams" },
  { code: "AF-2", manufacturerContains: "Soelberg" },
  { code: "AF-3", manufacturerContains: "3 Form", patternContains: "Varia Ecoresin", colorContains: "Fray Baltic" },
  { code: "CPT-1", manufacturerContains: "Durkan", patternContains: "Custom Print" },
  { code: "CT-5", manufacturerContains: "Dal Tile" },
  { code: "RC-1", manufacturerContains: "Fast Cabinet" },
  { code: "WC-8", manufacturerContains: "Koroseal" },
];

let totalEntries = 0;
const allEntries = [];

for (const page of fixture.pages) {
  const upright_count = page.items.filter(w => w.upright !== false).length;
  const rotated_count = page.items.length - upright_count;
  console.log(`\n=== PAGE ${page.pageNum}  (${page.items.length} words: ${upright_count} upright, ${rotated_count} rotated) ===`);
  const cols = clusterColumns(page.items, { pageHeight: page.height });
  console.log(`  Detected ${cols.length} columns at peakX: ${cols.map(c => `${c.peakX}(n=${c.peakCount}${c.fallback ? ",fallback" : ""})`).join(", ")}`);

  const entries = parseFinishLegendPageByCoords(page.items, page.pageNum, page.height, VERBOSE);
  console.log(`  Extracted ${entries.length} legend entries`);
  totalEntries += entries.length;
  allEntries.push(...entries);

  for (const e of entries.slice(0, 3)) {
    console.log(`    [${e.code}] mfr="${e.manufacturer}" pattern="${e.pattern}" color="${e.color}"`);
  }
}

console.log(`\n=== TOTAL: ${totalEntries} entries across ${fixture.pages.length} pages ===\n`);

console.log(`=== SPOT CHECKS ===`);
let passed = 0, failed = 0;
for (const check of expectedSpotChecks) {
  const found = allEntries.find(e => e.code === check.code);
  if (!found) {
    console.log(`  FAIL  ${check.code}: not found`);
    failed++;
    continue;
  }
  const errors = [];
  if (check.manufacturerContains && !found.manufacturer.includes(check.manufacturerContains)) {
    errors.push(`mfr="${found.manufacturer}" missing "${check.manufacturerContains}"`);
  }
  if (check.patternContains && !found.pattern.includes(check.patternContains)) {
    errors.push(`pattern="${found.pattern}" missing "${check.patternContains}"`);
  }
  if (check.colorContains && !found.color.includes(check.colorContains)) {
    errors.push(`color="${found.color}" missing "${check.colorContains}"`);
  }
  if (errors.length) {
    console.log(`  FAIL  ${check.code}: ${errors.join(", ")}`);
    failed++;
  } else {
    console.log(`  PASS  ${check.code}: mfr="${found.manufacturer}" pattern="${found.pattern}" color="${found.color}"`);
    passed++;
  }
}
console.log(`\n${passed} passed, ${failed} failed (${expectedSpotChecks.length} total)`);

console.log(`\n=== ALL ENTRIES (sorted by code) ===`);
const sorted = [...allEntries].sort((a, b) => a.code.localeCompare(b.code));
for (const e of sorted) {
  const desc = [e.manufacturer, e.pattern, e.color].filter(Boolean).join(" / ");
  console.log(`  ${e.code.padEnd(8)}  ${desc}`);
}

process.exit(failed > 0 ? 1 : 0);
