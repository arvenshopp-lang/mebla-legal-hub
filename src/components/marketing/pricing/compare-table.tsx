import { Check, Clock3, Minus } from "lucide-react";
import {
  cycleSuffix,
  planFeatureCells,
  planLimitRows,
  planSupportRows,
  priceLabel,
  type BillingCycle,
  type PublicPlan,
} from "@/lib/pricing.shared";

type Row = { key: string; label: string; cells: React.ReactNode[] };

function FeatureMark({ included, comingSoon }: { included: boolean; comingSoon: boolean }) {
  if (comingSoon)
    return (
      <span className="inline-flex items-center gap-1 text-[12.5px] text-warning">
        <Clock3 className="h-4 w-4" aria-hidden />
        قريباً
      </span>
    );
  if (included)
    return (
      <>
        <Check className="mx-auto h-4 w-4 text-primary" aria-hidden />
        <span className="sr-only">مشمولة</span>
      </>
    );
  return (
    <>
      <Minus className="mx-auto h-4 w-4 text-text-muted" aria-hidden />
      <span className="sr-only">غير مشمولة</span>
    </>
  );
}

/** جدول مقارنة الباقات — يظهر على الشاشات المتوسطة وما فوق فقط (البطاقات تكفي على الجوال). */
export function CompareTable({ plans, cycle }: { plans: PublicPlan[]; cycle: BillingCycle }) {
  if (plans.length === 0) return null;

  const limitKeys = planLimitRows(plans[0]).map((r) => ({ key: r.key, label: r.label }));
  const supportKeys = planSupportRows(plans[0]).map((r) => ({ key: r.key, label: r.label }));
  const featureKeys = planFeatureCells(plans[0]).map((f) => ({ key: f.key, label: f.label }));

  const rows: Row[] = [
    {
      key: "price",
      label: "السعر",
      cells: plans.map((plan) => (
        <span key={plan.code} className="font-semibold tabular-nums">
          {priceLabel(plan, cycle)} ريال{" "}
          <span className="text-[12px] font-normal text-text-muted">{cycleSuffix(cycle)}</span>
        </span>
      )),
    },
    ...limitKeys.map(({ key, label }) => ({
      key: `limit-${key}`,
      label,
      cells: plans.map((plan) => {
        const row = planLimitRows(plan).find((r) => r.key === key);
        return (
          <span key={plan.code} className="tabular-nums">
            {row?.value ?? "—"}
          </span>
        );
      }),
    })),
    ...supportKeys.map(({ key, label }) => ({
      key: `support-${key}`,
      label,
      cells: plans.map((plan) => {
        const row = planSupportRows(plan).find((r) => r.key === key);
        return <span key={plan.code}>{row?.value ?? "—"}</span>;
      }),
    })),
    ...featureKeys.map(({ key, label }) => ({
      key: `feature-${key}`,
      label,
      cells: plans.map((plan) => {
        const cell = planFeatureCells(plan).find((f) => f.key === key);
        return (
          <FeatureMark
            key={plan.code}
            included={Boolean(cell?.included)}
            comingSoon={Boolean(cell?.comingSoon)}
          />
        );
      }),
    })),
  ];

  return (
    <div className="overflow-hidden rounded-[var(--radius-l)] border border-border">
      <table className="w-full border-collapse text-[13.5px]">
        <caption className="sr-only">مقارنة تفصيلية بين باقات مِهلة</caption>
        <thead className="bg-surface-muted">
          <tr>
            <th scope="col" className="p-4 text-start text-[13px] font-bold">
              المقارنة
            </th>
            {plans.map((plan) => (
              <th key={plan.code} scope="col" className="p-4 text-center text-[13px] font-bold">
                {plan.name_ar}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-t border-border bg-surface">
              <th scope="row" className="p-4 text-start font-medium text-muted-foreground">
                {row.label}
              </th>
              {row.cells.map((cell, i) => (
                <td key={plans[i].code} className="p-4 text-center">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
