import { Link } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import type { ReactNode } from "react";
import { Btn, SectionLoader } from "@/lib/list-utils";
import { useSubscription } from "@/hooks/use-subscription";
import { FEATURE_LABELS, findRequiredPlan, type PlanFeatureKey } from "@/lib/subscription.shared";

/**
 * Presentational upsell surface. The real gate is enforced server-side —
 * this only replaces raw errors with professional Arabic copy.
 */
export function UpgradeNotice({
  feature,
  currentPlan,
  requiredPlan,
}: {
  feature: PlanFeatureKey;
  currentPlan: string;
  requiredPlan: string | null;
}) {
  return (
    <div className="surface-card mx-auto max-w-xl p-6 text-center sm:p-8">
      <span
        className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-surface-muted text-muted-foreground"
        aria-hidden
      >
        <Lock className="h-5 w-5" />
      </span>
      <h2 className="mt-4 text-[17px] font-bold">هذه الميزة غير متوفرة ضمن باقتك الحالية</h2>
      <p className="mt-1.5 text-[13px] text-muted-foreground">{FEATURE_LABELS[feature]}</p>
      <dl className="mt-5 grid gap-3 text-right sm:grid-cols-2">
        <div className="rounded-[var(--radius-m)] bg-surface-muted px-3 py-2.5">
          <dt className="text-[11.5px] text-text-muted">باقتك الحالية</dt>
          <dd className="text-[13.5px] font-semibold">{currentPlan}</dd>
        </div>
        <div className="rounded-[var(--radius-m)] bg-surface-muted px-3 py-2.5">
          <dt className="text-[11.5px] text-text-muted">الباقة المطلوبة</dt>
          <dd className="text-[13.5px] font-semibold">{requiredPlan ?? "باقة أعلى"}</dd>
        </div>
      </dl>
      <div className="mt-6">
        <Link to="/subscription">
          <Btn>ترقية الباقة</Btn>
        </Link>
      </div>
    </div>
  );
}

/** Renders children only when the plan includes the capability. */
export function FeatureGate({
  feature,
  children,
}: {
  feature: PlanFeatureKey;
  children: ReactNode;
}) {
  const { overview, isLoading, can } = useSubscription();
  if (isLoading) return <SectionLoader label="جاري التحقق من الباقة…" />;
  if (can(feature)) return <>{children}</>;
  return (
    <UpgradeNotice
      feature={feature}
      currentPlan={overview?.plan.name_ar ?? "الباقة المجانية"}
      requiredPlan={overview ? findRequiredPlan(feature, overview.upgrade_plans) : null}
    />
  );
}
