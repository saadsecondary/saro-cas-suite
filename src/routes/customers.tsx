import { createFileRoute, Link } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { money, fmtDate } from "@/lib/format";
import { round2 } from "@/lib/calc";
import { PageHeader } from "@/components/PageHeader";
import { useMemo, useState } from "react";
import { downloadCSV, downloadXLSX } from "@/lib/export";

export const Route = createFileRoute("/customers")({
  head: () => ({ meta: [{ title: "Customers - Zam Zam Traders" }] }),
  component: CustomersPage,
});

type SearchField = "all" | "code" | "name" | "address" | "phone";

function CustomersPage() {
  const [q, setQ] = useState("");
  const [field, setField] = useState<SearchField>("all");
  const [sortBy, setSortBy] = useState<"name" | "outstanding" | "purchases" | "code">("outstanding");
  const [outstandingOnly, setOutstandingOnly] = useState(false);
  const customers = useLiveQuery(() => db().customers.toArray()) ?? [];
  const invoices = useLiveQuery(() => db().invoices.toArray()) ?? [];
  const payments = useLiveQuery(() => db().payments.toArray()) ?? [];

  const rows = useMemo(() => {
    const purByC = new Map<string, number>();
    const payByC = new Map<string, number>();
    const invCntByC = new Map<string, number>();
    const payCntByC = new Map<string, number>();
    for (const i of invoices) {
      purByC.set(i.customerCode, round2((purByC.get(i.customerCode) ?? 0) + i.grandTotal));
      invCntByC.set(i.customerCode, (invCntByC.get(i.customerCode) ?? 0) + 1);
    }
    for (const p of payments) {
      payByC.set(p.customerCode, round2((payByC.get(p.customerCode) ?? 0) + p.amount));
      payCntByC.set(p.customerCode, (payCntByC.get(p.customerCode) ?? 0) + 1);
    }
    let out = customers.map(c => ({
      ...c,
      purchases: purByC.get(c.code) ?? 0,
      payments: payByC.get(c.code) ?? 0,
      outstanding: round2((purByC.get(c.code) ?? 0) - (payByC.get(c.code) ?? 0)),
      invoiceCount: invCntByC.get(c.code) ?? 0,
      paymentCount: payCntByC.get(c.code) ?? 0,
    }));
    const term = q.trim().toLowerCase();
    // Loose-match key: strip every non-alphanumeric character so searches like
    // "D.M MEDICAL", "DM medical", "d.mmedical" all hit the same record.
    const loose = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    const termLoose = loose(term);
    if (term) {
      out = out.filter(c => {
        const code = c.code.toLowerCase();
        const name = c.name.toLowerCase();
        const addr = (c.address ?? "").toLowerCase();
        const phone = (c.phone ?? "").toLowerCase();
        const nameL = loose(c.name);
        const codeL = loose(c.code);
        const addrL = loose(c.address ?? "");
        if (field === "code") return code.includes(term) || codeL.includes(termLoose);
        if (field === "name") return name.includes(term) || nameL.includes(termLoose);
        if (field === "address") return addr.includes(term) || addrL.includes(termLoose);
        if (field === "phone") return phone.includes(term);
        return code.includes(term) || codeL.includes(termLoose)
            || name.includes(term) || nameL.includes(termLoose)
            || addr.includes(term) || addrL.includes(termLoose)
            || phone.includes(term);
      });
    }
    if (outstandingOnly) out = out.filter(c => c.outstanding > 0.009);
    out.sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name);
      if (sortBy === "code") return a.code.localeCompare(b.code);
      if (sortBy === "purchases") return b.purchases - a.purchases;
      return b.outstanding - a.outstanding;
    });
    return out;
  }, [customers, invoices, payments, q, field, sortBy, outstandingOnly]);

  function exportData(kind: "csv" | "xlsx") {
    const data = rows.map(r => ({
      Code: r.code, Name: r.name, Address: r.address ?? "", Phone: r.phone ?? "",
      Purchases: r.purchases, Payments: r.payments, Outstanding: r.outstanding,
      Invoices: r.invoiceCount, PaymentsCount: r.paymentCount,
    }));
    if (kind === "csv") downloadCSV("customers.csv", data); else downloadXLSX("customers.xlsx", data, "Customers");
  }

  return (
    <div>
      <PageHeader
        eyebrow="Operations"
        title="Customers"
        subtitle={`${rows.length.toLocaleString()} customers`}
        actions={
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <div className="flex w-full sm:w-auto items-stretch rounded-md border border-input bg-surface overflow-hidden focus-within:ring-2 focus-within:ring-ring/40">
              <select
                value={field}
                onChange={e => setField(e.target.value as SearchField)}
                aria-label="Search field"
                className="bg-surface-2 text-[12px] px-2 border-r border-input outline-none"
              >
                <option value="all">All fields</option>
                <option value="code">Code</option>
                <option value="name">Name</option>
                <option value="address">Address</option>
                <option value="phone">Phone</option>
              </select>
              <input
                className="flex-1 sm:w-[220px] bg-surface text-[12.5px] px-3 py-1.5 outline-none"
                placeholder={field === "all" ? "Search code, name, address, phone..." : `Search by ${field}...`}
                value={q}
                onChange={e => setQ(e.target.value)}
                aria-label="Search customers"
              />
              {q && (
                <button
                  type="button"
                  onClick={() => setQ("")}
                  aria-label="Clear search"
                  className="px-2 text-muted-foreground hover:text-foreground text-sm"
                >
                  &times;
                </button>
              )}
            </div>
            <select className="input-base w-full sm:w-[170px]" value={sortBy} onChange={e => setSortBy(e.target.value as any)} aria-label="Sort by">
              <option value="outstanding">Outstanding (high)</option>
              <option value="purchases">Purchases (high)</option>
              <option value="name">Name A to Z</option>
              <option value="code">Code A to Z</option>
            </select>
            <label className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground select-none">
              <input
                type="checkbox"
                checked={outstandingOnly}
                onChange={e => setOutstandingOnly(e.target.checked)}
                className="accent-foreground"
              />
              Outstanding only
            </label>
            <button onClick={() => exportData("csv")} className="btn btn-secondary">CSV</button>
            <button onClick={() => exportData("xlsx")} className="btn btn-secondary">Excel</button>
          </div>
        }
      />

      <div className="panel overflow-hidden">
        <div className="max-h-[calc(100vh-220px)] overflow-auto">
          <table className="data-table">
            <thead>
              <tr><th>Code</th><th>Name</th><th>Address</th><th className="right">Invoices</th><th className="right">Purchases</th><th className="right">Payments</th><th className="right">Outstanding</th></tr>
            </thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={7} className="text-center text-muted-foreground py-10">No customers yet.</td></tr>}
              {rows.map(r => (
                <tr key={r.code} className="row-clickable" onClick={() => location.assign(`/customers/${encodeURIComponent(r.code)}`)}>
                  <td className="mono text-muted-foreground">{r.code}</td>
                  <td className="font-medium">{r.name}</td>
                  <td className="text-muted-foreground">{r.address ?? "-"}</td>
                  <td className="right num">{r.invoiceCount}</td>
                  <td className="right num">{money(r.purchases)}</td>
                  <td className="right num text-success">{money(r.payments)}</td>
                  <td className="right num font-semibold">{r.outstanding > 0 ? <span className="text-accent">{money(r.outstanding)}</span> : <span className="text-muted-foreground">{money(r.outstanding)}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
