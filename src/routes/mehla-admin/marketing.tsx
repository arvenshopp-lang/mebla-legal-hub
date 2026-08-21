import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BadgePercent, LineChart, Target, Trophy } from "lucide-react";
import { AdminShell } from "@/components/admin/shell";
import { usePlatformAdmin } from "@/hooks/use-platform-admin";
import { ErrorBlock, StatsSkeleton } from "@/lib/list-utils";
import { cn } from "@/lib/utils";
import { getMarketingPerformanceSummary } from "@/lib/marketing.functions";
import { CampaignsPanel } from "@/components/admin/marketing/campaigns-panel";
import { ConversionsPanel } from "@/components/admin/marketing/conversions-panel";
import { ReferralsPanel } from "@/components/admin/marketing/referrals-panel";
import { ProvidersPanel } from "@/components/admin/marketing/providers-panel";
import { fmtNumber } from "@/lib/format";
import { NOINDEX_META } from "@/config/indexing";

export const Route = createFileRoute("/mehla-admin/marketing")({
  head: () => ({
    meta: [
      { title: "مركز التسويق · إدارة مِهلة" },
      {
        name: "description",
        content:
          "متابعة أداء الحملات التسويقية وأحداث التحويل وبرامج الإحالة ومزوّدي القياس في منصة مِهلة.",
      },
      NOINDEX_META,
    ],
  }),
  component: MarketingPage,
});

const TABS = [
  { id: "campaigns", label: "الحملات" },
  { id: "conversions", label: "أحداث التحويل" },
  { id: "referrals", label: "الإحالات" },
  { id: "providers", label: "مزوّدو التسويق" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function MarketingPage() {
  const { can } = usePlatformAdmin();
  const canManage = can("marketing.manage");
  const canExport = can("marketing.export");
  const [tab, setTab] = useState<TabId>("campaigns");

  const summaryFn = useServerFn(getMarketingPerformanceSummary);
  const summaryQuery = useQuery({
    queryKey: ["marketing-performance"],
    queryFn: () => summaryFn({ data: {} }),
  });

  const totals = useMemo(() => {
    const rows = summaryQuery.data?.summary ?? [];
    type SummaryRow = (typeof rows)[number];
    return rows.reduce(
      (
        acc: {
          budget: number;
          spend: number;
          leads: number;
          deals: number;
          wonAmount: number;
          conversionEvents: number;
        },
        r: SummaryRow,
      ) => {
        acc.budget += r.budget_amount;
        acc.spend += r.spend_amount;
        acc.leads += r.leads_count;
        acc.deals += r.deals_count;
        acc.wonAmount += r.won_amount;
        acc.conversionEvents += r.conversion_events_count;
        return acc;
      },
      { budget: 0, spend: 0, leads: 0, deals: 0, wonAmount: 0, conversionEvents: 0 },
    );
  }, [summaryQuery.data]);

  return (
    <AdminShell
      title="مركز التسويق"
      description="أداء الحملات التسويقية وأحداث التحويل وبرامج الإحالة ومزوّدي القياس والإعلانات."
    >
      {summaryQuery.isLoading ? (
        <StatsSkeleton count={4} />
      ) : summaryQuery.isError ? (
        <ErrorBlock message="تعذّر تحميل ملخص أداء التسويق." />
      ) : (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            Icon={LineChart}
            label="إجمالي الإنفاق"
            value={`${fmtNumber(totals.spend)} ﷼`}
            hint={`من إجمالي ميزانية ${fmtNumber(totals.budget)} ﷼`}
          />
          <SummaryCard
            Icon={Target}
            label="عملاء محتملون مرتبطون"
            value={fmtNumber(totals.leads)}
            hint={`${fmtNumber(totals.deals)} صفقة مرتبطة بحملات`}
          />
          <SummaryCard
            Icon={Trophy}
            label="قيمة الصفقات الفائزة"
            value={`${fmtNumber(totals.wonAmount)} ﷼`}
            hint="محسوبة من الصفقات المطابقة لبيانات UTM"
          />
          <SummaryCard
            Icon={BadgePercent}
            label="أحداث التحويل المسجّلة"
            value={fmtNumber(totals.conversionEvents)}
            hint="عبر جميع الحملات"
          />
        </div>
      )}

      <div className="mb-5 overflow-x-auto">
        <div role="tablist" aria-label="أقسام مركز التسويق" className="flex min-w-max gap-1.5">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "rounded-[var(--radius-m)] px-3.5 py-2 text-[13px] font-medium transition",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                tab === t.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-surface text-foreground hover:bg-surface-muted",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "campaigns" && <CampaignsPanel canManage={canManage} canExport={canExport} />}
      {tab === "conversions" && <ConversionsPanel canManage={canManage} />}
      {tab === "referrals" && <ReferralsPanel canManage={canManage} />}
      {tab === "providers" && <ProvidersPanel />}
    </AdminShell>
  );
}

function SummaryCard({
  Icon,
  label,
  value,
  hint,
}: {
  Icon: typeof LineChart;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="surface-card p-5">
      <Icon className="h-5 w-5 text-muted-foreground" aria-hidden />
      <p className="mt-3 text-h4 tabular-nums">{value}</p>
      <p className="mt-1 text-body-sm font-semibold">{label}</p>
      {hint && <p className="text-caption mt-0.5">{hint}</p>}
    </div>
  );
}
