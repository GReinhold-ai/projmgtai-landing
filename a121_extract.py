from pypdf import PdfReader

PDF  = r"F:\ProjMgtAI\Plan PDFs\WELL-QUEST ASSISTED LIVING\MENIFEE LAKES SUBMITTAL 1 DRAWING PACKAGE R1 19013.pdf"
PAGE = 78  # 1-indexed; A12.1 Interior Elevations
OUT  = r"C:\Dev\projmgtai_parser_minimal\a121_coords.tsv"

reader = PdfReader(PDF)
page   = reader.pages[PAGE - 1]

rows = []
def visitor(text, cm, tm, font_dict, font_size):
    t = (text or "").strip()
    if not t:
        return
    # tm[4],tm[5] = text-matrix offset; cm[4],cm[5] = current-matrix offset (kept as a fallback)
    rows.append((round(tm[4], 2), round(tm[5], 2), round(cm[4], 2), round(cm[5], 2), t))

page.extract_text(visitor_text=visitor)

with open(OUT, "w", encoding="utf-8") as f:
    f.write("x\ty\tcm_x\tcm_y\ttext\n")
    for x, y, cx, cy, t in rows:
        f.write(f"{x}\t{y}\t{cx}\t{cy}\t{t}\n")

xs = [r[0] for r in rows]; ys = [r[1] for r in rows]
print(f"page {PAGE}: {len(rows)} fragments")
print(f"x range {min(xs):.0f}..{max(xs):.0f}   |   y range {min(ys):.0f}..{max(ys):.0f}")
print(f"wrote {OUT}")
