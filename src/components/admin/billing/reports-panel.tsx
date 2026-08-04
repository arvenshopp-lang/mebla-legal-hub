import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ErrorBlock, SectionCard, SectionLoader, Td, Th, inputCls } from "@/lib/list-utils";
import { billingReports } from "@/lib/billing/billing.functions";
import { formatDateTime, type BillingReports } from "@/lib/billing/billing.shared";
import { KpiCard, Money } from "./shared";

const startOfMonth = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
};

const MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const monthLabel = (value: string) => {
  const [year, month] = value.split("-");
  return `${MONTHS[Number(month) - 1] ?? month} ${year}`;
};

export function ReportsPanel() {
  const [from, setFrom] = useState(startOfMonth);
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));

  const reportsFn = useServerFn(billingReports);
  const range = useMemo(
    () => ({ from: new Date(`${from}T00:00:00`).toISOString(), to: new Date(`${to}T23:59:59`).toISOString() }),
    [from, to],
  );

  const query = useQuery({
    queryKey: ["billing-reports", range.from, range.to],
    queryFn: () => reportsFn({ data: range }),
  });

  const data = query.data as BillingReports | undefined;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-label">
          <span className="mb-1.5 block">من تاريخ</span>
          <input type="date" className={`${inputCls} w-44`} value={from} onChange={(event) => setFrom(event.target.value)} />
        </label>
        <label className="text-label">
          <span className="mb-1.5 block">إلى تاريخ</span>
          <input type="date" className={`${inputCls} w-44`} value={to} onChange={(event) => setTo(event.target.value)} />
        </label>
        {data && <p className="text-caption pb-2">آخر تحديث: {formatDateTime(data.generated_at)}</p>}
      </div>

      {query.isPending ? (
        <SectionLoader label="جاري احتساب التقارير…" rows={4} />
      ) : query.isError || !data ? (
        <ErrorBlock message={(query.error as Error | undefined)?.message ?? "تعذّر إعداد التقارير المالية."} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard label="إجمالي المُفتَّر" value={<Money value={data.summary.invoiced_total} />} />
            <KpiCard label="المُحصَّل" value={<Money value={data.summary.collected_total} />} tone="success" />
            <KpiCard
              label="المستحق غير المسدَّد"
              value={<Money value={data.summary.outstanding_total} />}
              tone="warning"
              hint={`متأخر: ${data.summary.overdue_count} فاتورة`}
            />
            <KpiCard
              label="نسبة التحصيل"
              value={`${Number(data.summary.collection_rate ?? 0).toFixed(1)}%`}
              hint={`فواتير الفترة: ${data.summary.invoice_count}`}
            />
          </div>

          <SectionCard title="أعمار الدين" description="توزيع المبالغ غير المسدَّدة حسب تأخر الاستحقاق.">
            <div className="overflow-x-auto">
              <table className="w-full text-body-sm">
                <thead>
                  <tr>
                    <Th>الفئة</Th>
                    <Th>عدد الفواتير</Th>
                    <Th>المبلغ</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.aging.map((row) => (
                    <tr key={row.key} className="border-t border-border">
                      <Td>{row.label}</Td>
                      <Td className="tabular-nums">{row.count}</Td>
                      <Td>
                        <Money value={row.amount} />
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>

          <div className="grid gap-5 lg:grid-cols-2">
            <SectionCard title="حسب الباقة">
              <Table
                head={["الباقة", "العدد", "المُفتَّر", "المُحصَّل"]}
                rows={data.by_plan.map((row) => [row.label, String(row.count), row.invoiced, row.collected])}
              />
            </SectionCard>
            <SectionCard title="حسب المكتب">
              <Table
                head={["المكتب", "المُفتَّر", "المُحصَّل", "المتبقي"]}
                rows={data.by_office.map((row) => [row.label, row.invoiced, row.collected, row.outstanding])}
              />
            </SectionCard>
            <SectionCard title="حسب الشهر">
              <Table
                head={["الشهر", "المُفتَّر", "المُحصَّل", "العدد"]}
                rows={data.by_month.map((row) => [monthLabel(row.month), row.invoiced, row.collected, String(row.count)])}
              />
            </SectionCard>
            <SectionCard title="حسب طريقة السداد">
              <Table
                head={["الطريقة", "العدد", "المبلغ"]}
                rows={data.payments_by_method.map((row) => [row.label, String(row.count), row.amount])}
              />
            </SectionCard>
          </div>
        </>
      )}
    </div>
  );
}

function Table({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  if (rows.length === 0) return <p className="text-caption p-5">لا توجد بيانات في هذه الفترة.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-body-sm">
        <thead>
          <tr>
            {head.map((label) => (
              <Th key={label}>{label}</Th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="border-t border-border">
              {row.map((cell, cellIndex) => (
                <Td key={cellIndex}>{typeof cell === "number" ? <Money value={cell} /> : cell}</Td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
