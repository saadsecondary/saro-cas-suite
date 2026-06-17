// Importer: takes a parser result and writes to the DB with dedupe + customer
// auto-creation. Pure data layer - no UI here.

import { db } from "@/lib/db";
import type { Invoice, Customer } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import type { OutstandingParseResult } from "@/lib/parser/outstanding-parser";

export interface ImportInvoiceResult {
  saved: boolean;
  reason?: "duplicate";
  number: string;
}

export async function importInvoice(inv: Invoice): Promise<ImportInvoiceResult> {
  const d = db();
  return d.transaction("rw", [d.invoices, d.customers, d.activity], async () => {
    const existing = await db().invoices.get(inv.number);
    if (existing && existing.source === "pdf-import") {
      return { saved: false, reason: "duplicate", number: inv.number };
    }
    // Customer upsert: prefer existing real code, else create.
    const cust = await db().customers.get(inv.customerCode);
    if (!cust) {
      const c: Customer = {
        code: inv.customerCode,
        name: inv.customerName,
        address: inv.address,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await db().customers.put(c);
    } else {
      await db().customers.update(inv.customerCode, {
        name: cust.name || inv.customerName,
        address: cust.address || inv.address,
        updatedAt: Date.now(),
      });
    }
    // If existing is an outstanding-seed stub, replace it with full invoice
    // but keep created date.
    if (existing && existing.source === "outstanding-seed") {
      inv.createdAt = existing.createdAt;
    }
    await db().invoices.put(inv);
    await logActivity("invoice.import", `Imported invoice #${inv.number} - ${inv.customerName}`, `invoice:${inv.number}`);
    return { saved: true, number: inv.number };
  });
}

export interface ImportOutstandingResult {
  invoicesAdded: number;
  invoicesSkipped: number;
  paymentsAdded: number;
  customersCreated: number;
}

export async function importOutstandingReport(parsed: OutstandingParseResult): Promise<ImportOutstandingResult> {
  let invoicesAdded = 0, invoicesSkipped = 0, paymentsAdded = 0, customersCreated = 0;
  const d = db();
  await d.transaction("rw", [d.invoices, d.customers, d.payments, d.activity], async () => {
    // Build a name->existing-customer-code map so we attach to real customers when possible
    const allCust = await db().customers.toArray();
    const nameMap = new Map<string, string>();
    for (const c of allCust) {
      nameMap.set(normName(c.name), c.code);
    }
    for (const r of parsed.rows) {
      const realCode = nameMap.get(normName(r.invoice.customerName));
      const code = realCode ?? r.invoice.customerCode;
      r.invoice.customerCode = code;
      // ensure customer exists
      const cust = await db().customers.get(code);
      if (!cust) {
        await db().customers.put({
          code,
          name: r.invoice.customerName,
          address: r.area,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        nameMap.set(normName(r.invoice.customerName), code);
        customersCreated++;
      }
      const existing = await db().invoices.get(r.invoice.number);
      if (existing) {
        invoicesSkipped++;
      } else {
        await db().invoices.put(r.invoice);
        invoicesAdded++;
      }
      if (r.payment) {
        // dedupe: don't add the same outstanding-seed payment twice
        const dupCount = await db().payments
          .where("invoiceNumber").equals(r.payment.invoiceNumber!)
          .filter(p => p.source === "outstanding-seed" && p.amount === r.payment!.amount)
          .count();
        if (!dupCount) {
          r.payment.customerCode = code;
          await db().payments.add({ ...r.payment });
          paymentsAdded++;
        }
      }
    }
    await logActivity("import.outstanding", `Outstanding import: +${invoicesAdded} invoices, +${paymentsAdded} payments, +${customersCreated} customers`);
  });
  return { invoicesAdded, invoicesSkipped, paymentsAdded, customersCreated };
}

function normName(s: string): string {
  return s.toUpperCase().replace(/\s+/g, " ").replace(/[^A-Z0-9& ]/g, "").trim();
}
