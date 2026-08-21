import { Link } from "@tanstack/react-router";
import { ChevronDown, LogOut, X } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useAuth, ROLE_LABELS } from "@/hooks/use-auth";
import { visibleGroups, isNavActive } from "./nav";
import { MehlaLogo } from "@/components/brand/mehla-logo";

/**
 * القائمة الجانبية لمساحة عمل المكتب — سطح داكن مؤسسي على يمين الشاشة.
 * الإظهار حسب الدور تحسين تجربة فقط؛ التصريح يبقى على الخادم.
 */
export function WorkspaceSidebar({
  pathname,
  mini = false,
  onNavigate,
  onClose,
  onSignOut,
}: {
  pathname: string;
  mini?: boolean;
  onNavigate?: () => void;
  onClose?: () => void;
  onSignOut: () => void;
}) {
  const { memberships, activeOrgId, setActiveOrgId, activeRole, user } = useAuth();
  const [orgOpen, setOrgOpen] = useState(false);
  const active = memberships.find((m) => m.organization_id === activeOrgId);
  const groups = visibleGroups(activeRole);

  return (
    <div className="flex h-full flex-col bg-nav text-nav-foreground select-none">
      {/* Brand Logo & Header */}
      <div className="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-nav-border/80 px-4 bg-nav/95">
        <Link
          to="/dashboard"
          onClick={onNavigate}
          className="inline-flex min-h-10 min-w-0 items-center gap-2.5 truncate text-sm font-bold tracking-tight text-nav-foreground group"
        >
          {mini ? (
            <MehlaLogo size="xs" className="mx-auto text-white" />
          ) : (
            <div className="flex flex-col gap-1">
              <MehlaLogo size="sm" className="text-white" />
              <span className="text-[10px] font-medium text-nav-muted">المنصة القانونية الذكية</span>
            </div>
          )}
        </Link>
        {onClose && (
          <button
            className="-m-2 rounded-lg p-2 text-nav-muted hover:bg-nav-elevated hover:text-nav-foreground transition"
            onClick={onClose}
            aria-label="إغلاق القائمة"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>

      {/* Organization Switcher */}
      {!mini && (
        <div className="border-b border-nav-border/60 p-3">
          <button
            onClick={() => setOrgOpen((v) => !v)}
            aria-expanded={orgOpen}
            disabled={memberships.length < 2}
            className="flex w-full items-center justify-between gap-2 rounded-xl border border-nav-border/80 bg-nav-elevated/70 px-3 py-2 text-right transition hover:border-nav-accent/40 hover:bg-nav-elevated disabled:cursor-default"
          >
            <span className="min-w-0">
              <span className="block truncate text-xs font-bold text-nav-foreground">
                {active?.organization?.name ?? "—"}
              </span>
              <span className="block text-[10px] text-nav-accent font-medium mt-0.5">
                {activeRole ? ROLE_LABELS[activeRole] : ""}
              </span>
            </span>
            {memberships.length > 1 && (
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 shrink-0 text-nav-muted transition duration-200",
                  orgOpen && "rotate-180",
                )}
                aria-hidden
              />
            )}
          </button>
          {orgOpen && memberships.length > 1 && (
            <ul className="mt-1.5 space-y-0.5 rounded-xl border border-nav-border/80 bg-nav-elevated p-1 shadow-lg">
              {memberships.map((m) => (
                <li key={m.organization_id}>
                  <button
                    onClick={() => {
                      setActiveOrgId(m.organization_id);
                      setOrgOpen(false);
                    }}
                    className={cn(
                      "block w-full rounded-lg px-2.5 py-1.5 text-right text-xs text-nav-muted transition hover:bg-white/10 hover:text-nav-foreground",
                      m.organization_id === activeOrgId &&
                        "bg-white/15 font-bold text-white",
                    )}
                  >
                    {m.organization?.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Navigation Groups */}
      <nav className="flex-1 overflow-y-auto px-2.5 py-3" aria-label="التنقل الرئيسي">
        {groups.map((group) => (
          <div key={group.label} className="mb-4 last:mb-0">
            {!mini && (
              <p className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-nav-muted/80">
                {group.label}
              </p>
            )}
            <ul className="space-y-0.5">
              {group.items.map(({ to, label, Icon }) => {
                const activeItem = isNavActive(pathname, to);
                const isBayan = to === "/bayan";
                return (
                  <li key={to}>
                    <Link
                      to={to}
                      onClick={onNavigate}
                      title={mini ? label : undefined}
                      aria-current={activeItem ? "page" : undefined}
                      className={cn(
                        "relative flex min-h-10 items-center gap-2.5 rounded-xl px-3 text-xs transition duration-150 ease-out active:scale-[0.98]",
                        mini && "justify-center px-0",
                        isBayan && !activeItem && "text-amber-300 hover:bg-amber-500/15 hover:text-amber-200 font-semibold",
                        activeItem
                          ? "bg-nav-active font-bold text-white shadow-xs"
                          : "text-nav-muted hover:bg-nav-elevated hover:text-nav-foreground",
                      )}
                    >
                      {activeItem && (
                        <span
                          className="absolute inset-y-1.5 right-0 w-1 rounded-full bg-nav-accent shadow-sm"
                          aria-hidden
                        />
                      )}
                      <Icon
                        className={cn(
                          "h-4 w-4 shrink-0 transition",
                          isBayan ? "text-amber-400" : activeItem ? "text-nav-accent" : "text-nav-muted group-hover:text-white"
                        )}
                        aria-hidden
                      />
                      {!mini && <span className="truncate">{label}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer User & Logout */}
      <div className="shrink-0 border-t border-nav-border/60 p-2.5 bg-nav/95">
        {!mini && <p className="mb-1 truncate px-2 text-[10px] text-nav-muted">{user?.email}</p>}
        <button
          onClick={onSignOut}
          title={mini ? "تسجيل الخروج" : undefined}
          className={cn(
            "flex min-h-9 w-full items-center gap-2.5 rounded-xl px-2.5 text-xs text-nav-muted transition hover:bg-rose-500/20 hover:text-rose-300",
            mini && "justify-center px-0",
          )}
        >
          <LogOut className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {!mini && "تسجيل الخروج"}
        </button>
      </div>
    </div>
  );
}
