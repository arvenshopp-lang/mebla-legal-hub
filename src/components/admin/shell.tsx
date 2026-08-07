import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronDown, LogOut, Menu, Search, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { usePlatformAdmin } from "@/hooks/use-platform-admin";
import { ImpersonationBanner } from "@/components/admin/impersonation-banner";
import { CommandPalette, useCommandPalette } from "@/components/admin/command-palette";
import {
  ADMIN_NAV,
  isNavPathActive,
  resolveNavMatch,
  resolveTabLabel,
  type AdminNavGroup,
} from "@/lib/admin-nav";
import { SectionTabs } from "@/components/admin/section-tabs";

const COLLAPSED_STORAGE_PREFIX = "mehla-admin-nav-collapsed";

/** مفتاح تخزين خاص بكل موظف: لا تنتقل تفضيلات الطيّ بين المستخدمين على جهاز واحد. */
function collapsedKey(staffId?: string | null): string {
  return staffId ? `${COLLAPSED_STORAGE_PREFIX}:${staffId}` : COLLAPSED_STORAGE_PREFIX;
}

function readCollapsed(key: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

export function AdminShell({
  children,
  title,
  description,
  actions,
  breadcrumb,
}: {
  children: ReactNode;
  title: string;
  description?: string;
  actions?: ReactNode;
  /** مستوى ثالث اختياري في مسار التنقل (رقم مستند أو تذكرة أو فاتورة). */
  breadcrumb?: string;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { staff, can } = usePlatformAdmin();
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const palette = useCommandPalette();
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const mobilePanelRef = useRef<HTMLElement>(null);

  const storageKey = collapsedKey(staff?.id);
  useEffect(() => setCollapsed(readCollapsed(storageKey)), [storageKey]);

  const match = useMemo(() => resolveNavMatch(pathname), [pathname]);
  const tabLabel = useMemo(() => resolveTabLabel(pathname), [pathname]);
  const tabs = useMemo(
    () => (match?.item.tabs ?? []).filter((t) => !t.permission || can(t.permission)),
    [match, can],
  );
  const activeTab = useMemo(
    () =>
      [...tabs]
        .sort((a, b) => b.to.length - a.to.length)
        .find((t) => isNavPathActive(pathname, t.to))?.to ?? "",
    [tabs, pathname],
  );

  const visibleGroups = useMemo<AdminNavGroup[]>(
    () =>
      ADMIN_NAV.map((group) => ({
        ...group,
        items: group.items.filter((item) => !item.permission || can(item.permission)),
      })).filter((group) => group.items.length > 0),
    [can],
  );

  const toggleGroup = useCallback(
    (id: string) => {
      setCollapsed((prev) => {
        const next = prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id];
        try {
          window.localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {
          /* التخزين المحلي قد يكون معطلاً — الطيّ يبقى فعّالاً في الجلسة الحالية. */
        }
        return next;
      });
    },
    [storageKey],
  );

  const closeMobile = useCallback(() => {
    setMobileOpen(false);
    menuButtonRef.current?.focus();
  }, []);

  // إغلاق قائمة الجوال بـ Esc وحصر التركيز داخل اللوحة.
  useEffect(() => {
    if (!mobileOpen) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMobile();
        return;
      }
      if (event.key !== "Tab") return;
      const panel = mobilePanelRef.current;
      if (!panel) return;
      const focusables = panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    const timer = window.setTimeout(
      () => mobilePanelRef.current?.querySelector<HTMLElement>("a[href]")?.focus(),
      30,
    );
    return () => {
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(timer);
    };
  }, [mobileOpen, closeMobile]);

  const onSignOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/login", search: { redirect: "/mehla-admin" }, replace: true } as never);
  };

  const Sidebar = (
    <>
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-border px-4">
        <Link to="/mehla-admin" className="min-w-0 truncate">
          <span className="block text-[15px] font-bold tracking-tight">مِهلة · الإدارة</span>
          <span className="block text-[11px] text-muted-foreground">Platform Control</span>
        </Link>
        <button
          className="-m-2 grid h-11 w-11 place-items-center rounded-[var(--radius-s)] text-muted-foreground hover:bg-surface-muted lg:hidden"
          onClick={closeMobile}
          aria-label="إغلاق القائمة"
        >
          <X className="h-5 w-5" aria-hidden />
        </button>
      </div>

      <nav
        className="flex-1 overflow-y-auto px-3 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
        aria-label="تنقل لوحة الإدارة"
      >
        {visibleGroups.map((group) => {
          const hasActive = group.items.some((item) => item.to === match?.item.to);
          const isOpen = hasActive || !collapsed.includes(group.id);
          return (
            <div key={group.id} className="mb-3 last:mb-0">
              <button
                type="button"
                onClick={() => toggleGroup(group.id)}
                aria-expanded={isOpen}
                aria-controls={`admin-nav-${group.id}`}
                className="flex min-h-11 w-full items-center justify-between rounded-[var(--radius-m)] px-3 text-[11px] font-semibold tracking-wide text-text-muted transition hover:bg-surface-muted"
              >
                <span className="truncate">{group.label}</span>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 shrink-0 transition-transform motion-reduce:transition-none",
                    isOpen ? "" : "-rotate-90",
                  )}
                  aria-hidden
                />
              </button>
              <ul id={`admin-nav-${group.id}`} hidden={!isOpen} className="space-y-0.5 pt-1">
                {group.items.map(({ to, label, Icon }) => (
                  <li key={to}>
                    <Link
                      to={to}
                      onClick={() => setMobileOpen(false)}
                      aria-current={
                        (match ? match.item.to === to : isNavPathActive(pathname, to))
                          ? "page"
                          : undefined
                      }
                      className={cn(
                        "flex min-h-11 items-center gap-2.5 rounded-[var(--radius-m)] px-3 py-2.5 text-[13px] font-medium transition",
                        (match ? match.item.to === to : isNavPathActive(pathname, to))
                          ? "bg-primary text-primary-foreground"
                          : "text-foreground hover:bg-surface-muted",
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" aria-hidden />
                      <span className="truncate">{label}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </nav>

      <div className="shrink-0 border-t border-border p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mb-2 px-2">
          <p className="truncate text-[13px] font-semibold">{staff?.full_name}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {staff?.role === "super_admin" ? "مالك المنصة" : (staff?.job_title ?? "موظف تشغيل")}
          </p>
        </div>
        <button
          onClick={onSignOut}
          className="flex min-h-11 w-full items-center gap-2 rounded-[var(--radius-m)] px-3 py-2.5 text-[13px] font-medium text-danger transition hover:bg-danger-soft"
        >
          <LogOut className="h-4 w-4" aria-hidden />
          تسجيل الخروج
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-dvh bg-surface-muted" dir="rtl">
      <ImpersonationBanner />
      <aside className="fixed inset-y-0 right-0 hidden w-64 flex-col border-l border-border bg-surface lg:flex">
        {Sidebar}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-[var(--z-modal)] lg:hidden">
          <div className="absolute inset-0 bg-foreground/40" onClick={closeMobile} />
          <aside
            ref={mobilePanelRef}
            role="dialog"
            aria-modal="true"
            aria-label="قائمة لوحة الإدارة"
            className="absolute inset-y-0 right-0 flex w-72 max-w-[85vw] flex-col bg-surface pt-[env(safe-area-inset-top)]"
          >
            {Sidebar}
          </aside>
        </div>
      )}

      <div className="lg:mr-64">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-surface/90 px-4 backdrop-blur lg:px-8">
          <button
            ref={menuButtonRef}
            className="-ms-2 grid h-11 w-11 shrink-0 place-items-center rounded-[var(--radius-s)] text-muted-foreground hover:bg-surface-muted lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-expanded={mobileOpen}
            aria-label="فتح القائمة"
          >
            <Menu className="h-5 w-5" aria-hidden />
          </button>
          <span className="truncate text-sm font-semibold">لوحة إدارة منصة مِهلة</span>
          <button
            onClick={() => palette.setOpen(true)}
            aria-label="البحث العالمي (Ctrl أو ⌘ ثم K)"
            className="ms-auto flex h-11 min-w-11 shrink-0 items-center gap-2 rounded-[var(--radius-m)] border border-border px-3 text-[12.5px] text-muted-foreground transition hover:bg-surface-muted"
          >
            <Search className="h-4 w-4 shrink-0" aria-hidden />
            <span className="hidden sm:inline">بحث شامل</span>
            <kbd className="hidden rounded border border-border px-1.5 py-0.5 text-[10px] font-semibold md:inline">
              ⌘K
            </kbd>
          </button>
          <span className="hidden rounded-full bg-success-soft px-2.5 py-0.5 text-[11px] font-semibold text-success xl:inline">
            بيانات العملاء القانونية غير متاحة لهذه اللوحة
          </span>
        </header>

        <main className="mx-auto max-w-[1200px] px-4 py-6 lg:px-8 lg:py-8">
          <nav
            aria-label="مسار التنقل"
            className="mb-3 flex flex-wrap items-center gap-1.5 text-[12px] text-muted-foreground"
          >
            <Link
              to="/mehla-admin"
              className="rounded-[var(--radius-s)] px-1 py-0.5 hover:text-foreground"
            >
              لوحة الإدارة
            </Link>
            {match && (
              <>
                <span aria-hidden>/</span>
                <span className="text-muted-foreground">{match.group.label}</span>
                <span aria-hidden>/</span>
                {breadcrumb || tabLabel ? (
                  <Link
                    to={match.item.to}
                    className="rounded-[var(--radius-s)] px-1 py-0.5 hover:text-foreground"
                  >
                    {match.item.label}
                  </Link>
                ) : (
                  <span className="font-medium text-foreground">{match.item.label}</span>
                )}
                {tabLabel && (
                  <>
                    <span aria-hidden>/</span>
                    <span className={cn(breadcrumb ? "" : "font-medium text-foreground")}>
                      {tabLabel}
                    </span>
                  </>
                )}
                {breadcrumb && (
                  <>
                    <span aria-hidden>/</span>
                    <span className="min-w-0 font-medium text-foreground [overflow-wrap:anywhere]">
                      {breadcrumb}
                    </span>
                  </>
                )}
              </>
            )}
          </nav>
          {tabs.length > 1 && (
            <SectionTabs tabs={tabs} activeTo={activeTab} label={match?.item.label} />
          )}
          {/* الجوال: العنوان والوصف في صف كامل، والإجراءات في صف مستقل يلتف. */}
          <div className="mb-6 flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <div className="min-w-0">
              <h1 className="text-h3 [overflow-wrap:anywhere] sm:truncate">{title}</h1>
              {description && (
                <p className="mt-1 text-body-sm [overflow-wrap:anywhere] text-muted-foreground">
                  {description}
                </p>
              )}
            </div>
            {actions && (
              <div className="flex min-w-0 flex-wrap items-center gap-2 sm:shrink-0 sm:flex-nowrap">
                {actions}
              </div>
            )}
          </div>
          {children}
        </main>
      </div>
      <CommandPalette open={palette.open} onClose={() => palette.setOpen(false)} />
    </div>
  );
}
