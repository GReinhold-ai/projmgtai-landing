import re, csv
import pdfplumber

PDF  = r"F:\ProjMgtAI\Plan PDFs\WELL-QUEST ASSISTED LIVING\MENIFEE LAKES SUBMITTAL 1 DRAWING PACKAGE R1 19013.pdf"
PAGE = 78  # 1-indexed; A12.1
OUT  = r"F:\Dev\projmgtai-landing\a121_chars.tsv"

with pdfplumber.open(PDF) as pdf:
    page  = pdf.pages[PAGE - 1]
    chars = page.chars
    words = page.extract_words(x_tolerance=2, y_tolerance=2)

# write every glyph with its bbox (authoritative raw signal)
with open(OUT, "w", encoding="utf-8", newline="") as f:
    w = csv.writer(f, delimiter="\t")
    w.writerow(["x0", "x1", "top", "bottom", "text"])
    for c in chars:
        w.writerow([round(c["x0"],2), round(c["x1"],2),
                    round(c["top"],2), round(c["bottom"],2), c["text"]])

# immediate quality read so we know pdfplumber fixed coverage before re-upload
zero = sum(1 for c in chars if c["x0"]==0 and c["top"]==0)
dims = [x for x in words if re.match(r'^\d+"$', x["text"])]
mcs  = [x for x in words if re.match(r'^M\d{1,2}$', x["text"])]
print(f"chars: {len(chars)}   words: {len(words)}   zero-bbox chars: {zero}")
print(f"dimension words: {len(dims)}   M-code words: {len(mcs)}")
print(f"sample M-codes: {[x['text'] for x in mcs][:20]}")
print(f"wrote {OUT}")
