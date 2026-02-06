// src/lib/parser/preprocess.ts
// Stage 1: Regex pre-processor for v14 extraction pipeline.
// Runs BEFORE the LLM call. Zero API cost. Extracts structured hints
// from raw OCR text so the LLM does semantic matching, not pattern hunting.

// ─── Types ───────────────────────────────────────────────────────────

export interface DimHint {
  raw: string;
  inches: number;
  mm: number;
  context: string;
  line: number;
}

export interface MaterialHint {
  code: string;
  fullName: string;
  category: "laminate" | "solid_surface" | "melamine" | "specialty" | "substrate" | "rubber" | "aluminum" | "unknown";
  line: number;
}

export interface HardwareHint {
  type: string;
  qty: number;
  size?: string;
  spec?: string;
  line: number;
}

export interface EquipmentHint {
  tag: string;
  description?: string;
  line: number;
}

export interface DetailRef {
  detailNum: string;
  sheet: string;
  title?: string;
  line: number;
}

export interface AssemblyHint {
  name: string;
  type: string;
  detailCount: number;
  overallDimensions?: {
    width_mm?: number;
    depth_mm?: number;
    height_mm?: number;
  };
  sections: string[];
  titleOccurrences: number;
}

export interface PreprocessResult {
  cleanedText: string;
  assembly: AssemblyHint | null;
  dimensions: DimHint[];
  materials: MaterialHint[];
  hardware: HardwareHint[];
  equipment: EquipmentHint[];
  detailRefs: DetailRef[];
  lineCount: number;
  millworkSignalStrength: number;
}

// ─── Material Code Lookup ────────────────────────────────────────────

const MATERIAL_LOOKUP: Record<string, { fullName: string; category: MaterialHint["category"] }> = {
  "PL-01": { fullName: "Plastic Laminate, Vertical Wood Grain (Primary)", category: "laminate" },
  "PL-10": { fullName: "Plastic Laminate, Vertical Wood Grain (Alternate)", category: "laminate" },
  "PL-1":  { fullName: "Plastic Laminate", category: "laminate" },
  "SS-1B": { fullName: "Solid Surface Countertop (Primary)", category: "solid_surface" },
  "SS-6":  { fullName: "Solid Surface Countertop (Alternate)", category: "solid_surface" },
  "FB-01": { fullName: "4\" Black Rubber Base", category: "rubber" },
};

// ─── Dimension Extraction ────────────────────────────────────────────

/** Convert fractional string like "2 1/2" or "63/64" to decimal */
function parseFraction(s: string): number {
  s = s.trim();
  const mixedMatch = s.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixedMatch) {
    return parseInt(mixedMatch[1]) + parseInt(mixedMatch[2]) / parseInt(mixedMatch[3]);
  }
  const fracMatch = s.match(/^(\d+)\/(\d+)$/);
  if (fracMatch) {
    return parseInt(fracMatch[1]) / parseInt(fracMatch[2]);
  }
  return parseFloat(s) || 0;
}

/** Parse architectural dimension string to inches */
function archDimToInches(raw: string): number | null {
  // Pattern: feet'-inches fraction" e.g. 3'-10", 2' - 6", 0' - 2 1/2", 14' - 6"
  const ftIn = raw.match(/(\d+)'\s*-?\s*(\d+(?:\s+\d+\/\d+)?(?:\s*\d+\/\d+)?)\s*"?/);
  if (ftIn) {
    const feet = parseInt(ftIn[1]);
    const inches = parseFraction(ftIn[2]);
    return feet * 12 + inches;
  }

  // Pattern: just inches with possible fraction: 34.5", 24", 7"
  const inOnly = raw.match(/^(\d+(?:\.\d+)?)\s*"$/);
  if (inOnly) {
    return parseFloat(inOnly[1]);
  }

  // Pattern: inches with fraction: 2 1/4", 5 1/8"
  const inFrac = raw.match(/^(\d+(?:\s+\d+\/\d+))\s*"$/);
  if (inFrac) {
    return parseFraction(inFrac[1]);
  }

  return null;
}

function inchesToMm(inches: number): number {
  return Math.round(inches * 25.4);
}

export function extractDimensions(text: string): DimHint[] {
  const hints: DimHint[] = [];
  const lines = text.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Architectural feet-inches: 3'-10", 14' - 6", 0' - 2 1/2"
    const ftInPattern = /(\d+'\s*-?\s*\d+(?:\s+\d+\/\d+)?(?:\s*\d+\/\d+)?\s*"?)/g;
    let match;
    while ((match = ftInPattern.exec(line)) !== null) {
      const raw = match[1].trim();
      const inches = archDimToInches(raw);
      if (inches !== null && inches > 0 && inches < 600) { // sanity: < 50 feet
        const start = Math.max(0, match.index - 40);
        const end = Math.min(line.length, match.index + match[0].length + 40);
        hints.push({
          raw,
          inches: Math.round(inches * 100) / 100,
          mm: inchesToMm(inches),
          context: line.slice(start, end).trim(),
          line: i + 1,
        });
      }
    }

    // Simple inches: 34.5", 24", 12", 7"
    // Avoid re-matching the inches part of a feet-inches dim
    const simpleInPattern = /(?<!\d'\s*-?\s*)(?<!\d)\b(\d+(?:\.\d+)?)\s*"/g;
    while ((match = simpleInPattern.exec(line)) !== null) {
      const raw = match[0].trim();
      const inches = parseFloat(match[1]);
      // Filter out tiny values (likely not dimensions) and very large
      if (inches >= 0.25 && inches <= 120) {
        // Check it's not already captured as part of a ft-in pattern
        const alreadyCaptured = hints.some(
          h => h.line === i + 1 && h.context.includes(raw)
        );
        if (!alreadyCaptured) {
          const start = Math.max(0, match.index - 40);
          const end = Math.min(line.length, match.index + match[0].length + 40);
          hints.push({
            raw,
            inches,
            mm: inchesToMm(inches),
            context: line.slice(start, end).trim(),
            line: i + 1,
          });
        }
      }
    }
  }

  return hints;
}

// ─── Material Extraction ─────────────────────────────────────────────

export function extractMaterials(text: string): MaterialHint[] {
  const hints: MaterialHint[] = [];
  const lines = text.split("\n");
  const seen = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Material codes: PL-01, SS-1B, FB-01, etc.
    const codePattern = /\b((?:PL|SS|FB|WD|GL|ST|MET|ALM?|HW)-?\d+[A-Z]?)\b/gi;
    let match;
    while ((match = codePattern.exec(line)) !== null) {
      const code = match[1].toUpperCase().replace(/^([A-Z]+)(\d)/, "$1-$2"); // normalize PL01 → PL-01
      if (!seen.has(code)) {
        seen.add(code);
        const lookup = MATERIAL_LOOKUP[code];
        hints.push({
          code,
          fullName: lookup?.fullName || code,
          category: lookup?.category || "unknown",
          line: i + 1,
        });
      }
    }

    // Named materials
    const namedPatterns: Array<{ pattern: RegExp; fullName: string; category: MaterialHint["category"]; code: string }> = [
      { pattern: /plastic\s+laminate/gi, fullName: "Plastic Laminate", category: "laminate", code: "PLAM" },
      { pattern: /solid\s+surface/gi, fullName: "Solid Surface", category: "solid_surface", code: "SS" },
      { pattern: /white\s+melamine/gi, fullName: "White Melamine", category: "melamine", code: "MEL-WHT" },
      { pattern: /3\s*form[\s,]*chroma[\s,]*vapor/gi, fullName: "3Form Chroma Vapor Renewable Matte 1/2\"", category: "specialty", code: "3FORM-VAPOR" },
      { pattern: /3\s*form/gi, fullName: "3Form Panel", category: "specialty", code: "3FORM" },
      { pattern: /\bplywood\b/gi, fullName: "Plywood Substrate", category: "substrate", code: "PLY" },
      { pattern: /rubber\s+base/gi, fullName: "Rubber Base", category: "rubber", code: "RB" },
      { pattern: /aluminum\s+trim/gi, fullName: "Aluminum Trim, Clear Anodized", category: "aluminum", code: "ALM-TRIM" },
      { pattern: /aluminum\s+channel/gi, fullName: "Aluminum Channel", category: "aluminum", code: "ALM-CHAN" },
      { pattern: /clear\s+anodized/gi, fullName: "Clear Anodized Aluminum", category: "aluminum", code: "ALM-CLR" },
    ];

    for (const np of namedPatterns) {
      if (np.pattern.test(line) && !seen.has(np.code)) {
        seen.add(np.code);
        hints.push({
          code: np.code,
          fullName: np.fullName,
          category: np.category,
          line: i + 1,
        });
      }
      np.pattern.lastIndex = 0; // reset regex
    }
  }

  return hints;
}

// ─── Hardware Extraction ─────────────────────────────────────────────

export function extractHardware(text: string): HardwareHint[] {
  const hints: HardwareHint[] = [];
  const lines = text.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const upper = line.toUpperCase();

    // "(3) BUCKLE HEAVY DUTY CONCEALED HINGES" or "(3) ... HINGES"
    const hingeMatch = upper.match(/\((\d+)\)\s*(.*?(?:HINGE|HINGES))/);
    if (hingeMatch) {
      hints.push({
        type: "concealed_hinge",
        qty: parseInt(hingeMatch[1]),
        spec: hingeMatch[2].trim(),
        line: i + 1,
      });
    }

    // "2 1/2\" GROMMET TYP (8) PLACES" or "2\" GROMMET TYP (4) PLACES"
    const grommetMatch = upper.match(/(\d[\d\/\s]*?)(?:"|INCH)?\s*GROMMET.*?\((\d+)\)\s*PLACE/);
    if (grommetMatch) {
      hints.push({
        type: "grommet",
        qty: parseInt(grommetMatch[2]),
        size: grommetMatch[1].trim() + '"',
        line: i + 1,
      });
    }

    // "PIANO HINGE"
    if (/PIANO\s*HINGE/i.test(upper)) {
      hints.push({ type: "piano_hinge", qty: 1, line: i + 1 });
    }

    // "ADJUSTABLE SHELF"
    if (/ADJUSTABLE\s+SHELF/i.test(upper)) {
      hints.push({ type: "adjustable_shelf", qty: 1, spec: "3/4\" white melamine", line: i + 1 });
    }

    // "FIXED CPU SHELF" or "FIXED SHELF"
    if (/FIXED\s+(?:CPU\s+)?SHELF/i.test(upper)) {
      hints.push({ type: "fixed_shelf", qty: 1, spec: "CPU shelf, PL-01", line: i + 1 });
    }

    // Heavy duty hardware note
    if (/ALL\s+CABINET\s+HARDWARE.*HEAVY\s+DUTY/i.test(upper) || /HEAVY\s+DUTY.*HARDWARE/i.test(upper)) {
      hints.push({ type: "hardware_spec_note", qty: 0, spec: "All cabinet hardware to be heavy duty", line: i + 1 });
    }
  }

  return hints;
}

// ─── Equipment Tag Extraction ────────────────────────────────────────

export function extractEquipment(text: string): EquipmentHint[] {
  const hints: EquipmentHint[] = [];
  const lines = text.split("\n");
  const seen = new Set<string>();

  const EQUIP_DESCRIPTIONS: Record<string, string> = {
    "FA-2": "Printer",
    "FA-02": "Printer",
    "FA-07": "Membership Check-in Terminal w/ Scanner",
    "FA-7": "Membership Check-in Terminal w/ Scanner",
    "FA-8": "POS & Telecheck Station",
    "FA-08": "POS & Telecheck Station",
    "SA-06": "CCTV Security Monitor",
    "SA-6": "CCTV Security Monitor",
    "PH-01": "Telephone",
    "PH-1": "Telephone",
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const tagPattern = /\b((?:FA|SA|PH|EL|ME|DA|AV)-?\d+[A-Z]?)\b/gi;
    let match;
    while ((match = tagPattern.exec(line)) !== null) {
      const tag = match[1].toUpperCase().replace(/^([A-Z]+)(\d)/, "$1-$2");
      if (!seen.has(tag)) {
        seen.add(tag);
        hints.push({
          tag,
          description: EQUIP_DESCRIPTIONS[tag],
          line: i + 1,
        });
      }
    }
  }

  return hints;
}

// ─── Detail Reference Extraction ─────────────────────────────────────

export function extractDetailRefs(text: string): DetailRef[] {
  const hints: DetailRef[] = [];
  const lines = text.split("\n");
  const seen = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Pattern: "8 / A8.10", "18B / A8.10", "4A\nA8.10"
    const refPattern = /(\d+[A-D]?)\s*[\/\\]?\s*(A\d+\.\d+)/gi;
    let match;
    while ((match = refPattern.exec(line)) !== null) {
      const key = `${match[1]}-${match[2]}`;
      if (!seen.has(key)) {
        seen.add(key);
        hints.push({
          detailNum: match[1],
          sheet: match[2].toUpperCase(),
          line: i + 1,
        });
      }
    }

    // Title-style references: "16 RECEPTION DESK PLAN"
    const titleRefPattern = /^(\d+)\s+((?:RECEPTION|FRONT)\s+DESK\s+(?:PLAN|SECTION|ELEVATION|DETAIL|NOTES|BACK)[\w\s]*)/i;
    const titleMatch = line.match(titleRefPattern);
    if (titleMatch) {
      const key = `title-${titleMatch[1]}`;
      if (!seen.has(key)) {
        seen.add(key);
        hints.push({
          detailNum: titleMatch[1],
          sheet: "",
          title: titleMatch[2].trim(),
          line: i + 1,
        });
      }
    }
  }

  return hints;
}

// ─── Assembly Detection ──────────────────────────────────────────────

const ASSEMBLY_KEYWORDS: Array<{ pattern: RegExp; type: string; name: string }> = [
  { pattern: /RECEPTION\s+DESK/gi, type: "reception_desk", name: "Reception Desk" },
  { pattern: /FRONT\s+DESK/gi, type: "reception_desk", name: "Front Desk" },
  { pattern: /NURSE\s*(?:'?S)?\s+STATION/gi, type: "nurse_station", name: "Nurse Station" },
  { pattern: /CHECK[\s-]?IN\s+(?:DESK|COUNTER|STATION)/gi, type: "checkin_counter", name: "Check-In Counter" },
  { pattern: /SERVICE\s+(?:DESK|COUNTER)/gi, type: "service_counter", name: "Service Counter" },
  { pattern: /VANITY\s+(?:RUN|COUNTER|TOP)/gi, type: "vanity_run", name: "Vanity Run" },
  { pattern: /TELLER\s+(?:LINE|COUNTER|STATION)/gi, type: "teller_line", name: "Teller Line" },
  { pattern: /CONCESSION\s+(?:STAND|COUNTER)/gi, type: "concession", name: "Concession Stand" },
  { pattern: /DISPLAY\s+CASE/gi, type: "display_case", name: "Display Case" },
  { pattern: /BREAK\s*ROOM\s+(?:CABINET|CASEWORK|MILLWORK)/gi, type: "breakroom_casework", name: "Breakroom Casework" },
  { pattern: /LOCKER\s+ROOM\s+(?:VANIT|CASEWORK)/gi, type: "locker_room_vanity", name: "Locker Room Vanity" },
  { pattern: /RETAIL\s+TRELLIS/gi, type: "retail_trellis", name: "Retail Trellis" },
];

export function detectAssembly(text: string, sheetRef?: string): AssemblyHint | null {
  let bestMatch: { keyword: typeof ASSEMBLY_KEYWORDS[0]; count: number } | null = null;

  for (const kw of ASSEMBLY_KEYWORDS) {
    const matches = text.match(kw.pattern);
    kw.pattern.lastIndex = 0;
    if (matches && (!bestMatch || matches.length > bestMatch.count)) {
      bestMatch = { keyword: kw, count: matches.length };
    }
  }

  // Need at least 3 title occurrences to confidently identify an assembly
  if (!bestMatch || bestMatch.count < 3) return null;

  // Find section identifiers (5A, 5B, 5C, 5D or similar)
  const sectionPattern = /\b(\d+[A-D])\b/g;
  const sectionMatches = text.match(sectionPattern) || [];
  const sections = [...new Set(sectionMatches)].sort();

  // Count detail views (numbered references to this sheet)
  const detailNums = new Set<string>();
  const detailPattern = /\b(\d{1,2})\s*[\/\\]?\s*A\d+\.\d+/g;
  let dm;
  while ((dm = detailPattern.exec(text)) !== null) {
    detailNums.add(dm[1]);
  }

  return {
    name: bestMatch.keyword.name,
    type: bestMatch.keyword.type,
    detailCount: detailNums.size || bestMatch.count,
    sections,
    titleOccurrences: bestMatch.count,
  };
}

// ─── Millwork Signal Strength ────────────────────────────────────────

function calcMillworkSignal(text: string): number {
  const upper = text.toUpperCase();
  const len = upper.length || 1;
  let score = 0;

  const signals = [
    { pattern: /CABINET/gi, weight: 3 },
    { pattern: /CASEWORK/gi, weight: 3 },
    { pattern: /MILLWORK/gi, weight: 3 },
    { pattern: /COUNTERTOP/gi, weight: 2 },
    { pattern: /SOLID\s+SURFACE/gi, weight: 2 },
    { pattern: /PLASTIC\s+LAMINATE/gi, weight: 2 },
    { pattern: /PLAM/gi, weight: 2 },
    { pattern: /MELAMINE/gi, weight: 2 },
    { pattern: /\bHINGE/gi, weight: 1 },
    { pattern: /\bSHELF|\bSHELVES/gi, weight: 1 },
    { pattern: /GROMMET/gi, weight: 1 },
    { pattern: /\bDESK\b/gi, weight: 1 },
    { pattern: /\bVANITY\b/gi, weight: 2 },
    { pattern: /WOOD\s+GRAIN/gi, weight: 1 },
    { pattern: /DRAWER/gi, weight: 1 },
    { pattern: /3\s*FORM/gi, weight: 2 },
    { pattern: /RECEPTION/gi, weight: 1 },
    { pattern: /\bTRIM\b/gi, weight: 1 },
    { pattern: /\bBASE\s+CABINET/gi, weight: 2 },
    { pattern: /\bUPPER\s+CABINET/gi, weight: 2 },
  ];

  for (const s of signals) {
    const matches = upper.match(s.pattern);
    s.pattern.lastIndex = 0;
    if (matches) score += matches.length * s.weight;
  }

  // Normalize: a very millwork-rich page might score 50+
  return Math.min(1, score / 40);
}

// ─── Text Cleaning ───────────────────────────────────────────────────

function cleanOcrText(text: string): string {
  return text
    // Remove excessive whitespace but preserve line breaks
    .replace(/[ \t]+/g, " ")
    // Remove common OCR artifacts
    .replace(/[|}{]/g, "")
    // Normalize smart quotes
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    // Remove page break markers
    .replace(/\f/g, "\n")
    // Collapse multiple blank lines
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ─── Main Pre-processor ─────────────────────────────────────────────

export function preprocess(text: string, sheetRef?: string): PreprocessResult {
  const cleanedText = cleanOcrText(text);
  const lines = cleanedText.split("\n");

  return {
    cleanedText,
    assembly: detectAssembly(cleanedText, sheetRef),
    dimensions: extractDimensions(cleanedText),
    materials: extractMaterials(cleanedText),
    hardware: extractHardware(cleanedText),
    equipment: extractEquipment(cleanedText),
    detailRefs: extractDetailRefs(cleanedText),
    lineCount: lines.length,
    millworkSignalStrength: calcMillworkSignal(cleanedText),
  };
}
