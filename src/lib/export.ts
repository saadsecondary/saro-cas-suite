// CSV / XLSX / PDF export helpers.

import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import jsPDF from "jspdf";

export function downloadCSV(filename: string, rows: Array<Record<string, unknown>>) {
  if (!rows.length) {
    saveAs(new Blob([""], { type: "text/csv;charset=utf-8" }), filename);
    return;
  }
  const headers = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = String(v).replace(/"/g, '""');
    return /[",\n]/.test(s) ? `"${s}"` : s;
  };
  const csv = [headers.join(","), ...rows.map(r => headers.map(h => esc(r[h])).join(","))].join("\n");
  saveAs(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }), filename);
}

export function downloadXLSX(filename: string, rows: Array<Record<string, unknown>>, sheetName = "Sheet1") {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  saveAs(new Blob([buf], { type: "application/octet-stream" }), filename);
}

export function downloadJSON(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  saveAs(blob, filename);
}

// Generate a clean ledger / statement PDF using the print-friendly DOM.
export async function printElementAsPDF(el: HTMLElement, filename: string) {
  // Simple A4 PDF via jsPDF using html method.
  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  await pdf.html(el, {
    callback: (doc) => doc.save(filename),
    margin: [24, 24, 24, 24],
    autoPaging: "text",
    html2canvas: { scale: 0.6, useCORS: true, backgroundColor: "#ffffff" },
    width: 547,
    windowWidth: 900,
  });
}

// Trigger the browser print dialog. We temporarily swap the document title to
// the app name so any browser-injected print header/footer reads "Zam Zam
// Traders" instead of leaking the URL or hosting platform name.
// (Tip for end users: most browsers also let you disable "Headers and footers"
// in the print dialog's "More settings" to remove those entirely.)
export function triggerPrint() {
  if (typeof document === "undefined") return;
  const original = document.title;
  document.title = "Zam Zam Traders";
  const restore = () => { document.title = original; window.removeEventListener("afterprint", restore); };
  window.addEventListener("afterprint", restore);
  // Safety: restore on next tick in case afterprint never fires.
  setTimeout(restore, 60_000);
  window.print();
}
