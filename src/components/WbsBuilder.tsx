"use client";

import React, { useEffect, useState } from "react";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8080";

type WbsRow = {
  inBid: boolean;
  className: string;
  qty: number;
  unit: string;
  location: string;
  sheet: string;
  elevation: string;
  description: string;
  page?: number | null;
};

export default function WbsBuilderPage() {
  const [rows, setRows] = useState<WbsRow[]>([]);
  const [showOnlyBid, setShowOnlyBid] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isClassifying, setIsClassifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load rows from localStorage that were saved on the upload page
  useEffect(() => {
    try {
      const stored = localStorage.getItem("projmgtai_scope_items");
      if (!stored) return;
      const scopeItems: {
        id: string;
        raw_text: string;
        page_number?: number | null;
      }[] = JSON.parse(stored);

      const initialRows: WbsRow[] = scopeItems.map((item) => ({
        inBid: true,
        className: "Unc",
        qty: 1,
        unit: "EA",
        location: "",
        sheet: item.page_number ? `Page ${item.page_number}` : "",
        elevation: "",
        description: item.raw_text,
        page: item.page_number ?? null,
      }));
      setRows(initialRows);
    } catch (e) {
      console.error("Failed to parse stored scope items", e);
    }
  }, []);

  const visibleRows = showOnlyBid ? rows.filter((r) => r.inBid) : rows;

  const updateRow = (index: number, patch: Partial<WbsRow>) => {
    setRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  };

  const removeRow = (index: number) => {
    setRows((prev) => prev.filter((_, i) => i !== index));
  };

  const handleExportCsv = async () => {
    try {
      setIsExporting(true);
      setError(null);

      const payload = {
        rows: rows.map((r) => ({
          in_bid: r.inBid,
          class_name: r.className,
          qty: r.qty,
          unit: r.unit,
          location: r.location,
          sheet: r.sheet,
          elevation: r.elevation,
          description: r.description,
          page: r.page ?? null,
        })),
      };

      const res = await fetch(`${API_BASE_URL}/api/export_wbs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const detail = await res
          .json()
          .catch(() => ({ detail: "Export failed" }));
        throw new Error(detail.detail || "Export failed");
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "ProjMgtAI_WBS.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e: any) {
      console.error(e);
      setError(e.message || "Failed to export CSV");
    } finally {
      setIsExporting(false);
    }
  };

  const handleClassifyRows = async () => {
    if (!rows.length) return;
    try {
      setIsClassifying(true);
      setError(null);

      const payload = {
        rows: rows.map((r) => ({
          in_bid: r.inBid,
          class_name: r.className,
          qty: r.qty,
          unit: r.unit,
          location: r.location,
          sheet: r.sheet,
          elevation: r.elevation,
          description: r.description,
          page: r.page ?? null,
        })),
      };

      const res = await fetch(`${API_BASE_URL}/api/classify_rows`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const detail = await res
          .json()
          .catch(() => ({ detail: "Classification failed" }));
        throw new Error(detail.detail || "Classification failed");
      }

      const data: {
        classifications: { index: number; class_name: string; in_bid: boolean }[];
      } = await res.json();

      setRows((prev) => {
        const next = [...prev];
        for (const c of data.classifications) {
          if (c.index < 0 || c.index >= next.length) continue;
          next[c.index] = {
            ...next[c.index],
            className: c.class_name,
            inBid: c.in_bid,
          };
        }
        return next;
      });
    } catch (e: any) {
      console.error(e);
      setError(e.message || "Failed to classify rows");
    } finally {
      setIsClassifying(false);
    }
  };

  const totalBidRows = rows.filter((r) => r.inBid).length;

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 px-8 py-6">
      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">
            ProjMgtAI – Millwork WBS Builder
          </h1>
          <p className="text-sm text-slate-400">
            Review and refine scope rows before pricing and bid generation.
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-300">
          <span>
            Rows in bid:{" "}
            <span className="font-semibold text-emerald-400">
              {totalBidRows}
            </span>
          </span>
          <span>
            Millwork rows:{" "}
            <span className="font-semibold text-sky-400">
              {
                rows.filter(
                  (r) =>
                    r.className.toLowerCase() === "core" ||
                    r.className.toLowerCase() === "mw" ||
                    r.className.toLowerCase() === "millwork",
                ).length
              }
            </span>
          </span>
        </div>
      </header>

      <div className="flex items-center gap-3 mb-4">
        <button
          type="button"
          onClick={() => (window.location.href = "/upload")}
          className="px-4 py-2 rounded bg-slate-800 hover:bg-slate-700 text-sm"
        >
          ← Back to Upload
        </button>

        <button
          type="button"
          onClick={handleClassifyRows}
          disabled={isClassifying || !rows.length}
          className="px-4 py-2 rounded bg-purple-600 hover:bg-purple-500 disabled:bg-slate-700 text-sm"
        >
          {isClassifying ? "Classifying…" : "AI Classify Rows"}
        </button>

        <button
          type="button"
          onClick={handleExportCsv}
          disabled={isExporting || !rows.length}
          className="px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 text-sm"
        >
          {isExporting ? "Exporting…" : "Export WBS to Excel (CSV)"}
        </button>

        <label className="ml-auto flex items-center gap-2 text-xs text-slate-300">
          <input
            type="checkbox"
            checked={showOnlyBid}
            onChange={(e) => setShowOnlyBid(e.target.checked)}
            className="h-4 w-4"
          />
          Show only bid rows
        </label>
      </div>

      {error && (
        <div className="mb-3 rounded border border-red-500 bg-red-950/60 px-3 py-2 text-xs text-red-200">
          {error}
        </div>
      )}

      <div className="border border-slate-800 rounded-lg overflow-hidden">
        <div className="grid grid-cols-[60px,100px,60px,70px,1.2fr,120px,120px,1.8fr,40px] bg-slate-900 text-xs font-medium">
          <div className="px-3 py-2 border-r border-slate-800">Bid</div>
          <div className="px-3 py-2 border-r border-slate-800">Class</div>
          <div className="px-3 py-2 border-r border-slate-800">Qty</div>
          <div className="px-3 py-2 border-r border-slate-800">Unit</div>
          <div className="px-3 py-2 border-r border-slate-800">Location</div>
          <div className="px-3 py-2 border-r border-slate-800">Sheet</div>
          <div className="px-3 py-2 border-r border-slate-800">Elevation</div>
          <div className="px-3 py-2 border-r border-slate-800">Description</div>
          <div className="px-3 py-2 text-center">Pg</div>
        </div>

        <div className="max-h-[70vh] overflow-y-auto text-xs">
          {visibleRows.map((row, idx) => {
            const realIndex = showOnlyBid
              ? rows.findIndex((r) => r === row)
              : idx;

            return (
              <div
                key={realIndex}
                className="grid grid-cols-[60px,100px,60px,70px,1.2fr,120px,120px,1.8fr,40px] border-t border-slate-900"
              >
                {/* Bid checkbox */}
                <div className="flex items-center justify-center border-r border-slate-900">
                  <input
                    type="checkbox"
                    checked={row.inBid}
                    onChange={(e) =>
                      updateRow(realIndex, { inBid: e.target.checked })
                    }
                    className="h-4 w-4"
                  />
                </div>

                {/* Class */}
                <div className="border-r border-slate-900">
                  <select
                    value={row.className}
                    onChange={(e) =>
                      updateRow(realIndex, { className: e.target.value })
                    }
                    className="w-full bg-slate-950 px-2 py-1 outline-none"
                  >
                    <option value="Unc">Unc</option>
                    <option value="CORE">CORE</option>
                    <option value="MISC">MISC</option>
                    <option value="NONMW">NONMW</option>
                  </select>
                </div>

                {/* Qty */}
                <div className="border-r border-slate-900">
                  <input
                    type="number"
                    min={0}
                    value={row.qty}
                    onChange={(e) =>
                      updateRow(realIndex, {
                        qty: Number(e.target.value) || 0,
                      })
                    }
                    className="w-full bg-slate-950 px-2 py-1 outline-none"
                  />
                </div>

                {/* Unit */}
                <div className="border-r border-slate-900">
                  <input
                    type="text"
                    value={row.unit}
                    onChange={(e) =>
                      updateRow(realIndex, { unit: e.target.value })
                    }
                    className="w-full bg-slate-950 px-2 py-1 outline-none"
                  />
                </div>

                {/* Location */}
                <div className="border-r border-slate-900">
                  <input
                    type="text"
                    value={row.location}
                    onChange={(e) =>
                      updateRow(realIndex, { location: e.target.value })
                    }
                    className="w-full bg-slate-950 px-2 py-1 outline-none"
                  />
                </div>

                {/* Sheet */}
                <div className="border-r border-slate-900">
                  <input
                    type="text"
                    value={row.sheet}
                    onChange={(e) =>
                      updateRow(realIndex, { sheet: e.target.value })
                    }
                    className="w-full bg-slate-950 px-2 py-1 outline-none"
                  />
                </div>

                {/* Elevation */}
                <div className="border-r border-slate-900">
                  <input
                    type="text"
                    value={row.elevation}
                    onChange={(e) =>
                      updateRow(realIndex, { elevation: e.target.value })
                    }
                    className="w-full bg-slate-950 px-2 py-1 outline-none"
                  />
                </div>

                {/* Description */}
                <div className="border-r border-slate-900">
                  <input
                    type="text"
                    value={row.description}
                    onChange={(e) =>
                      updateRow(realIndex, { description: e.target.value })
                    }
                    className="w-full bg-slate-950 px-2 py-1 outline-none"
                  />
                </div>

                {/* Page */}
                <div className="flex items-center justify-center text-slate-400">
                  {row.page ?? ""}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
