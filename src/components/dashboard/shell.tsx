import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Briefcase,
  Users,
  Gavel,
  Clock,
  ListChecks,
  FileText,
  Settings,
  LogOut,
  ChevronDown,
  UsersRound,
  Menu,
  X,
  PanelRightClose,
  PanelRightOpen,
  CreditCard,
  FileSearch,
  Printer,
  LifeBuoy,
  Globe,
  BarChart3,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useAuth, ROLE_LABELS, type AppRole } from "@/hooks/use-auth";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useSubscription } from "@/hooks/use-subscription";
import { SubscriptionAlert } from "@/components/subscription/subscription-ui";
import { PrintGuard } from "@/components/print/print-guard";
import { NotificationBell } from "@/components/notifications/notification-bell";

type NavItem = {
  to: string;
  label: string;
  Icon: typeof LayoutDashboard;
  /** يظهر لهذه الأدوار فقط — الإخفاء تحسين تجربة، والفرض على الخادم. */
  roles?: AppRole[];
};

const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "العمل اليومي",
    items: [
      { to: "/dashboard", label: "الرئيسية", Icon: LayoutDashboard },
      { to: "/cases", label: "القضايا", Icon: Briefcase },
      { to: "/hearings", label: "الجلسات", Icon: Gavel },
      { to: "/deadlines", label: "المهل", Icon: Clock },
      { to: "/tasks", label: "المهام", Icon: ListChecks },
    ],
  },
  {
    label: "السجلات",
    items: [
      { to: "/clients", label: "العملاء", Icon: Users },
      { to: "/documents", label: "المستندات", Icon: FileText },
      { to: "/search", label: "البحث في المستندات", Icon: FileSearch },
    ],
  },
  {
    label: "المكتب",
    items: [
      { to: "/team", label: "الفريق", Icon: UsersRound },
      {
        to: "/team-performance",
        label: "أداء الفريق",
        Icon: BarChart3,
        roles: ["owner", "admin"],
      },
      { to: "/office-page", label: "الصفحة العامة", Icon: Globe },
      { to: "/print-log", label: "سجل الطباعة", Icon: Printer },
      { to: "/subscription", label: "الاشتراك", Icon: CreditCard },
      { to: "/support", label: "الدعم الفني", Icon: LifeBuoy },
      { to: "/settings", label: "الإعدادات", Icon: Settings },
    ],
  },
];

const COLLAPSE_KEY = "mehla_sidebar_collapsed";

export function DashboardShell({
  children,
  title,
  description,
  actions,
}: {
  children: ReactNode;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { memberships, activeOrgId, setActiveOrgId, activeRole, user, signOut } = useAuth();
  const [orgOpen, setOrgOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const active = memberships.find((m) => m.organization_id === activeOrgId);
  const { overview } = useSubscription();

  useEffect(() => {
    setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const toggleCollapsed = () => {
    setCollapsed((v) => {
      localStorage.setItem(COLLAPSE_KEY, v ? "0" : "1");
      return !v;
    });
  };

  const onSignOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await signOut();
    navigate({ to: "/login", search: { redirect: "/dashboard" }, replace: true });
  };

  const isActive = (to: string) => pathname === to || pathname.startsWith(to + "/");

  const SidebarInner = ({ mini }: { mini: boolean }) => (
    <>
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-border px-4">
        <Link
          to="/dashboard"
          className="inline-flex min-h-[44px] min-w-0 items-center truncate text-[15px] font-bold tracking-tight"
        >
          {mini ? "مِهلة" : "مِهلة · MEHLA"}
        </Link>
        <button
          className="-m-2 rounded-[var(--radius-s)] p-2 text-muted-foreground hover:bg-surface-muted lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-label="إغلاق القائمة"
        >
          <X className="h-5 w-5" aria-hidden />
        </button>
      </div>

      {!mini && (
        <div className="border-b border-border p-3">
          <button
            onClick={() => setOrgOpen((v) => !v)}
            aria-expanded={orgOpen}
            className="flex w-full items-center justify-between gap-2 rounded-[var(--radius-m)] border border-border bg-surface-muted px-3 py-2.5 text-right transition hover:border-border-strong"
          >
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-semibold">
                {active?.organization?.name ?? "—"}
              </span>
              <span className="block text-[11px] text-muted-foreground">
                {activeRole ? ROLE_LABELS[activeRole] : ""}
              </span>
            </span>
            <ChevronDown
              className={cn(
                "h-4 w-4 shrink-0 text-muted-foreground transition",
                orgOpen && "rotate-180",
              )}
              aria-hidden
            />
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
                      "block w-full rounded-[var(--radius-s)] px-3 py-2 text-right text-[13px] hover:bg-surface-muted",
                      m.organization_id === activeOrgId && "bg-surface-muted font-semibold",
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
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="mb-5 last:mb-0">
            {!mini && (
              <p className="px-3 pb-2 text-[11px] font-semibold tracking-wide text-text-muted">
                {group.label}
              </p>
            )}
            <ul className="space-y-0.5">
              {group.items
                .filter((item) => !item.roles || (activeRole && item.roles.includes(activeRole)))
                .map(({ to, label, Icon }) => {
                  const activeItem = isActive(to);
                  return (
                    <li key={to}>
                      <Link
                        to={to}
                        title={mini ? label : undefined}
                        aria-current={activeItem ? "page" : undefined}
                        className={cn(
                          "relative flex min-h-11 items-center gap-3 rounded-[var(--radius-m)] px-3 text-[13.5px] transition-colors duration-[var(--duration-fast)]",
                          mini && "justify-center px-0",
                          activeItem
                            ? "bg-primary-soft font-semibold text-primary"
                            : "text-muted-foreground hover:bg-surface-muted hover:text-foreground",
                        )}
                      >
                        {activeItem && (
                          <span
                            className="absolute inset-y-1.5 right-0 w-[3px] rounded-full bg-primary"
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

      <div className="shrink-0 border-t border-border p-3">
        {!mini && <p className="mb-1.5 truncate px-3 text-[11px] text-text-muted">{user?.email}</p>}
        <button
          onClick={onSignOut}
          title={mini ? "تسجيل الخروج" : undefined}
          className={cn(
            "flex min-h-11 w-full items-center gap-3 rounded-[var(--radius-m)] px-3 text-[13.5px] text-muted-foreground transition hover:bg-surface-muted hover:text-foreground",
            mini && "justify-center px-0",
          )}
        >
          <LogOut className="h-[18px] w-[18px] shrink-0" aria-hidden />
          {!mini && "تسجيل الخروج"}
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-dvh bg-background text-foreground" dir="rtl">
      <PrintGuard />
      <aside
        className={cn(
          "fixed inset-y-0 right-0 z-[var(--z-sidebar)] hidden flex-col border-l border-border bg-surface transition-[width] duration-[var(--duration-base)] lg:flex",
          collapsed ? "w-[72px]" : "w-64",
        )}
      >
        <SidebarInner mini={collapsed} />
      </aside>

      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 z-[var(--z-overlay)] bg-foreground/40 backdrop-blur-[2px] lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="fixed inset-y-0 right-0 z-[var(--z-modal)] flex w-[280px] max-w-[85vw] flex-col border-l border-border bg-surface lg:hidden">
            <SidebarInner mini={false} />
          </aside>
        </>
      )}

      <div
        className={cn(
          "transition-[margin] duration-[var(--duration-base)]",
          collapsed ? "lg:mr-[72px]" : "lg:mr-64",
        )}
      >
        <header className="sticky top-0 z-[var(--z-sticky)] border-b border-border bg-surface/85 backdrop-blur">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 md:px-6">
            <div className="flex min-w-0 items-center gap-2">
              <button
                className="-m-1 inline-flex min-h-11 min-w-11 items-center justify-center rounded-[var(--radius-s)] p-2 text-muted-foreground hover:bg-surface-muted lg:hidden"
                onClick={() => setMobileOpen(true)}
                aria-label="فتح القائمة"
              >
                <Menu className="h-5 w-5" aria-hidden />
              </button>
              <button
                className="-m-1 hidden rounded-[var(--radius-s)] p-2 text-muted-foreground hover:bg-surface-muted lg:inline-flex"
                onClick={toggleCollapsed}
                aria-label={collapsed ? "توسيع القائمة الجانبية" : "تصغير القائمة الجانبية"}
              >
                {collapsed ? (
                  <PanelRightOpen className="h-5 w-5" aria-hidden />
                ) : (
                  <PanelRightClose className="h-5 w-5" aria-hidden />
                )}
              </button>
              <div className="min-w-0">
                <h1 className="truncate text-[15px] font-bold sm:text-base">{title}</h1>
                {description && (
                  <p className="truncate text-[12px] text-muted-foreground">{description}</p>
                )}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {actions}
              <NotificationBell />
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1400px] px-4 py-6 md:px-6 md:py-8">
          {pathname !== "/subscription" && <SubscriptionAlert overview={overview} />}
          {children}
        </main>
      </div>
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = "default",
  loading = false,
}: {
  label: string;
  value: number | string;
  hint?: string;
  tone?: "default" | "warn" | "danger" | "gold" | "success";
  loading?: boolean;
}) {
  const accent = {
    default: "bg-border-strong",
    gold: "bg-primary",
    success: "bg-success",
    warn: "bg-warning",
    danger: "bg-danger",
  }[tone];
  return (
    <div
      className="surface-card relative overflow-hidden p-4 sm:p-5"
      aria-busy={loading || undefined}
    >
      <span className={cn("absolute inset-y-0 right-0 w-[3px]", accent)} aria-hidden />
      <p className="text-[12.5px] text-muted-foreground">{label}</p>
      {loading ? (
        <div
          className="mt-2 h-7 w-16 animate-pulse rounded-[var(--radius-s)] bg-surface-muted"
          aria-hidden
        />
      ) : (
        <p className="mt-2 text-[28px] font-bold leading-none tabular-nums">{value}</p>
      )}
      {hint && <p className="text-caption mt-1.5">{hint}</p>}
    </div>
  );
}
