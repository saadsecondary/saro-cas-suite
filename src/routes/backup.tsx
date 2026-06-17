import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/PageHeader";
import { downloadBackup, restoreBackup, type BackupPayload } from "@/lib/backup";
import { useState, useRef } from "react";
import { toast } from "sonner";
import { db } from "@/lib/db";
import { useLiveQuery } from "dexie-react-hooks";
import { Download, Upload, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/backup")({
  head: () => ({ meta: [{ title: "Backup - Zam Zam Traders" }] }),
  component: BackupPage,
});

function BackupPage() {
  const [wipe, setWipe] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const counts = useLiveQuery(async () => ({
    customers: await db().customers.count(),
    invoices: await db().invoices.count(),
    payments: await db().payments.count(),
    activity: await db().activity.count(),
  })) ?? { customers: 0, invoices: 0, payments: 0, activity: 0 };

  async function handleRestore(file: File) {
    try {
      const text = await file.text();
      const payload = JSON.parse(text) as BackupPayload;
      await restoreBackup(payload, { wipe });
      toast.success("Backup restored successfully");
    } catch (e: any) {
      toast.error(e?.message ?? "Restore failed");
    }
  }

  return (
    <div>
      <PageHeader eyebrow="System" title="Backup &amp; Restore" subtitle="Save your records to a file you control. Restore that file later or on another machine." />
      <div className="grid grid-cols-2 gap-4">
        <div className="panel p-5">
          <div className="label-eyebrow mb-2">Current records</div>
          <div className="grid grid-cols-2 gap-2 text-[12.5px]">
            <div><span className="text-muted-foreground">Customers:</span> <strong className="num">{counts.customers}</strong></div>
            <div><span className="text-muted-foreground">Invoices:</span> <strong className="num">{counts.invoices}</strong></div>
            <div><span className="text-muted-foreground">Payments:</span> <strong className="num">{counts.payments}</strong></div>
            <div><span className="text-muted-foreground">Activity entries:</span> <strong className="num">{counts.activity}</strong></div>
          </div>
          <button onClick={downloadBackup} className="btn btn-primary mt-4"><Download className="h-3.5 w-3.5" />Download backup file</button>
          <p className="text-[11.5px] text-muted-foreground mt-3 leading-relaxed">
            Saves a single <code>.json</code> file containing every customer, invoice, payment and activity entry. Keep a copy on a USB drive, email it to yourself, or store it in a cloud folder. Recommended weekly.
          </p>
        </div>

        <div className="panel p-5">
          <div className="label-eyebrow mb-2">Restore from backup</div>
          <p className="text-[12px] text-muted-foreground mb-3">Choose a backup file you previously downloaded. By default new records are merged with existing ones - tick the option below only if you want to completely replace what's here.</p>
          <label className="flex items-start gap-2 text-[12.5px] mb-3">
            <input type="checkbox" checked={wipe} onChange={e => setWipe(e.target.checked)} className="mt-0.5" />
            <span className="inline-flex items-center gap-1 text-destructive"><AlertTriangle className="h-3.5 w-3.5" />Replace everything - delete current records before restoring</span>
          </label>
          <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={e => e.target.files?.[0] && handleRestore(e.target.files[0])} />
          <button onClick={() => fileRef.current?.click()} className="btn btn-secondary"><Upload className="h-3.5 w-3.5" />Choose backup file</button>
        </div>
      </div>
    </div>
  );
}
