// Parser for the "PARTICULAR SALESMAN WISE DUE INVOICES DETAIL" report.
// Each row becomes an Invoice stub plus (if Received > 0) a seed Payment.

import type { Invoice, Payment } from "@/lib/db";
import { extractPdf, cleanCell, parseNum, squashSpaces } from "./pdf-text";
import { parseDMY } from "@/lib/format";

export interface OutstandingParseRow {
  invoice: Invoice;
  payment?: Omit<Payment, "id">;
  area?: string;
}
export interface OutstandingParseResult {
  ok: boolean;
  bookerName?: string;
  reportDate?: string;
  rows: OutstandingParseRow[];
  rawText: string;
  totals?: { amount: number; received: number; balance: number };
  error?: string;
}

export async function parseOutstandingPdf(file: File): Promise<OutstandingParseResult> {
  try {
    const { rows } = await extractPdf(file);
    const rawText = rows.map(r => r.text).join("\n");
    const compactText = rawText.replace(/[^A-Z0-9]/gi, "").toUpperCase();
    if (!compactText.includes("SALESMANWISEDUEINVOICES") && !compactText.includes("DUEINVOICESDETAIL")) {
      return { ok: false, rows: [], rawText, error: "Not a salesman-wise outstanding report." };
    }

    const lineGet = (re: RegExp): string | null => {
      for (const r of rows) {
        const m = r.text.match(re);
        if (m) return cleanCell(m[1]).trim() || null;
      }
      return null;
    };

    const bookerName = lineGet(/BOOKER\s*NAME\s*[:#]?\s*(.+)$/i) ?? undefined;
    const reportDateRaw = lineGet(/REPORT\s*DATE\s*[:#]?\s*([\d\/\-\.]+)/i);
    const reportDate = reportDateRaw ? (parseDMY(reportDateRaw.replace(/\s+/g, "")) ?? undefined) : undefined;

    const out: OutstandingParseRow[] = [];
    let currentArea: string | undefined;

    for (const r of rows) {
      const text = cleanCell(r.text);
      // Data rows look like: "| 1|078237|18/04/2026|UBAID MEDICAL | 7656.0| | 7656.0|"
      const cells = text.split("|").map(part => cleanCell(part)).slice(1, -1);
      if (cells.length >= 7 && /^\d+$/.test(cells[0]) && /^\d+$/.test(cells[1])) {
        const [, invNoRaw, dateRaw, name, amountS, receivedS] = cells;
        const invNo = squashSpaces(invNoRaw);
        const date = parseDMY(dateRaw.replace(/\s+/g, "")) ?? "";
        const amount = parseNum(amountS);
        const received = parseNum(receivedS);
        const customerCode = makeCustomerCode(name);
        const inv: Invoice = {
          number: invNo.trim(),
          date,
          customerCode,
          customerName: cleanCell(name),
          address: currentArea,
          bookerName,
          lines: [],
          itemCount: 0,
          grandTotal: amount,
          source: "outstanding-seed",
          sourceFile: file.name,
          rawText: text,
          confidence: 0.85,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        let payment: Omit<Payment, "id"> | undefined;
        if (received > 0) {
          payment = {
            customerCode,
            invoiceNumber: invNo.trim(),
            date,
            amount: received,
            method: "Imported",
            notes: "Seeded from outstanding report",
            source: "outstanding-seed",
            createdAt: Date.now(),
          };
        }
        out.push({ invoice: inv, payment, area: currentArea });
        continue;
      }
      // Area header: text-only row, no pipes, not a known label
      if (!/[|=]/.test(text)
          && !/TOTAL|REPORT|BOOKER|DUE\s*DATE|CONTINUE|END\s*OF|PARTICULAR|Sr\.?\s*#/i.test(text)
          && /[A-Z]/.test(text)
          && text.length > 2 && text.length < 80
          && !/^-+$/.test(text)) {
        currentArea = cleanCell(text);
      }
    }

    // Totals (best-effort)
    const totalsMatch = rawText.match(/TOTAL\s*[:\-]+\s*\|\s*([\d,. ]+)\s*\|\s*([\d,. ]+)\s*\|\s*([\d,. ]+)/i);
    const totals = totalsMatch
      ? { amount: parseNum(totalsMatch[1]), received: parseNum(totalsMatch[2]), balance: parseNum(totalsMatch[3]) }
      : undefined;

    return { ok: true, bookerName, reportDate, rows: out, rawText, totals };
  } catch (e: any) {
    return { ok: false, rows: [], rawText: "", error: e?.message ?? String(e) };
  }
}

// Outstanding reports don't carry customer codes, so we derive a stable one
// from the (normalized) name. The importer maps it back to a real coded
// customer when one with the same normalized name exists.
export function makeCustomerCode(name: string): string {
  const norm = cleanCell(name).toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return "N-" + norm.slice(0, 32);
}
