import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DashboardShell } from "@/components/dashboard/shell";
import { ErrorBlock, LoadingBlock } from "@/lib/list-utils";
import { useAuth, canManage } from "@/hooks/use-auth";
import { errMsg } from "@/lib/errors";
import { getOfficePageState, previewOfficePage } from "@/lib/office-page.functions";
import { OfficePageEditor, type OfficePageStateView } from "@/components/office/editor";
import { OfficeLeadsPanel } from "@/components/office/leads-panel";
import { OfficeAnalyticsPanel } from "@/components/office/analytics-panel";
import { OfficePublicPage } from "@/components/office/public-page";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/office-page")({
  component: Page,
  head: () => ({
    meta: [
      { title: "الصفحة العامة للمكتب | مِهلة" },
      {
        name: "description",
        content: "تحرير صفحة مكتبك العامة ونشرها ومتابعة طلبات الاستشارة وإحصاءات الزيارات.",
      },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "الصفحة العامة للمكتب | مِهلة" },
      {
        property: "og:description",
        content: "تحرير صفحة مكتبك العامة ونشرها ومتابعة طلبات الاستشارة.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const TABS = [
  { id: "content", label: "المحتوى" },
  { id: "preview", label: "المعاينة" },
  { id: "leads", label: "الطلبات" },
  { id: "analytics", label: "الإحصاءات" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function Page() {
  const { activeOrgId, activeRole } = useAuth();
  const [tab, setTab] = useState<TabId>("content");
  const editable = canManage(activeRole);

  const state = useQuery({
    queryKey: ["office-page", activeOrgId],
    queryFn: () => getOfficePageState({ data: { organizationId: activeOrgId! } }),
    enabled: !!activeOrgId,
  });

  return (
    <DashboardShell
      title="الصفحة العامة للمكتب"
      description="صفحة تعريفية عامة لمكتبك مع طلبات استشارة وإحصاءات، ولا يظهر منها إلا ما تنشره صراحة."
    >
      <nav
        aria-label="أقسام الصفحة العامة"
        className="mb-5 flex gap-1 overflow-x-auto rounded-[var(--radius-l)] border border-border bg-surface p-1"
      >
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-current={tab === item.id ? "page" : undefined}
            onClick={() => setTab(item.id)}
            className={cn(
              "min-h-11 shrink-0 rounded-[var(--radius-m)] px-4 text-body-sm font-medium transition-colors",
              tab === item.id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-surface-muted",
            )}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {!activeOrgId ? (
        <ErrorBlock message="لم يتم تحديد مكتب نشط." />
      ) : state.isPending ? (
        <LoadingBlock rows={6} cols={3} />
      ) : state.isError ? (
        <ErrorBlock message={errMsg(state.error)} />
      ) : (
        <>
          {tab === "content" && (
            <OfficePageEditor
              state={state.data as OfficePageStateView}
              organizationId={activeOrgId}
              canEdit={editable}
            />
          )}
          {tab === "preview" && <PreviewTab organizationId={activeOrgId} />}
          {tab === "leads" && (
            <OfficeLeadsPanel organizationId={activeOrgId} canManageLeads={editable} />
          )}
          {tab === "analytics" && <OfficeAnalyticsPanel organizationId={activeOrgId} />}
        </>
      )}
    </DashboardShell>
  );
}

/** المعاينة داخل الجلسة فقط: نفس مكوّن العرض العام، بلا رابط عام ولا إرسال طلبات. */
function PreviewTab({ organizationId }: { organizationId: string }) {
  const query = useQuery({
    queryKey: ["office-preview", organizationId],
    queryFn: () => previewOfficePage({ data: { organizationId } }),
  });

  if (query.isPending) return <LoadingBlock rows={5} cols={2} />;
  if (query.isError) return <ErrorBlock message={errMsg(query.error)} />;

  return (
    <div className="overflow-hidden rounded-[var(--radius-l)] border border-border">
      <OfficePublicPage view={query.data} />
    </div>
  );
}
