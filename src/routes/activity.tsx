import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/PageHeader";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { fmtDateTime } from "@/lib/format";
import { useState, useMemo } from "react";
import { downloadCSV } from "@/lib/export";

export const Route = createFileRoute("/activity")({
  head: () => ({ meta: [{ title: "Activity Log - Zam Zam Traders" }] }),
  component: ActivityPage,
});

function ActivityPage() {
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("");
  const items = useLiveQuery(() => db().activity.orderBy("at").reverse().limit(2000).toArray()) ?? [];
  const kinds = useMemo(() => Array.from(new Set(items.map(i => i.kind))).sort(), [items]);
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return items.filter(i => (!kind || i.kind === kind) && (!t || i.summary.toLowerCase().includes(t) || i.kind.toLowerCase().includes(t) || (i.entity ?? "").toLowerCase().includes(t)));
  }, [items, q, kind]);

  return (
    <div>
      <PageHeader
        eyebrow="System" title="Activity Log" subtitle={`${rows.length.toLocaleString()} entries`}
        actions={<button onClick={() => downloadCSV("activity.csv", rows.map(r => ({ At: new Date(r.at).toISOString(), Kind: r.kind, Entity: r.entity ?? "", Summary: r.summary })))} className="btn btn-secondary">CSV</button>}
      />
      <div className="panel p-3 mb-3 grid grid-cols-4 gap-2">
        <input className="input-base col-span-2" placeholder="Search..." value={q} onChange={e => setQ(e.target.value)} />
        <select className="input-base" value={kind} onChange={e => setKind(e.target.value)}>
          <option value="">All kinds</option>{kinds.map(k => <option key={k} value={k}>{k}</option>)}
        </select>
      </div>
      <div className="panel overflow-hidden">
        <table className="data-table">
          <thead><tr><th>When</th><th>Kind</th><th>Entity</th><th>Summary</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={4} className="text-center py-10 text-muted-foreground">No activity.</td></tr>}
            {rows.map(r => (
              <tr key={r.id}>
                <td className="num text-muted-foreground">{fmtDateTime(r.at)}</td>
                <td><span className="mono text-[11px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{r.kind}</span></td>
                <td className="mono text-[11px] text-muted-foreground">{r.entity ?? "-"}</td>
                <td>{r.summary}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
