import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { money, fmtDate } from "@/lib/format";
import { round2 } from "@/lib/calc";
import { PageHeader } from "@/components/PageHeader";
import { useMemo, useState } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import { downloadCSV, downloadXLSX } from "@/lib/export";

export const Route = createFileRoute("/outstanding")({
  head: () => ({ meta: [{ title: "Outstanding - Zam Zam Traders" }] }),
  component: OutstandingPage,
});

function OutstandingPage() {
  const nav = useNavigate();
  const [groupBy, setGroupBy] = useState<"none" | "customer" | "booker">("customer");
  const [ageing, setAgeing] = useState(false);
  const invoices = useLiveQuery(() => db().invoices.toArray()) ?? [];
  const payments = useLiveQuery(() => db().payments.toArray()) ?? [];

  const items = useMemo(() => {
    const paidByInv = new Map<string, number>();
    for (const p of payments) if (p.invoiceNumber) paidByInv.set(p.invoiceNumber, round2((paidByInv.get(p.invoiceNumber) ?? 0) + p.amount));
    return invoices
      .map(i => {
        const paid = paidByInv.get(i.number) ?? 0;
        const out = round2(i.grandTotal - paid);
        return { ...i, paid, outstanding: out };
      })
      .filter(i => i.outstanding > 0.009)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [invoices, payments]);

  const totalOut = round2(items.reduce((a, i) => a + i.outstanding, 0));

  const buckets = useMemo(() => {
    const now = Date.now();
    const b = { d0_30: 0, d31_60: 0, d61_90: 0, d90: 0 };
    for (const i of items) {
      const days = Math.floor((now - new Date(i.date).getTime()) / 86400000);
      if (days <= 30) b.d0_30 += i.outstanding;
      else if (days <= 60) b.d31_60 += i.outstanding;
      else if (days <= 90) b.d61_90 += i.outstanding;
      else b.d90 += i.outstanding;
    }
    return b;
  }, [items]);

  const groups = useMemo(() => {
    if (groupBy === "none") return null;
    const key = (i: typeof items[number]) => groupBy === "customer" ? `${i.customerCode}|${i.customerName}` : (i.bookerName ?? "- No booker -");
    const map = new Map<string, typeof items>();
    for (const i of items) {
      const k = key(i);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(i);
    }
    return Array.from(map.entries()).map(([k, arr]) => ({ key: k, items: arr, total: round2(arr.reduce((a, i) => a + i.outstanding, 0)) }))
      .sort((a, b) => b.total - a.total);
  }, [items, groupBy]);

  function exportData(kind: "csv" | "xlsx") {
    const data = items.map(i => ({
      Invoice: i.number, Date: i.date, Customer: i.customerName, Code: i.customerCode,
      Booker: i.bookerName ?? "", Total: i.grandTotal, Paid: i.paid, Outstanding: i.outstanding,
    }));
    if (kind === "csv") downloadCSV("outstanding.csv", data); else downloadXLSX("outstanding.xlsx", data, "Outstanding");
  }

  return (
    <div>
      <PageHeader
        eyebrow="Operations"
        title="Outstanding"
        subtitle={`${items.length.toLocaleString()} open invoices · ${money(totalOut)} outstanding`}
        actions={
          <div className="flex gap-2">
            <select className="input-base w-[150px]" value={groupBy} onChange={e => setGroupBy(e.target.value as any)}>
              <option value="customer">Group by customer</option>
              <option value="booker">Group by booker</option>
              <option value="none">No grouping</option>
            </select>
            <button onClick={() => setAgeing(!ageing)} className={`btn ${ageing ? "btn-primary" : "btn-secondary"}`}>Ageing</button>
            <button onClick={() => exportData("xlsx")} className="btn btn-secondary">Excel</button>
          </div>
        }
      />

      {ageing && (
        <div className="grid grid-cols-4 gap-3 mb-3">
          <div className="panel p-4"><div className="label-eyebrow">0-30 days</div><div className="num text-[18px] font-semibold mt-1">{money(buckets.d0_30)}</div></div>
          <div className="panel p-4"><div className="label-eyebrow">31-60 days</div><div className="num text-[18px] font-semibold mt-1">{money(buckets.d31_60)}</div></div>
          <div className="panel p-4"><div className="label-eyebrow">61-90 days</div><div className="num text-[18px] font-semibold mt-1 text-warning">{money(buckets.d61_90)}</div></div>
          <div className="panel p-4"><div className="label-eyebrow">90+ days</div><div className="num text-[18px] font-semibold mt-1 text-destructive">{money(buckets.d90)}</div></div>
        </div>
      )}

      {groupBy === "none" ? (
        <div className="panel overflow-hidden">
          <table className="data-table">
            <thead><tr><th>Invoice</th><th>Date</th><th>Customer</th><th>Booker</th><th className="right">Total</th><th className="right">Paid</th><th className="right">Outstanding</th></tr></thead>
            <tbody>
              {items.map(i => (
                <tr key={i.number} className="row-clickable" onClick={() => nav({ to: "/invoices/$number", params: { number: i.number } })}>
                  <td className="mono">{i.number}</td>
                  <td className="num text-muted-foreground">{fmtDate(i.date)}</td>
                  <td>{i.customerName}</td>
                  <td className="text-muted-foreground">{i.bookerName ?? "-"}</td>
                  <td className="right num">{money(i.grandTotal)}</td>
                  <td className="right num text-success">{money(i.paid)}</td>
                  <td className="right num font-medium">{money(i.outstanding)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="space-y-3">
          {groups!.map(g => {
            const label = groupBy === "customer" ? g.key.split("|")[1] : g.key;
            const code = groupBy === "customer" ? g.key.split("|")[0] : "";
            return (
              <div key={g.key} className="panel overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 bg-surface-2 border-b border-border">
                  <div className="text-[13px] font-medium">
                    {groupBy === "customer" ? <Link to="/customers/$code" params={{ code }} className="hover:text-accent">{label}</Link> : label}
                    {code && <span className="mono text-[11px] text-muted-foreground ml-2">{code}</span>}
                    <span className="text-muted-foreground ml-2">· {g.items.length} invoices</span>
                  </div>
                  <div className="num font-semibold">{money(g.total)}</div>
                </div>
                <table className="data-table">
                  <thead><tr><th>Invoice</th><th>Date</th><th className="right">Total</th><th className="right">Paid</th><th className="right">Outstanding</th></tr></thead>
                  <tbody>
                    {g.items.map(i => (
                      <tr key={i.number} className="row-clickable" onClick={() => nav({ to: "/invoices/$number", params: { number: i.number } })}>
                        <td className="mono">{i.number}</td>
                        <td className="num text-muted-foreground">{fmtDate(i.date)}</td>
                        <td className="right num">{money(i.grandTotal)}</td>
                        <td className="right num text-success">{money(i.paid)}</td>
                        <td className="right num font-medium">{money(i.outstanding)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
