import { db, isBrowser } from "./db";

export async function logActivity(kind: string, summary: string, entity?: string, meta?: Record<string, unknown>) {
  if (!isBrowser()) return;
  try {
    await db().activity.add({ at: Date.now(), kind, entity, summary, meta });
  } catch {
    /* ignore */
  }
}
