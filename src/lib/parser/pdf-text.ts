// Browser-only PDF text extraction with coordinates, using pdf.js.
//
// Zam Zam invoices are DOS-style PDFs. Each "word" is rendered as a single
// PDF text item but its glyphs are visually separated ("D. M MEDI CAL").
// Word boundaries are conveyed by wide horizontal gaps (separate empty
// space items in the PDF stream).
//
// Strategy: keep non-space tokens, then when joining them into a row of text
// insert ONE space for narrow gaps (glyph spacing inside the same word) and
// TWO spaces for wide gaps (a real word break). The helper `deGlyphSpace`
// then collapses single spaces and turns double spaces back into single
// real-word breaks, giving us "D.M MEDICAL Cust.Code: 7216".

export interface PdfToken {
  page: number;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PdfRow {
  page: number;
  y: number;
  tokens: PdfToken[];   // sorted by x
  text: string;         // normalized human-readable line (de-glyph-spaced)
  rawText: string;      // line with gap markers preserved (single vs double space)
}

let _pdfjs: typeof import("pdfjs-dist") | null = null;
async function getPdfjs() {
  if (_pdfjs) return _pdfjs;
  const pdfjs = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  _pdfjs = pdfjs;
  return pdfjs;
}

export async function extractPdf(file: File | ArrayBuffer): Promise<{ tokens: PdfToken[]; rows: PdfRow[]; pages: number }>
{
  const pdfjs = await getPdfjs();
  const data = file instanceof ArrayBuffer ? file : await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data }).promise;
  const tokens: PdfToken[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    for (const item of content.items as Array<{ str: string; transform: number[]; width: number; height: number }>) {
      const s = item.str;
      if (!s || !s.trim()) continue; // drop whitespace items - gaps are inferred from x positions
      const x = item.transform[4];
      const y = item.transform[5];
      tokens.push({ page: p, text: s, x, y, width: item.width, height: item.height || Math.abs(item.transform[3]) });
    }
  }
  const rows = groupRows(tokens);
  return { tokens, rows, pages: doc.numPages };
}

function groupRows(tokens: PdfToken[]): PdfRow[] {
  const byPage = new Map<number, PdfToken[]>();
  for (const t of tokens) {
    if (!byPage.has(t.page)) byPage.set(t.page, []);
    byPage.get(t.page)!.push(t);
  }
  const rows: PdfRow[] = [];
  for (const [page, toks] of byPage) {
    toks.sort((a, b) => (b.y - a.y) || (a.x - b.x));
    let currentY = Number.POSITIVE_INFINITY;
    let bucket: PdfToken[] = [];
    const flush = () => {
      if (!bucket.length) return;
      bucket.sort((a, b) => a.x - b.x);
      const rawText = joinWithGapMarkers(bucket);
      rows.push({
        page,
        y: bucket[0].y,
        tokens: bucket.slice(),
        rawText,
        text: deGlyphSpace(rawText),
      });
      bucket = [];
    };
    for (const t of toks) {
      if (Math.abs(t.y - currentY) > 2.5) {
        flush();
        currentY = t.y;
      }
      bucket.push(t);
    }
    flush();
  }
  return rows;
}

// Join tokens with single space for narrow gaps, double space for wide gaps.
function joinWithGapMarkers(tokens: PdfToken[]): string {
  if (tokens.length === 0) return "";
  // Per-row average glyph width.
  let totalW = 0, totalChars = 0;
  for (const t of tokens) {
    const chars = Math.max(1, t.text.replace(/\s/g, "").length);
    totalW += t.width;
    totalChars += chars;
  }
  const avgCharW = totalChars > 0 ? totalW / totalChars : 5;
  // Threshold: gap larger than ~1.5 char widths is treated as a real word break.
  const wideGap = avgCharW * 1.5;

  let out = tokens[0].text;
  for (let i = 1; i < tokens.length; i++) {
    const prev = tokens[i - 1];
    const cur = tokens[i];
    const gap = cur.x - (prev.x + prev.width);
    out += gap > wideGap ? "  " : " ";
    out += cur.text;
  }
  return out;
}

// Collapse single inner spaces (DOS-style glyph spacing) while keeping wide
// gaps (encoded as 2+ spaces) as a single real word break.
// "Nu mb e r : 0 8 2 9 0 9  Da t e : 1 3 / 0 6 / 2 0 2 6" -> "Number:082909 Date:13/06/2026"
export function deGlyphSpace(s: string): string {
  if (!s) return "";
  const MARK = "\u0001";
  // Mark real word breaks (2+ spaces) first
  let t = s.replace(/ {2,}/g, MARK);
  // Remove glyph-level single spaces
  t = t.replace(/ /g, "");
  // Restore word breaks
  t = t.replace(new RegExp(MARK, "g"), " ");
  return t.trim();
}

// Normalize a token's text: collapse stray inner whitespace.
export function cleanCell(s: string): string {
  return s
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Aggressive: remove every inner space.
export function squashSpaces(s: string): string {
  return cleanCell(s).replace(/\s+/g, "");
}

// Parse a number that may contain stray spaces.
export function parseNum(s: string | undefined | null): number {
  if (!s) return 0;
  const cleaned = String(s).replace(/[\s,]/g, "").replace(/[^\d.\-]/g, "");
  if (!cleaned || cleaned === "-" || cleaned === ".") return 0;
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

// Normalize a customer name / human label for fuzzy comparison.
// "D. M MEDI CAL", "D.M MEDICAL", "D M MEDICAL" all collapse to "DMMEDICAL".
export function normalizeName(s: string | undefined | null): string {
  if (!s) return "";
  return s
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}
