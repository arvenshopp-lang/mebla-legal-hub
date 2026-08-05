/**
 * نظرة عامة على CRM: التوقعات المرجّحة، توزيع خط البيع، وتقارير المصادر وUTM.
 */
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Badge,
  DataCard,
  EmptyState,
  ErrorBlock,
  SectionCard,
  SectionLoader,
  StatsSkeleton,
  Td,
  Th,
} from "@/lib/list-utils";
import { pipelineSummary, sourceReport } from "@/lib/crm.functions";
import { Money } from "./shared";

function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="surface-card p-4">
      <p className="text-caption">{label}</p>
      <p className="mt-1 text-h4 font-semibold">{value}</p>
      {hint && <p className="text-caption mt-0.5">{hint}</p>}
    </div>
  );
}

export function OverviewPanel() {
  const summaryFn = useServerFn(pipelineSummary);
  const reportFn = useServerFn(sourceReport);
  const summaryQuery = useQuery({ queryKey: ["crm-pipeline"], queryFn: () => summaryFn({ data: undefined }) });
  const reportQuery = useQuery({ queryKey: ["crm-sources"], queryFn: () => reportFn({ data: undefined }) });

  const forecast = summaryQuery.data?.forecast;
  const stages = summaryQuery.data?.summary ?? [];
  const maxAmount = Math.max(1, ...stages.map((stage) => stage.total_amount));

  return (
    <div className="space-y-5">
      {summaryQuery.isLoading ? (
        <StatsSkeleton count={4} />
      ) : summaryQuery.isError ? (
        <ErrorBlock message="تعذّر حساب توقعات خط البيع." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat
            label="قيمة الصفقات المفتوحة"
            value={<Money value={forecast?.total_open_amount ?? 0} />}
            hint={`${forecast?.open_deals_count ?? 0} صفقة مفتوحة`}
          />
          <Stat label="التوقع المرجّح" value={<Money value={forecast?.total_weighted_amount ?? 0} />} hint="مرجّح باحتمالية المرحلة" />
          <Stat label="مكتسب (٣٠ يوماً)" value={<Money value={forecast?.won_amount_30d ?? 0} />} />
          <Stat label="مفقود (٣٠ يوماً)" value={<Money value={forecast?.lost_amount_30d ?? 0} />} />
        </div>
      )}

      <SectionCard title="توزيع خط البيع" description="قيمة الصفقات المفتوحة في كل مرحلة والقيمة المرجّحة.">
        {summaryQuery.isLoading ? (
          <SectionLoader rows={4} />
        ) : stages.length === 0 ? (
          <EmptyState title="لا توجد مراحل" hint="أضف مراحل خط البيع لعرض التوزيع." />
        ) : (
          <ul className="space-y-3">
            {stages.map((stage) => (
              <li key={stage.stage_id}>
                <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-body-sm">
                  <span className="flex items-center gap-2 font-semibold">
                    {stage.stage_name}
                    {stage.is_won && <Badge tone="green">فوز</Badge>}
                    {stage.is_lost && <Badge tone="red">خسارة</Badge>}
                  </span>
                  <span className="text-caption">
                    {stage.deals_count} صفقة · <Money value={stage.total_amount} /> · مرجّح <Money value={stage.weighted_amount} />
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-[var(--brand-green)]"
                    style={{ width: `${Math.round((stage.total_amount / maxAmount) * 100)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="تقرير المصادر" description="أداء العملاء المحتملين والصفقات بحسب مصدر الاستقطاب.">
        {reportQuery.isLoading ? (
          <SectionLoader rows={4} />
        ) : reportQuery.isError ? (
          <ErrorBlock message="تعذّر جلب تقرير المصادر." />
        ) : (reportQuery.data?.sources.length ?? 0) === 0 ? (
          <EmptyState title="لا توجد بيانات مصادر" />
        ) : (
          <DataCard>
            <table className="w-full min-w-[38rem] text-body-sm">
              <thead>
                <tr>
                  <Th>المصدر</Th>
                  <Th>محتملون</Th>
                  <Th>محوّلون</Th>
                  <Th>صفقات</Th>
                  <Th>صفقات مكتسبة</Th>
                  <Th>قيمة مكتسبة</Th>
                </tr>
              </thead>
              <tbody>
                {reportQuery.data?.sources.map((row) => (
                  <tr key={row.source} className="border-t border-border">
                    <Td>{row.source}</Td>
                    <Td>{row.leads_count}</Td>
                    <Td>{row.converted_count}</Td>
                    <Td>{row.deals_count}</Td>
                    <Td>{row.won_deals_count}</Td>
                    <Td>
                      <Money value={row.won_amount} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DataCard>
        )}
      </SectionCard>

      <SectionCard title="حملات UTM" description="أداء الصفقات المرتبطة بوسوم الحملات التسويقية.">
        {reportQuery.isLoading ? (
          <SectionLoader rows={3} />
        ) : (reportQuery.data?.utm.length ?? 0) === 0 ? (
          <EmptyState title="لا توجد بيانات UTM" hint="أضف وسوم الحملة عند إنشاء الصفقات لتتبع الأداء." />
        ) : (
          <DataCard>
            <table className="w-full min-w-[38rem] text-body-sm">
              <thead>
                <tr>
                  <Th>المصدر</Th>
                  <Th>الوسيط</Th>
                  <Th>الحملة</Th>
                  <Th>صفقات</Th>
                  <Th>قيمة مكتسبة</Th>
                </tr>
              </thead>
              <tbody>
                {reportQuery.data?.utm.map((row) => (
                  <tr key={`${row.utm_source}-${row.utm_medium}-${row.utm_campaign}`} className="border-t border-border">
                    <Td>{row.utm_source}</Td>
                    <Td>{row.utm_medium}</Td>
                    <Td>{row.utm_campaign}</Td>
                    <Td>{row.deals_count}</Td>
                    <Td>
                      <Money value={row.won_amount} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DataCard>
        )}
      </SectionCard>
    </div>
  );
}
