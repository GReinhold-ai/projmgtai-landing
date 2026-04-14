/**
 * ProjMgtAI — Assembly Decomposer
 * v14.9.1 | AWI Series 300 Custom
 *
 * Deterministic parts explosion for millwork scope items.
 * No LLM calls. Pure math from nominal dimensions + AWI 300 construction rules.
 *
 * Usage:
 *   import { decomposeItems } from "./assembly-decomposer";
 *   const parts = decomposeItems(scopeItems);
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type ScopeItem = {
  id?: string | number;
  item_type?: string;
  description?: string;
  room?: string;
  material?: string;
  qty?: number;
  width_mm?: number;
  height_mm?: number;
  depth_mm?: number;
};

export type PartsRow = {
  source_id: string | number;
  room: string;
  item_desc: string;
  part: string;
  qty: number;
  L: number | null;   // length, inches
  W: number | null;   // width (depth for panels), inches
  T: number | null;   // thickness, inches
  mat: MaterialCode;
  note: string;
};

type MaterialCode = "PLY-1" | "PLY-2" | "WD-1" | "HW" | "SS" | "OTHER";

type CabinetDims = {
  W: number;  // nominal width, inches
  H: number;  // nominal height, inches
  D: number;  // nominal depth, inches
};

type CabinetConfig = {
  type: "base" | "upper" | "tall";
  dims: CabinetDims;
  doors: number;
  drawers: number;
  adjustableShelves: number;
  sourceItem: ScopeItem;
};

// ─── AWI 300 Construction Constants ──────────────────────────────────────────

const THICKNESS = {
  carcass: 0.75,      // 3/4" PLY-1 box panels
  back: 0.5,          // 1/2" PLY-2 back (AWI 300 uses 1/2", not 1/4")
  faceFrame: 0.75,    // 3/4" solid WD-1 face frame
  door: 0.75,         // 3/4" WD-1 frame-and-panel door
  drawerBox: 0.625,   // 5/8" PLY-1 dovetail drawer box sides
  drawerBottom: 0.25, // 1/4" PLY-2 drawer bottom
  shelf: 0.75,        // 3/4" PLY-1 adjustable shelf
} as const;

const TOE_KICK_HEIGHT = 4.0;    // inches
const NAILER_WIDTH = 3.5;       // inches
const DRAWER_CLEARANCE = 0.125; // reveal per side
const DOOR_REVEAL = 0.0625;     // 1/16" overlay reveal

// ─── Dimension Parser ─────────────────────────────────────────────────────────

/**
 * Extracts W × H × D from a description string.
 * Handles formats like:
 *   "36"W x 34-1/2"H x 24"D"
 *   "36W x 34.5H x 24D"
 *   "36 x 34.5 x 24"
 *   "900mm x 876mm x 610mm"  (converts to inches)
 */
export function parseDims(description: string): Partial<CabinetDims> {
  if (!description) return {};

  // mm fields from ScopeItem (already parsed upstream)
  // — these are handled separately in buildConfig()

  const result: Partial<CabinetDims> = {};

  // Named dimension patterns: 36"W  36W  36 W
  const wMatch = description.match(/(\d+(?:[.\-\/]\d+)?)\s*["']?\s*W\b/i);
  const hMatch = description.match(/(\d+(?:[.\-\/]\d+)?)\s*["']?\s*H\b/i);
  const dMatch = description.match(/(\d+(?:[.\-\/]\d+)?)\s*["']?\s*D\b/i);

  if (wMatch) result.W = parseFraction(wMatch[1]);
  if (hMatch) result.H = parseFraction(hMatch[1]);
  if (dMatch) result.D = parseFraction(dMatch[1]);

  // Positional fallback: first × second × third (no labels)
  if (!result.W || !result.H) {
    const positional = description.match(
      /(\d+(?:\.\d+)?)\s*[xX×]\s*(\d+(?:\.\d+)?)\s*[xX×]\s*(\d+(?:\.\d+)?)/
    );
    if (positional) {
      if (!result.W) result.W = parseFloat(positional[1]);
      if (!result.H) result.H = parseFloat(positional[2]);
      if (!result.D) result.D = parseFloat(positional[3]);
    }
  }

  // mm → inches conversion
  const mmMatch = description.match(/(\d{3,4})mm\s*[xX×]\s*(\d{3,4})mm/);
  if (mmMatch && !result.W) {
    result.W = Math.round((parseInt(mmMatch[1]) / 25.4) * 8) / 8; // round to 1/8"
    result.H = Math.round((parseInt(mmMatch[2]) / 25.4) * 8) / 8;
  }

  return result;
}

function parseFraction(s: string): number {
  if (s.includes("-") && s.includes("/")) {
    // "34-1/2"
    const [whole, frac] = s.split("-");
    const [num, den] = frac.split("/");
    return parseInt(whole) + parseInt(num) / parseInt(den);
  }
  if (s.includes("/")) {
    const [num, den] = s.split("/");
    return parseInt(num) / parseInt(den);
  }
  return parseFloat(s);
}

// ─── Cabinet Type Inference ───────────────────────────────────────────────────

function inferCabinetType(item: ScopeItem): "base" | "upper" | "tall" | null {
  const type = (item.item_type || "").toLowerCase();
  const desc = (item.description || "").toLowerCase();

  if (type === "base_cabinet" || /\bbase\b/.test(desc)) return "base";
  if (type === "upper_cabinet" || /\bupper\b|\bwall cab/i.test(desc)) return "upper";
  if (type === "tall_cabinet" || /\btall\b|\bpantry\b|\butil/i.test(desc)) return "tall";

  // Infer from height
  const parsed = parseDims(item.description || "");
  if (parsed.H) {
    if (parsed.H <= 36) return "base";
    if (parsed.H <= 48) return "upper";
    return "tall";
  }

  return null;
}

function inferDoorCount(item: ScopeItem): number {
  const desc = (item.description || "").toLowerCase();
  if (/2[\s-]door|two[\s-]door|double door/.test(desc)) return 2;
  if (/no[\s-]door|open|shelf only/.test(desc)) return 0;
  const W = parseDims(desc).W || 0;
  return W >= 30 ? 2 : 1; // AWI heuristic: 30"+ gets double doors
}

function inferDrawerCount(item: ScopeItem): number {
  const desc = (item.description || "").toLowerCase();
  const m = desc.match(/(\d)\s*drawer/);
  if (m) return Math.min(parseInt(m[1]), 5);
  if (/drawer base|3-drawer|3 drawer/.test(desc)) return 3;
  if (/drawer/.test(desc)) return 1;
  return 0;
}

// ─── Parts Builders ───────────────────────────────────────────────────────────

function buildCabinetParts(cfg: CabinetConfig): PartsRow[] {
  const { type, dims, doors, drawers, adjustableShelves, sourceItem } = cfg;
  const { W, H, D } = dims;
  const t = THICKNESS.carcass;
  const bt = THICKNESS.back;
  const ft = THICKNESS.faceFrame;

  const iW = W - 2 * t;                                    // interior width
  const iD = D - t - (type === "upper" ? 0 : ft);          // interior depth
  const iH = H - t - t;                                    // interior height (top+bottom)

  const src = sourceItem.id ?? "?";
  const room = sourceItem.room ?? "";
  const desc = sourceItem.description ?? `${type} ${W}"W`;

  const row = (
    part: string,
    qty: number,
    L: number | null,
    Wp: number | null,
    Tp: number | null,
    mat: MaterialCode,
    note = ""
  ): PartsRow => ({ source_id: src, room, item_desc: desc, part, qty, L, W: Wp, T: Tp, mat, note });

  const parts: PartsRow[] = [];

  // ── Carcass ──
  parts.push(row("Side panel", 2, H, D, t, "PLY-1", "L & R"));
  parts.push(row("Bottom panel", 1, iW, iD, t, "PLY-1", ""));

  if (type === "base") {
    parts.push(row("Back panel", 1, H - TOE_KICK_HEIGHT, iW, bt, "PLY-2", "dado in sides"));
    parts.push(row("Toe kick", 1, W, TOE_KICK_HEIGHT, ft, "PLY-1", "4\"H solid"));
    parts.push(row("Top nailer", 2, iW, NAILER_WIDTH, t, "PLY-1", "front & back"));
  } else if (type === "upper") {
    parts.push(row("Back panel", 1, H, iW, bt, "PLY-2", "rabbet in sides"));
    parts.push(row("Top panel", 1, iW, iD, t, "PLY-1", ""));
  } else {
    // tall
    parts.push(row("Back panel", 1, H - TOE_KICK_HEIGHT, iW, bt, "PLY-2", "dado in sides"));
    parts.push(row("Top panel", 1, iW, iD, t, "PLY-1", ""));
    parts.push(row("Toe kick", 1, W, TOE_KICK_HEIGHT, ft, "PLY-1", "4\"H solid"));
    if (H > 54) {
      parts.push(row("Fixed shelf", 1, iW, iD - 1, t, "PLY-1", "mid-height"));
    }
  }

  // ── Face Frame ──
  parts.push(row("Face frame", 1, H, W, ft, "WD-1", "AWI 300 solid hardwood"));

  // ── Drawers ──
  if (drawers > 0) {
    const stackOffset = type === "base" ? TOE_KICK_HEIGHT : 0;
    const drawerZoneH = doors > 0
      ? (H - stackOffset) * 0.4  // drawers share cabinet with doors
      : H - stackOffset - 3;     // full drawer stack minus nailers
    const dBoxH = Math.round((drawerZoneH / drawers) * 8) / 8 - 1.5;

    parts.push(row(
      "Drawer box", drawers,
      round2(iW - 1),   // 1/2" clearance each side
      round2(iD - 3),   // 3" setback for slides
      round2(dBoxH),
      "PLY-1",
      `${drawers}× dovetail, UF undermount`
    ));
    parts.push(row(
      "Drawer front", drawers,
      round2(W - DRAWER_CLEARANCE),
      round2((H - stackOffset) / drawers - DRAWER_CLEARANCE),
      THICKNESS.door,
      "WD-1",
      "AWI 300 full overlay"
    ));
    parts.push(row(
      "Drawer bottom", drawers,
      round2(iW - 1.5),
      round2(iD - 3.5),
      THICKNESS.drawerBottom,
      "PLY-2",
      "1/4\" dado into drawer box"
    ));
    parts.push(row(
      "Drawer slide (pr)", drawers,
      round2(iD - 1),
      null, null,
      "HW",
      "UF undermount soft-close"
    ));
  }

  // ── Doors ──
  if (doors > 0) {
    const doorZoneH = drawers > 0
      ? (H - (type === "base" ? TOE_KICK_HEIGHT : 0)) * 0.6
      : H - (type === "base" ? TOE_KICK_HEIGHT : 0);
    const dW = doors === 1
      ? W - DOOR_REVEAL * 2
      : W / 2 - DOOR_REVEAL * 2;
    const hingesPerDoor = doorZoneH > 36 ? 3 : 2;

    parts.push(row(
      "Door", doors,
      round2(doorZoneH - DOOR_REVEAL),
      round2(dW),
      THICKNESS.door,
      "WD-1",
      `AWI 300 frame+panel${doors > 1 ? ", pair" : ""}`
    ));
    parts.push(row(
      "Hinge", doors * hingesPerDoor,
      null, null, null,
      "HW",
      "full-overlay soft-close cup hinge"
    ));
  }

  // ── Adjustable Shelves ──
  if (adjustableShelves > 0) {
    parts.push(row(
      "Adj. shelf", adjustableShelves,
      round2(iW - 0.25),
      round2(iD - 1.5),
      THICKNESS.shelf,
      "PLY-1",
      "shelf pin holes 32mm system"
    ));
    parts.push(row(
      "Shelf pin", adjustableShelves * 4,
      null, null, null,
      "HW",
      "5mm nickel shelf pin"
    ));
  }

  return parts;
}

function buildCountertopParts(item: ScopeItem): PartsRow[] {
  const desc = item.description ?? "";
  const src = item.id ?? "?";
  const room = item.room ?? "";

  // Try to extract lineal feet or W×D
  const dimsRaw = parseDims(desc);
  const lfMatch = desc.match(/(\d+(?:\.\d+)?)\s*(?:lf|l\.f\.|lin|linear)/i);

  let L: number | null = null;
  let W: number | null = null;

  if (dimsRaw.W) L = dimsRaw.W;
  if (dimsRaw.D) W = dimsRaw.D;
  if (lfMatch) { L = parseFloat(lfMatch[1]) * 12; W = 25.5; } // LF → inches, std depth

  const matCode: MaterialCode = /stone|quartz|granite|marble/i.test(desc) ? "SS"
    : /solid surface|corian/i.test(desc) ? "OTHER"
    : "PLY-1";

  const matNote = /stone|quartz|granite|marble/i.test(desc)
    ? "stone — verify template by fabricator"
    : "verify substrate under finish material";

  return [{
    source_id: src,
    room,
    item_desc: desc,
    part: "Countertop substrate",
    qty: 1,
    L,
    W,
    T: 1.5,  // standard 1.5" build-up
    mat: matCode,
    note: matNote,
  }];
}

function buildShelvingParts(item: ScopeItem): PartsRow[] {
  const desc = item.description ?? "";
  const src = item.id ?? "?";
  const room = item.room ?? "";
  const dims = parseDims(desc);

  const shelfCount = (() => {
    const m = desc.match(/(\d+)\s*shelf|shelf\s*(\d+)/i);
    if (m) return parseInt(m[1] || m[2]);
    if (dims.H && dims.H > 24) return Math.floor((dims.H - 12) / 12);
    return 1;
  })();

  return [{
    source_id: src,
    room,
    item_desc: desc,
    part: "Wall shelf",
    qty: shelfCount,
    L: dims.W ?? null,
    W: dims.D ?? 12,
    T: THICKNESS.shelf,
    mat: "PLY-1",
    note: "AWI 300 — edge band front, shelf pins",
  }];
}

// ─── Main Export ──────────────────────────────────────────────────────────────

/**
 * Decomposes an array of ScopeItems into a flat parts list.
 * Items with unsupported types or missing dimensions are skipped gracefully.
 */
export function decomposeItems(items: ScopeItem[]): PartsRow[] {
  const allParts: PartsRow[] = [];

  for (const item of items) {
    const type = (item.item_type ?? "").toLowerCase();
    const desc = item.description ?? "";

    try {
      // ── Cabinets ──
      const cabType = inferCabinetType(item);
      if (cabType) {
        const parsedDims = parseDims(desc);

        // Prefer mm fields from ScopeItem if available
        const W = item.width_mm
          ? Math.round((item.width_mm / 25.4) * 8) / 8
          : parsedDims.W;
        const H = item.height_mm
          ? Math.round((item.height_mm / 25.4) * 8) / 8
          : parsedDims.H;
        const D = item.depth_mm
          ? Math.round((item.depth_mm / 25.4) * 8) / 8
          : parsedDims.D;

        if (!W) continue; // can't build without at least width

        // Apply AWI 300 defaults for missing dims
        const dims: CabinetDims = {
          W,
          H: H ?? (cabType === "base" ? 34.5 : cabType === "upper" ? 30 : 84),
          D: D ?? (cabType === "upper" ? 12 : 24),
        };

        const doors = inferDoorCount(item);
        const drawers = inferDrawerCount(item);
        const hasDoor = doors > 0;
        const hasDrawer = drawers > 0;
        const adjShelves = (!hasDoor && !hasDrawer)
          ? Math.max(1, Math.floor((dims.H - 10) / 12))
          : hasDoor ? 1 : 0;

        const cfg: CabinetConfig = {
          type: cabType,
          dims,
          doors,
          drawers,
          adjustableShelves: adjShelves,
          sourceItem: item,
        };

        // Multiply parts by item qty (e.g. "3 base cabinets" → 3× all parts)
        const itemQty = item.qty ?? 1;
        const parts = buildCabinetParts(cfg);
        for (const p of parts) {
          allParts.push({ ...p, qty: p.qty * itemQty });
        }
        continue;
      }

      // ── Countertops ──
      if (type === "countertop" || type === "transaction_top" || /countertop|counter top/i.test(desc)) {
        allParts.push(...buildCountertopParts(item));
        continue;
      }

      // ── Shelving ──
      if (type === "shelving" || /\bshelf\b|\bshelv/i.test(desc)) {
        allParts.push(...buildShelvingParts(item));
        continue;
      }

      // Other types (ada_fascia, wall_cap, scope_exclusion, etc.) — skip
    } catch (e) {
      // Never let a single item crash the whole decomposition
      console.warn(`[AssemblyDecomposer] skipped item ${item.id}:`, e);
    }
  }

  return allParts;
}

// ─── Excel Sheet Builder ──────────────────────────────────────────────────────

/**
 * Converts PartsRow[] to a SheetJS-compatible AOA (array of arrays).
 * Import this in page.tsx and pass to XLSX.utils.aoa_to_sheet()
 */
export function partsToAOA(parts: PartsRow[]): (string | number | null)[][] {
  const HEADER = [
    "Item Ref", "Room", "Description", "Part", "Qty",
    'L"', 'W"', 'T"', "Material", "Notes"
  ];

  const rows = parts.map(p => [
    p.source_id,
    p.room,
    p.item_desc,
    p.part,
    p.qty,
    p.L !== null ? round2(p.L) : "",
    p.W !== null ? round2(p.W) : "",
    p.T !== null ? p.T : "",
    p.mat,
    p.note,
  ]);

  return [HEADER, ...rows];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
