import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Activity, Database, HardDrive, Plug, ShieldCheck, Clock, Users } from "lucide-react";
import { AdminShell } from "@/components/admin/shell";
import { Badge, Btn, ErrorBlock, SectionCard, StatsSkeleton } from "@/lib/list-utils";
import { fmtDateTime } from "@/lib/enums";
import { getSystemHealth } from "@/lib/admin-ops.functions";
import { getMonitoringSnapshot } from "@/lib/admin-observability.functions";
import { fmtNumber } from "@/lib/admin-console.shared";

export const Route = createFileRoute("/mehla-admin/monitoring")({
  head: () => ({
    meta: [
      { title: "مراقبة النظام · إدارة مِهلة" },
      { name: "description", content: "زمن الاستجابة والطوابير والجلسات ومؤشرات الأمان في منصة مِهلة بقيم فعلية." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: MonitoringPage,
});

const bytes = (n: number) => {
  const mb = n / 1024 / 1024;
  return mb >= 1024 ? `${(mb / 1024).toFixed(2)} ج.ب` : `${mb.toFixed(1)} م.ب`;
};

function MonitoringPage() {
  const health = useServerFn(getSystemHealth);
  const snapshot = useServerFn(getMonitoringSnapshot);

  const healthQuery = useQuery({
    queryKey: ["admin-health"],
    queryFn: () => health({ data: undefined }),
    refetchInterval: 60_000,
  });
  const opsQuery = useQuery({
    queryKey: ["admin-monitoring-snapshot"],
    queryFn: () => snapshot({ data: undefined }),
    refetchInterval: 60_000,
  });

  const isLoading = healthQuery.isLoading || opsQuery.isLoading;
  const isError = healthQuery.isError || opsQuery.isError;
  const data = healthQuery.data;
  const ops = opsQuery.data;
  const refreshing = healthQuery.isFetching || opsQuery.isFetching;

  return (
    <AdminShell
      title="مراقبة النظام"
      description="قيم فعلية لزمن الاستجابة والطوابير والجلسات ومؤشرات الأمان — بلا أي تقدير أو تقريب."
      actions={
        <Btn
          variant="outline"
          size="sm"
          loading={refreshing}
          onClick={() => {
            void healthQuery.refetch();
            void opsQuery.refetch();
          }}
        >
          تحديث الآن
        </Btn>
      }
    >
      {isLoading ? (
        <StatsSkeleton count={4} />
      ) : isError || !data || !ops ? (
        <ErrorBlock message="تعذّر قراءة حالة النظام. تأكد من صلاحية «قراءة المراقبة» ثم أعد المحاولة." />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Card
              Icon={Database}
              label="قاعدة البيانات"
              value={data.database.ok ? "تعمل" : "متعطلة"}
              tone={data.database.ok ? "green" : "red"}
              hint={`زمن الاستجابة ${ops.latency.database} م.ث`}
            />
            <Card
              Icon={HardDrive}
              label="التخزين"
              value={data.storage.ok ? "يعمل" : "متعطل"}
              tone={data.storage.ok ? "green" : "red"}
              hint={`${fmtNumber(ops.storage.documents)} مستنداً · ${bytes(ops.storage.bytes)}`}
            />
            <Card
              Icon={Users}
              label="جلسات الفريق النشطة"
              value={fmtNumber(ops.sessions.active24h)}
              tone="info"
              hint={`${fmtNumber(ops.sessions.total)} جلسة سارية · ${fmtNumber(ops.sessions.revoked30d)} أُبطلت خلال ٣٠ يوماً`}
            />
            <Card
              Icon={ShieldCheck}
              label="أحداث أمنية (٢٤ ساعة)"
              value={fmtNumber(ops.security.adminOps24h + ops.security.failures24h)}
              tone={ops.security.failures24h > 0 ? "red" : "green"}
              hint={`${fmtNumber(ops.security.adminOps24h)} عملية إدارية · ${fmtNumber(ops.security.failures24h)} عطل`}
            />
          </div>

          <SectionCard
            title="الطوابير التشغيلية"
            description="الأرقام محسوبة لحظياً من الجداول الفعلية؛ الصفر يعني «لا يوجد عمل معلّق»، لا انعدام القياس."
          >
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {ops.queues.map((queue) => (
                <div key={queue.key} className="rounded-[var(--radius-m)] border border-border p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 truncate text-body-sm font-semibold">{queue.label}</p>
                    <Badge tone={queue.failed > 0 ? "red" : queue.pending > 0 ? "warn" : "green"}>
                      {queue.failed > 0 ? "يوجد فشل" : queue.pending > 0 ? "قيد التنفيذ" : "مستقر"}
                    </Badge>
                  </div>
                  <dl className="mt-3 grid grid-cols-3 gap-2 text-[13px]">
                    <Metric label="بالانتظار" value={queue.pending} />
                    <Metric label="فاشلة" value={queue.failed} danger={queue.failed > 0} />
                    <Metric label="أُنجزت ٢٤س" value={queue.done24h} />
                  </dl>
                  {queue.oldestPendingAt && (
                    <p className="text-caption mt-2">
                      <Clock className="me-1 inline h-3.5 w-3.5" aria-hidden />
                      أقدم عنصر معلّق: {fmtDateTime(queue.oldestPendingAt)}
                    </p>
                  )}
                  <p className="text-caption mt-2">{queue.note}</p>
                </div>
              ))}
            </div>
          </SectionCard>

          <div className="grid gap-6 lg:grid-cols-2">
            <SectionCard title="زمن الاستجابة الفعلي">
              <dl className="grid gap-4 sm:grid-cols-2">
                <Row label="قاعدة البيانات" value={`${ops.latency.database} م.ث`} />
                <Row label="التخزين" value={`${ops.latency.storage} م.ث`} />
                <Row
                  label="أبطأ تكامل خارجي (٢٤س)"
                  value={
                    ops.latency.slowestIntegration
                      ? `${ops.latency.slowestIntegration.name} · ${ops.latency.slowestIntegration.ms} م.ث`
                      : "لا توجد فحوصات في آخر ٢٤ ساعة"
                  }
                />
                <Row label="وقت القراءة" value={fmtDateTime(ops.checkedAt)} />
              </dl>
              <p className="text-caption mt-4">
                قياس زمن الاستعلامات البطيئة على مستوى محرّك قاعدة البيانات غير متاح لهذه اللوحة، لذلك نعرض زمن
                استجابة القراءة الفعلي بدلاً من رقم تقديري.
              </p>
            </SectionCard>

            <SectionCard title="التكاملات والأمان">
              <dl className="grid gap-4 sm:grid-cols-2">
                <Row label="فحوصات التكاملات (٢٤س)" value={fmtNumber(ops.integrations.checks24h)} />
                <Row
                  label="فحوصات فاشلة (٢٤س)"
                  value={fmtNumber(ops.integrations.failures24h)}
                  danger={ops.integrations.failures24h > 0}
                />
                <Row
                  label="آخر فحص تكامل"
                  value={ops.integrations.lastCheckAt ? fmtDateTime(ops.integrations.lastCheckAt) : "لم يُشغّل بعد"}
                />
                <Row label="محاولات متابعة مرفوضة (٢٤س)" value={fmtNumber(ops.security.blockedLookups24h)} />
                <Row label="آخر مرجع عطل" value={ops.security.lastFailureRef ?? "—"} />
                <Row
                  label="آخر حركة في سجل التدقيق"
                  value={data.lastAuditAt ? fmtDateTime(data.lastAuditAt) : "—"}
                />
              </dl>
              <p className="text-caption mt-4">
                <Plug className="me-1 inline h-3.5 w-3.5" aria-hidden />
                النسخ الاحتياطي اليومي مُدار على مستوى الاستضافة، والوصول للمستندات يتم عبر روابط موقّعة قصيرة الأجل
                فقط.
              </p>
            </SectionCard>
          </div>
        </div>
      )}
    </AdminShell>
  );
}

function Card({
  Icon,
  label,
  value,
  hint,
  tone,
}: {
  Icon: typeof Database;
  label: string;
  value: string;
  hint?: string;
  tone: "green" | "red" | "info";
}) {
  return (
    <div className="surface-card p-5">
      <div className="flex items-center justify-between">
        <Icon className="h-5 w-5 text-muted-foreground" aria-hidden />
        <Badge tone={tone}>{value}</Badge>
      </div>
      <p className="mt-3 text-body-sm font-semibold">{label}</p>
      {hint && <p className="text-caption mt-0.5">{hint}</p>}
    </div>
  );
}

function Metric({ label, value, danger }: { label: string; value: number; danger?: boolean }) {
  return (
    <div>
      <dt className="text-caption">{label}</dt>
      <dd className={danger ? "font-semibold text-danger" : "font-semibold"}>{fmtNumber(value)}</dd>
    </div>
  );
}

function Row({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div>
      <dt className="text-caption">{label}</dt>
      <dd className={`mt-0.5 text-body-sm font-medium ${danger ? "text-danger" : ""}`}>{value}</dd>
    </div>
  );
}
