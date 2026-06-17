import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { Link, useNavigate } from "@tanstack/react-router";
import { money, fmtDate, cls } from "@/lib/format";
import { round2 } from "@/lib/calc";
import { Users, FileText, Wallet, Receipt, BookOpen, BarChart3, Search } from "lucide-react";

type Filter = "all" | "customers" | "invoices" | "payments" | "outstanding" | "ledger" | "reports";

const FILTERS: Array<{ id: Filter; label: string; icon: any }> = [
  { id: "all", label: "All", icon: Search },
  { id: "customers", label: "Customers", icon: Users },
  { id: "invoices", label: "Invoices", icon: FileText },
  { id: "payments", label: "Payments", icon: Wallet },
  { id: "outstanding", label: "Outstanding", icon: Receipt },
  { id: "ledger", label: "Ledger", icon: BookOpen },
  { id: "reports", label: "Reports", icon: BarChart3 },
];

const REPORT_LINKS: Array<{ label: string; hint: string }> = [
  { label: "Outstanding Report", hint: "Open invoices by customer" },
  { label: "Collection Report", hint: "Payments received" },
  { label: "Invoice Report", hint: "All invoices in a date range" },
  { label: "Payment Report", hint: "All payments in a date range" },
  { label: "Monthly Sales", hint: "Sales & collections by month" },
  { label: "Top Customers", hint: "By total purchases" },
  { label: "Booker Report", hint: "Sales grouped by booker" },
  { label: "Deliveryman Report", hint: "Sales grouped by deliveryman" },
  { label: "Ageing Report", hint: "Outstanding by age bucket" },
];

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (b: boolean) => void }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const navigate = useNavigate();

  useEffect(() => { if (!open) { setQ(""); setFilter("all"); } }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onOpenChange(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  const showCust = filter === "all" || filter === "customers";
  const showInv = filter === "all" || filter === "invoices";
  const showPay = filter === "all" || filter === "payments";
  const showOut = filter === "all" || filter === "outstanding";
  const showLed = filter === "all" || filter === "ledger";
  const showRep = filter === "all" || filter === "reports";

  const term = q.trim().toLowerCase();
  const hasTerm = term.length > 0;

  const customers = useLiveQuery(async () => {
    if (!open || !showCust || !hasTerm) return [];
    return (await db().customers.limit(3000).toArray())
      .filter(c => c.code.toLowerCase().includes(term) || c.name.toLowerCase().includes(term) || (c.address ?? "").toLowerCase().includes(term))
      .slice(0, 6);
  }, [open, filter, term]) ?? [];

  const invoices = useLiveQuery(async () => {
    if (!open || !showInv || !hasTerm) return [];
    return (await db().invoices.limit(5000).toArray())
      .filter(i =>
        i.number.toLowerCase().includes(term) ||
        i.customerName.toLowerCase().includes(term) ||
        i.customerCode.toLowerCase().includes(term) ||
        (i.bookerName ?? "").toLowerCase().includes(term) ||
        (i.deliveryman ?? "").toLowerCase().includes(term) ||
        String(Math.round(i.grandTotal)).includes(term),
      ).slice(0, 6);
  }, [open, filter, term]) ?? [];

  const payments = useLiveQuery(async () => {
    if (!open || !showPay || !hasTerm) return [];
    return (await db().payments.limit(5000).toArray())
      .filter(p =>
        (p.invoiceNumber ?? "").toLowerCase().includes(term) ||
        p.customerCode.toLowerCase().includes(term) ||
        (p.reference ?? "").toLowerCase().includes(term) ||
        (p.collector ?? "").toLowerCase().includes(term) ||
        (p.method ?? "").toLowerCase().includes(term) ||
        String(Math.round(p.amount)).includes(term),
      ).slice(0, 6);
  }, [open, filter, term]) ?? [];

  const outstanding = useLiveQuery(async () => {
    if (!open || !showOut) return [];
    const [invs, pays] = await Promise.all([db().invoices.toArray(), db().payments.toArray()]);
    const paidBy = new Map<string, number>();
    for (const p of pays) if (p.invoiceNumber) paidBy.set(p.invoiceNumber, round2((paidBy.get(p.invoiceNumber) ?? 0) + p.amount));
    const openInvs = invs.map(i => ({ inv: i, out: round2(i.grandTotal - (paidBy.get(i.number) ?? 0)) }))
      .filter(x => x.out > 0.009);
    const filt = hasTerm
      ? openInvs.filter(x => x.inv.number.toLowerCase().includes(term) || x.inv.customerName.toLowerCase().includes(term) || x.inv.customerCode.toLowerCase().includes(term))
      : openInvs;
    return filt.sort((a, b) => b.out - a.out).slice(0, 6);
  }, [open, filter, term]) ?? [];

  const ledgerCustomers = useLiveQuery(async () => {
    if (!open || !showLed || !hasTerm) return [];
    return (await db().customers.limit(3000).toArray())
      .filter(c => c.code.toLowerCase().includes(term) || c.name.toLowerCase().includes(term))
      .slice(0, 5);
  }, [open, filter, term]) ?? [];

  const reportMatches = useMemo(() => {
    if (!open || !showRep) return [];
    if (!hasTerm) return filter === "reports" ? REPORT_LINKS : [];
    return REPORT_LINKS.filter(r => r.label.toLowerCase().includes(term) || r.hint.toLowerCase().includes(term));
  }, [open, filter, term, showRep, hasTerm]);

  if (!open) return null;

  const empty = hasTerm && !customers.length && !invoices.length && !payments.length && !outstanding.length && !ledgerCustomers.length && !reportMatches.length;

  return (
    <div className="fixed inset-0 z-50 no-print" onClick={() => onOpenChange(false)}>
      <div className="absolute inset-0 bg-black/45" />
      <div
        onClick={e => e.stopPropagation()}
        className="absolute left-1/2 top-[6vh] sm:top-[10vh] w-[94vw] sm:w-[680px] max-w-[680px] -translate-x-1/2 rounded-xl border border-border bg-popover shadow-floating overflow-hidden"
      >
        <div className="flex items-center gap-2 border-b border-border px-3 py-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            autoFocus
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search by name, code, invoice #, amount, reference..."
            className="flex-1 bg-transparent text-[14px] outline-none placeholder:text-muted-foreground"
          />
          <span className="kbd">Esc</span>
        </div>
        <div className="flex flex-wrap gap-1 px-2 py-2 border-b border-border bg-surface-2">
          {FILTERS.map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={cls(
                "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11.5px] font-medium transition-colors",
                filter === f.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <f.icon className="h-3 w-3" /> {f.label}
            </button>
          ))}
        </div>
        <div className="max-h-[58vh] overflow-auto">
          {!hasTerm && filter === "all" && (
            <div className="p-6 text-center text-xs text-muted-foreground">
              Start typing to search across every customer, invoice, payment, and open balance.
              Use the filter chips above to scope your search.
            </div>
          )}
          {empty && <div className="p-6 text-center text-xs text-muted-foreground">No matches.</div>}

          {customers.length > 0 && (
            <Section title="Customers">
              {customers.map(c => (
                <Link key={c.code} to="/customers/$code" params={{ code: c.code }} onClick={() => onOpenChange(false)} className="flex items-center justify-between px-3 py-2 text-sm hover:bg-muted">
                  <span><span className="mono text-muted-foreground mr-2">{c.code}</span>{c.name}</span>
                  <span className="text-[11px] text-muted-foreground truncate max-w-[260px]">{c.address ?? ""}</span>
                </Link>
              ))}
            </Section>
          )}

          {invoices.length > 0 && (
            <Section title="Invoices">
              {invoices.map(i => (
                <Link key={i.number} to="/invoices/$number" params={{ number: i.number }} onClick={() => onOpenChange(false)} className="flex items-center justify-between px-3 py-2 text-sm hover:bg-muted">
                  <span><span className="mono text-muted-foreground mr-2">#{i.number}</span>{i.customerName}</span>
                  <span className="num text-[11px] text-muted-foreground">{fmtDate(i.date)} · {money(i.grandTotal)}</span>
                </Link>
              ))}
            </Section>
          )}

          {payments.length > 0 && (
            <Section title="Payments">
              {payments.map(p => (
                <button
                  key={p.id}
                  onClick={() => { onOpenChange(false); navigate({ to: "/payments" }); }}
                  className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-muted text-left"
                >
                  <span><span className="mono text-muted-foreground mr-2">{p.invoiceNumber ?? "-"}</span>{p.customerCode} <span className="text-[11px] text-muted-foreground">· {p.method ?? ""}</span></span>
                  <span className="num text-[11px] text-success">{fmtDate(p.date)} · {money(p.amount)}</span>
                </button>
              ))}
            </Section>
          )}

          {outstanding.length > 0 && (
            <Section title="Outstanding invoices">
              {outstanding.map(x => (
                <Link key={x.inv.number} to="/invoices/$number" params={{ number: x.inv.number }} onClick={() => onOpenChange(false)} className="flex items-center justify-between px-3 py-2 text-sm hover:bg-muted">
                  <span><span className="mono text-muted-foreground mr-2">#{x.inv.number}</span>{x.inv.customerName}</span>
                  <span className="num text-[11px] text-accent">{money(x.out)}</span>
                </Link>
              ))}
            </Section>
          )}

          {ledgerCustomers.length > 0 && (
            <Section title="Ledger">
              {ledgerCustomers.map(c => (
                <Link key={c.code} to="/customers/$code" params={{ code: c.code }} onClick={() => onOpenChange(false)} className="flex items-center justify-between px-3 py-2 text-sm hover:bg-muted">
                  <span><span className="mono text-muted-foreground mr-2">{c.code}</span>{c.name}</span>
                  <span className="text-[11px] text-muted-foreground">Open ledger →</span>
                </Link>
              ))}
            </Section>
          )}

          {reportMatches.length > 0 && (
            <Section title="Reports">
              {reportMatches.map(r => (
                <Link key={r.label} to="/reports" onClick={() => onOpenChange(false)} className="flex items-center justify-between px-3 py-2 text-sm hover:bg-muted">
                  <span>{r.label}</span>
                  <span className="text-[11px] text-muted-foreground">{r.hint}</span>
                </Link>
              ))}
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="py-1 border-t border-border first:border-t-0">
      <div className="px-3 py-1 label-eyebrow">{title}</div>
      {children}
    </div>
  );
}
