import { Link, useRouterState } from "@tanstack/react-router";
import { Logo } from "./Logo";
import { cls } from "@/lib/format";
import {
  LayoutDashboard, Users, FileText, Receipt, Wallet, BookOpen,
  BarChart3, Upload, History, DatabaseBackup, Settings as SettingsIcon,
  Search, Menu, X,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { CommandPalette } from "./CommandPalette";

const NAV: Array<{ to: string; label: string; icon: any; group?: string }> = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, group: "Operations" },
  { to: "/customers", label: "Customers", icon: Users, group: "Operations" },
  { to: "/invoices", label: "Invoices", icon: FileText, group: "Operations" },
  { to: "/payments", label: "Payments", icon: Wallet, group: "Operations" },
  { to: "/outstanding", label: "Outstanding", icon: Receipt, group: "Operations" },
  { to: "/ledger", label: "Ledger", icon: BookOpen, group: "Accounting" },
  { to: "/reports", label: "Reports", icon: BarChart3, group: "Accounting" },
  { to: "/import", label: "Import Center", icon: Upload, group: "System" },
  { to: "/activity", label: "Activity Log", icon: History, group: "System" },
  { to: "/backup", label: "Backup", icon: DatabaseBackup, group: "System" },
  { to: "/settings", label: "Settings", icon: SettingsIcon, group: "System" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: s => s.location.pathname });
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Close mobile nav on route change
  useEffect(() => { setNavOpen(false); }, [path]);

  const groups = Array.from(new Set(NAV.map(n => n.group ?? "")));

  const sidebarContent = (
    <>
      <nav className="px-2 py-3 space-y-3">
        {groups.map(g => (
          <div key={g}>
            {g && <div className="px-2 pb-1 text-[10px] uppercase tracking-[0.14em] text-sidebar-muted">{g}</div>}
            <div className="space-y-0.5">
              {NAV.filter(n => (n.group ?? "") === g).map(item => {
                const Active = path === item.to || (item.to !== "/" && path.startsWith(item.to + "/")) || (item.to !== "/" && path.startsWith(item.to));
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={() => setNavOpen(false)}
                    className={cls(
                      "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] transition-colors",
                      Active
                        ? "bg-[color-mix(in_oklab,var(--color-sidebar-accent)_22%,transparent)] text-white"
                        : "text-sidebar-foreground/85 hover:bg-white/[0.05]",
                    )}
                  >
                    <item.icon className="h-4 w-4 opacity-90 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="px-4 py-3 text-[10px] text-sidebar-muted border-t border-sidebar-border mt-2 leading-relaxed">
        <div>Zam Zam Traders &middot; v1.0</div>
        <div className="opacity-80 mt-0.5">Made by Saad Waqas</div>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-background text-foreground lg:grid lg:h-screen lg:grid-cols-[232px_1fr] lg:grid-rows-[52px_1fr]">
      {/* Top bar */}
      <header className="lg:col-span-2 lg:row-start-1 lg:row-end-2 sticky top-0 z-30 flex items-center gap-2 sm:gap-4 border-b border-border bg-sidebar text-sidebar-foreground no-print px-3 h-[52px]">
        <button
          type="button"
          onClick={() => setNavOpen(true)}
          aria-label="Open navigation"
          className="lg:hidden inline-flex h-9 w-9 items-center justify-center rounded-md text-sidebar-foreground hover:bg-white/[0.08]"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-3 lg:w-[208px] shrink-0 min-w-0">
          <Logo withWordmark />
        </div>
        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className="flex flex-1 max-w-[560px] items-center gap-2 rounded-md border border-white/15 bg-white/[0.06] px-2 sm:px-3 py-1.5 text-[12px] sm:text-[12.5px] text-sidebar-foreground/70 hover:bg-white/[0.10] hover:text-white transition-colors min-w-0"
        >
          <Search className="h-4 w-4 shrink-0" />
          <span className="flex-1 text-left truncate">
            <span className="hidden sm:inline">Search customers, invoices, payments, outstanding, ledger...</span>
            <span className="sm:hidden">Search...</span>
          </span>
          <span className="kbd hidden sm:inline-block !bg-white/10 !border-white/20 !text-sidebar-foreground/80">Ctrl K</span>
        </button>
        <div className="ml-auto" />
      </header>

      {/* Sidebar - desktop */}
      <aside className="hidden lg:block row-start-2 row-end-3 overflow-y-auto bg-sidebar text-sidebar-foreground no-print">
        {sidebarContent}
      </aside>

      {/* Sidebar - mobile drawer */}
      {navOpen && (
        <div className="fixed inset-0 z-40 lg:hidden no-print" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/55" onClick={() => setNavOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-[260px] max-w-[80vw] bg-sidebar text-sidebar-foreground overflow-y-auto shadow-floating">
            <div className="flex items-center justify-between px-3 py-3 border-b border-sidebar-border">
              <Logo withWordmark />
              <button
                type="button"
                onClick={() => setNavOpen(false)}
                aria-label="Close navigation"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-white/[0.08]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {sidebarContent}
          </div>
        </div>
      )}

      {/* Main */}
      <main className="lg:row-start-2 lg:row-end-3 lg:overflow-auto">
        <div className="mx-auto max-w-[1400px] px-3 sm:px-5 lg:px-6 py-4 sm:py-5">
          {children}
        </div>
      </main>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}
