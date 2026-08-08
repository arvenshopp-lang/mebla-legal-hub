import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  CreditCard,
  Database,
  Mail,
  MessageSquare,
  ShieldCheck,
} from "lucide-react";
import { AdminShell } from "@/components/admin/shell";
import {
  Badge,
  Btn,
  DataCard,
  ErrorBlock,
  SectionCard,
  StatsSkeleton,
  Td,
  Th,
} from "@/lib/list-utils";
import { fmtDateTime } from "@/lib/enums";
import { getServiceHealth } from "@/lib/admin-console.functions";
import { fmtBytes, fmtNumber, type ServiceIntegration } from "@/lib/admin-console.shared";

export const Route = createFileRoute("/mehla-admin/services")({
  head: () => ({
    meta: [
      { title: "حالة الخدمات · إدارة مِهلة" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ServicesPage,
});

const statusTone = (s: string): "green" | "red" | "warn" | "muted" =>
  s === "healthy" || s === "ok"
    ? "green"
    : s === "degraded"
      ? "warn"
      : s === "down" || s === "error"
        ? "red"
        : "muted";

const statusLabel = (s: string) =>
  ({ healthy: "سليمة", ok: "سليمة", degraded: "متذبذبة", down: "متوقفة", error: "خطأ" })[s] ??
  "غير مفحوصة";

function ServicesPage() {
  const fn = useServerFn(getServiceHealth);
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["admin-service-health"],
    queryFn: () => fn({ data: undefined }),
    refetchInterval: 60_000,
  });

  return (
    <AdminShell
      title="حالة الخدمات"
      description="مؤشرات فعلية للتكاملات والبريد والرسائل والمدفوعات وقاعدة البيانات."
      actions={
        <Btn variant="outline" size="sm" loading={isFetching} onClick={() => refetch()}>
          تحديث الآن
        </Btn>
      }
    >
      {isLoading ? (
        <StatsSkeleton count={4} />
      ) : isError || !data ? (
        <ErrorBlock message="تعذّر قراءة حالة الخدمات." />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Tile
              Icon={Mail}
              label="نقل البريد"
              value={`${fmtNumber(data.email_transport.mailboxes_active)} صندوقاً نشطاً`}
              tone={data.email_transport.failed_runs_24h > 0 ? "warn" : "green"}
              hint={`آخر نجاح: ${data.email_transport.last_success_at ? fmtDateTime(data.email_transport.last_success_at) : "—"}`}
            />
            <Tile
              Icon={MessageSquare}
              label="الرسائل النصية (24 ساعة)"
              value={`${fmtNumber(data.sms.sent_24h)} مُرسلة`}
              tone={data.sms.failed_24h > 0 ? "warn" : "green"}
              hint={`فشل: ${fmtNumber(data.sms.failed_24h)} · رموز تحقق معلّقة: ${fmtNumber(data.otp.pending)}`}
            />
            <Tile
              Icon={CreditCard}
              label="المدفوعات"
              value={`${fmtNumber(data.payments.providers_active)} مزوّداً مُفعّلاً`}
              tone={data.payments.webhooks_pending > 0 ? "warn" : "green"}
              hint={`محاولات 24 ساعة: ${fmtNumber(data.payments.attempts_24h)} · ويبهوك معلّق: ${fmtNumber(data.payments.webhooks_pending)}`}
            />
            <Tile
              Icon={AlertTriangle}
              label="الأعطال (7 أيام)"
              value={fmtNumber(data.reliability.failures_7d)}
              tone={
                data.reliability.failures_24h > 0
                  ? "red"
                  : data.reliability.failures_7d > 0
                    ? "warn"
                    : "green"
              }
              hint={
                data.reliability.last_failure_ref
                  ? `آخر مرجع: ${data.reliability.last_failure_ref}`
                  : "لا أعطال مسجّلة"
              }
            />
          </div>

          <SectionCard
            title="التكاملات الخارجية"
            description="تُقرأ الحالة من سجلات الفحص الدورية للتكاملات."
          >
            {data.integrations.length === 0 ? (
              <p className="text-body-sm text-muted-foreground">لا توجد تكاملات مُعرّفة.</p>
            ) : (
              <DataCard>
                <table className="w-full text-right">
                  <thead>
                    <tr>
                      <Th>الخدمة</Th>
                      <Th>الحالة</Th>
                      <Th className="hidden sm:table-cell">زمن الاستجابة</Th>
                      <Th className="hidden md:table-cell">آخر فحص</Th>
                      <Th className="hidden lg:table-cell">فحوص 24 ساعة</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.integrations.map((s: ServiceIntegration) => (
                      <tr key={s.key}>
                        <Td>
                          <span className="font-semibold">{s.label}</span>
                          <span className="text-caption block">{s.key}</span>
                          {s.last_error && (
                            <span className="text-caption mt-1 block text-danger">
                              {s.last_error}
                            </span>
                          )}
                        </Td>
                        <Td>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge tone={statusTone(s.status)}>{statusLabel(s.status)}</Badge>
                            {!s.configured && <Badge tone="muted">غير مهيّأة</Badge>}
                            {s.configured && !s.enabled && <Badge tone="warn">معطّلة</Badge>}
                          </div>
                        </Td>
                        <Td className="hidden sm:table-cell">
                          {s.latency_ms === null ? "—" : `${fmtNumber(s.latency_ms)} م.ث`}
                        </Td>
                        <Td className="hidden md:table-cell">
                          {s.last_check_at ? fmtDateTime(s.last_check_at) : "—"}
                        </Td>
                        <Td className="hidden lg:table-cell">{fmtNumber(s.checks_24h)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </DataCard>
            )}
          </SectionCard>

          <div className="grid gap-6 lg:grid-cols-2">
            <SectionCard title="تفاصيل البريد والرسائل">
              <dl className="grid gap-4 sm:grid-cols-2">
                <Row label="صناديق البريد" value={fmtNumber(data.email_transport.mailboxes)} />
                <Row
                  label="بانتظار الإرسال"
                  value={fmtNumber(data.email_transport.outbox_queued)}
                />
                <Row label="رسائل فاشلة" value={fmtNumber(data.email_transport.outbox_failed)} />
                <Row
                  label="جولات مزامنة فاشلة (24 ساعة)"
                  value={fmtNumber(data.email_transport.failed_runs_24h)}
                />
                <Row label="رموز تحقق صادرة (24 ساعة)" value={fmtNumber(data.otp.issued_24h)} />
                <Row label="رموز تحقق مُثبّتة (24 ساعة)" value={fmtNumber(data.otp.verified_24h)} />
              </dl>
              {data.email_transport.last_error && (
                <p className="text-caption mt-4 text-danger">
                  آخر خطأ مزامنة: {data.email_transport.last_error}
                </p>
              )}
              {data.sms.last_error && (
                <p className="text-caption mt-2 text-danger">
                  آخر خطأ رسائل: {data.sms.last_error}
                </p>
              )}
            </SectionCard>

            <SectionCard title="قاعدة البيانات والحماية">
              <dl className="grid gap-4 sm:grid-cols-2">
                <Row label="حجم قاعدة البيانات" value={fmtBytes(data.database.size_bytes)} />
                <Row label="الاتصالات النشطة" value={fmtNumber(data.database.connections)} />
                <Row label="عدد الجداول" value={fmtNumber(data.database.tables_public)} />
                <Row
                  label="جداول بدون عزل صفوف"
                  value={
                    data.database.rls_disabled === 0
                      ? "لا يوجد"
                      : fmtNumber(data.database.rls_disabled)
                  }
                />
              </dl>
              <div className="mt-4 flex items-center gap-2">
                {data.database.rls_disabled === 0 ? (
                  <>
                    <ShieldCheck className="h-4 w-4 text-success" aria-hidden />
                    <p className="text-body-sm text-success">عزل الصفوف مُفعّل على كل الجداول.</p>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="h-4 w-4 text-danger" aria-hidden />
                    <p className="text-body-sm text-danger">
                      توجد جداول بدون عزل صفوف — تتطلب معالجة فورية.
                    </p>
                  </>
                )}
              </div>
              <p className="text-caption mt-3">
                <Database className="me-1 inline h-3.5 w-3.5" aria-hidden />
                وقت الفحص: {fmtDateTime(data.generated_at)}
              </p>
            </SectionCard>
          </div>
        </div>
      )}
    </AdminShell>
  );
}

function Tile({
  Icon,
  label,
  value,
  hint,
  tone,
}: {
  Icon: typeof Mail;
  label: string;
  value: string;
  hint?: string;
  tone: "green" | "red" | "warn" | "muted";
}) {
  return (
    <div className="surface-card p-5">
      <div className="flex items-center justify-between">
        <Icon className="h-5 w-5 text-muted-foreground" aria-hidden />
        <Badge tone={tone}>
          {tone === "green"
            ? "مستقرة"
            : tone === "warn"
              ? "تحتاج متابعة"
              : tone === "red"
                ? "حرجة"
                : "—"}
        </Badge>
      </div>
      <p className="mt-3 text-body-sm font-semibold">{label}</p>
      <p className="text-h5 mt-1">{value}</p>
      {hint && <p className="text-caption mt-0.5">{hint}</p>}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-caption">{label}</dt>
      <dd className="mt-0.5 text-body-sm font-medium">{value}</dd>
    </div>
  );
}
