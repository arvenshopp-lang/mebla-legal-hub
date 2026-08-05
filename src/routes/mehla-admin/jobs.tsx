import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Clock, ListChecks, RefreshCw } from "lucide-react";
import { AdminShell } from "@/components/admin/shell";
import {
  Badge,
  Btn,
  DataCard,
  EmptyState,
  ErrorBlock,
  SectionCard,
  StatsSkeleton,
  Td,
  Th,
} from "@/lib/list-utils";
import { fmtDateTime } from "@/lib/enums";
import { getJobsOverview, retryEmailJob } from "@/lib/admin-console.functions";
import { fmtNumber, type JobQueue } from "@/lib/admin-console.shared";
import { usePlatformAdmin } from "@/hooks/use-platform-admin";

export const Route = createFileRoute("/mehla-admin/jobs")({
  head: () => ({
    meta: [
      { title: "مهام النظام · إدارة مِهلة" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: JobsPage,
});

function JobsPage() {
  const { can } = usePlatformAdmin();
  const queryClient = useQueryClient();
  const load = useServerFn(getJobsOverview);
  const retry = useServerFn(retryEmailJob);

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["admin-jobs"],
    queryFn: () => load({ data: undefined }),
    refetchInterval: 45_000,
  });

  const retryMutation = useMutation({
    mutationFn: (outboxId: string) => retry({ data: { outboxId } }),
    onSuccess: (result) => {
      if (result.sent) toast.success("أُعيد إرسال الرسالة بنجاح.");
      else toast.error(`تعذّرت إعادة الإرسال${result.failureRef ? ` · مرجع العطل ${result.failureRef}` : ""}.`);
      void queryClient.invalidateQueries({ queryKey: ["admin-jobs"] });
    },
    onError: (error: Error) => toast.error(error.message || "تعذّرت إعادة المحاولة."),
  });

  return (
    <AdminShell
      title="مهام النظام"
      description="طوابير الإرسال والمعالجة وإعادة التشفير، مع إعادة محاولة فعلية للرسائل الفاشلة."
      actions={
        <Btn variant="outline" size="sm" loading={isFetching} onClick={() => refetch()}>
          تحديث الآن
        </Btn>
      }
    >
      {isLoading ? (
        <StatsSkeleton count={3} />
      ) : isError || !data ? (
        <ErrorBlock message="تعذّر قراءة حالة المهام." />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            {data.queues.map((q: JobQueue) => (
              <div key={q.key} className="surface-card p-5">
                <div className="flex items-center justify-between">
                  <ListChecks className="h-5 w-5 text-muted-foreground" aria-hidden />
                  <Badge tone={q.failed > 0 ? "red" : q.queued + q.running > 0 ? "warn" : "green"}>
                    {q.failed > 0 ? "يوجد فشل" : q.queued + q.running > 0 ? "قيد التنفيذ" : "مستقر"}
                  </Badge>
                </div>
                <p className="mt-3 text-body-sm font-semibold">{q.label}</p>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-[13px]">
                  <Cell label="بالانتظار" value={q.queued + q.scheduled} />
                  <Cell label="تُنفّذ الآن" value={q.running} />
                  <Cell label="مكتملة" value={q.done} />
                  <Cell label="فاشلة" value={q.failed} tone={q.failed > 0 ? "danger" : undefined} />
                </dl>
                <p className="text-caption mt-3">
                  <Clock className="me-1 inline h-3.5 w-3.5" aria-hidden />
                  أقدم مهمة معلّقة: {q.oldest_pending_at ? fmtDateTime(q.oldest_pending_at) : "—"}
                </p>
              </div>
            ))}
          </div>

          <SectionCard
            title="الرسائل الفاشلة"
            description="إعادة المحاولة تُجدول الرسالة فوراً وتُرسلها عبر مسار النقل الفعلي، وتُسجَّل في سجل التدقيق."
          >
            {data.failed_jobs.length === 0 ? (
              <EmptyState title="لا توجد رسائل فاشلة" hint="طابور الإرسال سليم بالكامل." />
            ) : (
              <DataCard>
                <table className="w-full text-right">
                  <thead>
                    <tr>
                      <Th>المهمة</Th>
                      <Th>المحاولات</Th>
                      <Th className="hidden md:table-cell">الخطأ</Th>
                      <Th className="hidden sm:table-cell">التاريخ</Th>
                      <Th>إجراء</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.failed_jobs.map((job) => (
                      <tr key={job.id}>
                        <Td>
                          <span className="font-semibold">{job.queue === "email_outbox" ? "بريد صادر" : job.queue}</span>
                          {job.failure_ref && <span className="text-caption block">{job.failure_ref}</span>}
                        </Td>
                        <Td>
                          {fmtNumber(job.attempts)} / {fmtNumber(job.max_attempts)}
                        </Td>
                        <Td className="hidden md:table-cell">
                          <span className="text-caption block max-w-[280px] truncate text-danger">
                            {job.last_error ?? job.last_error_code ?? "—"}
                          </span>
                        </Td>
                        <Td className="hidden sm:table-cell">{fmtDateTime(job.created_at)}</Td>
                        <Td>
                          <Btn
                            size="sm"
                            variant="outline"
                            disabled={!can("email.retry")}
                            loading={retryMutation.isPending && retryMutation.variables === job.id}
                            onClick={() => retryMutation.mutate(job.id)}
                          >
                            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                            إعادة المحاولة
                          </Btn>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </DataCard>
            )}
          </SectionCard>

          <div className="grid gap-6 lg:grid-cols-2">
            <SectionCard title="آخر جولات مزامنة البريد">
              {data.sync_runs.length === 0 ? (
                <EmptyState title="لا توجد جولات مزامنة" hint="لم تُشغّل المزامنة بعد." />
              ) : (
                <ul className="divide-y divide-border">
                  {data.sync_runs.map((run) => (
                    <li key={run.id} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                      <div className="min-w-0">
                        <p className="text-body-sm font-medium">{fmtDateTime(run.started_at)}</p>
                        {run.error_message && (
                          <p className="text-caption mt-0.5 truncate text-danger">{run.error_message}</p>
                        )}
                      </div>
                      <Badge tone={run.status === "success" ? "green" : run.status === "failed" ? "red" : "warn"}>
                        {run.status === "success" ? "ناجحة" : run.status === "failed" ? "فاشلة" : "قيد التنفيذ"}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>

            <SectionCard title="آخر تشغيل للمهام الدورية">
              <dl className="grid gap-4 sm:grid-cols-2">
                <Row label="مزامنة البريد" value={data.cron.email_sync_last_at} />
                <Row label="تنظيف النسخ المائية" value={data.cron.watermark_cleanup_last_at} />
                <Row label="مؤشرات مستوى الخدمة" value={data.cron.sla_last_event_at} />
                <Row label="دعوات قياس الرضا" value={data.cron.csat_last_invitation_at} />
              </dl>
              <p className="text-caption mt-4">وقت القراءة: {fmtDateTime(data.generated_at)}</p>
            </SectionCard>
          </div>
        </div>
      )}
    </AdminShell>
  );
}

function Cell({ label, value, tone }: { label: string; value: number; tone?: "danger" }) {
  return (
    <div>
      <dt className="text-caption">{label}</dt>
      <dd className={tone === "danger" ? "font-semibold text-danger" : "font-semibold"}>{fmtNumber(value)}</dd>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-caption">{label}</dt>
      <dd className="mt-0.5 text-body-sm font-medium">{value ? fmtDateTime(value) : "لم تُشغّل بعد"}</dd>
    </div>
  );
}
