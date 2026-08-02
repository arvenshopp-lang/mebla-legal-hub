import { createFileRoute } from "@tanstack/react-router";
import { CalendarDays, Download, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { DashboardShell } from "@/components/dashboard/shell";
import { LimitBar, FeatureLine, NoticeBanner, StateBadge } from "@/components/subscription/subscription-ui";
import { useSubscription } from "@/hooks/use-subscription";
import { supabase } from "@/integrations/supabase/client";
import { Badge, Btn, DataCard, EmptyState, ErrorBlock, SectionCard, SectionLoader, Td, Th } from "@/lib/list-utils";
import { fmtDate } from "@/lib/enums";
import {
  SUPPORT_LABELS,
  buildFeatureRows,
  buildLimits,
  expiryNotice,
  remainingLabel,
  STATE_LABELS,
  type SubscriptionState,
} from "@/lib/subscription.shared";

export const Route = createFileRoute("/_authenticated/subscription")({
  head: () => ({
    meta: [
      { title: "الاشتراك · مِهلة" },
      { name: "description", content: "حالة اشتراك مكتبك في مِهلة: الباقة، المدة المتبقية، الحدود المستخدمة والفواتير." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: SubscriptionPage,
});

const SAR = (v: number, currency = "SAR") => `${v.toLocaleString("ar-SA-u-nu-latn")} ${currency}`;

const HISTORY_TONE: Record<string, "green" | "red" | "muted" | "info" | "warn"> = {
  active: "green",
  trial: "info",
  expired: "red",
  cancelled: "muted",
};

function SubscriptionPage() {
  const { overview, isLoading, isError, refetch, isFetching } = useSubscription();

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
                <h2 className="mt-1 text-[24px] font-bold leading-tight">{overview.plan.name_ar}</h2>
                {overview.plan.description && (
                  <p className="mt-1.5 max-w-xl text-[13px] text-muted-foreground">{overview.plan.description}</p>
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
              <InfoCell label="تاريخ البداية" value={overview.subscription ? fmtDate(overview.subscription.starts_at) : "—"} />
              <InfoCell label="تاريخ الانتهاء" value={overview.subscription ? fmtDate(overview.subscription.ends_at) : "—"} />
              <InfoCell
                label="قيمة الاشتراك"
                value={overview.subscription ? SAR(overview.subscription.amount, overview.subscription.currency) : "—"}
              />
              <InfoCell
                label="التجديد التلقائي"
                value={overview.subscription?.auto_renew ? "مفعّل" : "غير مفعّل"}
              />
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
              {buildLimits(overview.plan, overview.usage).map((row) => (
                <LimitBar key={row.key} row={row} />
              ))}
            </div>
          </SectionCard>

          {/* Features */}
          <div className="grid gap-6 lg:grid-cols-2">
            <SectionCard title="مميزات باقتك" description="ما تملكه وما لا تملكه بوضوح">
              <ul className="divide-y divide-border">
                {buildFeatureRows(overview).map((f) => (
                  <FeatureLine key={f.key} label={f.label} available={f.available} requiredPlan={f.requiredPlan} />
                ))}
              </ul>
            </SectionCard>

            <SectionCard title="الدعم ومستوى الخدمة">
              <ul className="divide-y divide-border">
                <FeatureLine
                  label="مستوى الدعم"
                  available
                  value={SUPPORT_LABELS[overview.plan.support_level] ?? overview.plan.support_level}
                />
                <FeatureLine label="زمن الاستجابة (SLA)" available value={`${overview.plan.sla_hours} ساعة`} />
                {(overview.plan.features ?? []).map((extra) => (
                  <FeatureLine key={extra} label={extra} available value="مشمولة" />
                ))}
              </ul>
            </SectionCard>
          </div>

          {/* Upgrade options */}
          {overview.upgrade_plans.length > 0 && (
            <SectionCard title="الترقية" description="اختر الباقة المناسبة وسيتواصل فريق مِهلة لإتمام التفعيل">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {overview.upgrade_plans.map((p) => {
                  const current = p.code === overview.plan.code;
                  return (
                    <div
                      key={p.code}
                      className="rounded-[var(--radius-m)] border border-border bg-surface-muted/50 p-4"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[14px] font-bold">{p.name_ar}</p>
                        {current && <Badge tone="green">باقتك</Badge>}
                      </div>
                      <p className="mt-1.5 text-[13px] tabular-nums text-muted-foreground">
                        {SAR(p.price_monthly)} / شهرياً
                      </p>
                      <p className="mt-2 text-[12px] text-text-muted">
                        {p.max_users === null ? "مستخدمون بلا حد" : `حتى ${p.max_users} مستخدمين`} ·{" "}
                        {p.max_cases === null ? "قضايا بلا حد" : `${p.max_cases} قضية`}
                      </p>
                      {!current && (
                        <div className="mt-3">
                          <Btn
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              toast.success("تم تسجيل طلب الترقية", {
                                description: `سيتواصل فريق مِهلة معك بخصوص ${p.name_ar}.`,
                              })
                            }
                          >
                            طلب الترقية
                          </Btn>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </SectionCard>
          )}

          {/* History */}
          <SectionCard title="سجل الاشتراكات">
            {overview.history.length === 0 ? (
              <EmptyState title="لا توجد اشتراكات سابقة" hint="سيظهر هنا كل اشتراك يتم تفعيله لمكتبك." />
            ) : (
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
                          <Badge tone={HISTORY_TONE[h.status] ?? "muted"}>{STATE_LABELS[h.status as SubscriptionState] ?? h.status}</Badge>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </DataCard>
            )}
          </SectionCard>

          {/* Invoices */}
          <SectionCard title="الفواتير" description="سجل المدفوعات الخاص بمكتبك">
            {overview.invoices.length === 0 ? (
              <EmptyState title="لا توجد فواتير" hint="ستظهر الفواتير بعد أول عملية دفع مسجّلة." />
            ) : (
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
                          <Badge tone={inv.status === "paid" ? "green" : inv.status === "refunded" ? "muted" : "warn"}>
                            {inv.status === "paid" ? "مدفوعة" : inv.status === "refunded" ? "مُستردة" : "غير مدفوعة"}
                          </Badge>
                        </Td>
                        <Td className="text-left">
                          {inv.pdf_path ? (
                            <InvoiceDownload path={inv.pdf_path} />
                          ) : (
                            <span className="text-[12px] text-text-muted">—</span>
                          )}
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </DataCard>
            )}
          </SectionCard>

          <p className="flex items-center gap-2 text-[12px] text-text-muted">
            <CalendarDays className="h-3.5 w-3.5" aria-hidden />
            جميع التواريخ محسوبة بتوقيت الرياض، والحدود مطبّقة على مستوى الخادم.
          </p>
        </div>
      )}
    </DashboardShell>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-m)] bg-surface-muted px-3 py-2.5">
      <dt className="text-[11.5px] text-text-muted">{label}</dt>
      <dd className="mt-0.5 text-[13.5px] font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function InvoiceDownload({ path }: { path: string }) {
  const download = async () => {
    const { data, error } = await supabase.storage.from("documents").createSignedUrl(path, 60);
    if (error || !data?.signedUrl) {
      toast.error("تعذّر تحميل الفاتورة", { description: "حاول مرة أخرى أو تواصل مع الدعم." });
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };
  return (
    <Btn variant="ghost" size="sm" onClick={download}>
      <Download className="h-3.5 w-3.5" aria-hidden /> PDF
    </Btn>
  );
}
