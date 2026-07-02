import csv
import pdfplumber
PDF  = r"F:\ProjMgtAI\Plan PDFs\WELL-QUEST ASSISTED LIVING\MENIFEE LAKES SUBMITTAL 1 DRAWING PACKAGE R1 19013.pdf"
PAGE = 78
OUT  = r"F:\Dev\projmgtai-landing\a121_geom.tsv"
with pdfplumber.open(PDF) as pdf:
    page = pdf.pages[PAGE-1]
    print(f"lines:{len(page.lines)}  rects:{len(page.rects)}  edges:{len(page.edges)}  curves:{len(page.curves)}  images:{len(page.images)}")
    with open(OUT, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f, delimiter="\t")
        w.writerow(["kind","x0","x1","top","bottom","width","height"])
        for L in page.lines:
            w.writerow(["line",round(L["x0"],1),round(L["x1"],1),round(L["top"],1),round(L["bottom"],1),round(L["width"],1),round(L["height"],1)])
        for R in page.rects:
            w.writerow(["rect",round(R["x0"],1),round(R["x1"],1),round(R["top"],1),round(R["bottom"],1),round(R["width"],1),round(R["height"],1)])
print(f"wrote {OUT}")
