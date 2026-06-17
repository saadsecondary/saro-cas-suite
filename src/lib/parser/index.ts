// Auto-detect kind of uploaded PDF and route to correct parser.
import { extractPdf } from "./pdf-text";
import { parseInvoicePdf, type ParseResult } from "./invoice-parser";
import { parseOutstandingPdf, type OutstandingParseResult } from "./outstanding-parser";

export type DetectedKind = "invoice" | "outstanding-report" | "unknown";

export async function detectKind(file: File): Promise<DetectedKind> {
  try {
    const { rows } = await extractPdf(file);
    const text = rows.slice(0, 24).map(r => r.text).join("\n").toUpperCase();
    const compact = text.replace(/[^A-Z0-9]/g, "");
    if (compact.includes("SALESMANWISEDUEINVOICES") || compact.includes("DUEINVOICESDETAIL")) return "outstanding-report";
    if (compact.includes("CASHMEMO") || compact.includes("INVOICE")) return "invoice";
    return "unknown";
  } catch {
    return "unknown";
  }
}

export type AnyParseResult =
  | { kind: "invoice"; result: ParseResult }
  | { kind: "outstanding-report"; result: OutstandingParseResult }
  | { kind: "unknown"; error: string };

export async function parseAny(file: File): Promise<AnyParseResult> {
  const kind = await detectKind(file);
  if (kind === "invoice") return { kind, result: await parseInvoicePdf(file) };
  if (kind === "outstanding-report") return { kind, result: await parseOutstandingPdf(file) };
  return { kind: "unknown", error: "Unrecognized PDF layout." };
}

export { parseInvoicePdf, parseOutstandingPdf };
