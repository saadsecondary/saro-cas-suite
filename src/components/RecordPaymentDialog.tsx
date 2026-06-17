import { useState, useEffect } from "react";
import { db } from "@/lib/db";
import { todayISO, money } from "@/lib/format";
import { logActivity } from "@/lib/activity";
import { toast } from "sonner";
import { invoiceOutstanding } from "@/lib/calc";

export function RecordPaymentDialog({
  open, onClose, customerCode, invoiceNumber, onDone,
}: {
  open: boolean;
  onClose: () => void;
  customerCode?: string;
  invoiceNumber?: string;
  onDone?: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayISO());
  const [method, setMethod] = useState("Cash");
  const [reference, setReference] = useState("");
  const [collector, setCollector] = useState("");
  const [notes, setNotes] = useState("");
  const [invNo, setInvNo] = useState(invoiceNumber ?? "");
  const [custCode, setCustCode] = useState(customerCode ?? "");
  const [outstanding, setOutstanding] = useState<number | null>(null);

  useEffect(() => {
    setInvNo(invoiceNumber ?? "");
    setCustCode(customerCode ?? "");
    setAmount(""); setReference(""); setNotes(""); setMethod("Cash"); setCollector("");
    setDate(todayISO());
  }, [open, invoiceNumber, customerCode]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!invNo) { setOutstanding(null); return; }
      const o = await invoiceOutstanding(invNo);
      if (!cancelled) setOutstanding(o ? o.outstanding : null);
    }
    load();
    return () => { cancelled = true; };
  }, [invNo, open]);

  useEffect(() => {
    if (!custCode && invNo) {
      db().invoices.get(invNo).then(i => { if (i) setCustCode(i.customerCode); });
    }
  }, [invNo, custCode]);

  if (!open) return null;

  async function save() {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { toast.error("Enter a valid amount"); return; }
    if (!custCode) { toast.error("Customer is required"); return; }
    if (!date) { toast.error("Date is required"); return; }
    await db().payments.add({
      customerCode: custCode,
      invoiceNumber: invNo || undefined,
      date, amount: amt, method, reference: reference || undefined,
      collector: collector || undefined, notes: notes || undefined,
      source: "manual", createdAt: Date.now(),
    });
    await logActivity("payment.add", `Payment ${money(amt)} from ${custCode}${invNo ? ` vs #${invNo}` : ""}`, `payment:${custCode}`);
    toast.success("Payment recorded");
    onDone?.();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center no-print" onClick={onClose}>
      <div className="absolute inset-0 bg-black/35" />
      <div onClick={e => e.stopPropagation()} className="relative w-[480px] rounded-xl border border-border bg-popover shadow-floating">
        <div className="px-5 py-3 border-b border-border">
          <div className="text-[13px] font-semibold">Record payment</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">Immutable. Saved to the activity log.</div>
        </div>
        <div className="p-5 space-y-3 text-[12.5px]">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Customer code">
              <input value={custCode} onChange={e => setCustCode(e.target.value)} className="input" />
            </Field>
            <Field label="Invoice # (optional)">
              <input value={invNo} onChange={e => setInvNo(e.target.value)} className="input" placeholder="-" />
            </Field>
          </div>
          {outstanding !== null && (
            <div className="rounded-md border border-border bg-surface-2 px-3 py-2 text-[11.5px]">
              Outstanding on #{invNo}: <strong className="num">{money(outstanding)}</strong>
              {outstanding > 0 && (
                <button type="button" onClick={() => setAmount(String(outstanding))} className="ml-2 text-accent underline">Pay in full</button>
              )}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount">
              <input value={amount} onChange={e => setAmount(e.target.value)} className="input num" inputMode="decimal" />
            </Field>
            <Field label="Date">
              <input value={date} onChange={e => setDate(e.target.value)} type="date" className="input" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Method">
              <select value={method} onChange={e => setMethod(e.target.value)} className="input">
                <option>Cash</option><option>Bank</option><option>Cheque</option><option>Online</option><option>JazzCash</option><option>EasyPaisa</option>
              </select>
            </Field>
            <Field label="Collected by">
              <input value={collector} onChange={e => setCollector(e.target.value)} className="input" placeholder="e.g. RIZWAN" />
            </Field>
          </div>
          <Field label="Reference">
            <input value={reference} onChange={e => setReference(e.target.value)} className="input" placeholder="cheque # / txn id" />
          </Field>
          <Field label="Notes">
            <textarea value={notes} onChange={e => setNotes(e.target.value)} className="input min-h-[60px]" />
          </Field>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-border">
          <button onClick={onClose} className="btn-ghost">Cancel</button>
          <button onClick={save} className="btn-primary">Record payment</button>
        </div>
      </div>
      <style>{`
        .input { width: 100%; background: var(--color-surface); border: 1px solid var(--color-input); border-radius: 6px; padding: 6px 8px; font-size: 12.5px; outline: none; }
        .input:focus { border-color: var(--color-ring); box-shadow: 0 0 0 2px color-mix(in oklab, var(--color-ring) 18%, transparent); }
        .btn-primary { background: var(--color-primary); color: var(--color-primary-foreground); padding: 6px 14px; border-radius: 6px; font-size: 12.5px; font-weight: 500; }
        .btn-primary:hover { opacity: 0.92; }
        .btn-ghost { padding: 6px 14px; border-radius: 6px; font-size: 12.5px; color: var(--color-muted-foreground); }
        .btn-ghost:hover { background: var(--color-muted); }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label-eyebrow block mb-1">{label}</span>
      {children}
    </label>
  );
}
