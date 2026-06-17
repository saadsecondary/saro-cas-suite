import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/PageHeader";
import { useRef, useState } from "react";
import { parseAny, type AnyParseResult } from "@/lib/parser";
import { importInvoice, importOutstandingReport } from "@/lib/import-store";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { toast } from "sonner";
import { Upload, FileText, CheckCircle2, AlertTriangle, XCircle, Loader2 } from "lucide-react";
import { money, fmtDate } from "@/lib/format";

export const Route = createFileRoute("/import")({
  head: () => ({ meta: [{ title: "Import Center - Zam Zam Traders" }] }),
  component: ImportPage,
});

interface FileState {
  file: File;
  status: "queued" | "parsing" | "ready" | "saving" | "saved" | "duplicate" | "error";
  message?: string;
  parsed?: AnyParseResult;
  invoiceNumber?: string;
}

function ImportPage() {
  const [files, setFiles] = useState<FileState[]>([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function add(list: FileList | File[]) {
    const arr = Array.from(list).filter(f => /\.pdf$/i.test(f.name));
    setFiles(prev => [...prev, ...arr.map(f => ({ file: f, status: "queued" as const }))]);
  }

  async function parseAll() {
    setFiles(prev => prev.map(f => f.status === "queued" ? { ...f, status: "parsing" } : f));
    const snapshot = [...files];
    for (let idx = 0; idx < snapshot.length; idx++) {
      const f = snapshot[idx];
      if (f.status !== "queued" && f.status !== "parsing") continue;
      try {
        const res = await parseAny(f.file);
        setFiles(prev => prev.map((p, i) => i === idx ? { ...p, status: "ready", parsed: res, message: summarize(res) } : p));
      } catch (e: any) {
        setFiles(prev => prev.map((p, i) => i === idx ? { ...p, status: "error", message: e?.message ?? String(e) } : p));
      }
    }
  }

  async function saveAll() {
    const snapshot = [...files];
    for (let idx = 0; idx < snapshot.length; idx++) {
      const f = snapshot[idx];
      if (f.status !== "ready" || !f.parsed) continue;
      setFiles(prev => prev.map((p, i) => i === idx ? { ...p, status: "saving" } : p));
      try {
        const parsed = f.parsed!;
        if (parsed.kind === "invoice") {
          if (!parsed.result.ok || !parsed.result.invoice) {
            setFiles(prev => prev.map((p, i) => i === idx ? { ...p, status: "error", message: parsed.result.error ?? "Parser failed" } : p));
            continue;
          }
          const r = await importInvoice(parsed.result.invoice);
          await db().imports.add({ at: Date.now(), fileName: f.file.name, kind: "invoice", itemsImported: r.saved ? 1 : 0, itemsSkipped: r.saved ? 0 : 1, notes: r.reason });
          setFiles(prev => prev.map((p, i) => i === idx ? { ...p, status: r.saved ? "saved" : "duplicate", message: r.saved ? `Saved as #${r.number}` : `Already imported (#${r.number})`, invoiceNumber: r.number } : p));
        } else if (parsed.kind === "outstanding-report") {
          if (!parsed.result.ok) {
            setFiles(prev => prev.map((p, i) => i === idx ? { ...p, status: "error", message: parsed.result.error ?? "Parser failed" } : p));
            continue;
          }
          const r = await importOutstandingReport(parsed.result);
          await db().imports.add({ at: Date.now(), fileName: f.file.name, kind: "outstanding-report", itemsImported: r.invoicesAdded + r.paymentsAdded, itemsSkipped: r.invoicesSkipped });
          setFiles(prev => prev.map((p, i) => i === idx ? { ...p, status: "saved", message: `+${r.invoicesAdded} invoices · +${r.paymentsAdded} payments · +${r.customersCreated} customers (${r.invoicesSkipped} duplicates)` } : p));
        } else {
          setFiles(prev => prev.map((p, i) => i === idx ? { ...p, status: "error", message: "Unrecognized layout" } : p));
        }
      } catch (e: any) {
        setFiles(prev => prev.map((p, i) => i === idx ? { ...p, status: "error", message: e?.message ?? String(e) } : p));
      }
    }
    await logActivity("import.batch", `Processed ${snapshot.length} file(s)`);
    toast.success("Import complete");
  }

  function clearDone() { setFiles(prev => prev.filter(f => f.status !== "saved" && f.status !== "duplicate")); }

  const ready = files.filter(f => f.status === "ready").length;
  const queued = files.filter(f => f.status === "queued").length;

  return (
    <div>
      <PageHeader
        eyebrow="System"
        title="Import Center"
        subtitle="Drop CASH MEMO / INVOICE PDFs or Salesman-wise outstanding reports. The parser is tuned for the Zam Zam Traders DOS layout."
        actions={
          <div className="flex gap-2">
            <button onClick={() => inputRef.current?.click()} className="btn btn-secondary"><Upload className="h-3.5 w-3.5" />Add files</button>
            {queued > 0 && <button onClick={parseAll} className="btn btn-secondary">Parse {queued}</button>}
            {ready > 0 && <button onClick={saveAll} className="btn btn-primary">Save {ready} to database</button>}
            {files.length > 0 && <button onClick={clearDone} className="btn btn-ghost">Clear completed</button>}
          </div>
        }
      />

      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files.length) add(e.dataTransfer.files); }}
        className={`panel border-2 border-dashed transition-colors ${dragging ? "border-accent bg-surface-2" : "border-border"} p-10 text-center mb-4 cursor-pointer`}
        onClick={() => inputRef.current?.click()}
      >
        <Upload className="h-7 w-7 mx-auto text-muted-foreground mb-2" />
        <div className="text-[14px] font-medium">Drag &amp; drop invoice PDFs here</div>
        <div className="text-[12px] text-muted-foreground mt-1">or click to browse. Bulk import supported. Auto-detects single invoices vs. outstanding reports.</div>
        <input ref={inputRef} type="file" multiple accept="application/pdf" className="hidden" onChange={e => e.target.files && add(e.target.files)} />
      </div>

      {files.length > 0 && (
        <div className="panel overflow-hidden">
          <table className="data-table">
            <thead><tr><th></th><th>File</th><th>Detected</th><th>Status</th><th>Details</th><th></th></tr></thead>
            <tbody>
              {files.map((f, i) => (
                <tr key={i}>
                  <td><StatusIcon status={f.status} /></td>
                  <td><FileText className="inline h-3.5 w-3.5 mr-1 text-muted-foreground" />{f.file.name}</td>
                  <td className="text-muted-foreground">{f.parsed?.kind ?? "-"}</td>
                  <td className="capitalize">{f.status}</td>
                  <td className="text-[11.5px] text-muted-foreground">{f.message ?? ""}</td>
                  <td className="right">
                    {f.invoiceNumber && <Link to="/invoices/$number" params={{ number: f.invoiceNumber }} className="text-accent text-[11.5px] hover:underline">Open →</Link>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function summarize(res: AnyParseResult): string {
  if (res.kind === "invoice") {
    if (!res.result.ok) return res.result.error ?? "Failed to parse";
    const inv = res.result.invoice!;
    return `#${inv.number} · ${inv.customerName} · ${inv.lines.length} lines · ${money(inv.grandTotal)} · confidence ${Math.round(res.result.confidence * 100)}%`;
  }
  if (res.kind === "outstanding-report") {
    if (!res.result.ok) return res.result.error ?? "Failed to parse";
    const t = res.result.totals;
    return `${res.result.rows.length} invoices · booker: ${res.result.bookerName ?? "-"}${t ? ` · ${money(t.balance)} outstanding` : ""}`;
  }
  return "Unknown layout";
}

function StatusIcon({ status }: { status: FileState["status"] }) {
  if (status === "saved") return <CheckCircle2 className="h-4 w-4 text-success" />;
  if (status === "duplicate") return <AlertTriangle className="h-4 w-4 text-warning" />;
  if (status === "error") return <XCircle className="h-4 w-4 text-destructive" />;
  if (status === "parsing" || status === "saving") return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
  if (status === "ready") return <CheckCircle2 className="h-4 w-4 text-info" />;
  return <FileText className="h-4 w-4 text-muted-foreground" />;
}
