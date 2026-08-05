import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Gauge,
  CreditCard,
  Layers,
  LifeBuoy,
  ShieldCheck,
  ScrollText,
  LogOut,
  Menu,
  X,
  Users,
  Building2,
  TrendingUp,
  Mail,
  BellRing,
  Inbox,
  Activity,
  Settings,
  Search,
  KeyRound,
  Lock,
  MessageSquare,
  Plug,
  Palette,
  Receipt,
  ListChecks,
  BarChart3,
  Server,
  FileText,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { usePlatformAdmin } from "@/hooks/use-platform-admin";
import { ImpersonationBanner } from "@/components/admin/impersonation-banner";
import type { AdminPermission } from "@/lib/admin-permissions";

type NavItem = { to: string; label: string; Icon: typeof Gauge; permission?: AdminPermission };

const NAV: { label: string; items: NavItem[] }[] = [
  {
    label: "التشغيل",
    items: [
      { to: "/mehla-admin", label: "لوحة المؤشرات", Icon: Gauge },
      { to: "/mehla-admin/users", label: "المستخدمون", Icon: Users, permission: "users.read" },
      { to: "/mehla-admin/organizations", label: "المكاتب", Icon: Building2, permission: "organizations.read" },
      { to: "/mehla-admin/subscriptions", label: "الاشتراكات", Icon: CreditCard, permission: "subscriptions.manage" },
      { to: "/mehla-admin/plans", label: "الباقات", Icon: Layers, permission: "plans.manage" },
      { to: "/mehla-admin/revenue", label: "الإيرادات والتقارير", Icon: TrendingUp, permission: "revenue.read" },
      { to: "/mehla-admin/billing", label: "المركز المالي", Icon: Receipt, permission: "billing.read" },
      { to: "/mehla-admin/support", label: "مركز الدعم", Icon: LifeBuoy, permission: "tickets.view" },
    ],
  },
  {
    label: "المراسلات",
    items: [
      { to: "/mehla-admin/mail", label: "مركز البريد", Icon: Inbox, permission: "email.view" },
      { to: "/mehla-admin/email", label: "البريد والقوالب", Icon: Mail, permission: "email.manage" },
      { to: "/mehla-admin/notifications", label: "الإشعارات", Icon: BellRing, permission: "notifications.send" },
      { to: "/mehla-admin/sms", label: "الرسائل وتوثيق الجوال", Icon: MessageSquare, permission: "settings.manage" },
      { to: "/mehla-admin/integrations", label: "مركز التكاملات", Icon: Plug, permission: "settings.manage" },
    ],
  },
  {
    label: "المنصة",
    items: [
      { to: "/mehla-admin/analytics", label: "التحليلات والنمو", Icon: BarChart3, permission: "monitoring.read" },
      { to: "/mehla-admin/services", label: "حالة الخدمات", Icon: Server, permission: "monitoring.read" },
      { to: "/mehla-admin/jobs", label: "مهام النظام", Icon: ListChecks, permission: "monitoring.read" },
      { to: "/mehla-admin/monitoring", label: "مراقبة النظام", Icon: Activity, permission: "monitoring.read" },
      { to: "/mehla-admin/content", label: "إدارة المحتوى", Icon: FileText, permission: "settings.manage" },
      { to: "/mehla-admin/settings", label: "إعدادات المنصة", Icon: Settings, permission: "settings.manage" },
      { to: "/mehla-admin/seo", label: "إدارة SEO", Icon: Search, permission: "seo.manage" },
      { to: "/mehla-admin/design", label: "تصميم المنصة", Icon: Palette, permission: "settings.manage" },
    ],
  },
  {
    label: "الأمان والفريق",
    items: [
      { to: "/mehla-admin/staff", label: "الموظفون والصلاحيات", Icon: ShieldCheck, permission: "staff.view" },
      { to: "/mehla-admin/security", label: "مركز الأمان", Icon: Lock },
      { to: "/mehla-admin/rbac", label: "الأدوار والصلاحيات", Icon: KeyRound, permission: "staff.view" },
      { to: "/mehla-admin/logs", label: "سجل التدقيق", Icon: ScrollText, permission: "audit.read" },
      { to: "/mehla-admin/failures", label: "سجل الأعطال", Icon: AlertTriangle, permission: "audit.read" },
    ],
  },
];

export function AdminShell({
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
  const { staff, can } = usePlatformAdmin();
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const isActive = (to: string) =>
    to === "/mehla-admin" ? pathname === to || pathname === `${to}/` : pathname.startsWith(to);

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
          className="-m-2 rounded-[var(--radius-s)] p-2 text-muted-foreground hover:bg-surface-muted lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-label="إغلاق القائمة"
        >
          <X className="h-5 w-5" aria-hidden />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="تنقل لوحة الإدارة">
        {NAV.map((group) => {
          const items = group.items.filter((i) => !i.permission || can(i.permission));
          if (items.length === 0) return null;
          return (
            <div key={group.label} className="mb-5 last:mb-0">
              <p className="px-3 pb-2 text-[11px] font-semibold tracking-wide text-text-muted">{group.label}</p>
              <ul className="space-y-0.5">
                {items.map(({ to, label, Icon }) => (
                  <li key={to}>
                    <Link
                      to={to}
                      onClick={() => setMobileOpen(false)}
                      className={cn(
                        "flex items-center gap-2.5 rounded-[var(--radius-m)] px-3 py-2.5 text-[13px] font-medium transition",
                        isActive(to)
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

      <div className="shrink-0 border-t border-border p-3">
        <div className="mb-2 px-2">
          <p className="truncate text-[13px] font-semibold">{staff?.full_name}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {staff?.role === "super_admin" ? "مالك المنصة" : (staff?.job_title ?? "موظف تشغيل")}
          </p>
        </div>
        <button
          onClick={onSignOut}
          className="flex w-full items-center gap-2 rounded-[var(--radius-m)] px-3 py-2.5 text-[13px] font-medium text-danger transition hover:bg-danger-soft"
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
          <div className="absolute inset-0 bg-foreground/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 right-0 flex w-72 flex-col bg-surface">{Sidebar}</aside>
        </div>
      )}

      <div className="lg:mr-64">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-surface/90 px-4 backdrop-blur lg:px-8">
          <button
            className="-m-2 rounded-[var(--radius-s)] p-2 text-muted-foreground hover:bg-surface-muted lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="فتح القائمة"
          >
            <Menu className="h-5 w-5" aria-hidden />
          </button>
          <span className="truncate text-sm font-semibold">لوحة إدارة منصة مِهلة</span>
          <span className="ms-auto hidden rounded-full bg-success-soft px-2.5 py-0.5 text-[11px] font-semibold text-success sm:inline">
            بيانات العملاء القانونية غير متاحة لهذه اللوحة
          </span>
        </header>

        <main className="mx-auto max-w-[1200px] px-4 py-6 lg:px-8 lg:py-8">
          <div className="mb-6 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 sm:flex sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-h3 truncate">{title}</h1>
              {description && <p className="mt-1 text-body-sm text-muted-foreground">{description}</p>}
            </div>
            {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}