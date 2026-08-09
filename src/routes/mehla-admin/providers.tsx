import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, PlugZap, ShieldAlert } from "lucide-react";
import { AdminShell } from "@/components/admin/shell";
import { Badge, Btn, EmptyState, ErrorBlock, LoadingBlock, SectionCard } from "@/lib/list-utils";
import { fmtDateTime } from "@/lib/enums";
import {
  getProvidersReadiness,
  verifyProviderConnection,
} from "@/lib/providers/readiness.functions";
import {
  DOMAIN_LABELS,
  READINESS_LABELS,
  READINESS_TONES,
  missingFields,
  readinessSummary,
  type ProviderDomain,
  type ProviderReadiness,
} from "@/lib/providers/readiness.shared";

export const Route = createFileRoute("/mehla-admin/providers")({
  component: ProvidersReadinessPage,
  head: () => ({
    meta: [
      { title: "جاهزية المزوّدين · إدارة مِهلة" },
      {
        name: "description",
        content:
          "حالة كل مزوّد خارجي في مِهلة: الدفع والرسائل وواتساب الرسمي، مع الحقول الناقصة وفحص الاتصال الفعلي.",
      },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "جاهزية المزوّدين · إدارة مِهلة" },
      {
        property: "og:description",
        content: "متابعة حالة الربط والحقول الناقصة وفحص الاتصال لكل مزوّد خارجي.",
      },
    ],
  }),
});

const DOMAIN_ORDER: ProviderDomain[] = ["payment", "otp", "whatsapp"];

function FieldRow({ label, present, hint }: { label: string; present: boolean; hint: string | null }) {
  return (
    <li className="flex items-start justify-between gap-3 py-1.5">
      <span className="flex min-w-0 items-start gap-2">
        {present ? (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
        ) : (
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
        )}
        <span className="min-w-0 text-[13px] leading-6">
          {label}
          {hint && present && (
            <span className="text-caption block font-mono" dir="ltr">
              {hint}
            </span>
          )}
        </span>
      </span>
      <span className="shrink-0 text-[11px] font-semibold">
        {present ? (
          <span className="text-success">محفوظ</span>
        ) : (
          <span className="text-warning">ناقص</span>
        )}
      </span>
    </li>
  );
}

function ProviderCard({
  provider,
  verifying,
  onVerify,
}: {
  provider: ProviderReadiness;
  verifying: boolean;
  onVerify: () => void;
}) {
  const missing = missingFields(provider);
  return (
    <article className="surface-card flex flex-col gap-4 p-5">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-body font-semibold">{provider.name}</h3>
          {provider.description && <p className="text-caption mt-0.5">{provider.description}</p>}
        </div>
        <Badge tone={READINESS_TONES[provider.status]}>{READINESS_LABELS[provider.status]}</Badge>
      </header>

      {provider.fields.length > 0 ? (
        <div>
          <p className="text-caption mb-1 font-semibold">حقول الربط المطلوبة</p>
          <ul className="divide-y divide-border">
            {provider.fields.map((field) => (
              <FieldRow
                key={field.key}
                label={field.required ? field.label : `${field.label} (اختياري)`}
                present={field.present}
                hint={field.hint}
              />
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-caption">لا يحتاج هذا المزوّد أي بيانات ربط.</p>
      )}

      {missing.length > 0 && (
        <div className="rounded-[var(--radius-m)] bg-warning-soft px-3 py-2 text-[12px] text-warning">
          لا يمكن اعتماد المزوّد قبل إكمال: {missing.map((field) => field.label).join(" · ")}
        </div>
      )}

      <dl className="text-caption grid gap-1.5">
        <div className="flex justify-between gap-2">
          <dt>آخر فحص اتصال</dt>
          <dd className="font-medium text-foreground">
            {provider.lastCheckedAt ? fmtDateTime(provider.lastCheckedAt) : "لم يُفحص بعد"}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt>حالة التشغيل</dt>
          <dd className="font-medium text-foreground">
            {provider.isEnabled ? "مفعّل" : "غير مفعّل"}
          </dd>
        </div>
      </dl>

      {provider.lastError && (
        <p className="rounded-[var(--radius-m)] bg-danger-soft px-3 py-2 text-[12px] text-danger">
          آخر خطأ مسجّل: {provider.lastError}
        </p>
      )}

      <footer className="mt-auto flex flex-wrap items-center gap-2">
        <Btn
          size="sm"
          onClick={onVerify}
          loading={verifying}
          disabled={!provider.canVerify}
          title={provider.verifyBlockedReason ?? undefined}
        >
          <PlugZap className="h-4 w-4" aria-hidden />
          فحص الاتصال
        </Btn>
        <Link
          to={provider.manageTo}
          className="text-[13px] font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {provider.manageLabel}
        </Link>
      </footer>
      {!provider.canVerify && provider.verifyBlockedReason && (
        <p className="text-caption">{provider.verifyBlockedReason}</p>
      )}
    </article>
  );
}

function ProvidersReadinessPage() {
  const qc = useQueryClient();
  const readFn = useServerFn(getProvidersReadiness);
  const verifyFn = useServerFn(verifyProviderConnection);
  const [pending, setPending] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["providers-readiness"],
    queryFn: () => readFn({ data: undefined }),
  });

  const verify = useMutation({
    mutationFn: (input: { domain: ProviderDomain; key: string }) => verifyFn({ data: input }),
    onMutate: (input) => setPending(`${input.domain}:${input.key}`),
    onSettled: () => setPending(null),
    onSuccess: (result) => {
      if (result.ok) toast.success(result.message);
      else
        toast.error(
          result.missing.length
            ? `${result.message} الحقول الناقصة: ${result.missing.join(" · ")}`
            : result.message,
        );
      void qc.invalidateQueries({ queryKey: ["providers-readiness"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const providers = query.data?.providers ?? [];
  const summary = useMemo(() => readinessSummary(providers), [providers]);

  return (
    <AdminShell
      title="جاهزية المزوّدين"
      description="حالة كل مزوّد خارجي مع الحقول الناقصة وفحص اتصال فعلي قبل الاعتماد."
    >
      {query.isLoading ? (
        <LoadingBlock rows={4} cols={3} />
      ) : query.isError ? (
        <ErrorBlock message="تعذّر تحميل حالة المزوّدين." />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {(
              ["connected", "not_verified", "incomplete", "not_linked", "failed"] as const
            ).map((status) => (
              <div key={status} className="surface-card p-4">
                <p className="text-caption">{READINESS_LABELS[status]}</p>
                <p className="text-h3 mt-1">{summary[status]}</p>
              </div>
            ))}
          </div>

          {query.data?.restrictedDomains.length ? (
            <p className="surface-card flex items-center gap-2 p-4 text-[13px] text-muted-foreground">
              <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden />
              نطاقات مخفية لعدم كفاية صلاحياتك:{" "}
              {query.data.restrictedDomains.map((domain) => DOMAIN_LABELS[domain]).join(" · ")}
            </p>
          ) : null}

          {DOMAIN_ORDER.map((domain) => {
            const rows = providers.filter((provider) => provider.domain === domain);
            if (rows.length === 0) return null;
            return (
              <SectionCard key={domain} title={DOMAIN_LABELS[domain]}>
                <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
                  {rows.map((provider) => (
                    <ProviderCard
                      key={`${provider.domain}:${provider.key}`}
                      provider={provider}
                      verifying={pending === `${provider.domain}:${provider.key}`}
                      onVerify={() =>
                        verify.mutate({ domain: provider.domain, key: provider.key })
                      }
                    />
                  ))}
                </div>
              </SectionCard>
            );
          })}

          {providers.length === 0 && (
            <EmptyState
              title="لا توجد مزوّدات متاحة لصلاحياتك"
              hint="راجع صلاحيات حسابك أو أضف مزوّداً من مركز التكاملات."
            />
          )}
        </div>
      )}
    </AdminShell>
  );
}
