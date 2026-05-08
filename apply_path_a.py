"""
apply_path_a.py - v14.10.11 Path A patch

Applies Change 1 (keyword loosening) and Change 3 (runtime guardrail)
from the broken ed78be3 commit, deliberately SKIPPING Change 2
(body-text scan) because it caused LLM hallucination on shared-content
pages.

Run from F:\\Dev\\projmgtai-landing on branch v14.10.11-final.

After running:
  - both API route copies should hash-equal
  - hash should NOT equal ed78be3's 1FF0EC7B...A8DC (Change 2 missing)
"""

import hashlib
import sys
from pathlib import Path

ROOT = Path(r"F:\Dev\projmgtai-landing")
TARGETS = [
    ROOT / "pages" / "api" / "scope-extractor-v14.ts",
    ROOT / "src" / "pages" / "api" / "scope-extractor-v14.ts",
]

# --- Change 1: keyword loosening, anchored in title-zone scoring patterns ---
CHANGE_1_OLD = """    [/Service\\s*Manager/i, "Service Manager", 10],
    [/Reception\\s*Desk/i, "Reception Desk", 10],
    [/Team\\s*(?:Member|Memb)/i, "Team Members", 10],"""

CHANGE_1_NEW = """    [/Service\\s*Manager/i, "Service Manager", 10],
    [/Reception\\s*Desk/i, "Reception Desk", 10],
    [/\\bFront\\s*Desk\\b/i, "Reception Desk", 10],                  // v14.10.11: alias - "FRONT DESK 219 SF"
    [/\\bRECEPTION\\s+\\d{3}/, "Reception Desk", 10],                // v14.10.11: floor-plan label "RECEPTION 100"
    [/\\b\\d{3}[A-Z]?\\s+RECEPTION\\b/, "Reception Desk", 10],       // v14.10.11: door-schedule label "100A RECEPTION"
    [/\\bRECEPTION\\s+\\d+\\s*SF\\b/, "Reception Desk", 10],         // v14.10.11: room schedule "RECEPTION 99 SF"

    [/Team\\s*(?:Member|Memb)/i, "Team Members", 10],"""

# --- Change 3: runtime guardrail, anchored at analyze handler post-grouping ---
CHANGE_3_OLD = """      const ctx = extractProjectContext(pages);
      const rooms = groupPagesByRoom(pages);

      // Log for debugging"""

CHANGE_3_NEW = """      const ctx = extractProjectContext(pages);
      const rooms = groupPagesByRoom(pages);

      // v14.10.11: Runtime guardrail. If any page text contains reception
      // labels but groupPagesByRoom produced no Reception Desk room, log a
      // warning. This catches future regressions immediately rather than
      // discovering them in customer Excel output six weeks later.
      const _hasReceptionRoom = rooms.some(r => r.roomName === "Reception Desk");
      if (!_hasReceptionRoom) {
        const _pagesWithReceptionLabels = pages
          .filter(p => /\\bRECEPTION\\s+\\d|\\d{3}[A-Z]?\\s+RECEPTION\\b|\\bFront\\s*Desk\\b/i.test(p.text))
          .map(p => p.pageNum);
        if (_pagesWithReceptionLabels.length > 0) {
          console.log(`[v14.10.11] WARN: pages ${JSON.stringify(_pagesWithReceptionLabels)} contain reception labels but no Reception Desk room was produced`);
        }
      }

      // Log for debugging"""


def patch_file(path: Path) -> str:
    """Apply Changes 1 and 3 to one file. Returns new SHA256."""
    if not path.exists():
        sys.exit(f"ERROR: file not found: {path}")

    content = path.read_text(encoding="utf-8")

    # Change 1
    if CHANGE_1_OLD not in content:
        sys.exit(f"ERROR: Change 1 anchor NOT FOUND in {path}\n"
                 f"File may not be at the expected baseline (main / 54aa8e5).")
    if content.count(CHANGE_1_OLD) != 1:
        sys.exit(f"ERROR: Change 1 anchor matched {content.count(CHANGE_1_OLD)} times in {path} (expected 1).")
    content = content.replace(CHANGE_1_OLD, CHANGE_1_NEW, 1)

    # Change 3
    if CHANGE_3_OLD not in content:
        sys.exit(f"ERROR: Change 3 anchor NOT FOUND in {path}")
    if content.count(CHANGE_3_OLD) != 1:
        sys.exit(f"ERROR: Change 3 anchor matched {content.count(CHANGE_3_OLD)} times in {path} (expected 1).")
    content = content.replace(CHANGE_3_OLD, CHANGE_3_NEW, 1)

    path.write_text(content, encoding="utf-8")

    h = hashlib.sha256(content.encode("utf-8")).hexdigest().upper()
    return h


def main():
    print("v14.10.11 Path A patch")
    print("Targets:")
    for t in TARGETS:
        print(f"  {t}")
    print()

    hashes = []
    for target in TARGETS:
        h = patch_file(target)
        hashes.append(h)
        print(f"  patched {target.name}: SHA256={h}")

    print()
    if hashes[0] == hashes[1]:
        print(f"OK: both files hash-equal: {hashes[0]}")
    else:
        sys.exit(f"ERROR: file hashes differ! {hashes[0]} vs {hashes[1]}")

    BROKEN_HASH = "1FF0EC7B753D7581A81BE369162E7457BEEFBA30E728479A90D60FF38C6A48DC"
    if hashes[0] == BROKEN_HASH:
        sys.exit("ERROR: hash equals ed78be3's broken-state hash. Change 2 may have been included.")
    else:
        print(f"OK: hash differs from ed78be3 broken state ({BROKEN_HASH[:16]}...) - Change 2 correctly omitted.")

    print()
    print("Patch complete. Next steps:")
    print("  1. git diff --stat                  # should show 2 files, 36 insertions total")
    print("  2. git diff pages/api/scope-extractor-v14.ts")
    print("  3. git add -A && git commit -m \"v14.10.11: Reception Desk Path A - keyword loosening + runtime guardrail\"")


if __name__ == "__main__":
    main()
