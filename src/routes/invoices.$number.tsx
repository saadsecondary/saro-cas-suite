import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { money, fmtDate, num } from "@/lib/format";
import { invoiceOutstanding } from "@/lib/calc";
import { PageHeader } from "@/components/PageHeader";
import { useState } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import { Logo } from "@/components/Logo";
import { RecordPaymentDialog } from "@/components/RecordPaymentDialog";
import { downloadCSV, downloadXLSX, triggerPrint } from "@/lib/export";
import { Printer, ArrowLeft, FileDown, Plus, Copy, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { logActivity } from "@/lib/activity";

export const Route = createFileRoute("/invoices/$number")({
  head: ({ params }) => ({ meta: [{ title: `Invoice #${params.number} - Zam Zam Traders` }] }),
  component: InvoiceDetail,
});

function InvoiceDetail() {
  const { number } = Route.useParams();
  const nav = useNavigate();
  const [payOpen, setPayOpen] = useState(false);
  const inv = useLiveQuery(() => db().invoices.get(number), [number]);
  const pays = useLiveQuery(() => db().payments.where("invoiceNumber").equals(number).toArray(), [number]) ?? [];

  if (!inv) return <div className="text-center py-12 text-muted-foreground text-sm">Invoice not found. <Link to="/invoices" className="text-accent underline">Back</Link></div>;

  const paid = pays.reduce((a, p) => a + p.amount, 0);
  const outstanding = Math.round((inv.grandTotal - paid) * 100) / 100;
  const status = outstanding <= 0.009 ? "cleared" : paid > 0 ? "partial" : "pending";

  function exportLines(kind: "csv" | "xlsx") {
    const rows = inv!.lines.map(l => ({
      Description: l.description, SaleQty: l.saleQty, FreeQty: l.freeQty,
      RetailPrice: l.retailPrice, TradePrice: l.tradePrice,
      DiscountRegular: l.discountRegular, DiscountSpecial: l.discountSpecial,
      TradeOfferRate: l.tradeOfferRate, TradeOfferAmount: l.tradeOfferAmount,
      SalesTax: l.salesTax, NetAmount: l.netAmount, NetRate: l.netRate,
    }));
    if (kind === "csv") downloadCSV(`invoice-${inv!.number}.csv`, rows);
    else downloadXLSX(`invoice-${inv!.number}.xlsx`, rows, "Invoice");
  }

  async function duplicate() {
    const newNo = inv!.number + "-COPY";
    if (await db().invoices.get(newNo)) { toast.error("A copy already exists"); return; }
    await db().invoices.put({ ...inv!, number: newNo, source: "manual", createdAt: Date.now(), updatedAt: Date.now() });
    await logActivity("invoice.duplicate", `Duplicated invoice ${inv!.number} → ${newNo}`, `invoice:${newNo}`);
    nav({ to: "/invoices/$number", params: { number: newNo } });
  }

  async function deleteInvoice() {
    if (!confirm(`Delete invoice #${inv!.number}? Payments will be detached.`)) return;
    await db().invoices.delete(inv!.number);
    await db().payments.where("invoiceNumber").equals(inv!.number).modify({ invoiceNumber: undefined });
    await logActivity("invoice.delete", `Deleted invoice ${inv!.number}`, `invoice:${inv!.number}`);
    toast.success("Deleted");
    nav({ to: "/invoices" });
  }

  return (
    <div>
      <PageHeader
        eyebrow={<Link to="/invoices" className="inline-flex items-center gap-1"><ArrowLeft className="h-3 w-3" />Invoices</Link> as any}
        title={`Invoice #${inv.number}`}
        subtitle={`${fmtDate(inv.date)} · ${inv.customerName}`}
        actions={
          <div className="flex gap-2">
            {outstanding > 0 && <button onClick={() => setPayOpen(true)} className="btn btn-primary"><Plus className="h-3.5 w-3.5" />Record payment</button>}
            <button onClick={() => exportLines("xlsx")} className="btn btn-secondary"><FileDown className="h-3.5 w-3.5" />Export</button>
            <button onClick={triggerPrint} className="btn btn-secondary"><Printer className="h-3.5 w-3.5" />Print</button>
            <button onClick={duplicate} className="btn btn-ghost"><Copy className="h-3.5 w-3.5" />Duplicate</button>
            <button onClick={deleteInvoice} className="btn btn-ghost text-destructive"><Trash2 className="h-3.5 w-3.5" />Delete</button>
          </div>
        }
      />

      <div className="grid grid-cols-4 gap-3 mb-4 no-print">
        <div className="panel p-4"><div className="label-eyebrow">Grand total</div><div className="num text-[20px] font-semibold mt-1">{money(inv.grandTotal)}</div></div>
        <div className="panel p-4"><div className="label-eyebrow">Paid</div><div className="num text-[20px] font-semibold mt-1 text-success">{money(paid)}</div></div>
        <div className="panel p-4"><div className="label-eyebrow">Outstanding</div><div className="num text-[20px] font-semibold mt-1 text-accent">{money(outstanding)}</div></div>
        <div className="panel p-4"><div className="label-eyebrow">Status</div><div className="mt-2"><StatusBadge status={status as any} /></div><div className="text-[10.5px] mt-2 text-muted-foreground">{inv.lowConfidenceFields?.length ? `Review: ${inv.lowConfidenceFields.join(", ")}` : `Confidence ${Math.round((inv.confidence ?? 1) * 100)}%`}</div></div>
      </div>

      <div className="panel p-6 print:p-0">
        <div className="flex items-start justify-between mb-5 pb-4 border-b border-border">
          <div>
            <Logo withWordmark />
            <div className="text-[11px] text-muted-foreground mt-2">Gulshan-e-Iqbal, Karachi</div>
          </div>
          <div className="text-right text-[12px]">
            <div className="text-[16px] font-semibold tracking-tight">CASH MEMO / INVOICE</div>
            <div className="mt-1"><span className="text-muted-foreground">No.</span> <span className="mono">{inv.number}</span></div>
            <div><span className="text-muted-foreground">Date</span> <span className="num">{fmtDate(inv.date)}</span></div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-[12.5px] mb-5">
          <div><span className="label-eyebrow inline-block w-[110px]">Customer</span><Link to="/customers/$code" params={{ code: inv.customerCode }} className="font-medium hover:text-accent">{inv.customerName}</Link> <span className="mono text-[11px] text-muted-foreground ml-1">({inv.customerCode})</span></div>
          <div><span className="label-eyebrow inline-block w-[110px]">Booker</span>{inv.bookerName ?? "-"}</div>
          <div><span className="label-eyebrow inline-block w-[110px]">Address</span>{inv.address ?? "-"}</div>
          <div><span className="label-eyebrow inline-block w-[110px]">Deliveryman</span>{inv.deliveryman ?? "-"}</div>
        </div>

        <table className="data-table">
          <thead>
            <tr>
              <th>Description</th>
              <th className="right">Sale</th><th className="right">Free</th>
              <th className="right">Retail</th><th className="right">Trade</th>
              <th className="right">Disc. Reg.</th><th className="right">Disc. Sp.</th>
              <th className="right">T.O. Rate</th><th className="right">T.O. Amt</th>
              <th className="right">Tax</th><th className="right">Net Amt</th><th className="right">Net Rate</th>
            </tr>
          </thead>
          <tbody>
            {inv.lines.length === 0 && <tr><td colSpan={12} className="text-center text-muted-foreground py-6">No line items captured (this invoice was seeded from an outstanding report).</td></tr>}
            {inv.lines.map((l, i) => (
              <tr key={i}>
                <td>{l.description}</td>
                <td className="right num">{l.saleQty || ""}</td>
                <td className="right num text-muted-foreground">{l.freeQty || ""}</td>
                <td className="right num">{l.retailPrice ? money(l.retailPrice) : ""}</td>
                <td className="right num">{l.tradePrice ? money(l.tradePrice) : ""}</td>
                <td className="right num">{l.discountRegular || ""}</td>
                <td className="right num">{l.discountSpecial || ""}</td>
                <td className="right num">{l.tradeOfferRate || ""}</td>
                <td className="right num">{l.tradeOfferAmount ? money(l.tradeOfferAmount) : ""}</td>
                <td className="right num">{l.salesTax || ""}</td>
                <td className="right num font-medium">{l.netAmount ? money(l.netAmount) : ""}</td>
                <td className="right num">{l.netRate ? money(l.netRate) : ""}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-surface-2 font-semibold">
              <td colSpan={10}>Total items: {num(inv.itemCount)}</td>
              <td className="right num">{money(inv.grandTotal)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="panel mt-4 no-print">
        <div className="px-4 py-3 border-b border-border label-eyebrow">Payments against this invoice</div>
        <table className="data-table">
          <thead><tr><th>Date</th><th>Method</th><th>Reference</th><th>Collector</th><th>Notes</th><th className="right">Amount</th></tr></thead>
          <tbody>
            {pays.length === 0 && <tr><td colSpan={6} className="text-center text-muted-foreground py-6">No payments yet.</td></tr>}
            {pays.sort((a, b) => b.date.localeCompare(a.date)).map(p => (
              <tr key={p.id}>
                <td className="num text-muted-foreground">{fmtDate(p.date)}</td>
                <td>{p.method ?? "-"}</td>
                <td className="text-muted-foreground">{p.reference ?? "-"}</td>
                <td>{p.collector ?? "-"}</td>
                <td className="text-muted-foreground">{p.notes ?? "-"}</td>
                <td className="right num font-medium text-success">{money(p.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <RecordPaymentDialog open={payOpen} onClose={() => setPayOpen(false)} customerCode={inv.customerCode} invoiceNumber={inv.number} />
    </div>
  );
}
