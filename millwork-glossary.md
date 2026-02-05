# Millwork Glossary & Normalization Map (ProjMgtAI)
_Last updated: 2025-10-08_

## Purpose
Standardize names, units, and references for millwork scope extraction so bid tables are consistent and easy to price.

---

## 1) Canonical Item Names (→ means “normalize to”)
- casework → **Base cabinets**
- upper cabinets / wall cabinets → **Wall cabinets**
- tall cabinets / pantry → **Tall cabinets**
- counter / countertop / c-top → **Countertop**
- splash / backspl → **Backsplash**
- panel / wall paneling / wainscot → **Wall panel**
- trim / moulding / molding → **Trim**
- baseboard → **Base trim**
- crown / cornice → **Crown trim**
- chair rail → **Chair-rail trim**
- door casing / jamb trim → **Door casing**
- window casing → **Window casing**
- stile & rail door / wood door (millwork scope) → **Wood door (millwork)**
- frame (wood) → **Wood frame**
- hardware set / Hdw set → **Hardware set (millwork)**
- shelving / adj shelves → **Shelving**
- reception desk / service counter → **Custom counter assembly**
- bench / banquette → **Built-in seating**
- solid surface / Corian → **Solid-surface top**
- quartz / engineered stone → **Quartz top**
- butcher block → **Wood top**

> Rule: pick the **bold** canonical name for all obvious synonyms; keep product models/spec section in **Spec/Detail ref**.

---

## 2) Units & Typical Usage
- **EA** (each): doors, hardware sets, custom assemblies, panels (large discrete), built-ins
- **LF** (linear feet): trim (base, crown, chair rail), countertops/backsplashes, shelving runs
- **SF** (square feet): wall paneling (field areas), large veneer surfaces
- **SETS**: hardware sets only if grouped; otherwise EA
- **PAIR**: double doors (note as pair in **Notes**)

> If units are unclear, default to **EA** and set `Flag = "Units unclear"`.

---

## 3) Sheet/Detail Referencing
- Prefer **detail/elevation callouts**: e.g., “A9.21/5” (Sheet A9.21, Detail 5).
- For schedule matches, include **schedule tag** (e.g., “Finish Sch, RM 210”).
- Always fill **Sheet ID**. If missing, set `Flag = "Missing sheet ref"` and add the best breadcrumb to **Notes**.

---

## 4) Common Patterns to Capture
- **Cabinets**: count by type and module width (e.g., B24, B36); note fillers, end panels.
- **Countertops**: measure LF; separate **backsplash** LF; list material in **Notes**.
- **Trim**: LF by type (base/crown/chair-rail); note profile if specified.
- **Panels**: EA for discrete panels; SF for field paneling—state substrate/veneer if given.
- **Doors & Frames (millwork scope)**: EA; list thickness/spec in **Spec/Detail ref**.
- **Hardware sets**: EA per door; keep the set number (e.g., HW-102) in **Spec/Detail ref**.

---

## 5) Exclusions / Clarifications
- Exclude **metal studs, GWB, paint**, and **non-millwork hardware** unless drawings place them in millwork scope.
- If scope seems split between Div 06 and Div 08, flag: `Flag = "Scope split (Div06/Div08)"`.
- Do **not** infer finishes or species—only record what’s specified; otherwise flag `Finish unspecified`.

---

## 6) Normalization Examples
| Source text                               | Normalize to              | Units | Notes                                   |
|-------------------------------------------|---------------------------|-------|-----------------------------------------|
| “2cm Quartz counter, 18 LF incl. splash”  | Quartz top                | LF    | Backsplash counted separately if shown  |
| “Solid surface window stools (ea)”        | Solid-surface top         | EA    | Window stools                           |
| “Stile & rail doors, Type D1”             | Wood door (millwork)      | EA    | Spec Type D1 in Spec/Detail ref         |
| “Baseboard MDF 5-1/4", profile B-3”       | Base trim                 | LF    | Profile B-3                             |
| “Reception desk per A9.51/2”              | Custom counter assembly   | EA    | Ref A9.51/2                             |

---

## 7) Flag Reasons (use in `Flag` column)
- Missing sheet reference
- Units unclear
- Quantity unusually high
- Alternate / Allowance / Addendum item
- Scope split (Div06/Div08)
- Finish unspecified
- Conflicts across sheets

---

## 8) Export Checklist (pre-XLSX)
- Every line has **Units** and **Sheet ID** (or a Flag).
- Alternates/allowances clearly marked.
- Totals reconcile with elevations/schedules.
- Key assumptions listed in the summary.

