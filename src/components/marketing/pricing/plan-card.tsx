import { ArrowLeft, Check, Clock3, CreditCard, Minus, Sparkles } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Riyal } from "@/components/ui/riyal";
import { cn } from "@/lib/utils";
import { fmtNumber } from "@/lib/format";
import { useAuth } from "@/hooks/use-auth";
import { useSubscription } from "@/hooks/use-subscription";
import {
  cycleSuffix,
  monthlyEquivalent,
  planFeatureCells,
  planLimitRows,
  planSupportRows,
  priceLabel,
  type BillingCycle,
  type PublicPlan,
} from "@/lib/pricing.shared";

/** بطاقة باقة واحدة — كل الأرقام والمزايا من كتالوج المنصة. */
export function PlanCard({
  plan,
  cycle,
  highlighted,
  registerHref,
  contactSlot,
}: {
  plan: PublicPlan;
  cycle: BillingCycle;
  highlighted: boolean;
  registerHref: string;
  contactSlot?: React.ReactNode;
}) {
  const { user } = useAuth();
  const { overview } = useSubscription();

  const isCurrentPlan = Boolean(user && overview && overview.plan.code === plan.code);
  const isUpgrade = Boolean(
    user && overview && plan.price_monthly > (overview.plan.price_monthly ?? 0),
  );
  const isDowngrade = Boolean(
    user && overview && !isCurrentPlan && !isUpgrade && plan.price_monthly <= (overview.plan.price_monthly ?? 0),
  );

  const features = planFeatureCells(plan);
  const limits = planLimitRows(plan);
  const support = planSupportRows(plan);
  const headingId = `plan-${plan.code}`;

  return (
    <article
      aria-labelledby={headingId}
      className={cn(
        "flex h-full flex-col rounded-[var(--radius-l)] border p-6 transition-all",
        isCurrentPlan
          ? "border-primary ring-2 ring-primary/20 bg-primary/5 shadow-md"
          : highlighted
            ? "border-primary bg-surface shadow-[0_1px_0_0_var(--color-primary)]"
            : "border-border bg-surface",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 id={headingId} className="text-h4">
          {plan.name_ar}
        </h3>
        {isCurrentPlan ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-[11.5px] font-bold text-primary-foreground">
            <Check className="h-3 w-3" /> باقتك الحالية
          </span>
        ) : isUpgrade ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 border border-primary/20 px-2.5 py-1 text-[11.5px] font-bold text-primary">
            <Sparkles className="h-3 w-3" /> ترقية متاحة
          </span>
        ) : highlighted ? (
          <span className="rounded-full bg-primary px-2.5 py-1 text-[11.5px] font-bold text-primary-foreground">
            الأكثر ملاءمة
          </span>
        ) : null}
      </div>

      {plan.description && (
        <p className="mt-2 text-body-sm leading-7 text-muted-foreground">{plan.description}</p>
      )}

      <p className="mt-5 flex flex-wrap items-baseline gap-1.5">
        <span
          className="inline-flex items-center gap-1.5 text-[30px] font-bold leading-none tabular-nums"
          dir="ltr"
        >
          {priceLabel(plan, cycle)}
          <Riyal className="text-muted-foreground" />
          <span className="sr-only">ريال سعودي</span>
        </span>
        <span className="text-[13px] text-text-muted">{cycleSuffix(cycle)}</span>
      </p>
      {cycle === "yearly" && plan.price_yearly > 0 && (
        <p className="mt-1.5 text-[12.5px] text-text-muted">
          ما يعادل{" "}
          <span className="inline-flex items-center gap-1 tabular-nums" dir="ltr">
            {fmtNumber(Math.round(monthlyEquivalent(plan)))}
            <Riyal />
            <span className="sr-only">ريال سعودي</span>
          </span>{" "}
          شهرياً
        </p>
      )}

      {/* أزرار الإجراء الذكية: تميز بين الزائر والمستخدم المسجل */}
      {user ? (
        isCurrentPlan ? (
          <Link
            to="/subscription"
            className="mt-6 inline-flex min-h-12 items-center justify-center gap-2 rounded-[var(--radius-m)] bg-primary/15 border border-primary/30 px-5 text-[14px] font-bold text-primary transition hover:bg-primary/25"
          >
            <Check className="h-4 w-4" /> باقتك الحالية — إدارة الاشتراك
          </Link>
        ) : isUpgrade ? (
          <Link
            to="/subscription"
            className="mt-6 inline-flex min-h-12 items-center justify-center gap-2 rounded-[var(--radius-m)] bg-primary px-5 text-[14px] font-bold text-primary-foreground shadow-sm transition hover:bg-primary-hover"
          >
            <CreditCard className="h-4 w-4" /> ترقية إلى {plan.name_ar}{" "}
            <ArrowLeft className="h-4 w-4" aria-hidden />
          </Link>
        ) : isDowngrade ? (
          <Link
            to="/subscription"
            className="mt-6 inline-flex min-h-12 items-center justify-center gap-2 rounded-[var(--radius-m)] border border-border bg-surface-muted px-5 text-[13.5px] font-medium text-muted-foreground transition hover:text-foreground"
          >
            مشمولة في باقتك الحالية
          </Link>
        ) : (
          <Link
            to="/subscription"
            className="mt-6 inline-flex min-h-12 items-center justify-center gap-2 rounded-[var(--radius-m)] border border-border-strong px-5 text-[14px] font-semibold transition hover:bg-surface-muted"
          >
            اختيار الباقة <ArrowLeft className="h-4 w-4" aria-hidden />
          </Link>
        )
      ) : (
        <a
          href={`${registerHref}${registerHref.includes("?") ? "&" : "?"}plan=${plan.code}`}
          className={cn(
            "mt-6 inline-flex min-h-12 items-center justify-center gap-2 rounded-[var(--radius-m)] px-5 text-[14.5px] font-semibold transition",
            highlighted
              ? "bg-primary text-primary-foreground hover:bg-primary-hover"
              : "border border-border-strong hover:bg-surface-muted",
          )}
        >
          ابدأ الآن <ArrowLeft className="h-4 w-4" aria-hidden />
        </a>
      )}
      {contactSlot}

      <dl className="mt-6 grid gap-2 border-t border-border pt-5">
        {[...limits, ...support].map((row) => (
          <div key={row.key} className="flex items-baseline justify-between gap-3">
            <dt className="text-[13px] text-muted-foreground">{row.label}</dt>
            <dd className="text-[13px] font-semibold tabular-nums">{row.value}</dd>
          </div>
        ))}
      </dl>

      <ul className="mt-5 grid gap-2 border-t border-border pt-5">
        {features.map((f) => (
          <li key={f.key} className="flex items-start gap-2 text-[13px]">
            {f.comingSoon ? (
              <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
            ) : f.included ? (
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
            ) : (
              <Minus className="mt-0.5 h-4 w-4 shrink-0 text-text-muted" aria-hidden />
            )}
            <span className={f.included ? "text-foreground" : "text-text-muted"}>
              {f.label}
              {f.comingSoon && <span className="text-[12px] text-warning"> — قريباً</span>}
              {!f.included && <span className="sr-only"> غير مشمولة في هذه الباقة</span>}
            </span>
          </li>
        ))}
      </ul>
    </article>
  );
}
