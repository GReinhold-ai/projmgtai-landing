// src/lib/wbs.ts

export type WbsRow = {
  // identity / matching keys
  spec_id?: string;        // e.g., "ID-5", "ID-5.1", "CAB-01"
  location?: string;       // free text ("Bar Back / Lobby / RM-101")
  unit_type?: string;      // item/unit type ("Base Cabinet", "Wall Cab", "Countertop")
  series?: number;         // sequence grouping like 100/200, optional

  // parsed quantities/details
  qty?: number;
  unit?: string;           // EA, LF, SF, LOT...
  dims?: string;
  material?: string;
  material_int?: string;
  edgeband?: string;
  ops?: string;            // fabrication ops/notes

  // costing placeholders from parsed rows (if any)
  labor_hrs?: number;
  matl_$?: number;
  sell_$?: number;

  note?: string;
  source?: string;         // "Parsed" | "Bid" | "Manual"

  // passthroughs (nice-to-have)
  wbs_id?: string;
  discipline?: string;
  building?: string;
  floor?: string;
  room?: string;
};

export type BidRow = {
  spec_id?: string;
  location?: string;
  unit_type?: string;
  series?: number;

  qty?: number;
  dims?: string;
  sell_$?: number;

  note?: string;

  // keep original row around for debugging
  raw?: Record<string, any>;
};

export type ReconcileRow = {
  key: string;           // composite key used for matching
  // identity
  spec_id?: string;
  location?: string;
  unit_type?: string;
  series?: number;

  // parsed vs bid
  qty_parsed?: number;
  qty_bid?: number;

  dims_parsed?: string;
  dims_bid?: string;

  price_parsed?: number;
  price_bid?: number;

  // simple deltas
  delta_qty?: number;     // bid - parsed
  delta_$?: number;       // bid - parsed

  // refs if you want to show detail cards later
  parsed?: WbsRow | null;
  bid?: BidRow | null;
};

function keyOf(x: { spec_id?: string; location?: string; unit_type?: string; series?: number }) {
  const s = (v?: string) => (v || "").trim().toLowerCase();
  const n = (v?: number) => (typeof v === "number" ? v : undefined);
  return [
    s(x.spec_id),
    s(x.location),
    s(x.unit_type),
    n(x.series) ?? "",
  ].join(" | ");
}

export function reconcile(parsed: WbsRow[], bid: BidRow[]): ReconcileRow[] {
  const parsedMap = new Map<string, WbsRow>();
  const bidMap = new Map<string, BidRow>();

  for (const p of parsed) parsedMap.set(keyOf(p), p);
  for (const b of bid) bidMap.set(keyOf(b), b);

  // union of keys
  const keys = new Set<string>([...parsedMap.keys(), ...bidMap.keys()]);
  const out: ReconcileRow[] = [];

  for (const key of keys) {
    const p = parsedMap.get(key) || null;
    const b = bidMap.get(key) || null;

    // identity props (favor parsed → then bid)
    const spec_id = p?.spec_id ?? b?.spec_id;
    const location = p?.location ?? b?.location;
    const unit_type = p?.unit_type ?? b?.unit_type;
    const series = p?.series ?? b?.series;

    // quantities / price
    const qty_parsed = safeNum(p?.qty);
    const qty_bid = safeNum(b?.qty);
    const price_parsed = safeNum(p?.sell_$);
    const price_bid = safeNum(b?.sell_$);

    const dims_parsed = p?.dims ?? "";
    const dims_bid = b?.dims ?? "";

    out.push({
      key,
      spec_id,
      location,
      unit_type,
      series,
      qty_parsed,
      qty_bid,
      dims_parsed,
      dims_bid,
      price_parsed,
      price_bid,
      delta_qty: (qty_bid ?? 0) - (qty_parsed ?? 0),
      delta_$: (price_bid ?? 0) - (price_parsed ?? 0),
      parsed: p,
      bid: b,
    });
  }

  // sort: spec_id, location, series, unit_type for stable display
  out.sort((a, b) => {
    const s = (v?: string) => (v || "").toLowerCase();
    const c = (x: string, y: string) => (x < y ? -1 : x > y ? 1 : 0);
    return (
      c(s(a.spec_id), s(b.spec_id)) ||
      c(s(a.location), s(b.location)) ||
      ((a.series ?? 0) - (b.series ?? 0)) ||
      c(s(a.unit_type), s(b.unit_type))
    );
  });

  return out;
}

function safeNum(v: any): number | undefined {
  if (v == null || v === "") return undefined;
  if (typeof v === "number") return isFinite(v) ? v : undefined;
  const s = String(v).replace(/[, $]/g, "");
  const n = Number(s);
  return isFinite(n) ? n : undefined;
}
