// Backup / restore via JSON dump of all Dexie tables.
import { db } from "./db";
import { downloadJSON } from "./export";
import { logActivity } from "./activity";

export interface BackupPayload {
  app: "zamzam-traders";
  version: 1;
  exportedAt: number;
  customers: unknown[];
  invoices: unknown[];
  payments: unknown[];
  activity: unknown[];
  settings: unknown[];
  imports: unknown[];
}

export async function createBackup(): Promise<BackupPayload> {
  const [customers, invoices, payments, activity, settings, imports] = await Promise.all([
    db().customers.toArray(),
    db().invoices.toArray(),
    db().payments.toArray(),
    db().activity.toArray(),
    db().settings.toArray(),
    db().imports.toArray(),
  ]);
  return {
    app: "zamzam-traders",
    version: 1,
    exportedAt: Date.now(),
    customers, invoices, payments, activity, settings, imports,
  };
}

export async function downloadBackup() {
  const data = await createBackup();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  downloadJSON(`zamzam-backup-${stamp}.json`, data);
  await logActivity("backup.create", `Backup downloaded (${data.invoices.length} invoices, ${data.payments.length} payments)`);
}

export async function restoreBackup(payload: BackupPayload, opts: { wipe: boolean }) {
  if (payload.app !== "zamzam-traders") throw new Error("Not a Zam Zam Traders backup file.");
  const d = db();
  await d.transaction(
    "rw",
    [d.customers, d.invoices, d.payments, d.activity, d.settings, d.imports],
    async () => {
      if (opts.wipe) {
        await Promise.all([
          d.customers.clear(), d.invoices.clear(), d.payments.clear(),
          d.activity.clear(), d.imports.clear(),
        ]);
      }
      if (payload.customers?.length) await d.customers.bulkPut(payload.customers as any);
      if (payload.invoices?.length) await d.invoices.bulkPut(payload.invoices as any);
      if (payload.payments?.length) await d.payments.bulkAdd(payload.payments as any);
      if (payload.activity?.length) await d.activity.bulkAdd(payload.activity as any);
      if (payload.settings?.length) await d.settings.bulkPut(payload.settings as any);
      if (payload.imports?.length) await d.imports.bulkAdd(payload.imports as any);
    },
  );
  await logActivity("backup.restore", `Restored backup (wipe=${opts.wipe})`);
}
