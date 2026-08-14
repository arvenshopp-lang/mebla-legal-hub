import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useAuth, canEdit, ROLE_LABELS } from "@/hooks/use-auth";
import { useSubscription } from "@/hooks/use-subscription";
import { SubscriptionAlert } from "@/components/subscription/subscription-ui";
import { PrintGuard } from "@/components/print/print-guard";
import { WorkspaceSidebar } from "./workspace-sidebar";
import { WorkspaceTopbar } from "./workspace-topbar";
import { WorkspaceMobileNav } from "./workspace-mobile-nav";

const COLLAPSE_KEY = "mehla_sidebar_collapsed";

/**
 * قشرة مساحة عمل المكتب: قائمة جانبية داكنة على سطح المكتب، وتنقل سفلي على الجوال،
 * وشريط علوي واحد لسياق الصفحة. إيقاع المسافات موحّد عبر جميع صفحات المكتب.
 */
export function AppShell({
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
  const { signOut, activeRole, user } = useAuth();
  const { overview } = useSubscription();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
  }, []);

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

  return (
    <div className="min-h-dvh bg-background text-foreground" dir="rtl">
      <PrintGuard />
      <a
        href="#workspace-main"
        className="sr-only focus:not-sr-only focus:fixed focus:right-4 focus:top-4 focus:z-[var(--z-modal)] focus:rounded-[var(--radius-m)] focus:bg-primary focus:px-4 focus:py-2 focus:text-[13px] focus:font-semibold focus:text-primary-foreground"
      >
        تخطَّ إلى المحتوى
      </a>

      <aside
        className={cn(
          "fixed inset-y-0 right-0 z-[var(--z-sidebar)] hidden flex-col transition-[width] duration-[var(--duration-base)] lg:flex",
          collapsed ? "w-[76px]" : "w-[264px]",
        )}
      >
        <WorkspaceSidebar pathname={pathname} mini={collapsed} onSignOut={onSignOut} />
      </aside>

      <div
        className={cn(
          "transition-[margin] duration-[var(--duration-base)]",
          collapsed ? "lg:mr-[76px]" : "lg:mr-[264px]",
        )}
      >
        <WorkspaceTopbar
          title={title}
          description={description}
          actions={actions}
          collapsed={collapsed}
          onToggleCollapse={toggleCollapsed}
          canCreate={canEdit(activeRole)}
          userEmail={user?.email ?? undefined}
          roleLabel={activeRole ? ROLE_LABELS[activeRole] : undefined}
          onSignOut={onSignOut}
        />
        <main id="workspace-main" className="workspace-page workspace-stack">
          {pathname !== "/subscription" && <SubscriptionAlert overview={overview} />}
          {children}
        </main>
      </div>

      <WorkspaceMobileNav pathname={pathname} onSignOut={onSignOut} />
    </div>
  );
}
