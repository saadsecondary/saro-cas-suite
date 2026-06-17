import { createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { money, fmtDate } from "@/lib/format";
import { round2 } from "@/lib/calc";
import { PageHeader } from "@/components/PageHeader";
import { useMemo, useState } from "react";
import { downloadCSV, downloadXLSX, triggerPrint } from "@/lib/export";

const REPORTS = [
  { id: "outstanding", label: "Outstanding Report" },
  { id: "collection", label: "Collection Report" },
  { id: "invoices", label: "Invoice Report" },
  { id: "payments", label: "Payment Report" },
  { id: "monthly-sales", label: "Monthly Sales" },
  { id: "top-customers", label: "Top Customers" },
  { id: "booker", label: "Booker Report" },
  { id: "deliveryman", label: "Deliveryman Report" },
  { id: "ageing", label: "Ageing Report" },
] as const;

type ReportId = (typeof REPORTS)[number]["id"];

export const Route = createFileRoute("/reports")({
  head: () => ({ meta: [{ title: "Reports - Zam Zam Traders" }] }),
  component: ReportsPage,
});

function ReportsPage() {
  const [active, setActive] = useState<ReportId>("outstanding");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const invoices = useLiveQuery(() => db().invoices.toArray()) ?? [];
  const payments = useLiveQuery(() => db().payments.toArray()) ?? [];
  const customers = useLiveQuery(() => db().customers.toArray()) ?? [];

  const inRange = <T extends { date: string }>(arr: T[]) => arr.filter(x => (!from || x.date >= from) && (!to || x.date <= to));

  const rows = useMemo(() => {
    const paidByInv = new Map<string, number>();
    for (const p of payments) if (p.invoiceNumber) paidByInv.set(p.invoiceNumber, round2((paidByInv.get(p.invoiceNumber) ?? 0) + p.amount));

    switch (active) {
      case "outstanding": {
        return invoices.map(i => ({
          Invoice: i.number, Date: i.date, Customer: i.customerName, Code: i.customerCode,
          Booker: i.bookerName ?? "", Total: i.grandTotal, Paid: paidByInv.get(i.number) ?? 0,
          Outstanding: round2(i.grandTotal - (paidByInv.get(i.number) ?? 0)),
        })).filter(r => r.Outstanding > 0.009);
      }
      case "collection": {
        return inRange(payments).map(p => {
          const c = customers.find(c => c.code === p.customerCode);
          return { Date: p.date, Customer: c?.name ?? p.customerCode, Code: p.customerCode, Invoice: p.invoiceNumber ?? "", Method: p.method ?? "", Reference: p.reference ?? "", Collector: p.collector ?? "", Amount: p.amount };
        });
      }
      case "invoices": {
        return inRange(invoices).map(i => ({
          Invoice: i.number, Date: i.date, Customer: i.customerName, Code: i.customerCode,
          Booker: i.bookerName ?? "", Items: i.itemCount, Total: i.grandTotal,
        }));
      }
      case "payments": {
        return inRange(payments).map(p => ({
          Date: p.date, Customer: customers.find(c => c.code === p.customerCode)?.name ?? p.customerCode,
          Code: p.customerCode, Method: p.method ?? "", Amount: p.amount, Invoice: p.invoiceNumber ?? "",
        }));
      }
      case "monthly-sales": {
        const byMonth = new Map<string, { sales: number; collections: number; invoices: number }>();
        for (const i of inRange(invoices)) {
          const k = i.date.slice(0, 7);
          const s = byMonth.get(k) ?? { sales: 0, collections: 0, invoices: 0 };
          s.sales = round2(s.sales + i.grandTotal); s.invoices++; byMonth.set(k, s);
        }
        for (const p of inRange(payments)) {
          const k = p.date.slice(0, 7);
          const s = byMonth.get(k) ?? { sales: 0, collections: 0, invoices: 0 };
          s.collections = round2(s.collections + p.amount); byMonth.set(k, s);
        }
        return Array.from(byMonth.entries()).sort().map(([k, v]) => ({ Month: k, Invoices: v.invoices, Sales: v.sales, Collections: v.collections }));
      }
      case "top-customers": {
        const map = new Map<string, { name: string; code: string; purchases: number; paid: number; outstanding: number }>();
        for (const i of invoices) {
          const s = map.get(i.customerCode) ?? { name: i.customerName, code: i.customerCode, purchases: 0, paid: 0, outstanding: 0 };
          s.purchases = round2(s.purchases + i.grandTotal);
          map.set(i.customerCode, s);
        }
        for (const p of payments) {
          const s = map.get(p.customerCode); if (s) s.paid = round2(s.paid + p.amount);
        }
        return Array.from(map.values()).map(v => ({ ...v, outstanding: round2(v.purchases - v.paid) }))
          .sort((a, b) => b.purchases - a.purchases).slice(0, 100)
          .map(v => ({ Customer: v.name, Code: v.code, Purchases: v.purchases, Paid: v.paid, Outstanding: v.outstanding }));
      }
      case "booker":
      case "deliveryman": {
        const key = active === "booker" ? "bookerName" : "deliveryman";
        const map = new Map<string, { name: string; invoices: number; sales: number }>();
        for (const i of inRange(invoices)) {
          const k = (i as any)[key] ?? "- Unassigned -";
          const s = map.get(k) ?? { name: k, invoices: 0, sales: 0 };
          s.invoices++; s.sales = round2(s.sales + i.grandTotal); map.set(k, s);
        }
        return Array.from(map.values()).sort((a, b) => b.sales - a.sales).map(v => ({ Name: v.name, Invoices: v.invoices, Sales: v.sales }));
      }
      case "ageing": {
        const now = Date.now();
        const map = new Map<string, { name: string; code: string; d0_30: number; d31_60: number; d61_90: number; d90: number; total: number }>();
        for (const i of invoices) {
          const out = round2(i.grandTotal - (paidByInv.get(i.number) ?? 0));
          if (out <= 0.009) continue;
          const days = Math.floor((now - new Date(i.date).getTime()) / 86400000);
          const s = map.get(i.customerCode) ?? { name: i.customerName, code: i.customerCode, d0_30: 0, d31_60: 0, d61_90: 0, d90: 0, total: 0 };
          if (days <= 30) s.d0_30 = round2(s.d0_30 + out);
          else if (days <= 60) s.d31_60 = round2(s.d31_60 + out);
          else if (days <= 90) s.d61_90 = round2(s.d61_90 + out);
          else s.d90 = round2(s.d90 + out);
          s.total = round2(s.total + out);
          map.set(i.customerCode, s);
        }
        return Array.from(map.values()).sort((a, b) => b.total - a.total)
          .map(v => ({ Customer: v.name, Code: v.code, "0-30": v.d0_30, "31-60": v.d31_60, "61-90": v.d61_90, "90+": v.d90, Total: v.total }));
      }
    }
  }, [active, invoices, payments, customers, from, to]);

  const cols = rows.length ? Object.keys(rows[0]) : [];
  const reportLabel = REPORTS.find(r => r.id === active)!.label;

  return (
    <div>
      <PageHeader
        eyebrow="Accounting"
        title="Reports"
        subtitle={`${reportLabel} · ${rows.length.toLocaleString()} rows`}
        actions={
          <div className="flex gap-2">
            <button onClick={() => downloadCSV(`${active}.csv`, rows as any)} className="btn btn-secondary">CSV</button>
            <button onClick={() => downloadXLSX(`${active}.xlsx`, rows as any, reportLabel)} className="btn btn-secondary">Excel</button>
            <button onClick={triggerPrint} className="btn btn-secondary">Print</button>
          </div>
        }
      />
      <div className="grid grid-cols-[200px_1fr] gap-3">
        <div className="panel p-2 self-start no-print">
          {REPORTS.map(r => (
            <button key={r.id} onClick={() => setActive(r.id)} className={`w-full text-left px-3 py-2 rounded text-[12.5px] ${active === r.id ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>{r.label}</button>
          ))}
        </div>
        <div>
          <div className="panel p-3 mb-3 grid grid-cols-4 gap-2 no-print">
            <label className="text-[11px] text-muted-foreground self-center">Date range</label>
            <input type="date" className="input-base" value={from} onChange={e => setFrom(e.target.value)} />
            <input type="date" className="input-base" value={to} onChange={e => setTo(e.target.value)} />
            <button onClick={() => { setFrom(""); setTo(""); }} className="btn btn-ghost">Clear</button>
          </div>
          <div className="panel overflow-hidden">
            <div className="hidden print:block px-6 py-4 border-b border-border">
              <div className="font-semibold text-[14px]">Zam Zam Traders - {reportLabel}</div>
              <div className="text-[11px] text-muted-foreground">{from || "-"} → {to || "-"} · Printed {new Date().toLocaleString()}</div>
            </div>
            <div className="max-h-[calc(100vh-280px)] overflow-auto">
              <table className="data-table">
                <thead><tr>{cols.map(c => <th key={c} className={typeof (rows[0] as any)?.[c] === "number" ? "right" : ""}>{c}</th>)}</tr></thead>
                <tbody>
                  {rows.length === 0 && <tr><td colSpan={cols.length || 1} className="text-center py-10 text-muted-foreground">No data.</td></tr>}
                  {rows.map((r, i) => (
                    <tr key={i}>{cols.map(c => {
                      const v = (r as any)[c];
                      const numeric = typeof v === "number";
                      return <td key={c} className={numeric ? "right num" : ""}>{numeric ? money(v) : (c.toLowerCase().includes("date") && typeof v === "string" ? fmtDate(v) : v)}</td>;
                    })}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
