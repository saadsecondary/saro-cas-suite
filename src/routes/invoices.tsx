import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { money, fmtDate } from "@/lib/format";
import { round2 } from "@/lib/calc";
import { PageHeader } from "@/components/PageHeader";
import { useMemo, useState } from "react";
import { downloadCSV, downloadXLSX } from "@/lib/export";
import { StatusBadge } from "@/components/StatusBadge";

export const Route = createFileRoute("/invoices")({
  head: () => ({ meta: [{ title: "Invoices - Zam Zam Traders" }] }),
  component: InvoicesPage,
});

function InvoicesPage() {
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState<"all" | "pending" | "partial" | "cleared">("all");
  const [booker, setBooker] = useState("");
  const [deliveryman, setDeliveryman] = useState("");
  const [product, setProduct] = useState("");

  const invoices = useLiveQuery(() => db().invoices.toArray()) ?? [];
  const payments = useLiveQuery(() => db().payments.toArray()) ?? [];

  const bookers = useMemo(() => Array.from(new Set(invoices.map(i => i.bookerName).filter(Boolean))).sort() as string[], [invoices]);
  const deliverymen = useMemo(() => Array.from(new Set(invoices.map(i => i.deliveryman).filter(Boolean))).sort() as string[], [invoices]);

  const rows = useMemo(() => {
    const paidByInv = new Map<string, number>();
    for (const p of payments) if (p.invoiceNumber) paidByInv.set(p.invoiceNumber, round2((paidByInv.get(p.invoiceNumber) ?? 0) + p.amount));
    const term = q.trim().toLowerCase();
    const prodTerm = product.trim().toLowerCase();
    let arr = invoices.map(i => {
      const paid = paidByInv.get(i.number) ?? 0;
      const out = round2(i.grandTotal - paid);
      const st = out <= 0.009 ? "cleared" : paid > 0 ? "partial" : "pending";
      return { ...i, paid, outstanding: out, status: st as "cleared" | "partial" | "pending" };
    });
    if (term) arr = arr.filter(i =>
      i.number.toLowerCase().includes(term) ||
      i.customerName.toLowerCase().includes(term) ||
      i.customerCode.toLowerCase().includes(term)
    );
    if (from) arr = arr.filter(i => i.date >= from);
    if (to) arr = arr.filter(i => i.date <= to);
    if (status !== "all") arr = arr.filter(i => i.status === status);
    if (booker) arr = arr.filter(i => i.bookerName === booker);
    if (deliveryman) arr = arr.filter(i => i.deliveryman === deliveryman);
    if (prodTerm) arr = arr.filter(i => i.lines.some(l => l.description.toLowerCase().includes(prodTerm)));
    arr.sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number));
    return arr;
  }, [invoices, payments, q, from, to, status, booker, deliveryman, product]);

  const totals = useMemo(() => {
    const t = rows.reduce((acc, r) => ({ grand: acc.grand + r.grandTotal, paid: acc.paid + r.paid, out: acc.out + r.outstanding }), { grand: 0, paid: 0, out: 0 });
    return { grand: round2(t.grand), paid: round2(t.paid), out: round2(t.out) };
  }, [rows]);

  function exportData(kind: "csv" | "xlsx") {
    const data = rows.map(r => ({
      Invoice: r.number, Date: r.date, Customer: r.customerName, Code: r.customerCode,
      Booker: r.bookerName ?? "", Deliveryman: r.deliveryman ?? "",
      Items: r.itemCount, Total: r.grandTotal, Paid: r.paid, Outstanding: r.outstanding, Status: r.status,
    }));
    if (kind === "csv") downloadCSV("invoices.csv", data); else downloadXLSX("invoices.xlsx", data, "Invoices");
  }

  return (
    <div>
      <PageHeader
        eyebrow="Operations"
        title="Invoices"
        subtitle={`${rows.length.toLocaleString()} of ${invoices.length.toLocaleString()} invoices · ${money(totals.grand)} total · ${money(totals.out)} outstanding`}
        actions={
          <div className="flex gap-2">
            <button onClick={() => exportData("csv")} className="btn btn-secondary">CSV</button>
            <button onClick={() => exportData("xlsx")} className="btn btn-secondary">Excel</button>
          </div>
        }
      />

      <div className="panel p-3 mb-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-2 text-[12px]">
        <input className="input-base sm:col-span-2" placeholder="Search invoice #, customer, code..." value={q} onChange={e => setQ(e.target.value)} aria-label="Search invoices" />
        <input type="date" className="input-base" value={from} onChange={e => setFrom(e.target.value)} aria-label="From date" />
        <input type="date" className="input-base" value={to} onChange={e => setTo(e.target.value)} aria-label="To date" />
        <select className="input-base" value={status} onChange={e => setStatus(e.target.value as any)} aria-label="Status filter">
          <option value="all">All status</option><option value="pending">Pending</option><option value="partial">Partial</option><option value="cleared">Cleared</option>
        </select>
        <select className="input-base" value={booker} onChange={e => setBooker(e.target.value)} aria-label="Booker filter">
          <option value="">All bookers</option>{bookers.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
        <select className="input-base" value={deliveryman} onChange={e => setDeliveryman(e.target.value)} aria-label="Deliveryman filter">
          <option value="">All deliverymen</option>{deliverymen.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <input className="input-base" placeholder="Product contains..." value={product} onChange={e => setProduct(e.target.value)} aria-label="Product filter" />
      </div>


      <div className="panel overflow-hidden">
        <div className="max-h-[calc(100vh-300px)] overflow-auto">
          <table className="data-table">
            <thead><tr><th>Invoice #</th><th>Date</th><th>Customer</th><th>Booker</th><th>Deliveryman</th><th className="right">Items</th><th className="right">Total</th><th className="right">Outstanding</th><th>Status</th></tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={9} className="text-center text-muted-foreground py-10">No invoices match.</td></tr>}
              {rows.map(i => (
                <tr key={i.number} className="row-clickable" onClick={() => nav({ to: "/invoices/$number", params: { number: i.number } })}>
                  <td className="mono">{i.number}</td>
                  <td className="num text-muted-foreground">{fmtDate(i.date)}</td>
                  <td><span className="font-medium">{i.customerName}</span> <span className="mono text-[11px] text-muted-foreground ml-1">{i.customerCode}</span></td>
                  <td className="text-muted-foreground">{i.bookerName ?? "-"}</td>
                  <td className="text-muted-foreground">{i.deliveryman ?? "-"}</td>
                  <td className="right num">{i.itemCount}</td>
                  <td className="right num">{money(i.grandTotal)}</td>
                  <td className="right num font-medium">{money(i.outstanding)}</td>
                  <td><StatusBadge status={i.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
