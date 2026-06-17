export function money(n: number | undefined | null, opts: { compact?: boolean } = {}): string {
  if (n === undefined || n === null || Number.isNaN(n)) return "-";
  const abs = Math.abs(n);
  if (opts.compact && abs >= 100000) {
    if (abs >= 10000000) return (n / 10000000).toFixed(2) + " Cr";
    if (abs >= 100000) return (n / 100000).toFixed(2) + " Lac";
  }
  return n.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function num(n: number | undefined | null): string {
  if (n === undefined || n === null || Number.isNaN(n)) return "-";
  return n.toLocaleString("en-PK");
}

export function fmtDate(iso?: string): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function fmtDateTime(ts?: number): string {
  if (!ts) return "-";
  const d = new Date(ts);
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function parseDMY(s: string): string | null {
  // accepts "13/06/2026", "13/ 06/ 2026", "13-06-2026"
  const m = s.replace(/\s+/g, "").match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (!m) return null;
  let [_, d, mo, y] = m;
  if (y.length === 2) y = "20" + y;
  const dd = d.padStart(2, "0");
  const mm = mo.padStart(2, "0");
  return `${y}-${mm}-${dd}`;
}

export function todayISO(): string {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

export function cls(...xs: (string | false | undefined | null)[]): string {
  return xs.filter(Boolean).join(" ");
}
