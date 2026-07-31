import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Activity, Database, HardDrive, ShieldCheck } from "lucide-react";
import { AdminShell } from "@/components/admin/shell";
import { Badge, Btn, ErrorBlock, SectionCard, StatsSkeleton } from "@/lib/list-utils";
import { fmtDateTime } from "@/lib/enums";
import { getSystemHealth } from "@/lib/admin-ops.functions";

export const Route = createFileRoute("/mehla-admin/monitoring")({
  head: () => ({ meta: [{ title: "مراقبة النظام · إدارة مِهلة" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: MonitoringPage,
});

const bytes = (n: number) => {
  const mb = n / 1024 / 1024;
  return mb >= 1024 ? `${(mb / 1024).toFixed(2)} ج.ب` : `${mb.toFixed(1)} م.ب`;
};

function MonitoringPage() {
  const fn = useServerFn(getSystemHealth);
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["admin-health"],
    queryFn: () => fn({ data: undefined }),
    refetchInterval: 60_000,
  });

  return (
    <AdminShell
      title="مراقبة النظام"
      description="حالة قاعدة البيانات والتخزين ومؤشرات المنصة."
      actions={
        <Btn variant="outline" size="sm" loading={isFetching} onClick={() => refetch()}>
          تحديث الآن
        </Btn>
      }
    >
      {isLoading ? (
        <StatsSkeleton count={4} />
      ) : isError || !data ? (
        <ErrorBlock message="تعذّر قراءة حالة النظام." />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Card
              Icon={Database}
              label="قاعدة البيانات"
              value={data.database.ok ? "تعمل" : "متعطلة"}
              tone={data.database.ok ? "green" : "red"}
              hint={`زمن الاستجابة ${data.database.latencyMs} م.ث`}
            />
            <Card
              Icon={HardDrive}
              label="التخزين"
              value={data.storage.ok ? "يعمل" : "متعطل"}
              tone={data.storage.ok ? "green" : "red"}
              hint={`${data.storage.documents} مستنداً · ${bytes(data.storage.bytes)}`}
            />
            <Card Icon={Activity} label="المكاتب المسجّلة" value={String(data.platform.organizations)} tone="info" />
            <Card Icon={ShieldCheck} label="المستخدمون" value={String(data.platform.users)} tone="info" />
          </div>

          <SectionCard title="تفاصيل الفحص">
            <dl className="grid gap-4 sm:grid-cols-2">
              <Row label="وقت الفحص" value={fmtDateTime(data.checkedAt)} />
              <Row label="آخر حركة في سجل التدقيق" value={data.lastAuditAt ? fmtDateTime(data.lastAuditAt) : "—"} />
              <Row label="زمن استجابة القاعدة" value={`${data.database.latencyMs} م.ث`} />
              <Row label="زمن استجابة التخزين" value={`${data.storage.latencyMs} م.ث`} />
            </dl>
            <p className="text-caption mt-5">
              النسخ الاحتياطي اليومي مُدار على مستوى الاستضافة، والاتصال بالمستندات يتم عبر روابط موقّعة قصيرة الأجل فقط.
            </p>
          </SectionCard>
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-caption">{label}</dt>
      <dd className="mt-0.5 text-body-sm font-medium">{value}</dd>
    </div>
  );
}
