'use client'                  // <-- add this line

// src/lib/exportToXLSX.ts
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { ScopeItem } from "./parsePlansAndSaveScopes";

type TradeScopes = Record<string, ScopeItem[]>;

function sanitizeCell(v: any): any {
  const s = String(v ?? "");
  if (/^[=\-+@]/.test(s)) return `'${s}`;
  return s;
}

export async function exportTradeToXLSX(trade: string, items: ScopeItem[]) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "ProjMgtAI";
  const ws = wb.addWorksheet(trade);

  ws.addRow(["Trade", trade]);
  ws.addRow([]);
  ws.addRow(["Item", "Qty", "Sheet", "Notes"]);
  items.forEach(it => {
    ws.addRow([
      sanitizeCell(it.item || ""),
      sanitizeCell(it.qty ?? ""),
      sanitizeCell(it.sheet || ""),
      sanitizeCell(it.notes || "")
    ]);
  });

  ws.columns = [
    { key: "item", width: 40 },
    { key: "qty", width: 10 },
    { key: "sheet", width: 12 },
    { key: "notes", width: 40 },
  ];

  const buf = await wb.xlsx.writeBuffer();
  saveAs(new Blob([buf]), `${trade}_Scope.xlsx`);
}

export async function exportAllTradesToXLSX(scopes: TradeScopes, projectName: string) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "ProjMgtAI";
  Object.entries(scopes).forEach(([trade, items]) => {
    const ws = wb.addWorksheet(trade);
    ws.addRow(["Trade", trade]);
    ws.addRow([]);
    ws.addRow(["Item", "Qty", "Sheet", "Notes"]);
    items.forEach(it => {
      ws.addRow([
        sanitizeCell(it.item || ""),
        sanitizeCell(it.qty ?? ""),
        sanitizeCell(it.sheet || ""),
        sanitizeCell(it.notes || "")
      ]);
    });
    ws.columns = [
      { key: "item", width: 40 },
      { key: "qty", width: 10 },
      { key: "sheet", width: 12 },
      { key: "notes", width: 40 },
    ];
  });

  const buf = await wb.xlsx.writeBuffer();
  saveAs(new Blob([buf]), `${projectName}_All_Trades_Scope.xlsx`);
}
