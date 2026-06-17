import { db } from "./db";
import type { Invoice, Payment } from "./db";

export interface InvoiceOutstanding {
  invoice: Invoice;
  paid: number;
  outstanding: number;
  status: "cleared" | "partial" | "pending";
}

export function statusOf(total: number, paid: number): "cleared" | "partial" | "pending" {
  const out = round2(total - paid);
  if (out <= 0.009) return "cleared";
  if (paid > 0) return "partial";
  return "pending";
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function invoiceOutstanding(invoiceNumber: string): Promise<InvoiceOutstanding | null> {
  const inv = await db().invoices.get(invoiceNumber);
  if (!inv) return null;
  const pays = await db().payments.where("invoiceNumber").equals(invoiceNumber).toArray();
  const paid = round2(pays.reduce((a, p) => a + p.amount, 0));
  const outstanding = round2(inv.grandTotal - paid);
  return { invoice: inv, paid, outstanding, status: statusOf(inv.grandTotal, paid) };
}

export async function customerSummary(customerCode: string) {
  const [invoices, payments] = await Promise.all([
    db().invoices.where("customerCode").equals(customerCode).toArray(),
    db().payments.where("customerCode").equals(customerCode).toArray(),
  ]);
  const totalPurchases = round2(invoices.reduce((a, i) => a + i.grandTotal, 0));
  const totalPayments = round2(payments.reduce((a, p) => a + p.amount, 0));
  const outstanding = round2(totalPurchases - totalPayments);
  const dates = [
    ...invoices.map(i => i.date),
    ...payments.map(p => p.date),
  ].sort();
  return {
    invoices,
    payments,
    totalPurchases,
    totalPayments,
    outstanding,
    invoiceCount: invoices.length,
    paymentCount: payments.length,
    firstTransaction: dates[0],
    lastTransaction: dates[dates.length - 1],
  };
}

export interface LedgerRow {
  date: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
  ref?: string;
  type: "invoice" | "payment" | "opening";
}

export function buildLedger(invoices: Invoice[], payments: Payment[], opening = 0): LedgerRow[] {
  type Item = { date: string; t: "i" | "p"; payload: Invoice | Payment };
  const items: Item[] = [
    ...invoices.map(i => ({ date: i.date, t: "i" as const, payload: i })),
    ...payments.map(p => ({ date: p.date, t: "p" as const, payload: p })),
  ];
  items.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.t === "i" ? -1 : 1));
  const rows: LedgerRow[] = [];
  let bal = opening;
  if (opening !== 0) {
    rows.push({ date: items[0]?.date ?? "", description: "Opening balance", debit: opening > 0 ? opening : 0, credit: opening < 0 ? -opening : 0, balance: bal, type: "opening" });
  }
  for (const it of items) {
    if (it.t === "i") {
      const inv = it.payload as Invoice;
      bal = round2(bal + inv.grandTotal);
      rows.push({ date: inv.date, description: `Invoice #${inv.number}`, debit: inv.grandTotal, credit: 0, balance: bal, ref: inv.number, type: "invoice" });
    } else {
      const p = it.payload as Payment;
      bal = round2(bal - p.amount);
      const desc = p.invoiceNumber ? `Payment vs #${p.invoiceNumber}` : "Payment received";
      rows.push({ date: p.date, description: desc + (p.reference ? ` (${p.reference})` : ""), debit: 0, credit: p.amount, balance: bal, ref: p.invoiceNumber, type: "payment" });
    }
  }
  return rows;
}
