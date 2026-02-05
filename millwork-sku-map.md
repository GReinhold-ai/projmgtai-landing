# Millwork SKU & Spec-Section Map (ProjMgtAI)
_Last updated: 2025-10-08_

**Purpose:** Provide examples so agents ground model numbers and CSI spec sections correctly.  
**Rule:** Put model/SKU/Spec **only** in **Spec/Detail ref**; keep **Item** as the normalized name from the Glossary.

---

## 0) Field definitions
- **Item (normalized):** Canonical name (see Millwork Glossary).
- **Spec/Detail ref:** CSI section, model/SKU, detail/elevation callout.
- **Units:** EA / LF / SF.
- **Notes:** Finish/species/edge/profile as applicable.

---

## 1) Casework & Countertops

| Item (normalized) | Typical CSI | Example Model / SKU | Spec/Detail ref (example) | Notes |
|---|---|---|---|---|
| Base cabinets | **06 41 00** Architectural Wood Casework | AWI Premium, Type B24 | `06 41 00 / AWI-PREM / B24` | Module width in Notes (24", 36") |
| Wall cabinets | **06 41 00** | AWI Premium, Type W36 | `06 41 00 / AWI-PREM / W36` | Mount height if specified |
| Tall cabinets | **06 41 00** | AWI Premium, Type T24 | `06 41 00 / AWI-PREM / T24` | Include ovens/appliance bays in Notes |
| Countertop (solid-surface) | **06 61 16** Solid Surface Fabrications | Corian® Glacier White 2 cm | `06 61 16 / CORIAN / GLACIER-WHITE / 2cm` | LF; separate backsplash |
| Countertop (quartz) | **06 61 19** Quartz Surfacing | Caesarstone® 2141 Snow 2 cm | `06 61 19 / CAESARSTONE / 2141 / 2cm` | LF |
| Backsplash | **06 61 16 / 06 61 19** | Match top | `See top spec` | LF, separate line |

---

## 2) Panels, Trim, Veneers

| Item (normalized) | Typical CSI | Example Model / SKU | Spec/Detail ref | Notes |
|---|---|---|---|---|
| Wall panel | **06 20 00** Finish Carpentry | Veneer: White Oak, rift | `06 20 00 / VNR-WO-RIFT` | SF for field; EA for discrete |
| Trim – Base | **06 20 00** | MDF 5-1/4" profile B-3 | `06 20 00 / MDF / PROF-B3 / 5.25"` | LF |
| Trim – Crown | **06 20 00** | MDF profile C-2 | `06 20 00 / MDF / PROF-C2` | LF |
| Edge banding | **06 41 00** | ABS/PVC 2 mm, match | `06 41 00 / EBAND / 2mm / MATCH` | Note color/species |

---

## 3) Doors, Frames, Hardware (Millwork scope)

| Item (normalized) | Typical CSI | Example Model / SKU | Spec/Detail ref | Notes |
|---|---|---|---|---|
| Wood door (millwork) | **08 14 16** Flush Wood Doors (if under Div 06, note that) | VT Industries D-Series | `08 14 16 / VT / D-SERIES` | EA; thickness/spec |
| Wood frame | **08 12 14** | Custom hardwood frame | `08 12 14 / CUSTOM-HW` | EA |
| Hardware set (millwork) | **08 71 00** Door Hardware | Set HW-102 (Hinge HBP1800, Closer 4040XP, Lever L9080) | `08 71 00 / SET HW-102` | List set # only in Spec/Detail ref; do not expand into Item |

---

## 4) Drawers, Slides, Hinges, Pulls (component examples)

| Item (normalized) | Typical CSI | Example Model / SKU | Spec/Detail ref | Notes |
|---|---|---|---|---|
| Drawer slide | **06 41 00** (components) | Blum TANDEM 563H | `COMP / BLUM / 563H` | EA |
| Hinge (concealed) | **06 41 00** | Blum CLIP top 110° | `COMP / BLUM / CLIPTOP-110` | EA |
| Pull / handle | **06 41 00** | Richelieu BP54228 | `COMP / RICHELIEU / BP54228` | EA; c-to-c dimension in Notes |

---

## 5) Laminates & Sheet Goods

| Item (normalized) | Typical CSI | Example Model / SKU | Spec/Detail ref | Notes |
|---|---|---|---|---|
| Plastic laminate (HPL) | **06 41 00 / 12 36 00** | Wilsonart 10776K-12 | `HPL / WILSONART / 10776K-12` | Apply to fronts/sides per detail |
| Plywood core | **06 41 00** | 3/4" VC, PS1 | `CORE / PLY / 3-4 VC PS1` | Note core grade |
| MDF core | **06 41 00** | 3/4" MDF | `CORE / MDF / 3-4` | For paint-grade |

---

## 6) Adhesives, Finishes (reference only—don’t turn into Items)

| Reference | Typical CSI | Example | Spec/Detail ref | Usage note |
|---|---|---|---|---|
| Adhesive | **06 05 73** | 3M 1357 | `ADH / 3M / 1357` | Reference only; not a bid line unless specified |
| Clear finish | **09 93 00** | AWI TR-4 Poly | `FIN / AWI / TR-4` | Put sheen/species in **Notes** |

---

## 7) Normalization mapping (examples)
- “Wall cabs W36 Laminate Wilsonart 10776-12” → **Item:** *Wall cabinets* | **Spec/Detail ref:** `06 41 00 / HPL / WILSONART / 10776-12 / W36` | **Units:** EA | **Notes:** module width.
- “Reception desk per A9.51/2, Corian GW” → **Item:** *Custom counter assembly* | **Spec/Detail ref:** `A9.51/2; 06 61 16 / CORIAN / GLACIER-WHITE` | **Units:** EA.
- “Base trim MDF 5.25" B-3” → **Item:** *Base trim* | **Spec/Detail ref:** `06 20 00 / MDF / PROF-B3 / 5.25"` | **Units:** LF.

---

## 8) Ambiguity rules
- If a model number appears but section is missing, keep the model in **Spec/Detail ref** and set `Flag = "Missing CSI section"`.
- If only brand/material is given (e.g., “Quartz 2cm”), use the correct CSI (**06 61 19**) and add brand if present.
- Never move model numbers into **Item**; keep Items normalized.

