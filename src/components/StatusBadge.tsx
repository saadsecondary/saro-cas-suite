import { cls } from "@/lib/format";

export function StatusBadge({ status }: { status: "cleared" | "partial" | "pending" }) {
  const map = {
    cleared:  { label: "Cleared",  cn: "bg-[oklch(0.95_0.04_150)] text-success border-success/30" },
    partial:  { label: "Partial",  cn: "bg-[oklch(0.97_0.05_70)] text-[oklch(0.45_0.12_50)] border-warning/40" },
    pending:  { label: "Pending",  cn: "bg-[oklch(0.96_0.02_28)] text-accent border-accent/30" },
  }[status];
  return (
    <span className={cls("inline-flex items-center gap-1 rounded-full border px-2 py-[1px] text-[10.5px] font-medium uppercase tracking-[0.06em]", map.cn)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {map.label}
    </span>
  );
}
