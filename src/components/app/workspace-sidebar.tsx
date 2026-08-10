import { Link } from "@tanstack/react-router";
import { ChevronDown, LogOut, X } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useAuth, ROLE_LABELS } from "@/hooks/use-auth";
import { visibleGroups, isNavActive } from "./nav";

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
    <div className="flex h-full flex-col bg-nav text-nav-foreground">
      <div className="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-nav-border px-4">
        <Link
          to="/dashboard"
          onClick={onNavigate}
          className="inline-flex min-h-11 min-w-0 items-center gap-2 truncate text-[15px] font-bold tracking-tight text-nav-foreground"
        >
          <span
            className="grid h-8 w-8 shrink-0 place-items-center rounded-[var(--radius-m)] border border-nav-accent/40 text-[13px] font-bold text-nav-accent"
            aria-hidden
          >
            م
          </span>
          {!mini && <span className="truncate">مِهلة · MEHLA</span>}
        </Link>
        {onClose && (
          <button
            className="-m-2 rounded-[var(--radius-s)] p-2 text-nav-muted hover:bg-nav-elevated hover:text-nav-foreground"
            onClick={onClose}
            aria-label="إغلاق القائمة"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        )}
      </div>

      {!mini && (
        <div className="border-b border-nav-border p-3">
          <button
            onClick={() => setOrgOpen((v) => !v)}
            aria-expanded={orgOpen}
            disabled={memberships.length < 2}
            className="flex w-full items-center justify-between gap-2 rounded-[var(--radius-m)] border border-nav-border bg-nav-elevated px-3 py-2.5 text-right transition hover:border-nav-accent/40 disabled:cursor-default"
          >
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-semibold text-nav-foreground">
                {active?.organization?.name ?? "—"}
              </span>
              <span className="block text-[11px] text-nav-muted">
                {activeRole ? ROLE_LABELS[activeRole] : ""}
              </span>
            </span>
            {memberships.length > 1 && (
              <ChevronDown
                className={cn("h-4 w-4 shrink-0 text-nav-muted transition", orgOpen && "rotate-180")}
                aria-hidden
              />
            )}
          </button>
          {orgOpen && memberships.length > 1 && (
            <ul className="mt-1.5 space-y-0.5">
              {memberships.map((m) => (
                <li key={m.organization_id}>
                  <button
                    onClick={() => {
                      setActiveOrgId(m.organization_id);
                      setOrgOpen(false);
                    }}
                    className={cn(
                      "block w-full rounded-[var(--radius-s)] px-3 py-2 text-right text-[13px] text-nav-muted hover:bg-nav-elevated hover:text-nav-foreground",
                      m.organization_id === activeOrgId &&
                        "bg-nav-elevated font-semibold text-nav-foreground",
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

      <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="التنقل الرئيسي">
        {groups.map((group) => (
          <div key={group.label} className="mb-5 last:mb-0">
            {!mini && (
              <p className="px-3 pb-2 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-nav-muted">
                {group.label}
              </p>
            )}
            <ul className="space-y-0.5">
              {group.items.map(({ to, label, Icon }) => {
                const activeItem = isNavActive(pathname, to);
                return (
                  <li key={to}>
                    <Link
                      to={to}
                      onClick={onNavigate}
                      title={mini ? label : undefined}
                      aria-current={activeItem ? "page" : undefined}
                      className={cn(
                        "relative flex min-h-11 items-center gap-3 rounded-[var(--radius-m)] px-3 text-[13.5px] transition-colors duration-[var(--duration-fast)]",
                        mini && "justify-center px-0",
                        activeItem
                          ? "bg-nav-active font-semibold text-nav-foreground"
                          : "text-nav-muted hover:bg-nav-elevated hover:text-nav-foreground",
                      )}
                    >
                      {activeItem && (
                        <span
                          className="absolute inset-y-2 right-0 w-[3px] rounded-full bg-nav-accent"
                          aria-hidden
                        />
                      )}
                      <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
                      {!mini && <span className="truncate">{label}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="shrink-0 border-t border-nav-border p-3">
        {!mini && (
          <p className="mb-1.5 truncate px-3 text-[11px] text-nav-muted">{user?.email}</p>
        )}
        <button
          onClick={onSignOut}
          title={mini ? "تسجيل الخروج" : undefined}
          className={cn(
            "flex min-h-11 w-full items-center gap-3 rounded-[var(--radius-m)] px-3 text-[13.5px] text-nav-muted transition hover:bg-nav-elevated hover:text-nav-foreground",
            mini && "justify-center px-0",
          )}
        >
          <LogOut className="h-[18px] w-[18px] shrink-0" aria-hidden />
          {!mini && "تسجيل الخروج"}
        </button>
      </div>
    </div>
  );
}