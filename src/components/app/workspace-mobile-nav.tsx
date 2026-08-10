import { Link } from "@tanstack/react-router";
import { MoreHorizontal, X } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useAuth, ROLE_LABELS } from "@/hooks/use-auth";
import { visibleGroups, isNavActive, MOBILE_PRIMARY, type NavItem } from "./nav";

/**
 * تنقل الجوال: شريط سفلي للمقاصد اليومية + ورقة سفلية «المزيد» لباقي المسارات.
 * لا نضغط قائمة سطح المكتب داخل الجوال.
 */
export function WorkspaceMobileNav({ pathname }: { pathname: string }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const { activeRole, memberships, activeOrgId, user } = useAuth();
  const groups = visibleGroups(activeRole);
  const all: NavItem[] = groups.flatMap((g) => g.items);
  const primary = MOBILE_PRIMARY.map((to) => all.find((i) => i.to === to)).filter(
    (i): i is NavItem => !!i,
  );
  const secondaryGroups = groups
    .map((g) => ({ ...g, items: g.items.filter((i) => !MOBILE_PRIMARY.includes(i.to)) }))
    .filter((g) => g.items.length > 0);
  const activeOrg = memberships.find((m) => m.organization_id === activeOrgId);
  const moreActive = !primary.some((i) => isNavActive(pathname, i.to));

  return (
    <>
      <nav
        aria-label="التنقل السريع"
        className="workspace-safe-bottom fixed inset-x-0 bottom-0 z-[var(--z-sidebar)] border-t border-nav-border bg-nav lg:hidden"
      >
        <ul className="grid grid-cols-5">
          {primary.map(({ to, label, Icon }) => {
            const active = isNavActive(pathname, to);
            return (
              <li key={to}>
                <Link
                  to={to}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-[56px] flex-col items-center justify-center gap-1 px-1 pt-1.5 text-[10.5px] transition-colors",
                    active ? "text-nav-accent" : "text-nav-muted",
                  )}
                >
                  <Icon className="h-5 w-5" aria-hidden />
                  <span className="truncate">{label}</span>
                </Link>
              </li>
            );
          })}
          <li>
            <button
              onClick={() => setMoreOpen(true)}
              aria-expanded={moreOpen}
              className={cn(
                "flex min-h-[56px] w-full flex-col items-center justify-center gap-1 px-1 pt-1.5 text-[10.5px] transition-colors",
                moreActive ? "text-nav-accent" : "text-nav-muted",
              )}
            >
              <MoreHorizontal className="h-5 w-5" aria-hidden />
              <span>المزيد</span>
            </button>
          </li>
        </ul>
      </nav>

      {moreOpen && (
        <div className="lg:hidden">
          <div
            className="fixed inset-0 z-[var(--z-overlay)] bg-foreground/45"
            onClick={() => setMoreOpen(false)}
          />
          <div
            role="dialog"
            aria-label="قائمة التنقل"
            className="workspace-safe-bottom fixed inset-x-0 bottom-0 z-[var(--z-modal)] max-h-[82dvh] overflow-y-auto rounded-t-[var(--radius-xl2)] bg-surface pb-2"
          >
            <div className="sticky top-0 flex items-center justify-between gap-3 border-b border-border bg-surface px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-[14px] font-semibold">
                  {activeOrg?.organization?.name ?? "مِهلة"}
                </p>
                <p className="truncate text-[11.5px] text-muted-foreground">
                  {activeRole ? ROLE_LABELS[activeRole] : (user?.email ?? "")}
                </p>
              </div>
              <button
                onClick={() => setMoreOpen(false)}
                aria-label="إغلاق"
                className="-m-2 rounded-[var(--radius-s)] p-2 text-muted-foreground hover:bg-surface-muted"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
            <div className="px-3 py-3">
              {secondaryGroups.map((group) => (
                <div key={group.label} className="mb-4 last:mb-0">
                  <p className="px-2 pb-1.5 text-[11px] font-semibold text-text-muted">
                    {group.label}
                  </p>
                  <ul className="grid grid-cols-2 gap-2">
                    {group.items.map(({ to, label, Icon }) => (
                      <li key={to}>
                        <Link
                          to={to}
                          onClick={() => setMoreOpen(false)}
                          aria-current={isNavActive(pathname, to) ? "page" : undefined}
                          className={cn(
                            "flex min-h-[52px] items-center gap-2.5 rounded-[var(--radius-m)] border border-border px-3 text-[13px]",
                            isNavActive(pathname, to)
                              ? "border-primary/30 bg-primary-soft font-semibold text-primary"
                              : "bg-surface text-foreground",
                          )}
                        >
                          <Icon
                            className="h-[18px] w-[18px] shrink-0 text-muted-foreground"
                            aria-hidden
                          />
                          <span className="truncate">{label}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
