import { type ReactNode } from "react";

export function PageHeader({
  title, subtitle, actions, eyebrow,
}: { title: string; subtitle?: string; actions?: ReactNode; eyebrow?: string }) {
  return (
    <div className="flex flex-col gap-3 pb-4 mb-4 border-b border-border no-print sm:flex-row sm:items-end sm:justify-between sm:gap-4">
      <div className="min-w-0">
        {eyebrow && <div className="label-eyebrow mb-1">{eyebrow}</div>}
        <h1 className="text-[20px] sm:text-[22px] font-semibold tracking-tight truncate">{title}</h1>
        {subtitle && <p className="text-[12.5px] text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
