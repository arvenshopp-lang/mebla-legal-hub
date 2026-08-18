import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Activity, AlertTriangle, Clock, ListChecks, Timer } from "lucide-react";
import { AdminShell } from "@/components/admin/shell";
import {
  Badge,
  Btn,
  DataCard,
  EmptyState,
  ErrorBlock,
  FormField,
  Modal,
  Pagination,
  SectionCard,
  StatsSkeleton,
  Td,
  Th,
  inputCls,
  useDebounced,
} from "@/lib/list-utils";
import { fmtDateTime } from "@/lib/enums";
import { fmtNumber } from "@/lib/admin-console.shared";
import { usePlatformAdmin } from "@/hooks/use-platform-admin";
import {
  getIncidentDetail,
  getOperationsOverview,
  listIncidents,
  updateIncident,
} from "@/lib/observability/operations.functions";
import {
  INCIDENT_EVENT_LABELS,
  INCIDENT_SEVERITY_LABELS,
  INCIDENT_SOURCE_LABELS,
  INCIDENT_STATUS_LABELS,
  JOB_HEALTH_LABELS,
  QUEUE_HEALTH_LABELS,
  type IncidentSeverity,
  type IncidentStatus,
  type JobHeartbeatRow,
  type QueueHealthRow,
} from "@/lib/observability/incidents.shared";

export const Route = createFileRoute("/mehla-admin/operations")({
  head: () => ({
    meta: [
      { title: "مركز التشغيل · إدارة مِهلة" },
      {
        name: "description",
        content: "الحوادث التشغيلية ونبضات المهام الدورية وصحة الطوابير في منصة مِهلة.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: OperationsPage,
});

const PAGE_SIZE = 20;

const OPEN_STATUSES: IncidentStatus[] = ["open", "investigating", "monitoring"];
const ALL_STATUSES: IncidentStatus[] = ["open", "investigating", "monitoring", "resolved"];
const ALL_SEVERITIES: IncidentSeverity[] = ["critical", "high", "medium", "low"];

const severityTone = (severity: IncidentSeverity) =>
  severity === "critical" || severity === "high" ? "red" : severity === "medium" ? "warn" : "muted";

const statusTone = (status: IncidentStatus) =>
  status === "resolved" ? "green" : status === "open" ? "red" : "warn";

const jobTone = (health: JobHeartbeatRow["health"]) =>
  health === "ok" ? "green" : health === "never" ? "muted" : health === "late" ? "warn" : "red";

const queueTone = (health: QueueHealthRow["health"]) =>
  health === "ok" ? "green" : health === "degraded" ? "warn" : "red";

function OperationsPage() {
  const { can } = usePlatformAdmin();
  const queryClient = useQueryClient();
  const loadOverview = useServerFn(getOperationsOverview);
  const loadIncidents = useServerFn(listIncidents);

  const [showResolved, setShowResolved] = useState(false);
  const [severity, setSeverity] = useState<"all" | IncidentSeverity>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [openIncidentId, setOpenIncidentId] = useState<string | null>(null);
  const debouncedSearch = useDebounced(search);

  const overviewQuery = useQuery({
    queryKey: ["admin-operations-overview"],
    queryFn: () => loadOverview({ data: undefined }),
    refetchInterval: 60_000,
  });

  const incidentsQuery = useQuery({
    queryKey: ["admin-operations-incidents", showResolved, severity, debouncedSearch, page],
    queryFn: () =>
      loadIncidents({
        data: {
          statuses: showResolved ? ALL_STATUSES : OPEN_STATUSES,
          severities: severity === "all" ? ALL_SEVERITIES : [severity],
          sources: ["failure", "job", "queue"],
          search: debouncedSearch,
          limit: PAGE_SIZE,
          offset: (page - 1) * PAGE_SIZE,
        },
      }),
    refetchInterval: 60_000,
  });

  const overview = overviewQuery.data;
  const refreshing = overviewQuery.isFetching || incidentsQuery.isFetching;
  const lateJobs = useMemo(
    () => (overview?.jobs ?? []).filter((job) => job.health !== "ok").length,
    [overview],
  );

  return (
    <AdminShell
      title="مركز التشغيل"
      description="حوادث مجمّعة بلا تكرار، نبضات المهام الدورية، وصحة الطوابير — كلها قيم فعلية من قاعدة البيانات."
      actions={
        <Btn
          variant="outline"
          size="sm"
          loading={refreshing}
          onClick={() => {
            void overviewQuery.refetch();
            void incidentsQuery.refetch();
          }}
        >
          تحديث الآن
        </Btn>
      }
    >
      {overviewQuery.isLoading ? (
        <StatsSkeleton count={4} />
      ) : overviewQuery.isError || !overview ? (
        <ErrorBlock message="تعذّر قراءة حالة التشغيل. تأكد من صلاحية «قراءة التشغيل» ثم أعد المحاولة." />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              Icon={AlertTriangle}
              label="حوادث مفتوحة"
              value={fmtNumber(overview.incidents.open + overview.incidents.investigating)}
              tone={overview.incidents.open > 0 ? "red" : "green"}
              hint={`${fmtNumber(overview.incidents.critical)} حرجة · ${fmtNumber(overview.incidents.unassigned)} بلا إسناد`}
            />
            <StatCard
              Icon={Activity}
              label="تحت المراقبة"
              value={fmtNumber(overview.incidents.monitoring)}
              tone="info"
              hint={`${fmtNumber(overview.incidents.resolved24h)} أُغلقت خلال ٢٤ ساعة`}
            />
            <StatCard
              Icon={Timer}
              label="مهام خارج الحد الزمني"
              value={fmtNumber(lateJobs)}
              tone={lateJobs > 0 ? "warn" : "green"}
              hint={`${fmtNumber(overview.jobs.length)} مهمة دورية مرصودة`}
            />
            <StatCard
              Icon={ListChecks}
              label="طوابير تحتاج متابعة"
              value={fmtNumber(overview.queues.filter((q) => q.health !== "ok").length)}
              tone={overview.queues.some((q) => q.health === "stalled") ? "red" : "green"}
              hint={`آخر قراءة ${fmtDateTime(overview.checkedAt)}`}
            />
          </div>

          <SectionCard
            title="نبضات المهام الدورية"
            description="الحالة محسوبة من آخر تشغيل فعلي مقابل الحد الزمني المسموح لكل مهمة."
          >
            <DataCard density="compact">
              <table className="w-full">
                <thead>
                  <tr>
                    <Th>المهمة</Th>
                    <Th>الحالة</Th>
                    <Th>آخر نجاح</Th>
                    <Th>مدة آخر تشغيل</Th>
                    <Th>فشل متتابع</Th>
                    <Th>الجدولة</Th>
                  </tr>
                </thead>
                <tbody>
                  {overview.jobs.map((job) => (
                    <tr key={job.jobKey} className="border-b border-border last:border-0">
                      <Td>
                        <span className="font-medium">{job.label}</span>
                        {job.critical && (
                          <span className="text-caption ms-2">مهمة حرجة</span>
                        )}
                      </Td>
                      <Td>
                        <Badge tone={jobTone(job.health)}>{JOB_HEALTH_LABELS[job.health]}</Badge>
                      </Td>
                      <Td>{job.lastSuccessAt ? fmtDateTime(job.lastSuccessAt) : "—"}</Td>
                      <Td>{job.lastDurationMs === null ? "—" : `${fmtNumber(job.lastDurationMs)} م.ث`}</Td>
                      <Td className={job.consecutiveFailures > 0 ? "text-danger" : ""}>
                        {fmtNumber(job.consecutiveFailures)}
                      </Td>
                      <Td className="text-muted-foreground">{job.schedule}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DataCard>
          </SectionCard>

          <SectionCard
            title="صحة الطوابير"
            description="الصفر يعني «لا يوجد عمل معلّق»، لا انعدام القياس."
          >
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {overview.queues.map((queue) => (
                <div key={queue.key} className="rounded-[var(--radius-m)] border border-border p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 truncate text-body-sm font-semibold">{queue.label}</p>
                    <Badge tone={queueTone(queue.health)}>{QUEUE_HEALTH_LABELS[queue.health]}</Badge>
                  </div>
                  <dl className="mt-3 grid grid-cols-4 gap-2 text-[13px]">
                    <Metric label="بالانتظار" value={queue.pending} />
                    <Metric label="فاشلة" value={queue.failed} danger={queue.failed > 0} />
                    <Metric label="عالقة" value={queue.stuck} danger={queue.stuck > 0} />
                    <Metric label="أقفال مهجورة" value={queue.staleLocks} danger={queue.staleLocks > 0} />
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

          <SectionCard
            title="سجل الحوادث"
            description="التكرارات المتطابقة تُجمَّع في حادثة واحدة لها عدّاد وأول/آخر ظهور."
          >
            <div className="mb-4 flex flex-wrap items-end gap-3">
              <FormField label="بحث">
                <input
                  className={inputCls}
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setPage(1);
                  }}
                  placeholder="العنوان أو السطح أو رمز العطل"
                  aria-label="بحث في الحوادث"
                />
              </FormField>
              <FormField label="الخطورة">
                <select
                  className={inputCls}
                  value={severity}
                  onChange={(event) => {
                    setSeverity(event.target.value as "all" | IncidentSeverity);
                    setPage(1);
                  }}
                >
                  <option value="all">جميع الدرجات</option>
                  {ALL_SEVERITIES.map((value) => (
                    <option key={value} value={value}>
                      {INCIDENT_SEVERITY_LABELS[value]}
                    </option>
                  ))}
                </select>
              </FormField>
              <label className="flex min-h-11 items-center gap-2 text-body-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={showResolved}
                  onChange={(event) => {
                    setShowResolved(event.target.checked);
                    setPage(1);
                  }}
                />
                إظهار الحوادث المغلقة
              </label>
            </div>

            {incidentsQuery.isError ? (
              <ErrorBlock message="تعذّر قراءة سجل الحوادث. أعد المحاولة." />
            ) : (incidentsQuery.data?.rows.length ?? 0) === 0 && !incidentsQuery.isLoading ? (
              <EmptyState
                title="لا توجد حوادث مطابقة"
                hint="غياب الحوادث هنا يعني أن الرصد لم يفتح أي حادثة بهذه المرشّحات."
              />
            ) : (
              <>
                <DataCard>
                  <table className="w-full">
                    <thead>
                      <tr>
                        <Th>الحادثة</Th>
                        <Th>المصدر</Th>
                        <Th>الخطورة</Th>
                        <Th>الحالة</Th>
                        <Th>التكرارات</Th>
                        <Th>آخر ظهور</Th>
                        <Th>الإسناد</Th>
                        <Th className="text-end">إجراء</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {(incidentsQuery.data?.rows ?? []).map((incident) => (
                        <tr key={incident.id} className="border-b border-border last:border-0">
                          <Td className="max-w-[22rem] whitespace-normal">
                            <span className="font-medium">{incident.title}</span>
                            <span className="text-caption block">
                              {incident.surface} · {incident.action}
                              {incident.errorCode ? ` · ${incident.errorCode}` : ""}
                            </span>
                          </Td>
                          <Td>{INCIDENT_SOURCE_LABELS[incident.source]}</Td>
                          <Td>
                            <Badge tone={severityTone(incident.severity)}>
                              {INCIDENT_SEVERITY_LABELS[incident.severity]}
                            </Badge>
                          </Td>
                          <Td>
                            <Badge tone={statusTone(incident.status)}>
                              {INCIDENT_STATUS_LABELS[incident.status]}
                            </Badge>
                          </Td>
                          <Td>{fmtNumber(incident.occurrences)}</Td>
                          <Td>{fmtDateTime(incident.lastSeenAt)}</Td>
                          <Td>{incident.assigneeEmail ?? "بلا إسناد"}</Td>
                          <Td className="text-end">
                            <Btn
                              variant="outline"
                              size="sm"
                              onClick={() => setOpenIncidentId(incident.id)}
                            >
                              التفاصيل
                            </Btn>
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </DataCard>
                <Pagination
                  page={page}
                  setPage={setPage}
                  total={incidentsQuery.data?.total ?? 0}
                  pageSize={PAGE_SIZE}
                />
              </>
            )}
          </SectionCard>
        </div>
      )}

      {openIncidentId && (
        <IncidentModal
          incidentId={openIncidentId}
          canManage={can("operations.manage")}
          onClose={() => setOpenIncidentId(null)}
          onSaved={() => {
            void queryClient.invalidateQueries({ queryKey: ["admin-operations-incidents"] });
            void queryClient.invalidateQueries({ queryKey: ["admin-operations-overview"] });
          }}
        />
      )}
    </AdminShell>
  );
}

function IncidentModal({
  incidentId,
  canManage,
  onClose,
  onSaved,
}: {
  incidentId: string;
  canManage: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const queryClient = useQueryClient();
  const loadDetail = useServerFn(getIncidentDetail);
  const save = useServerFn(updateIncident);

  const detailQuery = useQuery({
    queryKey: ["admin-operations-incident", incidentId],
    queryFn: () => loadDetail({ data: { incidentId } }),
  });

  const [status, setStatus] = useState<IncidentStatus | "">("");
  const [assignee, setAssignee] = useState<string>("keep");
  const [note, setNote] = useState("");
  const [resolution, setResolution] = useState("");

  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          incidentId,
          ...(status ? { status } : {}),
          ...(assignee === "keep"
            ? {}
            : { assigneeStaffId: assignee === "none" ? null : assignee }),
          ...(note.trim() ? { note: note.trim() } : {}),
          ...(resolution.trim() ? { resolution: resolution.trim() } : {}),
        },
      }),
    onSuccess: () => {
      toast.success("حُدّثت الحادثة وسُجّلت في سجل التدقيق.");
      setStatus("");
      setAssignee("keep");
      setNote("");
      setResolution("");
      void queryClient.invalidateQueries({ queryKey: ["admin-operations-incident", incidentId] });
      onSaved();
    },
    onError: (error: Error) => toast.error(error.message || "تعذّر تحديث الحادثة."),
  });

  const detail = detailQuery.data;
  const dirty = status !== "" || assignee !== "keep" || note.trim().length > 0;

  return (
    <Modal
      open
      onClose={onClose}
      title="تفاصيل الحادثة"
      description="الحوادث لا تحمل بيانات مكاتب ولا محتوى قانوني — تصنيفات وعدّادات تشخيصية فقط."
      size="lg"
      busy={detailQuery.isLoading}
    >
      {detailQuery.isError || (!detailQuery.isLoading && !detail) ? (
        <ErrorBlock message="تعذّر قراءة تفاصيل الحادثة." />
      ) : detail ? (
        <div className="space-y-5">
          <div>
            <p className="text-body font-semibold">{detail.incident.title}</p>
            <p className="text-caption mt-1">
              {INCIDENT_SOURCE_LABELS[detail.incident.source]} · {detail.incident.surface} ·{" "}
              {detail.incident.action}
              {detail.incident.errorCode ? ` · ${detail.incident.errorCode}` : ""}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge tone={severityTone(detail.incident.severity)}>
                {INCIDENT_SEVERITY_LABELS[detail.incident.severity]}
              </Badge>
              <Badge tone={statusTone(detail.incident.status)}>
                {INCIDENT_STATUS_LABELS[detail.incident.status]}
              </Badge>
              <Badge tone="muted">{fmtNumber(detail.incident.occurrences)} تكراراً</Badge>
              {detail.incident.reopenedCount > 0 && (
                <Badge tone="warn">
                  أُعيد فتحها {fmtNumber(detail.incident.reopenedCount)} مرة
                </Badge>
              )}
            </div>
          </div>

          <dl className="grid gap-3 sm:grid-cols-2">
            <Row label="أول ظهور" value={fmtDateTime(detail.incident.firstSeenAt)} />
            <Row label="آخر ظهور" value={fmtDateTime(detail.incident.lastSeenAt)} />
            <Row label="الإسناد" value={detail.incident.assigneeEmail ?? "بلا إسناد"} />
            <Row
              label="التنبيهات المُرسلة"
              value={`${fmtNumber(detail.incident.alertCount)}${
                detail.incident.lastAlertAt ? ` · آخرها ${fmtDateTime(detail.incident.lastAlertAt)}` : ""
              }`}
            />
            <Row label="مرجع نموذجي" value={detail.incident.sampleRef ?? "—"} />
            <Row
              label="الإغلاق"
              value={
                detail.incident.resolvedAt
                  ? `${fmtDateTime(detail.incident.resolvedAt)} · ${detail.incident.resolvedBy ?? "—"}`
                  : "—"
              }
            />
          </dl>

          {detail.incident.resolution && (
            <p className="rounded-[var(--radius-m)] bg-surface-muted p-3 text-body-sm">
              {detail.incident.resolution}
            </p>
          )}

          {canManage ? (
            <div className="space-y-3 rounded-[var(--radius-m)] border border-border p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField label="الحالة">
                  <select
                    className={inputCls}
                    value={status}
                    onChange={(event) => setStatus(event.target.value as IncidentStatus | "")}
                  >
                    <option value="">بلا تغيير</option>
                    {ALL_STATUSES.map((value) => (
                      <option key={value} value={value}>
                        {INCIDENT_STATUS_LABELS[value]}
                      </option>
                    ))}
                  </select>
                </FormField>
                <FormField label="الإسناد">
                  <select
                    className={inputCls}
                    value={assignee}
                    onChange={(event) => setAssignee(event.target.value)}
                  >
                    <option value="keep">بلا تغيير</option>
                    <option value="none">إلغاء الإسناد</option>
                    {detail.assignable.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.fullName} · {member.email}
                      </option>
                    ))}
                  </select>
                </FormField>
              </div>
              {status === "resolved" && (
                <FormField label="سبب الإغلاق" hint="يظهر في سجل التدقيق والسطر الزمني.">
                  <input
                    className={inputCls}
                    value={resolution}
                    onChange={(event) => setResolution(event.target.value)}
                    maxLength={300}
                  />
                </FormField>
              )}
              <FormField label="ملاحظة" optional>
                <textarea
                  className={inputCls}
                  rows={2}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  maxLength={300}
                />
              </FormField>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Btn variant="outline" onClick={onClose} disabled={mutation.isPending}>
                  إغلاق
                </Btn>
                <Btn
                  onClick={() => mutation.mutate()}
                  loading={mutation.isPending}
                  disabled={!dirty}
                >
                  حفظ التغيير
                </Btn>
              </div>
            </div>
          ) : (
            <p className="text-caption">
              تحتاج صلاحية «إدارة التشغيل» لتغيير حالة الحادثة أو إسنادها.
            </p>
          )}

          <div>
            <p className="text-label mb-2">السطر الزمني</p>
            {detail.events.length === 0 ? (
              <p className="text-caption">لا توجد أحداث مسجّلة بعد.</p>
            ) : (
              <ol className="space-y-2">
                {detail.events.map((event) => (
                  <li
                    key={event.id}
                    className="rounded-[var(--radius-m)] border border-border p-3 text-body-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">
                        {INCIDENT_EVENT_LABELS[event.kind] ?? event.kind}
                      </span>
                      <span className="text-caption">{fmtDateTime(event.createdAt)}</span>
                    </div>
                    {event.note && <p className="text-caption mt-1">{event.note}</p>}
                    {event.actorEmail && <p className="text-caption mt-1">{event.actorEmail}</p>}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      ) : null}
    </Modal>
  );
}

function StatCard({
  Icon,
  label,
  value,
  hint,
  tone,
}: {
  Icon: typeof Activity;
  label: string;
  value: string;
  hint?: string;
  tone: "green" | "red" | "warn" | "info";
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-caption">{label}</dt>
      <dd className="mt-0.5 text-body-sm font-medium">{value}</dd>
    </div>
  );
}
