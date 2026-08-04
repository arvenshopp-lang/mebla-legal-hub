import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AdminShell } from "@/components/admin/shell";
import { ErrorBlock, LoadingBlock, Btn } from "@/lib/list-utils";
import { usePlatformAdmin } from "@/hooks/use-platform-admin";
import { getRbacOverview } from "@/lib/rbac/rbac.functions";
import { RolesPanel } from "@/components/admin/rbac/roles-panel";
import { DepartmentsPanel } from "@/components/admin/rbac/departments-panel";
import { GrantsPanel } from "@/components/admin/rbac/grants-panel";
import { ApprovalsPanel } from "@/components/admin/rbac/approvals-panel";
import { ImpersonationPanel } from "@/components/admin/rbac/impersonation-panel";
import { SessionsPanel } from "@/components/admin/rbac/sessions-panel";
import { AuditPanel } from "@/components/admin/rbac/audit-panel";
import { OverviewPanel } from "@/components/admin/rbac/overview-panel";
import type { RbacOverview } from "@/components/admin/rbac/shared";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/mehla-admin/rbac")({
  head: () => ({
    meta: [
      { title: "الأدوار والصلاحيات · إدارة مِهلة" },
      { name: "description", content: "إدارة أدوار المنصة وصلاحياتها وأقسامها والمنح والاعتمادات والجلسات." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: RbacPage,
});

const TABS = [
  { id: "overview", label: "نظرة عامة" },
  { id: "roles", label: "الأدوار والصلاحيات" },
  { id: "departments", label: "الأقسام" },
  { id: "grants", label: "المنح والتفويض" },
  { id: "approvals", label: "طلبات الاعتماد" },
  { id: "impersonation", label: "الانتحال" },
  { id: "sessions", label: "الجلسات والقيود" },
  { id: "audit", label: "سجل التدقيق" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function RbacPage() {
  const qc = useQueryClient();
  const { can } = usePlatformAdmin();
  const [tab, setTab] = useState<TabId>("overview");

  const overviewFn = useServerFn(getRbacOverview);
  const query = useQuery<RbacOverview>({
    queryKey: ["rbac-overview"],
    queryFn: async () => (await overviewFn({ data: undefined })) as RbacOverview,
    staleTime: 20_000,
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["rbac-overview"] });
    void qc.invalidateQueries({ queryKey: ["rbac-audit"] });
  };

  return (
    <AdminShell
      title="الأدوار والصلاحيات"
      description="مركز التحكم في أدوار المنصة، الأقسام، المنح المؤقتة، الاعتمادات، الانتحال، والجلسات."
      actions={
        <Btn size="sm" variant="outline" onClick={refresh} loading={query.isFetching}>
          تحديث
        </Btn>
      }
    >
      <div className="mb-5 overflow-x-auto">
        <div role="tablist" aria-label="أقسام مركز الصلاحيات" className="flex min-w-max gap-1.5">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "rounded-[var(--radius-m)] px-3.5 py-2 text-[13px] font-medium transition",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                tab === t.id ? "bg-primary text-primary-foreground" : "bg-surface text-foreground hover:bg-surface-muted",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "audit" ? (
        <AuditPanel />
      ) : query.isPending ? (
        <div className="surface-card p-5">
          <LoadingBlock rows={6} cols={4} />
        </div>
      ) : query.isError ? (
        <div className="space-y-3">
          <ErrorBlock message="تعذّر تحميل بيانات الصلاحيات. تأكد من صلاحياتك ثم أعد المحاولة." />
          <Btn variant="outline" onClick={() => void query.refetch()}>
            إعادة المحاولة
          </Btn>
        </div>
      ) : (
        (() => {
          const data = query.data;
          switch (tab) {
            case "overview":
              return <OverviewPanel data={data} />;
            case "roles":
              return <RolesPanel data={data} canManage={can("roles.manage")} refresh={refresh} />;
            case "departments":
              return <DepartmentsPanel data={data} canManage={can("staff.manage")} refresh={refresh} />;
            case "grants":
              return <GrantsPanel data={data} canGrant={can("delegation.grant")} refresh={refresh} />;
            case "approvals":
              return <ApprovalsPanel data={data} canDecide={can("approvals.decide")} refresh={refresh} />;
            case "impersonation":
              return (
                <ImpersonationPanel
                  data={data}
                  canRequest={can("impersonation.request")}
                  canApprove={can("impersonation.approve")}
                  refresh={refresh}
                />
              );
            case "sessions":
              return (
                <SessionsPanel
                  data={data}
                  canRevoke={can("staff.sessions.revoke")}
                  canManageRestrictions={can("staff.restrictions.manage")}
                  refresh={refresh}
                />
              );
            default:
              return null;
          }
        })()
      )}
    </AdminShell>
  );
}
