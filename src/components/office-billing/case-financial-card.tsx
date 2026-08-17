import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronLeft } from "lucide-react";
import { EmptyState, SectionCard, SectionLoader } from "@/lib/list-utils";
import { fmtMoney } from "@/lib/format";
import { getOfficeBillingSummary } from "@/lib/office-billing/billing.functions";
import { can } from "@/lib/office-billing/permissions";
import { useAuth } from "@/hooks/use-auth";

/** الملخص المالي داخل تفاصيل القضية — يُخفى تماماً لمن لا يملك صلاحية الاطلاع المالي. */
export function CaseFinancialCard({
  organizationId,
  caseId,
}: {
  organizationId: string;
  caseId: string;
}) {
  const { activeRole } = useAuth();
  const fetchSummary = useServerFn(getOfficeBillingSummary);
  const allowed = can(activeRole, "billing.view");

  const { data, isLoading, error } = useQuery({
    queryKey: ["office-billing-summary", organizationId, "case", caseId],
    enabled: allowed && !!organizationId && !!caseId,
    queryFn: () => fetchSummary({ data: { organizationId, caseId } }),
  });

  if (!allowed) return null;

  return (
    <SectionCard
      title="الملخص المالي للقضية"
      actions={
        <Link
          to="/invoices"
          className="inline-flex items-center gap-1 text-body-sm text-primary hover:underline"
        >
          الأتعاب والمطالبات <ChevronLeft className="h-4 w-4" aria-hidden />
        </Link>
      }
    >
      {isLoading ? (
        <SectionLoader rows={3} />
      ) : error ? (
        <p role="alert" className="text-body-sm text-danger">
          تعذّر تحميل الملخص المالي.
        </p>
      ) : !data || data.invoiced === 0 ? (
        <EmptyState
          title="لا توجد مطالبات أتعاب مُصدرة لهذه القضية"
          hint="أنشئ مطالبة أتعاب أو عرض سعر من صفحة الأتعاب وحدّد هذه القضية."
        />
      ) : (
        <dl className="grid grid-cols-2 gap-3">
          <Cell label="إجمالي الأتعاب" value={fmtMoney(data.invoiced)} />
          <Cell label="المبالغ المحصلة" value={fmtMoney(data.collected)} />
          <Cell label="الأتعاب المستحقة" value={fmtMoney(data.outstanding)} />
          <Cell label="متأخرات السداد" value={fmtMoney(data.overdue)} tone="danger" />
        </dl>
      )}
    </SectionCard>
  );
}

function Cell({ label, value, tone }: { label: string; value: string; tone?: "danger" }) {
  return (
    <div className="rounded-[var(--radius-m)] bg-surface-muted p-3">
      <dt className="text-caption">{label}</dt>
      <dd
        className={`mt-1 font-display text-[18px] font-bold tabular-nums ${tone === "danger" ? "text-danger" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}
