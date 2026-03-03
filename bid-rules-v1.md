# Bid Rules v1 (ProjMgtAI)
_Last updated: 2025-10-08_

## 1) Scope Extraction (general)
- Extract ONLY items relevant to the selected **trade**.
- Prefer quantities tied to **details/elevations/schedules** over narrative notes.
- Capture for each line: **Item**, **Spec/Detail ref**, **Sheet ID**, **Quantity**, **Units**, **Location/Room**, **Notes**.
- Include **Alternates**, **Allowances**, **Addenda** as separate flagged lines.

## 2) Normalization
- Normalize names to a consistent vocabulary (singular nouns; drop vendor-specific names unless required).
- Merge exact duplicates; keep the highest-confidence quantity and sum identical items when appropriate.
- Keep model numbers/spec sections in **Spec/Detail ref** (not in Item).

## 3) Flagging (use a `Flag` column)
Flag and DO NOT guess when any of these are true:
- Missing or ambiguous **sheet reference**.
- Unclear or missing **units** (EA vs LF vs SF).
- **Unusually high** or inconsistent quantity for the context.
- Mentioned only in notes with **no supporting detail/elevation**.
- Affected by **Alternates/Allowances/Addenda**.
- Conflicts between different sheets/schedules.

## 4) Quality Checks (before export)
- Totals reconcile with schedules/elevations where available.
- All items have **Units** and **Sheet ID**.
- Flags reviewed and resolved or justified in Notes.
- Summary lists sheets processed, total items, flagged count, key assumptions.

## 5) Trade hints
- **Millwork**: casework, doors/frames, trim, panels, hardware sets, finish schedules, room finish tags; prefer counts from elevations/details.
- **Electrical**: fixtures by type, panels/schedules, devices, risers; verify circuit counts and fixture schedules.
- **Plumbing**: fixtures by type, pipe sizes, risers, equipment schedules, floor drains/vents; verify fixture schedules.

## 6) Style
- Be precise and concise.
- If uncertain, **flag**—do not infer quantities or units.
