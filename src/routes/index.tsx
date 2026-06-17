import { createFileRoute, Link } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { money, fmtDate, fmtDateTime, todayISO } from "@/lib/format";
import { round2, statusOf } from "@/lib/calc";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar } from "recharts";
import { useMemo } from "react";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "Dashboard - Zam Zam Traders" }] }),
  component: Dashboard,
});

function Dashboard() {
  const invoices = useLiveQuery(() => db().invoices.toArray()) ?? [];
  const payments = useLiveQuery(() => db().payments.toArray()) ?? [];
  const customers = useLiveQuery(() => db().customers.toArray()) ?? [];
  const recentActivity = useLiveQuery(() => db().activity.orderBy("at").reverse().limit(8).toArray()) ?? [];
  const recentImports = useLiveQuery(() => db().imports.orderBy("at").reverse().limit(5).toArray()) ?? [];

  const today = todayISO();

  const stats = useMemo(() => {
    const totalInvoiced = round2(invoices.reduce((a, i) => a + i.grandTotal, 0));
    const totalPaid = round2(payments.reduce((a, p) => a + p.amount, 0));
    const totalOutstanding = round2(totalInvoiced - totalPaid);

    const paidByInv = new Map<string, number>();
    for (const p of payments) if (p.invoiceNumber) paidByInv.set(p.invoiceNumber, round2((paidByInv.get(p.invoiceNumber) ?? 0) + p.amount));
    let pending = 0, partial = 0, cleared = 0;
    for (const i of invoices) {
      const paid = paidByInv.get(i.number) ?? 0;
      const s = statusOf(i.grandTotal, paid);
      if (s === "pending") pending++; else if (s === "partial") partial++; else cleared++;
    }
    const todaysCollection = round2(payments.filter(p => p.date === today).reduce((a, p) => a + p.amount, 0));
    const todaysInvoices = invoices.filter(i => i.date === today);
    const todaysInvoiceAmt = round2(todaysInvoices.reduce((a, i) => a + i.grandTotal, 0));

    // monthly sales for last 12 months
    const byMonth = new Map<string, { sales: number; collections: number }>();
    const months: string[] = [];
    const now = new Date();
    for (let k = 11; k >= 0; k--) {
      const d = new Date(now.getFullYear(), now.getMonth() - k, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      months.push(key);
      byMonth.set(key, { sales: 0, collections: 0 });
    }
    for (const i of invoices) {
      const key = i.date.slice(0, 7);
      const slot = byMonth.get(key); if (slot) slot.sales = round2(slot.sales + i.grandTotal);
    }
    for (const p of payments) {
      const key = p.date.slice(0, 7);
      const slot = byMonth.get(key); if (slot) slot.collections = round2(slot.collections + p.amount);
    }
    const chart = months.map(m => {
      const [y, mo] = m.split("-");
      return { month: new Date(+y, +mo - 1, 1).toLocaleString("en", { month: "short" }), ...byMonth.get(m)! };
    });

    // Top customers by outstanding
    const outByCust = new Map<string, { code: string; name: string; outstanding: number; purchases: number }>();
    for (const i of invoices) {
      const slot = outByCust.get(i.customerCode) ?? { code: i.customerCode, name: i.customerName, outstanding: 0, purchases: 0 };
      slot.outstanding = round2(slot.outstanding + i.grandTotal);
      slot.purchases = round2(slot.purchases + i.grandTotal);
      outByCust.set(i.customerCode, slot);
    }
    for (const p of payments) {
      const slot = outByCust.get(p.customerCode);
      if (slot) slot.outstanding = round2(slot.outstanding - p.amount);
    }
    const topCustomers = [...outByCust.values()].sort((a, b) => b.outstanding - a.outstanding).slice(0, 8);

    return { totalInvoiced, totalPaid, totalOutstanding, pending, partial, cleared, todaysCollection, todaysInvoices, todaysInvoiceAmt, chart, topCustomers };
  }, [invoices, payments, today]);

  return (
    <div>
      <PageHeader
        eyebrow="Overview"
        title="Dashboard"
        subtitle={`${customers.length.toLocaleString()} customers · ${invoices.length.toLocaleString()} invoices · ${payments.length.toLocaleString()} payments`}
        actions={
          <div className="flex gap-2">
            <Link to="/import" className="btn btn-primary">Add Invoice</Link>
          </div>
        }
      />

      <div className="grid grid-cols-4 gap-3 mb-4">
        <StatCard label="Total outstanding" value={stats.totalOutstanding} money tone="accent" hint={`${stats.pending + stats.partial} invoices open`} />
        <StatCard label="Today's collections" value={stats.todaysCollection} money tone="success" hint={fmtDate(today)} />
        <StatCard label="Today's invoices" value={stats.todaysInvoiceAmt} money hint={`${stats.todaysInvoices.length} new invoices`} />
        <StatCard label="Pending invoices" value={stats.pending} hint={`${stats.partial} partial · ${stats.cleared} cleared`} />
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="panel p-4 col-span-2">
          <div className="flex items-baseline justify-between mb-2">
            <div>
              <div className="label-eyebrow">Monthly sales vs collections</div>
              <div className="text-[16px] font-semibold tracking-tight mt-0.5">Last 12 months</div>
            </div>
          </div>
          <div className="h-[220px]">
            <ResponsiveContainer>
              <AreaChart data={stats.chart}>
                <defs>
                  <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="oklch(0.42 0.10 28)" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="oklch(0.42 0.10 28)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="oklch(0.52 0.10 150)" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="oklch(0.52 0.10 150)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="2 4" stroke="oklch(0.92 0.005 80)" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} tickLine={false} axisLine={false} tickFormatter={v => v >= 100000 ? (v / 100000).toFixed(1) + "L" : String(v)} width={42} />
                <Tooltip
                  contentStyle={{ background: "white", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 12 }}
                  formatter={(v) => money(Number(v))}
                />
                <Area type="monotone" dataKey="sales" stroke="oklch(0.42 0.10 28)" strokeWidth={1.5} fill="url(#g1)" name="Sales" />
                <Area type="monotone" dataKey="collections" stroke="oklch(0.52 0.10 150)" strokeWidth={1.5} fill="url(#g2)" name="Collections" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="panel p-4">
          <div className="label-eyebrow mb-2">Outstanding status</div>
          <div className="h-[220px]">
            <ResponsiveContainer>
              <BarChart data={[
                { name: "Pending", value: stats.pending },
                { name: "Partial", value: stats.partial },
                { name: "Cleared", value: stats.cleared },
              ]}>
                <CartesianGrid strokeDasharray="2 4" stroke="oklch(0.92 0.005 80)" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} tickLine={false} axisLine={false} width={28} />
                <Tooltip contentStyle={{ background: "white", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="value" fill="oklch(0.22 0.015 60)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="panel col-span-2">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="label-eyebrow">Top customers by outstanding</div>
            <Link to="/outstanding" className="text-[11.5px] text-accent hover:underline">View all</Link>
          </div>
          <table className="data-table">
            <thead><tr><th>Code</th><th>Customer</th><th className="right">Purchases</th><th className="right">Outstanding</th></tr></thead>
            <tbody>
              {stats.topCustomers.length === 0 && <tr><td colSpan={4} className="text-center text-muted-foreground py-8">No data yet - import an invoice PDF to get started.</td></tr>}
              {stats.topCustomers.map(c => (
                <tr key={c.code}><td className="mono text-muted-foreground">{c.code}</td><td><Link to="/customers/$code" params={{ code: c.code }} className="hover:text-accent">{c.name}</Link></td><td className="right num">{money(c.purchases)}</td><td className="right num font-medium">{money(c.outstanding)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="panel">
          <div className="px-4 py-3 border-b border-border label-eyebrow">Latest activity</div>
          <div className="divide-y divide-border">
            {recentActivity.length === 0 && <div className="px-4 py-8 text-center text-xs text-muted-foreground">No activity yet</div>}
            {recentActivity.map(a => (
              <div key={a.id} className="px-4 py-2.5 text-[12px]">
                <div>{a.summary}</div>
                <div className="text-[10.5px] text-muted-foreground mt-0.5">{fmtDateTime(a.at)}</div>
              </div>
            ))}
          </div>
          <div className="px-4 py-2 border-t border-border">
            <Link to="/activity" className="text-[11.5px] text-accent hover:underline">Open activity log →</Link>
          </div>
        </div>
      </div>

      <div className="panel mt-3">
        <div className="px-4 py-3 border-b border-border label-eyebrow">Recent imports</div>
        <table className="data-table">
          <thead><tr><th>When</th><th>File</th><th>Type</th><th className="right">Imported</th><th className="right">Skipped</th></tr></thead>
          <tbody>
            {recentImports.length === 0 && <tr><td colSpan={5} className="text-center text-muted-foreground py-6">No imports yet</td></tr>}
            {recentImports.map(im => (
              <tr key={im.id}>
                <td className="num">{fmtDateTime(im.at)}</td>
                <td>{im.fileName}</td>
                <td className="text-muted-foreground">{im.kind}</td>
                <td className="right num">{im.itemsImported}</td>
                <td className="right num text-muted-foreground">{im.itemsSkipped}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
