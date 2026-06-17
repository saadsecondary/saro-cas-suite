import { money } from "@/lib/format";
import { cls } from "@/lib/format";

export function StatCard({
  label, value, hint, tone = "default", money: isMoney = false,
}: {
  label: string; value: number | string; hint?: string;
  tone?: "default" | "accent" | "success" | "warning" | "destructive";
  money?: boolean;
}) {
  const toneClass = {
    default: "text-foreground",
    accent: "text-accent",
    success: "text-success",
    warning: "text-warning",
    destructive: "text-destructive",
  }[tone];
  return (
    <div className="panel p-4">
      <div className="label-eyebrow">{label}</div>
      <div className={cls("mt-1.5 text-[22px] font-semibold tracking-tight num", toneClass)}>
        {typeof value === "number" ? (isMoney ? money(value) : value.toLocaleString("en-PK")) : value}
      </div>
      {hint && <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}
