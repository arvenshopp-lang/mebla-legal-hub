import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Info, RefreshCw } from "lucide-react";
import { PageHeading, PublicShell } from "@/components/marketing/public-shell";
import { CycleToggle } from "@/components/marketing/pricing/cycle-toggle";
import { PlanCard } from "@/components/marketing/pricing/plan-card";
import { CompareTable } from "@/components/marketing/pricing/compare-table";
import { publicSiteQueryOptions } from "@/lib/public-site.query";
import { publicPlansQueryOptions } from "@/lib/pricing.query";
import {
  PRICING_FAQ,
  PRICING_NOTES,
  bestYearlySaving,
  cyclePrice,
  highlightedPlanCode,
  type BillingCycle,
  type PublicPlan,
} from "@/lib/pricing.shared";
import { useSurfaceHref } from "@/hooks/use-surface-guard";

const TITLE = "أسعار وباقات مِهلة — منصة إدارة مكاتب المحاماة";
const DESCRIPTION =
  "باقات مِهلة وأسعارها بالريال السعودي: عدد المستخدمين والقضايا والمستندات والمساحة والمزايا المشمولة في كل باقة، بدون التزام دفع قبل إنشاء الحساب.";
const URL = "https://mehlalex.com/pricing";

export const Route = createFileRoute("/pricing")({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(publicSiteQueryOptions());
    // كتالوج الباقات غير حاجز للعرض: تعذّر القراءة يُعالج داخل الصفحة برسالة وإعادة محاولة.
    await context.queryClient.prefetchQuery(publicPlansQueryOptions());
  },
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: URL },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESCRIPTION },
    ],
    links: [{ rel: "canonical", href: URL }],
  }),
  component: PricingRoute,
});

function PlansJsonLd({ plans }: { plans: PublicPlan[] }) {
  if (plans.length === 0) return null;
  const payload = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: "مِهلة | منصة إدارة مكاتب المحاماة",
    description: DESCRIPTION,
    url: URL,
    brand: { "@type": "Brand", name: "مِهلة" },
    offers: plans.map((plan) => ({
      "@type": "Offer",
      name: plan.name_ar,
      price: plan.price_monthly.toFixed(2),
      priceCurrency: plan.currency,
      url: URL,
      availability: "https://schema.org/InStock",
      category: "شهري",
    })),
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(payload).replace(/</g, "\\u003c"),
      }}
    />
  );
}

function StateBox({ title, body, onRetry }: { title: string; body: string; onRetry?: () => void }) {
  return (
    <div className="mx-auto max-w-lg rounded-[var(--radius-l)] border border-border bg-surface p-6 text-center">
      <p className="text-[15px] font-semibold">{title}</p>
      <p className="mt-2 text-body-sm leading-7 text-muted-foreground">{body}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-m)] bg-primary px-5 text-[14px] font-semibold text-primary-foreground transition hover:bg-primary-hover"
        >
          <RefreshCw className="h-4 w-4" aria-hidden />
          إعادة المحاولة
        </button>
      )}
    </div>
  );
}

function PricingRoute() {
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const registerHref = useSurfaceHref("/register");
  const { data, isPending, isError, refetch, isFetching } = useQuery(publicPlansQueryOptions());

  const plans = data ?? [];
  const highlighted = highlightedPlanCode(plans);
  const saving = bestYearlySaving(plans);
  const customPlan = plans.find((p) => cyclePrice(p, cycle) === 0);

  return (
    <PublicShell>
      <PageHeading
        eyebrow="الباقات والأسعار"
        title="اختر الباقة المناسبة لحجم مكتبك"
        intro="كل الباقات تتضمن إدارة القضايا والجلسات والمهل والمهام والمستندات. الفرق في الحدود والمزايا المتقدمة ومستوى الدعم."
      />

      <section className="container-page py-10 md:py-14">
        {plans.length > 0 && (
          <div className="flex justify-center">
            <CycleToggle value={cycle} onChange={setCycle} savingPercent={saving} />
          </div>
        )}

        <div className="mt-8">
          {isPending ? (
            <div
              className="grid gap-5 lg:grid-cols-3"
              aria-busy="true"
              aria-label="جاري تحميل الباقات"
            >
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-[420px] animate-pulse rounded-[var(--radius-l)] border border-border bg-surface-muted"
                />
              ))}
            </div>
          ) : isError ? (
            <StateBox
              title="تعذّر تحميل الباقات"
              body="حدثت مشكلة مؤقتة في جلب الأسعار. أعد المحاولة، أو تواصل معنا لمعرفة الباقة المناسبة لمكتبك."
              onRetry={() => void refetch()}
            />
          ) : plans.length === 0 ? (
            <StateBox
              title="لا توجد باقات منشورة حالياً"
              body="نعمل على تحديث الباقات. تواصل معنا وسنرشدك إلى الخيار المناسب لمكتبك."
            />
          ) : (
            <>
              <div
                className="grid gap-5 lg:grid-cols-3"
                aria-busy={isFetching ? "true" : undefined}
              >
                {plans.map((plan) => (
                  <PlanCard
                    key={plan.code}
                    plan={plan}
                    cycle={cycle}
                    highlighted={plan.code === highlighted}
                    registerHref={registerHref}
                    contactSlot={
                      plan.code === plans[plans.length - 1].code ? (
                        <Link
                          to="/contact"
                          className="mt-2 inline-flex min-h-11 items-center justify-center gap-1.5 text-[13.5px] font-medium text-muted-foreground transition hover:text-foreground"
                        >
                          أو اطلب عرضاً مخصصاً لمؤسستك
                          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
                        </Link>
                      ) : undefined
                    }
                  />
                ))}
              </div>
              {customPlan && (
                <p className="mt-6 text-center text-body-sm text-muted-foreground">
                  باقة {customPlan.name_ar} تُسعَّر حسب الاحتياج بعد التواصل مع فريق مِهلة.
                </p>
              )}
              <PlansJsonLd plans={plans} />
            </>
          )}
        </div>

        <ul className="mx-auto mt-8 grid max-w-3xl gap-2">
          {PRICING_NOTES.map((note) => (
            <li
              key={note}
              className="flex items-start gap-2 text-body-sm leading-7 text-muted-foreground"
            >
              <Info className="mt-1.5 h-4 w-4 shrink-0 text-text-muted" aria-hidden />
              {note}
            </li>
          ))}
        </ul>
      </section>

      {plans.length > 0 && (
        <section className="border-t border-border bg-surface-muted py-10 md:py-14">
          <div className="container-page">
            <h2 className="text-h3">مقارنة تفصيلية</h2>
            <p className="mt-2 text-body-sm text-muted-foreground">
              الحدود والمزايا كما هي مطبّقة فعلياً داخل المنصة.
            </p>
            <div className="mt-6 hidden md:block">
              <CompareTable plans={plans} cycle={cycle} />
            </div>
            <p className="mt-6 text-body-sm text-muted-foreground md:hidden">
              تفاصيل كل باقة معروضة كاملة في بطاقات الأعلى.
            </p>
          </div>
        </section>
      )}

      <section className="border-t border-border py-10 md:py-14">
        <div className="container-page">
          <h2 className="text-h3">أسئلة متكررة عن الباقات</h2>
          <dl className="mt-6 grid gap-px overflow-hidden rounded-[var(--radius-l)] border border-border bg-border md:grid-cols-2">
            {PRICING_FAQ.map((item) => (
              <div key={item.q} className="bg-surface p-6">
                <dt className="text-[14.5px] font-bold">{item.q}</dt>
                <dd className="mt-2 text-body-sm leading-7 text-muted-foreground">{item.a}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-6 text-body-sm text-muted-foreground">
            لمزيد من التفاصيل راجع{" "}
            <Link to="/faq" className="font-semibold text-foreground underline underline-offset-4">
              الأسئلة الشائعة
            </Link>{" "}
            أو{" "}
            <Link
              to="/contact"
              className="font-semibold text-foreground underline underline-offset-4"
            >
              تواصل معنا
            </Link>
            .
          </p>
        </div>
      </section>
    </PublicShell>
  );
}
