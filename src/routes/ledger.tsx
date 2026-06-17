import { createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { money, fmtDate } from "@/lib/format";
import { buildLedger } from "@/lib/calc";
import { PageHeader } from "@/components/PageHeader";
import { useMemo, useState } from "react";
import { downloadCSV, downloadXLSX, triggerPrint } from "@/lib/export";
import { Printer, FileDown } from "lucide-react";
import { Logo } from "@/components/Logo";

export const Route = createFileRoute("/ledger")({
  head: () => ({ meta: [{ title: "Ledger - Zam Zam Traders" }] }),
  component: LedgerPage,
});

function LedgerPage() {
  const [code, setCode] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const customers = useLiveQuery(() => db().customers.toArray()) ?? [];
  const invoices = useLiveQuery(async () => code ? db().invoices.where("customerCode").equals(code).toArray() : [], [code]) ?? [];
  const payments = useLiveQuery(async () => code ? db().payments.where("customerCode").equals(code).toArray() : [], [code]) ?? [];

  const cust = customers.find(c => c.code === code);
  const ledger = useMemo(() => buildLedger(invoices, payments), [invoices, payments]);
  const filtered = useMemo(() => ledger.filter(r => (!from || r.date >= from) && (!to || r.date <= to)), [ledger, from, to]);

  function exportData(kind: "csv" | "xlsx") {
    const data = filtered.map(r => ({ Date: r.date, Description: r.description, Debit: r.debit || "", Credit: r.credit || "", Balance: r.balance }));
    if (kind === "csv") downloadCSV(`ledger-${code || "all"}.csv`, data);
    else downloadXLSX(`ledger-${code || "all"}.xlsx`, data, "Ledger");
  }

  const totalDebit = filtered.reduce((a, r) => a + r.debit, 0);
  const totalCredit = filtered.reduce((a, r) => a + r.credit, 0);

  return (
    <div>
      <PageHeader
        eyebrow="Accounting"
        title="Ledger"
        subtitle="Select a customer to view their accounting ledger."
        actions={
          <div className="flex gap-2">
            <button onClick={() => exportData("xlsx")} className="btn btn-secondary" disabled={!code}><FileDown className="h-3.5 w-3.5" />Export</button>
            <button onClick={triggerPrint} className="btn btn-secondary" disabled={!code}><Printer className="h-3.5 w-3.5" />Print</button>
          </div>
        }
      />
      <div className="panel p-3 mb-3 grid grid-cols-4 gap-2 no-print">
        <select className="input-base col-span-2" value={code} onChange={e => setCode(e.target.value)}>
          <option value="">- Select customer -</option>
          {customers.sort((a, b) => a.name.localeCompare(b.name)).map(c => <option key={c.code} value={c.code}>{c.name} ({c.code})</option>)}
        </select>
        <input type="date" className="input-base" value={from} onChange={e => setFrom(e.target.value)} />
        <input type="date" className="input-base" value={to} onChange={e => setTo(e.target.value)} />
      </div>

      {!code && <div className="text-center py-12 text-muted-foreground text-sm">Choose a customer to display ledger.</div>}

      {code && (
        <div className="panel overflow-hidden">
          <div className="hidden print:block px-6 py-5 border-b border-border">
            <div className="flex items-start justify-between">
              <Logo withWordmark />
              <div className="text-right text-[11px]">
                <div className="font-semibold text-[13px]">Account Ledger</div>
                <div>{cust?.name} ({code})</div>
                <div className="text-muted-foreground">{from || "-"} → {to || "-"}</div>
              </div>
            </div>
          </div>
          <table className="data-table">
            <thead><tr><th>Date</th><th>Description</th><th className="right">Debit</th><th className="right">Credit</th><th className="right">Balance</th></tr></thead>
            <tbody>
              {filtered.length === 0 && <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">No entries.</td></tr>}
              {filtered.map((r, i) => (
                <tr key={i}>
                  <td className="num text-muted-foreground">{fmtDate(r.date)}</td>
                  <td>{r.description}</td>
                  <td className="right num">{r.debit ? money(r.debit) : ""}</td>
                  <td className="right num text-success">{r.credit ? money(r.credit) : ""}</td>
                  <td className="right num font-medium">{money(r.balance)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-surface-2 font-semibold">
                <td colSpan={2}>Totals</td>
                <td className="right num">{money(totalDebit)}</td>
                <td className="right num text-success">{money(totalCredit)}</td>
                <td className="right num">{money(totalDebit - totalCredit)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
