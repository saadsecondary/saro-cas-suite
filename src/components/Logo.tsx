import logoAsset from "@/assets/zamzam-logo-trust.png.asset.json";
import { cls } from "@/lib/format";

export function Logo({ className, withWordmark = false }: { className?: string; withWordmark?: boolean }) {
  return (
    <div className={cls("flex items-center gap-2 min-w-0", className)}>
      <img
        src={logoAsset.url}
        alt="Zam Zam Traders"
        className="h-9 w-9 shrink-0 object-contain bg-white rounded-md p-1 ring-1 ring-black/10"
      />
      {withWordmark && (
        <div className="leading-tight min-w-0">
          <div className="text-[13px] font-semibold tracking-tight truncate">Zam Zam Traders</div>
          <div className="text-[10px] uppercase tracking-[0.16em] opacity-60 truncate">name of Trust</div>
        </div>
      )}
    </div>
  );
}
