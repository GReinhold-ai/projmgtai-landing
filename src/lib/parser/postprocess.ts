// src/lib/parser/postprocess.ts
// Stage 3: Post-processor for v14 extraction pipeline.
// Runs AFTER the LLM call. Validates, deduplicates, enriches, flags issues.

import type { ToonRow } from "@/lib/toon";

// ─── Types ───────────────────────────────────────────────────────────

export interface PostprocessResult {
  rows: ToonRow[];
  assemblies: AssemblySummary[];
  warnings: string[];
  stats: {
    totalItems: number;
    withDimensions: number;
    withMaterials: number;
    withHardware: number;
    flaggedDefaults: number;
    duplicatesRemoved: number;
  };
}

export interface AssemblySummary {
  assemblyId: string;
  assemblyName: string;
  assemblyType: string;
  componentCount: number;
  cabinetCount: number;
  countertopCount: number;
  hardwareCount: number;
  trimPartCount: number;
  materialCodes: string[];
  totalCountertopSf: number;
  sections: string[];
}

// ─── Default Dimension Detection ─────────────────────────────────────

const KNOWN_DEFAULTS_MM = [
  { w: 610, h: 876, d: 610 },   // 24x34.5x24 (standard base cab)
  { w: 762, h: 762, d: 305 },   // 30x30x12 (standard wall cab)
  { w: 610, h: 762, d: 305 },   // 24x30x12 (standard wall cab)
  { w: 914, h: 876, d: 610 },   // 36x34.5x24 (standard base cab)
];

function isDefaultDimension(row: ToonRow): boolean {
  const w = Number(row.width_mm) || 0;
  const h = Number(row.height_mm) || 0;
  const d = Number(row.depth_mm) || 0;

  if (w === 0 && h === 0 && d === 0) return false; // empty is not "default"

  return KNOWN_DEFAULTS_MM.some(
    def => Math.abs(w - def.w) < 5 && Math.abs(h - def.h) < 5 && Math.abs(d - def.d) < 5
  );
}

// ─── Dimension Validator ─────────────────────────────────────────────

function validateDimensions(rows: ToonRow[], warnings: string[]): ToonRow[] {
  return rows.map((row, idx) => {
    const itemId = row.item_id || `row-${idx}`;

    // Flag default dimensions
    if (isDefaultDimension(row)) {
      row.dim_source = "default_FLAGGED";
      row.confidence = "low";
      row.notes = ((row.notes as string) || "") +
        " [⚠ DEFAULT DIMS DETECTED — needs manual measurement]";
      warnings.push(`${itemId}: Default dimensions (${row.width_mm}×${row.height_mm}×${row.depth_mm}mm) — likely not from drawing`);
    }

    // Sanity checks
    const w = Number(row.width_mm) || 0;
    const h = Number(row.height_mm) || 0;
    const d = Number(row.depth_mm) || 0;
    const l = Number(row.length_mm) || 0;

    if (w > 0 && w < 50) {
      warnings.push(`${itemId}: Width ${w}mm (< 2") — verify`);
      row.notes = ((row.notes as string) || "") + " [⚠ Width < 2\"]";
    }
    if (h > 3048) {
      warnings.push(`${itemId}: Height ${h}mm (> 10') — verify`);
      row.notes = ((row.notes as string) || "") + " [⚠ Height > 10']";
    }
    if (l > 12192) {
      warnings.push(`${itemId}: Length ${l}mm (> 40') — verify`);
      row.notes = ((row.notes as string) || "") + " [⚠ Length > 40']";
    }

    return row;
  });
}

// ─── Deduplicator ────────────────────────────────────────────────────

function makeDedupeKey(row: ToonRow): string {
  return [
    row.item_type,
    row.assembly_id,
    row.section_id,
    row.width_mm,
    row.height_mm,
    row.depth_mm,
    row.material_code,
    row.room,
  ].map(v => String(v || "").toLowerCase().trim()).join("|");
}

function deduplicateRows(rows: ToonRow[], warnings: string[]): { rows: ToonRow[]; removed: number } {
  const groups = new Map<string, ToonRow[]>();

  for (const row of rows) {
    const key = makeDedupeKey(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  const result: ToonRow[] = [];
  let removed = 0;

  for (const [key, group] of groups) {
    if (group.length === 1) {
      result.push(group[0]);
    } else {
      // Merge: keep first row, sum quantities
      const merged = { ...group[0] };
      const totalQty = group.reduce((sum, r) => sum + (Number(r.qty) || 1), 0);
      merged.qty = String(totalQty);
      merged.notes = ((merged.notes as string) || "") +
        ` [Merged ${group.length} duplicate rows]`;
      result.push(merged);
      removed += group.length - 1;

      if (group.length > 2) {
        warnings.push(
          `${merged.item_id}: ${group.length} identical rows merged → qty=${totalQty} (${merged.item_type}, ${merged.description})`
        );
      }
    }
  }

  return { rows: result, removed };
}

// ─── Area / SF Calculator ────────────────────────────────────────────

function calculateAreas(rows: ToonRow[]): ToonRow[] {
  return rows.map(row => {
    const type = String(row.item_type || "").toLowerCase();
    const l = Number(row.length_mm) || 0;
    const w = Number(row.width_mm) || 0;

    // Countertops: calculate SF from length × width
    if (type.includes("countertop") && l > 0 && w > 0) {
      const sqft = (l * w) / 92903; // mm² to ft²
      row.notes = ((row.notes as string) || "") + ` [Calc: ${sqft.toFixed(1)} SF]`;
    }

    // Panels (3Form, etc.): calculate SF from length × height or width
    if ((type.includes("panel") || type.includes("3form")) && l > 0) {
      const h = Number(row.height_mm) || w;
      if (h > 0) {
        const sqft = (l * h) / 92903;
        row.notes = ((row.notes as string) || "") + ` [Calc: ${sqft.toFixed(1)} SF]`;
      }
    }

    // Trim/molding: calculate LF from length
    if ((type.includes("trim") || type.includes("channel") || type.includes("molding") || type.includes("base")) && l > 0) {
      const lf = l / 304.8; // mm to feet
      row.notes = ((row.notes as string) || "") + ` [Calc: ${lf.toFixed(1)} LF]`;
    }

    return row;
  });
}

// ─── Assembly Roll-Up ────────────────────────────────────────────────

function rollUpAssemblies(rows: ToonRow[]): AssemblySummary[] {
  const assemblyMap = new Map<string, ToonRow[]>();

  for (const row of rows) {
    const aId = String(row.assembly_id || "NONE");
    if (!assemblyMap.has(aId)) assemblyMap.set(aId, []);
    assemblyMap.get(aId)!.push(row);
  }

  const summaries: AssemblySummary[] = [];

  for (const [aId, components] of assemblyMap) {
    if (aId === "NONE") continue;

    const firstRow = components[0];
    const materialCodes = new Set<string>();
    const sections = new Set<string>();
    let cabinetCount = 0;
    let countertopCount = 0;
    let hardwareCount = 0;
    let trimPartCount = 0;
    let totalCtopSf = 0;

    for (const c of components) {
      const type = String(c.item_type || "").toLowerCase();
      if (c.material_code) materialCodes.add(String(c.material_code));
      if (c.section_id) sections.add(String(c.section_id));

      if (type.includes("cabinet") || type.includes("desk")) cabinetCount++;
      else if (type.includes("countertop")) countertopCount++;
      else if (type.includes("hinge") || type.includes("grommet") || type.includes("shelf") || type.includes("hardware")) hardwareCount++;
      else if (type.includes("trim") || type.includes("panel") || type.includes("channel") || type.includes("base")) trimPartCount++;

      // Extract SF from notes if calculated
      const sfMatch = String(c.notes || "").match(/Calc:\s*([\d.]+)\s*SF/);
      if (sfMatch && type.includes("countertop")) {
        totalCtopSf += parseFloat(sfMatch[1]);
      }
    }

    summaries.push({
      assemblyId: aId,
      assemblyName: String(firstRow.assembly_name || "Unknown Assembly"),
      assemblyType: String(firstRow.item_type || "custom_assembly"),
      componentCount: components.length,
      cabinetCount,
      countertopCount,
      hardwareCount,
      trimPartCount,
      materialCodes: [...materialCodes],
      totalCountertopSf: Math.round(totalCtopSf * 10) / 10,
      sections: [...sections].sort(),
    });
  }

  return summaries;
}

// ─── Confidence Scorer ───────────────────────────────────────────────

function scoreConfidence(rows: ToonRow[]): ToonRow[] {
  return rows.map(row => {
    if (row.confidence) return row; // already set (e.g., by dim validator)

    let score = 0;
    const maxScore = 5;

    if (row.item_type && String(row.item_type).length > 2) score++;
    if (row.width_mm || row.height_mm || row.length_mm) score++;
    if (row.material_code || row.material) score++;
    if (row.sheet_ref) score++;
    if (row.description && String(row.description).length > 5) score++;

    const ratio = score / maxScore;
    row.confidence = ratio >= 0.8 ? "high" : ratio >= 0.5 ? "medium" : "low";

    return row;
  });
}

// ─── Main Post-processor ────────────────────────────────────────────

export function postprocess(rows: ToonRow[]): PostprocessResult {
  const warnings: string[] = [];

  // Step 1: Validate dimensions (flag defaults)
  let processed = validateDimensions(rows, warnings);

  // Step 2: Deduplicate
  const { rows: deduped, removed } = deduplicateRows(processed, warnings);
  processed = deduped;

  // Step 3: Calculate areas and linear footage
  processed = calculateAreas(processed);

  // Step 4: Score confidence
  processed = scoreConfidence(processed);

  // Step 5: Roll up assemblies
  const assemblies = rollUpAssemblies(processed);

  // Stats
  const stats = {
    totalItems: processed.length,
    withDimensions: processed.filter(r => r.width_mm || r.height_mm || r.length_mm).length,
    withMaterials: processed.filter(r => r.material_code || r.material).length,
    withHardware: processed.filter(r => {
      const t = String(r.item_type || "").toLowerCase();
      return t.includes("hinge") || t.includes("grommet") || t.includes("shelf") || t.includes("hardware");
    }).length,
    flaggedDefaults: processed.filter(r => String(r.dim_source || "").includes("FLAGGED")).length,
    duplicatesRemoved: removed,
  };

  return { rows: processed, assemblies, warnings, stats };
}
