// src/lib/toonSchemas.ts
// Central place for all TOON column schemas used in ProjMgtAI + RewmoAI.
// V14: Added assembly hierarchy, dimension source tracking, and confidence scoring.

export type ToonSchema = string[];

/**
 * V13 (LEGACY) — Millwork / Casework scope line items.
 * Kept for backward compatibility with existing data.
 */
export const MW_ITEM_SCHEMA: ToonSchema = [
  "item_id",
  "item_type",
  "description",
  "room",
  "level",
  "zone",
  "qty",
  "unit",
  "length_mm",
  "width_mm",
  "height_mm",
  "material",
  "finish",
  "edge",
  "wbs_code",
  "sheet_ref",
  "detail_ref",
  "notes"
];

/**
 * V14 — Millwork / Casework scope line items with assembly hierarchy.
 *
 * Changes from v13:
 * - Added assembly_id, assembly_name, section_id for parent/child relationships
 * - Added depth_mm (separated from width — width is front face, depth is cabinet depth)
 * - Added material_code and finish_code (parsed codes vs free text descriptions)
 * - Added hardware_type and hardware_spec for hardware line items
 * - Added dim_source to track whether dimensions are extracted, calculated, or unknown
 * - Added confidence scoring
 */
export const MW_ITEM_SCHEMA_V14: ToonSchema = [
  // Identity
  "item_id",          // "MW-001"
  "assembly_id",      // "ASSY-001" — groups components under a parent assembly
  "assembly_name",    // "Reception Desk" — human-readable assembly name
  "section_id",       // "5A", "5B" — sub-section within an assembly

  // Classification
  "item_type",        // "base_cabinet", "countertop", "panel", "trim", "grommet",
                      // "concealed_hinge", "piano_hinge", "adjustable_shelf",
                      // "fixed_shelf", "channel", "rubber_base", "conduit",
                      // "decorative_panel", "substrate", "assembly" (parent record)
  "description",      // human-friendly summary

  // Location
  "room",             // "Lobby", "Breakroom 204"
  "level",            // "L1", "Level 01"
  "zone",             // optional area tag

  // Quantity
  "qty",              // numeric string
  "unit",             // "ea", "lf", "sf"

  // Dimensions (all mm; leave empty string if unknown — NEVER default)
  "length_mm",        // overall length (front face or run length)
  "width_mm",         // width (front face of cabinet or countertop width/depth)
  "height_mm",        // height
  "depth_mm",         // depth (cabinet depth, separated from width in v14)
  "dim_source",       // "extracted" | "calculated" | "from_schedule" | "unknown"
                      // NEVER "default" — if no real dim, leave empty and set "unknown"

  // Materials
  "material",         // free text: "Plastic Laminate, Vertical Wood Grain"
  "material_code",    // parsed code: "PL-01", "SS-1B", "3FORM-VAPOR"
  "finish",           // free text finish description
  "finish_code",      // parsed finish code
  "edge",             // edge profile: "1/4\" radiused", "1/2\" radiused"

  // Hardware (for hardware-type line items)
  "hardware_type",    // "concealed_hinge", "grommet", "piano_hinge", etc.
  "hardware_spec",    // "heavy duty, 3 per door", "2-1/2\" diameter"

  // Metadata
  "wbs_code",         // CSI code: "06 40 00"
  "sheet_ref",        // "A8.10"
  "detail_ref",       // "Detail 9", "Section 5A"
  "confidence",       // "high" | "medium" | "low"
  "notes"             // free-form
];

/**
 * Location-only schema (unchanged from v13)
 */
export const MW_LOCATION_SCHEMA: ToonSchema = [
  "item_id",
  "room",
  "level",
  "zone",
  "sheet_ref",
  "detail_ref"
];

/**
 * WBS / estimating roll-up rows.
 * V14: Added assembly_id for grouping.
 */
export const MW_WBS_SCHEMA: ToonSchema = [
  "wbs_code",
  "wbs_name",
  "trade",
  "assembly_id",      // NEW: link to parent assembly
  "assembly_name",    // NEW
  "room",
  "level",
  "zone",
  "qty_total",
  "unit",
  "length_total_mm",
  "width_total_mm",
  "height_max_mm",
  "material_primary",
  "material_code",    // NEW
  "finish_primary",
  "estimate_basis",
  "notes"
];

/**
 * Generic trade package schema (unchanged)
 */
export const TRADE_PACKAGE_SCHEMA: ToonSchema = [
  "trade_code",
  "trade_name",
  "scope_summary",
  "qty_items",
  "qty_wbs_rows",
  "estimator_name",
  "bid_status",
  "notes"
];

/* ------------------------------------------------------------------
 * RewmoAI schemas (unchanged from v13)
 * ------------------------------------------------------------------*/

export const REWMO_TXN_SCHEMA: ToonSchema = [
  "txn_id",
  "user_id",
  "date",
  "amount",
  "currency",
  "merchant_name",
  "merchant_category",
  "channel",
  "city",
  "state",
  "country",
  "is_subscription",
  "is_american_made",
  "tags",
  "notes"
];

export const REWMO_REWARD_EVENT_SCHEMA: ToonSchema = [
  "event_id",
  "user_id",
  "timestamp",
  "source",
  "ref_id",
  "points_delta",
  "points_type",
  "tier_level",
  "balance_after",
  "notes"
];

export const REWMO_TIER_SNAPSHOT_SCHEMA: ToonSchema = [
  "snapshot_id",
  "user_id",
  "date",
  "tier_level",
  "days_since_signup",
  "bonus_multiplier",
  "total_points",
  "locked_until",
  "notes"
];
