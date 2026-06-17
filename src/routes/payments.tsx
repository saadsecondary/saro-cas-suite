import { createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { money, fmtDate } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { useMemo, useState } from "react";
import { RecordPaymentDialog } from "@/components/RecordPaymentDialog";
import { downloadCSV, downloadXLSX } from "@/lib/export";
import { logActivity } from "@/lib/activity";
import { toast } from "sonner";
import { Trash2, Plus } from "lucide-react";

export const Route = createFileRoute("/payments")({
  head: () => ({ meta: [{ title: "Payments - Zam Zam Traders" }] }),
  component: PaymentsPage,
});

function PaymentsPage() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [method, setMethod] = useState("");
  const payments = useLiveQuery(() => db().payments.orderBy("date").reverse().toArray()) ?? [];
  const customers = useLiveQuery(() => db().customers.toArray()) ?? [];
  const custName = useMemo(() => new Map(customers.map(c => [c.code, c.name])), [customers]);

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return payments.filter(p => {
      if (from && p.date < from) return false;
      if (to && p.date > to) return false;
      if (method && p.method !== method) return false;
      if (term) {
        const name = (custName.get(p.customerCode) ?? "").toLowerCase();
        if (!name.includes(term) && !p.customerCode.toLowerCase().includes(term) && !(p.invoiceNumber ?? "").toLowerCase().includes(term) && !(p.reference ?? "").toLowerCase().includes(term)) return false;
      }
      return true;
    });
  }, [payments, q, from, to, method, custName]);

  const total = rows.reduce((a, p) => a + p.amount, 0);

  async function del(id: number) {
    if (!confirm("Delete this payment? Outstanding will recalculate.")) return;
    await db().payments.delete(id);
    await logActivity("payment.delete", `Deleted payment id=${id}`);
    toast.success("Deleted");
  }

  function exportData(kind: "csv" | "xlsx") {
    const data = rows.map(p => ({
      Date: p.date, Customer: custName.get(p.customerCode) ?? p.customerCode, Code: p.customerCode,
      Invoice: p.invoiceNumber ?? "", Method: p.method ?? "", Reference: p.reference ?? "",
      Collector: p.collector ?? "", Notes: p.notes ?? "", Amount: p.amount,
    }));
    if (kind === "csv") downloadCSV("payments.csv", data); else downloadXLSX("payments.xlsx", data, "Payments");
  }

  return (
    <div>
      <PageHeader
        eyebrow="Operations"
        title="Payments"
        subtitle={`${rows.length.toLocaleString()} payments · ${money(total)} total`}
        actions={
          <div className="flex gap-2">
            <button onClick={() => exportData("csv")} className="btn btn-secondary">CSV</button>
            <button onClick={() => exportData("xlsx")} className="btn btn-secondary">Excel</button>
            <button onClick={() => setOpen(true)} className="btn btn-primary"><Plus className="h-3.5 w-3.5" />Record payment</button>
          </div>
        }
      />
      <div className="panel p-3 mb-3 grid grid-cols-5 gap-2">
        <input className="input-base col-span-2" placeholder="Search customer, invoice, reference..." value={q} onChange={e => setQ(e.target.value)} />
        <input type="date" className="input-base" value={from} onChange={e => setFrom(e.target.value)} />
        <input type="date" className="input-base" value={to} onChange={e => setTo(e.target.value)} />
        <select className="input-base" value={method} onChange={e => setMethod(e.target.value)}>
          <option value="">All methods</option><option>Cash</option><option>Bank</option><option>Cheque</option><option>Online</option><option>JazzCash</option><option>EasyPaisa</option><option>Imported</option>
        </select>
      </div>
      <div className="panel overflow-hidden">
        <table className="data-table">
          <thead><tr><th>Date</th><th>Customer</th><th>Invoice</th><th>Method</th><th>Reference</th><th>Collector</th><th className="right">Amount</th><th></th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={8} className="text-center py-10 text-muted-foreground">No payments.</td></tr>}
            {rows.map(p => (
              <tr key={p.id}>
                <td className="num text-muted-foreground">{fmtDate(p.date)}</td>
                <td>{custName.get(p.customerCode) ?? p.customerCode} <span className="mono text-[11px] text-muted-foreground">({p.customerCode})</span></td>
                <td className="mono">{p.invoiceNumber ?? "-"}</td>
                <td>{p.method ?? "-"}</td>
                <td className="text-muted-foreground">{p.reference ?? "-"}</td>
                <td>{p.collector ?? "-"}</td>
                <td className="right num font-medium text-success">{money(p.amount)}</td>
                <td className="right"><button onClick={() => del(p.id!)} className="text-muted-foreground hover:text-destructive p-1"><Trash2 className="h-3.5 w-3.5" /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <RecordPaymentDialog open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
