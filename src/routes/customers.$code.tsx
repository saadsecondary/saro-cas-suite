import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { money, fmtDate, fmtDateTime } from "@/lib/format";
import { round2, buildLedger } from "@/lib/calc";
import { PageHeader } from "@/components/PageHeader";
import { useMemo, useRef, useState } from "react";
import { downloadCSV, downloadXLSX, triggerPrint } from "@/lib/export";
import { RecordPaymentDialog } from "@/components/RecordPaymentDialog";
import { StatusBadge } from "@/components/StatusBadge";
import { Logo } from "@/components/Logo";
import { Printer, ArrowLeft, FileDown, Plus } from "lucide-react";
import { toast } from "sonner";
import { logActivity } from "@/lib/activity";

export const Route = createFileRoute("/customers/$code")({
  head: ({ params }) => ({ meta: [{ title: `Customer ${params.code} - Zam Zam Traders` }] }),
  component: CustomerDetail,
});

function CustomerDetail() {
  const { code } = Route.useParams();
  const nav = useNavigate();
  const cust = useLiveQuery(() => db().customers.get(code), [code]);
  const invoices = useLiveQuery(() => db().invoices.where("customerCode").equals(code).toArray(), [code]) ?? [];
  const payments = useLiveQuery(() => db().payments.where("customerCode").equals(code).toArray(), [code]) ?? [];
  const [tab, setTab] = useState<"timeline" | "invoices" | "payments" | "ledger">("ledger");
  const [search, setSearch] = useState("");
  const [payOpen, setPayOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const printRef = useRef<HTMLDivElement>(null);

  const stats = useMemo(() => {
    const paid = round2(payments.reduce((a, p) => a + p.amount, 0));
    const purchases = round2(invoices.reduce((a, i) => a + i.grandTotal, 0));
    const out = round2(purchases - paid);
    const dates = [...invoices.map(i => i.date), ...payments.map(p => p.date)].sort();
    return { paid, purchases, outstanding: out, first: dates[0], last: dates[dates.length - 1] };
  }, [invoices, payments]);

  const ledger = useMemo(() => buildLedger(invoices, payments), [invoices, payments]);
  const filteredLedger = useMemo(() => {
    const t = search.trim().toLowerCase();
    if (!t) return ledger;
    return ledger.filter(r => r.description.toLowerCase().includes(t) || (r.ref ?? "").toLowerCase().includes(t) || r.date.includes(t));
  }, [ledger, search]);

  if (!cust) {
    return <div className="text-center py-12 text-muted-foreground text-sm">Customer not found. <Link to="/customers" className="text-accent underline">Back to customers</Link></div>;
  }

  function startEdit() {
    if (!cust) return;
    setEditName(cust.name); setEditAddress(cust.address ?? ""); setEditPhone(cust.phone ?? "");
    setEditing(true);
  }
  async function saveEdit() {
    await db().customers.update(code, { name: editName, address: editAddress, phone: editPhone, updatedAt: Date.now() });
    await logActivity("customer.update", `Updated customer ${code}`, `customer:${code}`);
    setEditing(false);
    toast.success("Customer updated");
  }

  function exportStatement(kind: "csv" | "xlsx") {
    const rows = ledger.map(r => ({ Date: r.date, Description: r.description, Debit: r.debit || "", Credit: r.credit || "", Balance: r.balance }));
    if (kind === "csv") downloadCSV(`statement-${code}.csv`, rows);
    else downloadXLSX(`statement-${code}.xlsx`, rows, "Statement");
  }

  return (
    <div>
      <PageHeader
        eyebrow={<span><Link to="/customers" className="inline-flex items-center gap-1 hover:text-foreground"><ArrowLeft className="h-3 w-3" /> Customers</Link></span> as any}
        title={cust.name}
        subtitle={`Customer code ${cust.code}${cust.address ? " · " + cust.address : ""}${cust.phone ? " · " + cust.phone : ""}`}
        actions={
          <div className="flex gap-2">
            <button onClick={() => setPayOpen(true)} className="btn btn-primary"><Plus className="h-3.5 w-3.5" />Record payment</button>
            <button onClick={() => exportStatement("xlsx")} className="btn btn-secondary"><FileDown className="h-3.5 w-3.5" />Export</button>
            <button onClick={triggerPrint} className="btn btn-secondary"><Printer className="h-3.5 w-3.5" />Print statement</button>
            <button onClick={startEdit} className="btn btn-ghost">Edit</button>
          </div>
        }
      />

      <div className="grid grid-cols-4 gap-3 mb-4 no-print">
        <div className="panel p-4"><div className="label-eyebrow">Total purchases</div><div className="num text-[20px] font-semibold mt-1">{money(stats.purchases)}</div></div>
        <div className="panel p-4"><div className="label-eyebrow">Total payments</div><div className="num text-[20px] font-semibold mt-1 text-success">{money(stats.paid)}</div></div>
        <div className="panel p-4"><div className="label-eyebrow">Outstanding</div><div className="num text-[20px] font-semibold mt-1 text-accent">{money(stats.outstanding)}</div></div>
        <div className="panel p-4"><div className="label-eyebrow">Activity</div><div className="text-[13px] mt-1">{fmtDate(stats.first)} → {fmtDate(stats.last)}</div><div className="text-[11px] text-muted-foreground mt-1">{invoices.length} invoices · {payments.length} payments</div></div>
      </div>

      <div className="flex items-center justify-between mb-2 no-print">
        <div className="inline-flex rounded-md border border-border bg-surface text-[12.5px] p-0.5">
          {(["ledger", "invoices", "payments", "timeline"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} className={`px-3 py-1 rounded ${tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>{t[0].toUpperCase() + t.slice(1)}</button>
          ))}
        </div>
        <input className="input-base w-[280px]" placeholder="Search this customer's history..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {tab === "ledger" && (
        <div className="panel overflow-hidden" ref={printRef}>
          <div className="hidden print:block px-6 py-5 border-b border-border">
            <div className="flex items-start justify-between">
              <Logo withWordmark />
              <div className="text-right text-[11px]">
                <div className="font-semibold text-[13px]">Customer Statement</div>
                <div>{cust.name} ({cust.code})</div>
                <div className="text-muted-foreground">{cust.address ?? ""}</div>
                <div className="text-muted-foreground">Printed {new Date().toLocaleString()}</div>
              </div>
            </div>
          </div>
          <table className="data-table">
            <thead><tr><th>Date</th><th>Description</th><th className="right">Debit</th><th className="right">Credit</th><th className="right">Balance</th></tr></thead>
            <tbody>
              {filteredLedger.length === 0 && <tr><td colSpan={5} className="text-center text-muted-foreground py-8">No ledger entries.</td></tr>}
              {filteredLedger.map((r, idx) => (
                <tr key={idx}>
                  <td className="num text-muted-foreground">{fmtDate(r.date)}</td>
                  <td>{r.type === "invoice" ? <Link to="/invoices/$number" params={{ number: r.ref! }} className="hover:text-accent">{r.description}</Link> : r.description}</td>
                  <td className="right num">{r.debit ? money(r.debit) : ""}</td>
                  <td className="right num text-success">{r.credit ? money(r.credit) : ""}</td>
                  <td className="right num font-medium">{money(r.balance)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-surface-2 font-medium"><td colSpan={2}>Closing balance</td><td className="right num">{money(stats.purchases)}</td><td className="right num text-success">{money(stats.paid)}</td><td className="right num">{money(stats.outstanding)}</td></tr>
            </tfoot>
          </table>
        </div>
      )}

      {tab === "invoices" && (
        <div className="panel overflow-hidden">
          <table className="data-table">
            <thead><tr><th>Invoice #</th><th>Date</th><th>Booker</th><th className="right">Total</th><th className="right">Paid</th><th className="right">Outstanding</th><th>Status</th></tr></thead>
            <tbody>
              {invoices.length === 0 && <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">No invoices.</td></tr>}
              {invoices.sort((a, b) => b.date.localeCompare(a.date)).map(i => {
                const paid = round2(payments.filter(p => p.invoiceNumber === i.number).reduce((a, p) => a + p.amount, 0));
                const out = round2(i.grandTotal - paid);
                const status = out <= 0.009 ? "cleared" : paid > 0 ? "partial" : "pending";
                return (
                  <tr key={i.number} className="row-clickable" onClick={() => nav({ to: "/invoices/$number", params: { number: i.number } })}>
                    <td className="mono">{i.number}</td>
                    <td className="num text-muted-foreground">{fmtDate(i.date)}</td>
                    <td className="text-muted-foreground">{i.bookerName ?? "-"}</td>
                    <td className="right num">{money(i.grandTotal)}</td>
                    <td className="right num text-success">{money(paid)}</td>
                    <td className="right num font-medium">{money(out)}</td>
                    <td><StatusBadge status={status as any} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {tab === "payments" && (
        <div className="panel overflow-hidden">
          <table className="data-table">
            <thead><tr><th>Date</th><th>Method</th><th>Reference</th><th>Collector</th><th>Invoice</th><th className="right">Amount</th></tr></thead>
            <tbody>
              {payments.length === 0 && <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">No payments.</td></tr>}
              {payments.sort((a, b) => b.date.localeCompare(a.date)).map(p => (
                <tr key={p.id}>
                  <td className="num text-muted-foreground">{fmtDate(p.date)}</td>
                  <td>{p.method ?? "-"}</td>
                  <td className="text-muted-foreground">{p.reference ?? "-"}</td>
                  <td>{p.collector ?? "-"}</td>
                  <td className="mono">{p.invoiceNumber ?? "-"}</td>
                  <td className="right num font-medium text-success">{money(p.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "timeline" && (
        <div className="panel p-4">
          <ol className="relative border-l border-border ml-2 space-y-3">
            {ledger.slice().reverse().map((r, i) => (
              <li key={i} className="pl-4 relative">
                <span className={`absolute -left-[5px] top-1.5 h-2 w-2 rounded-full ${r.type === "invoice" ? "bg-accent" : r.type === "payment" ? "bg-success" : "bg-muted-foreground"}`} />
                <div className="text-[12px]"><span className="num text-muted-foreground mr-2">{fmtDate(r.date)}</span>{r.description}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {r.debit ? `Debit ${money(r.debit)}` : ""}{r.credit ? `Credit ${money(r.credit)}` : ""} · Balance {money(r.balance)}
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}

      <RecordPaymentDialog open={payOpen} onClose={() => setPayOpen(false)} customerCode={code} />

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center no-print" onClick={() => setEditing(false)}>
          <div className="absolute inset-0 bg-black/35" />
          <div onClick={e => e.stopPropagation()} className="relative w-[420px] rounded-xl border border-border bg-popover shadow-floating p-5 space-y-3">
            <div className="font-semibold text-[13px]">Edit customer</div>
            <label className="block"><span className="label-eyebrow">Name</span><input className="input-base mt-1" value={editName} onChange={e => setEditName(e.target.value)} /></label>
            <label className="block"><span className="label-eyebrow">Address</span><input className="input-base mt-1" value={editAddress} onChange={e => setEditAddress(e.target.value)} /></label>
            <label className="block"><span className="label-eyebrow">Phone</span><input className="input-base mt-1" value={editPhone} onChange={e => setEditPhone(e.target.value)} /></label>
            <div className="flex justify-end gap-2 pt-2">
              <button className="btn btn-ghost" onClick={() => setEditing(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveEdit}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
