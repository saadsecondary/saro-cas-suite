import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/PageHeader";
import { useState, useEffect } from "react";
import { db } from "@/lib/db";
import { toast } from "sonner";
import { useLiveQuery } from "dexie-react-hooks";
import { logActivity } from "@/lib/activity";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings - Zam Zam Traders" }] }),
  component: SettingsPage,
});

const KEYS = {
  businessName: "businessName",
  businessAddress: "businessAddress",
  businessPhone: "businessPhone",
};

function SettingsPage() {
  const settings = useLiveQuery(() => db().settings.toArray()) ?? [];
  const get = (k: string, d: string) => (settings.find(s => s.key === k)?.value as string) ?? d;
  const [name, setName] = useState("");
  const [addr, setAddr] = useState("");
  const [phone, setPhone] = useState("");

  useEffect(() => {
    setName(get(KEYS.businessName, "Zam Zam Traders"));
    setAddr(get(KEYS.businessAddress, "Gulshan-e-Iqbal, Karachi"));
    setPhone(get(KEYS.businessPhone, ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.length]);

  async function save() {
    await db().settings.bulkPut([
      { key: KEYS.businessName, value: name },
      { key: KEYS.businessAddress, value: addr },
      { key: KEYS.businessPhone, value: phone },
    ]);
    await logActivity("settings.update", "Updated business settings");
    toast.success("Settings saved");
  }

  async function wipe() {
    if (!confirm("This will permanently delete ALL customers, invoices, payments and activity. Continue?")) return;
    if (!confirm("This is irreversible without a backup. Are you absolutely sure?")) return;
    await db().delete();
    location.reload();
  }

  return (
    <div>
      <PageHeader eyebrow="System" title="Settings" subtitle="Business profile and danger zone." />
      <div className="grid grid-cols-2 gap-4">
        <div className="panel p-5 space-y-3">
          <div className="label-eyebrow">Business profile</div>
          <label className="block"><span className="text-[11px] text-muted-foreground">Business name</span><input className="input-base mt-1" value={name} onChange={e => setName(e.target.value)} /></label>
          <label className="block"><span className="text-[11px] text-muted-foreground">Address</span><input className="input-base mt-1" value={addr} onChange={e => setAddr(e.target.value)} /></label>
          <label className="block"><span className="text-[11px] text-muted-foreground">Phone</span><input className="input-base mt-1" value={phone} onChange={e => setPhone(e.target.value)} /></label>
          <button onClick={save} className="btn btn-primary">Save</button>
        </div>
        <div className="panel p-5">
          <div className="label-eyebrow">About</div>
          <p className="text-[12.5px] mt-2 text-muted-foreground leading-relaxed">
            Zam Zam Traders - wholesale distribution management. Use the Backup tab regularly to keep a copy of your records on a USB drive or cloud folder.
          </p>
          <div className="mt-6 pt-4 border-t border-border">
            <div className="label-eyebrow text-destructive">Danger zone</div>
            <p className="text-[12px] text-muted-foreground my-2">Permanently delete every customer, invoice, payment and activity entry. This cannot be undone.</p>
            <button onClick={wipe} className="btn btn-destructive">Wipe all data</button>
          </div>
        </div>
      </div>
    </div>
  );
}
