import { StatCard } from "@/components/dashboard/shell";
import { fmtMoney } from "@/lib/format";
import type { BillingSummary } from "@/lib/office-billing/billing.server";

/** مؤشرات مالية موحّدة تُستخدم في صفحة الفواتير ولوحة المكتب معاً. */
export function BillingSummaryCards({
  summary,
  loading = false,
}: {
  summary: BillingSummary | undefined;
  loading?: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard
        label="إجمالي الفواتير المُصدرة"
        loading={loading}
        value={fmtMoney(summary?.invoiced ?? 0)}
      />
      <StatCard
        label="المحصل"
        loading={loading}
        value={fmtMoney(summary?.collected ?? 0)}
        tone="success"
      />
      <StatCard
        label="الرصيد المستحق"
        loading={loading}
        value={fmtMoney(summary?.outstanding ?? 0)}
        tone="gold"
      />
      <StatCard
        label="متأخر السداد"
        loading={loading}
        value={fmtMoney(summary?.overdue ?? 0)}
        tone="danger"
        hint={
          summary && summary.overdueCount > 0 ? `${summary.overdueCount} فاتورة متأخرة` : undefined
        }
      />
    </div>
  );
}