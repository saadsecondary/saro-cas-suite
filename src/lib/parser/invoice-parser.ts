// Deterministic parser for the Zam Zam Traders DOS-style CASH MEMO / INVOICE.
//
// The PDF tokens use DOS-style glyph spacing — each visual character is
// rendered with a space after it. pdf-text.ts now normalizes that at the row
// level: row.text reads like a human would type it ("Customer Name: D.M MEDICAL
// Cust. Code : 7216"). The header fields are extracted from those clean rows,
// while line items still use coordinate-based column mapping so the Sale Qty
// and Free Qty columns are never merged.

import type { Invoice, InvoiceLine } from "@/lib/db";
import {
  extractPdf, cleanCell, parseNum, squashSpaces,
  type PdfRow, type PdfToken,
} from "./pdf-text";
import { parseDMY } from "@/lib/format";

export interface ParseResult {
  ok: boolean;
  invoice?: Invoice;
  rawText: string;
  confidence: number;
  lowConfidence: string[];
  error?: string;
}

const COLUMNS = [
  "sale", "free", "desc", "retail", "trade", "discReg", "discSpe",
  "tradeRate", "tradeAmt", "tax", "netAmt", "netRate",
] as const;
type ColKey = (typeof COLUMNS)[number];

interface ColMap {
  centers: Record<ColKey, number>;
}

function joinTokens(tokens: PdfToken[]): string {
  return cleanCell(tokens.map(t => t.text).join(" "));
}

export async function parseInvoicePdf(file: File): Promise<ParseResult> {
  const lowConfidence: string[] = [];
  try {
    const { rows } = await extractPdf(file);
    const rawText = rows.map(r => r.text).join("\n");

    const compactHeader = rawText.slice(0, 400).replace(/[^A-Z0-9]/gi, "").toUpperCase();
    if (!compactHeader.includes("CASHMEMO") && !compactHeader.includes("INVOICE")) {
      return { ok: false, rawText, confidence: 0, lowConfidence, error: "Not a Zam Zam Traders invoice." };
    }

    // Extract header fields from cleaned per-row text. Each row is a separate
    // line so we can anchor with start/end and avoid greedy bleed-over.
    const lines = rows.map(r => r.text);
    const lineGet = (re: RegExp): string | null => {
      for (const l of lines) {
        const m = l.match(re);
        if (m) return cleanCell(m[1]).replace(/[│|]/g, "").trim() || null;
      }
      return null;
    };

    // "Number : 082909 Date : 13/06/2026 Page No. : 1"
    const number = squashSpaces(lineGet(/Number\s*[:#]\s*([0-9]{3,})/i) ?? "");
    const dateRaw = lineGet(/Date\s*[:#]?\s*([\d\/\-\.]{6,12})/i);
    const date = dateRaw ? parseDMY(dateRaw.replace(/\s+/g, "")) : null;

    // "Customer Name: D.M MEDICAL Cust. Code : 7216"
    const customerName = lineGet(/Customer\s*Name\s*[:#]?\s*(.+?)\s+Cust\.?\s*Code/i)
                       ?? lineGet(/Customer\s*Name\s*[:#]?\s*(.+)$/i);
    const customerCode = squashSpaces(lineGet(/Cust\.?\s*Code\s*[:#]?\s*([A-Za-z0-9\-]+)/i) ?? "");

    // "Address : CHISTI NAGAR Booker Name: SALEEM(BABA"
    const address = lineGet(/Address\s*[:#]?\s*(.+?)\s+Booker\s*Name/i)
                 ?? lineGet(/Address\s*[:#]?\s*(.+)$/i);
    const bookerName = lineGet(/Booker\s*Name\s*[:#]?\s*(.+?)(?:\s+Deliveryman|$)/i);
    const deliveryman = lineGet(/Deliveryman\s*[:#]?\s*(.+?)(?:\s+CUSTOMER|$)/i);
    const customerNo = lineGet(/CUSTOMER\s*NO\.?\s*[:#]?\s*([A-Za-z0-9\-]*)/i);

    if (!number) return { ok: false, rawText, confidence: 0, lowConfidence, error: "Could not find invoice number." };
    if (!date) lowConfidence.push("date");
    if (!customerName) lowConfidence.push("customerName");
    if (!customerCode) lowConfidence.push("customerCode");

    const colMap = detectColumns(rows);
    if (!colMap) lowConfidence.push("columns");

    const compact = (v: string) => v.replace(/[^A-Z0-9]/gi, "").toUpperCase();
    const totalIdx = rows.findIndex(r => compact(r.text).includes("TOTALOFITEMS") || compact(r.text).includes("TOTALITEMS"));
    const headerIdx = rows.findIndex(r => compact(r.text).includes("DESCRIPTION"));
    const itemRows = (headerIdx >= 0 && totalIdx > headerIdx)
      ? rows.slice(headerIdx + 1, totalIdx).filter(r => r.tokens.length > 0)
      : [];

    const itemLines: InvoiceLine[] = [];
    if (colMap) {
      for (const row of itemRows) {
        const line = rowToLine(row, colMap);
        if (line && (line.description || line.saleQty || line.netAmount)) {
          itemLines.push(line);
        }
      }
    }

    const totalRowText = rows[totalIdx]?.text ?? "";
    const itemCountMatch = totalRowText.match(/ITEMS\s*:?\s*(\d+)/i);
    const declaredItemCount = itemCountMatch ? parseInt(itemCountMatch[1], 10) : itemLines.length;
    const nums = totalRowText.match(/[\d,]+\.?\d*/g) ?? [];
    let grandTotal = nums.length ? parseNum(nums[nums.length - 1]) : 0;
    if (!grandTotal) {
      grandTotal = itemLines.reduce((a, l) => a + (l.netAmount || 0), 0);
      lowConfidence.push("grandTotal");
    }

    if (!itemLines.length) lowConfidence.push("lines");

    const inv: Invoice = {
      number: String(number).trim(),
      date: date ?? "",
      customerCode: customerCode ? String(customerCode).trim() : "UNCODED",
      customerName: customerName ? cleanCell(customerName) : "UNKNOWN",
      address: address ? cleanCell(address) : undefined,
      bookerName: bookerName ? cleanCell(bookerName) : undefined,
      deliveryman: deliveryman ? cleanCell(deliveryman) : undefined,
      customerNo: customerNo ? cleanCell(customerNo) : undefined,
      lines: itemLines,
      itemCount: declaredItemCount,
      grandTotal,
      source: "pdf-import",
      sourceFile: file.name,
      rawText,
      confidence: 1 - Math.min(0.5, lowConfidence.length * 0.1),
      lowConfidenceFields: lowConfidence.length ? lowConfidence : undefined,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    return { ok: true, invoice: inv, rawText, confidence: inv.confidence, lowConfidence };
  } catch (e: any) {
    return { ok: false, rawText: "", confidence: 0, lowConfidence: [], error: e?.message ?? String(e) };
  }
}

function compact(value: string): string {
  return value.replace(/[^A-Z0-9]/gi, "").toUpperCase();
}

// Locate the column header in the table (two stacked rows with the labels) and
// compute the X center of each column from the actual rendered glyphs.
function detectColumns(rows: PdfRow[]): ColMap | null {
  const qtyRowIdx = rows.findIndex(r => compact(r.text).includes("QUANTITY") && compact(r.text).includes("ITEM"));
  if (qtyRowIdx < 0) return null;
  const subRow = rows[qtyRowIdx + 1];
  if (!subRow) return null;

  const centers: Partial<Record<ColKey, number>> = {};
  const all: PdfToken[] = [...rows[qtyRowIdx].tokens, ...subRow.tokens];

  const findCenter = (predicate: (s: string) => boolean): number | undefined => {
    const hits = all.filter(t => predicate(cleanCell(t.text)));
    if (!hits.length) return undefined;
    const sum = hits.reduce((a, t) => a + t.x + t.width / 2, 0);
    return sum / hits.length;
  };

  centers.sale     = findCenter(s => /^Sal/i.test(s) && s.length <= 6);
  centers.free     = findCenter(s => /^Free$/i.test(s));
  centers.desc     = findCenter(s => /Descri/i.test(s));
  centers.retail   = findCenter(s => /Ret\s*ai?\s*l/i.test(s));
  centers.trade    = findCenter(s => /^Trade$/i.test(s) || /^Trade\s*Price/i.test(s));
  centers.discReg  = findCenter(s => /^Regu/i.test(s));
  centers.discSpe  = findCenter(s => /^Spe/i.test(s));
  centers.tradeRate= findCenter(s => /^RATE$/i.test(s));
  centers.tradeAmt = findCenter(s => /^AMOUNT$/i.test(s));
  centers.tax      = findCenter(s => /^SALES$/i.test(s) || /^TAX$/i.test(s));
  centers.netAmt   = findCenter(s => /^Net$/i.test(s) || /^Amount$/i.test(s));
  centers.netRate  = findCenter(s => /^NET$/i.test(s) || /^RATE$/i.test(s));

  const present = COLUMNS.filter(c => centers[c] !== undefined);
  if (present.length < 4) return null;

  const xs: Record<ColKey, number> = {} as any;
  for (let i = 0; i < COLUMNS.length; i++) {
    const k = COLUMNS[i];
    if (centers[k] !== undefined) { xs[k] = centers[k]!; continue; }
    let pIdx = i - 1; while (pIdx >= 0 && centers[COLUMNS[pIdx]] === undefined) pIdx--;
    let nIdx = i + 1; while (nIdx < COLUMNS.length && centers[COLUMNS[nIdx]] === undefined) nIdx++;
    if (pIdx >= 0 && nIdx < COLUMNS.length) {
      const span = nIdx - pIdx;
      const frac = (i - pIdx) / span;
      xs[k] = centers[COLUMNS[pIdx]]! + (centers[COLUMNS[nIdx]]! - centers[COLUMNS[pIdx]]!) * frac;
    } else if (pIdx >= 0) {
      xs[k] = centers[COLUMNS[pIdx]]! + 30;
    } else if (nIdx < COLUMNS.length) {
      xs[k] = centers[COLUMNS[nIdx]]! - 30;
    } else {
      xs[k] = 0;
    }
  }
  return { centers: xs };
}

function rowToLine(row: PdfRow, map: ColMap): InvoiceLine | null {
  const buckets: Record<ColKey, PdfToken[]> = {
    sale: [], free: [], desc: [], retail: [], trade: [],
    discReg: [], discSpe: [], tradeRate: [], tradeAmt: [],
    tax: [], netAmt: [], netRate: [],
  };
  const realTokens = row.tokens.filter(t => !/^[│|┌┐└┘├┤┬┴┼─═]+$/.test(t.text));
  if (!realTokens.length) return null;

  for (const t of realTokens) {
    let bestKey: ColKey = "desc";
    let bestDist = Number.POSITIVE_INFINITY;
    const center = t.x + t.width / 2;
    for (const k of COLUMNS) {
      const d = Math.abs(center - map.centers[k]);
      if (d < bestDist) { bestDist = d; bestKey = k; }
    }
    buckets[bestKey].push(t);
  }

  const description = cleanCell(buckets.desc.map(t => t.text).join(" "));
  const saleQty   = parseNum(joinTokens(buckets.sale));
  const freeQty   = parseNum(joinTokens(buckets.free));
  const retail    = parseNum(joinTokens(buckets.retail));
  const trade     = parseNum(joinTokens(buckets.trade));
  const discReg   = parseNum(joinTokens(buckets.discReg));
  const discSpe   = parseNum(joinTokens(buckets.discSpe));
  const tradeRate = parseNum(joinTokens(buckets.tradeRate));
  const tradeAmt  = parseNum(joinTokens(buckets.tradeAmt));
  const tax       = parseNum(joinTokens(buckets.tax));
  const netAmount = parseNum(joinTokens(buckets.netAmt));
  const netRate   = parseNum(joinTokens(buckets.netRate));

  if (!description && !saleQty && !freeQty && !netAmount) return null;

  return {
    description,
    saleQty,
    freeQty,
    retailPrice: retail,
    tradePrice: trade,
    discountRegular: discReg,
    discountSpecial: discSpe,
    tradeOfferRate: tradeRate,
    tradeOfferAmount: tradeAmt,
    salesTax: tax,
    netAmount,
    netRate,
  };
}
