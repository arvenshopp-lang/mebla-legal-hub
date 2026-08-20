import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Money } from "@/components/ui/money";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { CalendarDays, CreditCard, Download, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { DashboardShell } from "@/components/dashboard/shell";
import {
  LimitBar,
  FeatureLine,
  NoticeBanner,
  StateBadge,
} from "@/components/subscription/subscription-ui";
import { useAuth } from "@/hooks/use-auth";
import { useSubscription } from "@/hooks/use-subscription";
import {
  createSubscriptionMoyasarPayment,
  signInvoiceUrl,
  verifyAndActivateSubscriptionPayment,
} from "@/lib/subscription.functions";
import {
  Badge,
  Btn,
  DataCard,
  ErrorBlock,
  SectionCard,
  SectionLoader,
  Td,
  Th,
} from "@/lib/list-utils";
import { fmtDate } from "@/lib/enums";
import { PaymentMethodsBar } from "@/components/ui/payment-icons";
import {
  buildFeatureRows,
  buildLimits,
  expiryNotice,
  remainingLabel,
  STATE_LABELS,
  type FeatureRow,
  type LimitRow,
  type SubscriptionState,
} from "@/lib/subscription.shared";

export const Route = createFileRoute("/_authenticated/subscription")({
  validateSearch: (search: Record<string, unknown>) => ({
    payment: typeof search.payment === "string" ? search.payment : undefined,
    org: typeof search.org === "string" ? search.org : undefined,
    plan: typeof search.plan === "string" ? search.plan : undefined,
    cycle: typeof search.cycle === "string" ? search.cycle : undefined,
    id: typeof search.id === "string" ? search.id : undefined,
    status: typeof search.status === "string" ? search.status : undefined,
    message: typeof search.message === "string" ? search.message : undefined,
  }),
  head: () => ({
    meta: [
      { title: "الاشتراك · مِهلة" },
      {
        name: "description",
        content: "حالة اشتراك مكتبك في مِهلة: الباقة، المدة المتبقية، الحدود المستخدمة والفواتير.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: SubscriptionPage,
});

const SAR = (v: number, currency = "SAR") =>
  currency.toUpperCase() === "SAR" ? (
    <Money value={v} decimals={false} />
  ) : (
    <span className="tabular-nums">{`${v.toLocaleString("ar-SA-u-nu-latn")} ${currency}`}</span>
  );

const HISTORY_TONE: Record<string, "green" | "red" | "muted" | "info" | "warn"> = {
  active: "green",
  trial: "info",
  expired: "red",
  cancelled: "muted",
};

/** الأقرب للامتلاء أولاً؛ الحدود غير المحدودة في النهاية. */
function sortLimits(rows: LimitRow[]): LimitRow[] {
  return [...rows].sort((a, b) => {
    if (a.percent === null && b.percent === null) return 0;
    if (a.percent === null) return 1;
    if (b.percent === null) return -1;
    return b.percent - a.percent;
  });
}

/** المميزات المتاحة أولاً مع الحفاظ على الترتيب داخل كل مجموعة. */
function sortFeatures(rows: FeatureRow[]): FeatureRow[] {
  return [...rows].sort((a, b) => Number(b.available) - Number(a.available));
}

function SubscriptionPage() {
  const { activeOrgId } = useAuth();
  const searchParams = Route.useSearch();
  const { overview, isLoading, isError, refetch, isFetching } = useSubscription();
  const payFn = useServerFn(createSubscriptionMoyasarPayment);
  const verifyFn = useServerFn(verifyAndActivateSubscriptionPayment);
  const [upgradingCode, setUpgradingCode] = useState<string | null>(null);

  // Auto-verify payment when redirected back from Moyasar
  useEffect(() => {
    if (searchParams?.payment === "success" || searchParams?.status === "paid") {
      const targetOrg = searchParams.org || activeOrgId;
      const targetPlan = searchParams.plan || "basic";
      const targetCycle = (searchParams.cycle === "yearly" ? "yearly" : "monthly") as
        | "monthly"
        | "yearly";
      const moyasarId = searchParams.id;

      if (targetOrg) {
        toast.promise(
          verifyFn({
            data: {
              organizationId: targetOrg,
              planCode: targetPlan,
              billingCycle: targetCycle,
              moyasarId,
            },
          }).then((res) => {
            void refetch();
            window.history.replaceState({}, document.title, "/subscription");
            return res;
          }),
          {
            loading: "جاري التحقق من عملية السداد وتفعيل الباقة…",
            success: (data) => `🎉 تم تفعيل اشتراك مكتبك في باقة ${data.planName} بنجاح!`,
            error: (err) => err?.message || "تعذّر تأكيد عملية السداد.",
          },
        );
      }
    } else if (searchParams?.status === "failed") {
      toast.error("لم تكتمل عملية الدفع أو تم إلغاؤها من قبلك.");
      window.history.replaceState({}, document.title, "/subscription");
    }
  }, [searchParams, activeOrgId]);

  const upgradeMutation = useMutation({
    mutationFn: async (planCode: string) => {
      if (!activeOrgId) throw new Error("لم يتم تحديد المنظمة.");
      setUpgradingCode(planCode);
      return payFn({
        data: {
          organizationId: activeOrgId,
          planCode,
          billingCycle: "monthly",
        },
      });
    },
    onSuccess: (result) => {
      const data = result as { redirectUrl: string; planName: string };
      toast.success(`تم إنشاء رابط السداد لباقة ${data.planName}. جاري التحويل لصفحة السداد…`);
      if (data.redirectUrl) {
        window.location.href = data.redirectUrl;
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || "تعذّر بدء عملية الدفع.");
    },
    onSettled: () => {
      setUpgradingCode(null);
    },
  });

  const higherPlans = (overview?.upgrade_plans ?? [])
    .filter(
      (p) =>
        p.code !== overview?.plan.code && p.price_monthly > (overview?.plan.price_monthly ?? 0),
    )
    .sort((a, b) => a.sort_order - b.sort_order);

  return (
    <DashboardShell
      title="الاشتراك"
      description="باقتك الحالية، المدة المتبقية، والحدود المستخدمة"
      actions={
        <Btn variant="ghost" onClick={() => void refetch()} loading={isFetching}>
          <RefreshCw className="h-4 w-4" aria-hidden /> تحديث
        </Btn>
      }
    >
      {isError ? (
        <ErrorBlock message="تعذّر تحميل بيانات الاشتراك. حاول تحديث الصفحة." />
      ) : isLoading || !overview ? (
        <SectionLoader label="جاري تحميل بيانات الاشتراك…" rows={6} />
      ) : (
        <div className="space-y-6">
          <NoticeBanner notice={expiryNotice(overview)} />

          {/* Plan hero */}
          <section className="surface-card relative overflow-hidden p-5 sm:p-6">
            <span className="absolute inset-y-0 right-0 w-[3px] bg-primary" aria-hidden />
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[12px] text-muted-foreground">الباقة الحالية</p>
                <h2 className="mt-1 text-[24px] font-bold leading-tight">
                  {overview.plan.name_ar}
                </h2>
                {overview.plan.description && (
                  <p className="mt-1.5 max-w-xl text-[13px] text-muted-foreground">
                    {overview.plan.description}
                  </p>
                )}
              </div>
              <div className="flex flex-col items-end gap-2">
                <StateBadge state={overview.state as SubscriptionState} />
                <p className="text-[13px] font-semibold">
                  {remainingLabel(overview.state, overview.subscription?.days_remaining ?? null)}
                </p>
              </div>
            </div>

            <dl className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <InfoCell
                label="تاريخ البداية"
                value={overview.subscription ? fmtDate(overview.subscription.starts_at) : "—"}
              />
              <InfoCell
                label="تاريخ الانتهاء"
                value={overview.subscription ? fmtDate(overview.subscription.ends_at) : "—"}
              />
              <InfoCell
                label="قيمة الاشتراك"
                value={
                  overview.subscription
                    ? SAR(overview.subscription.amount, overview.subscription.currency)
                    : "—"
                }
              />
              {overview.subscription && (
                <InfoCell
                  label="التجديد التلقائي"
                  value={overview.subscription.auto_renew ? "مفعّل" : "غير مفعّل"}
                />
              )}
            </dl>

            {overview.subscription?.suspension_reason && overview.state === "suspended" && (
              <p className="mt-4 rounded-[var(--radius-m)] bg-warning-soft px-3 py-2.5 text-[12.5px] text-warning">
                سبب الإيقاف: {overview.subscription.suspension_reason}
              </p>
            )}
          </section>

          {/* Limits */}
          <SectionCard title="الحدود والاستخدام" description="أرقام فعلية محسوبة من بيانات مكتبك">
            <div className="grid gap-5 sm:grid-cols-2">
              {sortLimits(buildLimits(overview.plan, overview.usage)).map((row) => (
                <LimitBar key={row.key} row={row} />
              ))}
            </div>
          </SectionCard>

          {/* Features */}
          <SectionCard title="مميزات باقتك" description="ما هو متاح لك الآن وما يحتاج ترقية">
            <ul className="divide-y divide-border">
              {sortFeatures(buildFeatureRows(overview)).map((f) => (
                <FeatureLine
                  key={f.key}
                  label={f.label}
                  available={f.available}
                  requiredPlan={f.requiredPlan}
                />
              ))}
              {(overview.plan.features ?? []).map((extra) => (
                <FeatureLine key={extra} label={extra} available value="مشمولة" />
              ))}
            </ul>
          </SectionCard>

          {/* Upgrade options — الباقات الأعلى من باقتك الحالية فقط */}
          {higherPlans.length > 0 && (
            <SectionCard
              title="ترقية الباقة وسداد فوري"
              description="اختر باقتك المفضلة للدفع الفوري والتفعيل الآلي عبر مدى، Apple Pay، أو البطاقات الائتمانية"
            >
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {higherPlans.map((p) => (
                  <div
                    key={p.code}
                    className="flex flex-col justify-between rounded-[var(--radius-l)] border border-primary/20 bg-gradient-to-b from-surface to-surface-muted/40 p-5 shadow-sm transition-all hover:border-primary/40 hover:shadow-md"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <p className="text-[15px] font-bold text-foreground">{p.name_ar}</p>
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                          <Sparkles className="h-3 w-3" /> مميزة
                        </span>
                      </div>
                      <p className="mt-2 text-[20px] font-extrabold tabular-nums text-primary">
                        {SAR(p.price_monthly)} <span className="text-[12px] font-normal text-muted-foreground">/ شهرياً</span>
                      </p>
                      <p className="mt-2.5 text-[12px] text-muted-foreground leading-relaxed">
                        {p.max_users === null ? "👥 مستخدمون بلا حد" : `👥 حتى ${p.max_users} مستخدمين`} ·{" "}
                        {p.max_cases === null ? "📁 قضايا بلا حد" : `📁 ${p.max_cases} قضية`}
                      </p>
                    </div>

                    <div className="mt-5 pt-3 border-t border-border/60">
                      <Btn
                        variant="primary"
                        className="w-full justify-center gap-2 font-medium"
                        loading={upgradingCode === p.code && upgradeMutation.isPending}
                        onClick={() => upgradeMutation.mutate(p.code)}
                      >
                        <CreditCard className="h-4 w-4" /> ترقية وسداد فوري
                      </Btn>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4 text-[12.5px] text-muted-foreground">
                <PaymentMethodsBar showLabel={true} />
                <div className="flex flex-wrap gap-2">
                  <Link to="/pricing">
                    <Btn variant="ghost" size="sm">مقارنة الباقات</Btn>
                  </Link>
                  <Link to="/contact">
                    <Btn variant="ghost" size="sm">تواصل مع الدعم</Btn>
                  </Link>
                </div>
              </div>
            </SectionCard>
          )}

          {/* History — يظهر فقط عند وجود سجل فعلي */}
          {overview.history.length > 0 && (
            <SectionCard title="سجل الاشتراكات">
              <DataCard>
                <table className="w-full min-w-[620px] text-right">
                  <thead>
                    <tr>
                      <Th>الباقة</Th>
                      <Th>من</Th>
                      <Th>إلى</Th>
                      <Th>القيمة</Th>
                      <Th>الحالة</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {overview.history.map((h) => (
                      <tr key={h.id}>
                        <Td>{h.plan_label}</Td>
                        <Td>{fmtDate(h.starts_at)}</Td>
                        <Td>{fmtDate(h.ends_at)}</Td>
                        <Td className="tabular-nums">{SAR(h.amount, h.currency)}</Td>
                        <Td>
                          <Badge tone={HISTORY_TONE[h.status] ?? "muted"}>
                            {STATE_LABELS[h.status as SubscriptionState] ?? h.status}
                          </Badge>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </DataCard>
            </SectionCard>
          )}

          {/* Invoices — يظهر فقط عند وجود فواتير فعلية */}
          {overview.invoices.length > 0 && (
            <SectionCard title="فواتير الاشتراك" description="سجل مدفوعات اشتراك مكتبك في مِهلة">
              <DataCard>
                <table className="w-full min-w-[680px] text-right">
                  <thead>
                    <tr>
                      <Th>رقم الفاتورة</Th>
                      <Th>المبلغ</Th>
                      <Th>تاريخ الدفع</Th>
                      <Th>طريقة الدفع</Th>
                      <Th>الحالة</Th>
                      <Th className="text-left">الملف</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {overview.invoices.map((inv) => (
                      <tr key={inv.id}>
                        <Td>{inv.number}</Td>
                        <Td className="tabular-nums">{SAR(inv.amount, inv.currency)}</Td>
                        <Td>{inv.paid_at ? fmtDate(inv.paid_at) : "—"}</Td>
                        <Td>{inv.payment_method ?? "—"}</Td>
                        <Td>
                          <Badge
                            tone={
                              inv.status === "paid"
                                ? "green"
                                : inv.status === "refunded"
                                  ? "muted"
                                  : "warn"
                            }
                          >
                            {inv.status === "paid"
                              ? "مدفوعة"
                              : inv.status === "refunded"
                                ? "مُستردة"
                                : "غير مدفوعة"}
                          </Badge>
                        </Td>
                        <Td className="text-left">
                          {inv.pdf_path ? (
                            <InvoiceDownload invoiceId={inv.id} organizationId={activeOrgId!} />
                          ) : (
                            <span className="text-[12px] text-text-muted">—</span>
                          )}
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </DataCard>
            </SectionCard>
          )}

          <p className="flex items-center gap-2 text-[12px] text-text-muted">
            <CalendarDays className="h-3.5 w-3.5" aria-hidden />
            جميع التواريخ محسوبة بتوقيت الرياض، والحدود مطبّقة على مستوى الخادم.
          </p>
        </div>
      )}
    </DashboardShell>
  );
}

function InfoCell({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-[var(--radius-m)] bg-surface-muted px-3 py-2.5">
      <dt className="text-[11.5px] text-text-muted">{label}</dt>
      <dd className="mt-0.5 text-[13.5px] font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function InvoiceDownload({
  invoiceId,
  organizationId,
}: {
  invoiceId: string;
  organizationId: string;
}) {
  const sign = useServerFn(signInvoiceUrl);
  const [busy, setBusy] = useState(false);
  const download = async () => {
    setBusy(true);
    try {
      const { url } = await sign({ data: { organizationId, invoiceId } });
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      toast.error("تعذّر تحميل الفاتورة", { description: "حاول مرة أخرى أو تواصل مع الدعم." });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Btn variant="ghost" size="sm" onClick={() => void download()} loading={busy}>
      <Download className="h-3.5 w-3.5" aria-hidden /> PDF
    </Btn>
  );
}
