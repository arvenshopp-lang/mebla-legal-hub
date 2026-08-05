import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCircle2, DatabaseBackup, Plus, ShieldAlert } from "lucide-react";
import { AdminShell } from "@/components/admin/shell";
import {
  Badge,
  Btn,
  DataCard,
  EmptyState,
  ErrorBlock,
  FormField,
  LoadingBlock,
  Modal,
  SectionCard,
  Td,
  Th,
  inputCls,
} from "@/lib/list-utils";
import { fmtDateTime } from "@/lib/enums";
import { usePlatformAdmin } from "@/hooks/use-platform-admin";
import {
  decideBackupRestore,
  listBackupSnapshots,
  listRestoreRequests,
  recordBackupRestoreExecution,
  recordBackupSnapshot,
  requestBackupRestore,
  verifyBackupSnapshot,
} from "@/lib/backups.functions";
import { BACKUP_KINDS, BACKUP_STATUSES, RESTORE_STATUSES, fmtBytes, type BackupKind } from "@/lib/backups.shared";

export const Route = createFileRoute("/mehla-admin/backups")({
  head: () => ({
    meta: [
      { title: "مركز النسخ الاحتياطية · إدارة مِهلة" },
      {
        name: "description",
        content: "سجل النسخ الاحتياطية وطلبات الاستعادة واعتماداتها بمبدأ الرقابة المزدوجة.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: BackupsPage,
});

type RecordDraft = {
  kind: BackupKind;
  source: string;
  externalId: string;
  sizeBytes: string;
  retentionUntil: string;
  notes: string;
};

const emptyRecordDraft: RecordDraft = {
  kind: "manual",
  source: "",
  externalId: "",
  sizeBytes: "",
  retentionUntil: "",
  notes: "",
};

function BackupsPage() {
  const { can } = usePlatformAdmin();
  const canManage = can("backups.manage");
  const canRestore = can("backups.restore");
  const queryClient = useQueryClient();

  const [recordOpen, setRecordOpen] = useState(false);
  const [recordDraft, setRecordDraft] = useState<RecordDraft>(emptyRecordDraft);
  const [recordErrors, setRecordErrors] = useState<Record<string, string>>({});

  const [requestOpen, setRequestOpen] = useState(false);
  const [requestScope, setRequestScope] = useState("");
  const [requestReason, setRequestReason] = useState("");
  const [requestSnapshot, setRequestSnapshot] = useState<string>("");
  const [requestErrors, setRequestErrors] = useState<Record<string, string>>({});

  const [decisionTarget, setDecisionTarget] = useState<{ id: string; decision: "approved" | "rejected" } | null>(null);
  const [decisionNote, setDecisionNote] = useState("");

  const [executeId, setExecuteId] = useState<string | null>(null);
  const [executeNote, setExecuteNote] = useState("");

  const snapshotsFn = useServerFn(listBackupSnapshots);
  const requestsFn = useServerFn(listRestoreRequests);

  const snapshotsQuery = useQuery({
    queryKey: ["admin-backup-snapshots"],
    queryFn: () => snapshotsFn({ data: {} }),
    enabled: canManage,
  });
  const requestsQuery = useQuery({
    queryKey: ["admin-backup-restore-requests"],
    queryFn: () => requestsFn({ data: undefined }),
    enabled: canManage,
  });

  const invalidateAll = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin-backup-snapshots"] });
    void queryClient.invalidateQueries({ queryKey: ["admin-backup-restore-requests"] });
  };

  const recordFn = useServerFn(recordBackupSnapshot);
  const recordMutation = useMutation({
    mutationFn: () =>
      recordFn({
        data: {
          kind: recordDraft.kind,
          source: recordDraft.source,
          externalId: recordDraft.externalId || null,
          sizeBytes: recordDraft.sizeBytes ? Number(recordDraft.sizeBytes) : null,
          retentionUntil: recordDraft.retentionUntil ? new Date(recordDraft.retentionUntil).toISOString() : null,
          notes: recordDraft.notes || null,
          status: "recorded",
        },
      }),
    onSuccess: () => {
      toast.success("تم تسجيل النسخة الاحتياطية.");
      setRecordOpen(false);
      setRecordDraft(emptyRecordDraft);
      invalidateAll();
    },
    onError: (e: Error) => setRecordErrors({ form: e.message }),
  });

  const verifyFn = useServerFn(verifyBackupSnapshot);
  const verifyMutation = useMutation({
    mutationFn: (id: string) => verifyFn({ data: { id } }),
    onSuccess: () => {
      toast.success("تم تأكيد التحقق من سلامة النسخة.");
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const requestFn = useServerFn(requestBackupRestore);
  const requestMutation = useMutation({
    mutationFn: () =>
      requestFn({ data: { snapshotId: requestSnapshot || null, scope: requestScope, reason: requestReason } }),
    onSuccess: () => {
      toast.success("تم إرسال طلب الاستعادة للاعتماد.");
      setRequestOpen(false);
      setRequestScope("");
      setRequestReason("");
      setRequestSnapshot("");
      invalidateAll();
    },
    onError: (e: Error) => setRequestErrors({ form: e.message }),
  });

  const decideFn = useServerFn(decideBackupRestore);
  const decideMutation = useMutation({
    mutationFn: () =>
      decideFn({ data: { id: decisionTarget!.id, decision: decisionTarget!.decision, note: decisionNote || null } }),
    onSuccess: () => {
      toast.success(decisionTarget?.decision === "approved" ? "تم اعتماد الطلب." : "تم رفض الطلب.");
      setDecisionTarget(null);
      setDecisionNote("");
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const executeFn = useServerFn(recordBackupRestoreExecution);
  const executeMutation = useMutation({
    mutationFn: () => executeFn({ data: { id: executeId!, note: executeNote || null } }),
    onSuccess: () => {
      toast.success("تم تسجيل تنفيذ الاستعادة.");
      setExecuteId(null);
      setExecuteNote("");
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!canManage) {
    return (
      <AdminShell title="مركز النسخ الاحتياطية" description="سجل النسخ وطلبات الاستعادة واعتماداتها.">
        <ErrorBlock message="لا تملك صلاحية «النسخ الاحتياطي» للاطلاع على هذا المركز." />
      </AdminShell>
    );
  }

  const snapshots = snapshotsQuery.data?.rows ?? [];
  const requests = requestsQuery.data?.rows ?? [];
  const now = Date.now();

  return (
    <AdminShell
      title="مركز النسخ الاحتياطية"
      description="سجل وموافقات وتدقيق فقط — النسخ الاحتياطي الفعلي مُدار على مستوى الاستضافة ولا يُنفَّذ من هنا."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Btn size="sm" variant="outline" onClick={() => setRequestOpen(true)}>
            طلب استعادة
          </Btn>
          <Btn size="sm" onClick={() => setRecordOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden /> تسجيل نسخة
          </Btn>
        </div>
      }
    >
      <div className="mb-6 rounded-[var(--radius-m)] border border-info/25 bg-info-soft px-4 py-3 text-body-sm text-info">
        <ShieldAlert className="me-1.5 inline h-4 w-4" aria-hidden />
        هذا المركز سجل وموافقات وتدقيق فقط: لا يُنفّذ أي استعادة فعلية من الواجهة. النسخ الاحتياطي اليومي مُدار على
        مستوى الاستضافة، وتنفيذ الاستعادة يتم يدوياً من فريق البنية التحتية ثم يُسجَّل تاريخه هنا للتوثيق.
      </div>

      <SectionCard title="سجل النسخ الاحتياطية" description="مرتب بالأحدث أولاً — لا نسخ وهمية، فقط ما تم تسجيله فعلياً.">
        {snapshotsQuery.isLoading ? (
          <LoadingBlock rows={4} cols={5} />
        ) : snapshotsQuery.isError ? (
          <ErrorBlock message="تعذّر قراءة سجل النسخ." />
        ) : snapshots.length === 0 ? (
          <EmptyState
            title="لا توجد نسخ مسجَّلة"
            hint="النسخ الاحتياطية المُدارة على مستوى الاستضافة غير مربوطة بواجهة برمجية بعد؛ استخدم «تسجيل نسخة» لإدخال نسخة يدوية أو خارجية."
          />
        ) : (
          <DataCard>
            <table className="w-full min-w-[760px] text-right">
              <thead>
                <tr>
                  <Th>النوع</Th>
                  <Th>المصدر</Th>
                  <Th className="hidden sm:table-cell">الحجم</Th>
                  <Th>الحالة</Th>
                  <Th className="hidden md:table-cell">الاحتفاظ حتى</Th>
                  <Th className="hidden lg:table-cell">تاريخ التسجيل</Th>
                  <Th>إجراء</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {snapshots.map((s) => {
                  const expired = s.retention_until ? new Date(s.retention_until).getTime() < now : false;
                  return (
                    <tr key={s.id}>
                      <Td>{BACKUP_KINDS[s.kind] ?? s.kind}</Td>
                      <Td className="max-w-[180px] truncate" title={s.source}>
                        {s.source}
                        {s.external_id && <span className="text-caption block truncate">{s.external_id}</span>}
                      </Td>
                      <Td className="hidden sm:table-cell">{fmtBytes(s.size_bytes)}</Td>
                      <Td>
                        <div className="flex flex-col gap-1">
                          <Badge tone={s.status === "verified" ? "green" : s.status === "failed" ? "red" : "info"}>
                            {BACKUP_STATUSES[s.status] ?? s.status}
                          </Badge>
                          {expired && <Badge tone="warn">منتهية الاحتفاظ</Badge>}
                        </div>
                      </Td>
                      <Td className="hidden md:table-cell text-[12px] text-muted-foreground">
                        {s.retention_until ? fmtDateTime(s.retention_until) : "—"}
                      </Td>
                      <Td className="hidden lg:table-cell text-[12px] text-muted-foreground">
                        {fmtDateTime(s.created_at)}
                      </Td>
                      <Td>
                        {s.status !== "verified" ? (
                          <Btn
                            size="sm"
                            variant="outline"
                            loading={verifyMutation.isPending}
                            onClick={() => verifyMutation.mutate(s.id)}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> تأكيد التحقق
                          </Btn>
                        ) : (
                          <span className="text-caption">
                            تحقّق {s.verified_at ? fmtDateTime(s.verified_at) : ""}
                          </span>
                        )}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </DataCard>
        )}
      </SectionCard>

      <div className="mt-6">
        <SectionCard
          title="طلبات الاستعادة"
          description="سبب لا يقل عن ١٠ أحرف ونطاق محدد، ثم اعتماد أو رفض بمبدأ الرقابة المزدوجة (لا يعتمد الطالب طلبه)."
        >
          {requestsQuery.isLoading ? (
            <LoadingBlock rows={3} cols={5} />
          ) : requestsQuery.isError ? (
            <ErrorBlock message="تعذّر قراءة طلبات الاستعادة." />
          ) : requests.length === 0 ? (
            <EmptyState title="لا توجد طلبات استعادة" hint="عند الحاجة لاستعادة بيانات، أنشئ طلباً موضحاً السبب والنطاق." />
          ) : (
            <DataCard>
              <table className="w-full min-w-[760px] text-right">
                <thead>
                  <tr>
                    <Th>النطاق</Th>
                    <Th className="hidden sm:table-cell">السبب</Th>
                    <Th>الحالة</Th>
                    <Th className="hidden md:table-cell">الطالب</Th>
                    <Th className="hidden lg:table-cell">القرار</Th>
                    <Th>إجراء</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {requests.map((r) => (
                    <tr key={r.id}>
                      <Td className="max-w-[160px] truncate" title={r.scope}>
                        {r.scope}
                      </Td>
                      <Td className="hidden sm:table-cell max-w-[220px] truncate" title={r.reason}>
                        {r.reason}
                      </Td>
                      <Td>
                        <Badge
                          tone={
                            r.status === "executed"
                              ? "green"
                              : r.status === "approved"
                                ? "info"
                                : r.status === "rejected"
                                  ? "red"
                                  : "warn"
                          }
                        >
                          {RESTORE_STATUSES[r.status] ?? r.status}
                        </Badge>
                      </Td>
                      <Td className="hidden md:table-cell text-[12px] text-muted-foreground">{r.requested_by_email}</Td>
                      <Td className="hidden lg:table-cell text-[12px] text-muted-foreground">
                        {r.approved_by_email ? `${r.approved_by_email} · ${fmtDateTime(r.approved_at)}` : "—"}
                      </Td>
                      <Td>
                        {r.status === "pending" && canRestore ? (
                          <div className="flex gap-1.5">
                            <Btn size="sm" variant="outline" onClick={() => setDecisionTarget({ id: r.id, decision: "approved" })}>
                              اعتماد
                            </Btn>
                            <Btn size="sm" variant="danger" onClick={() => setDecisionTarget({ id: r.id, decision: "rejected" })}>
                              رفض
                            </Btn>
                          </div>
                        ) : r.status === "approved" ? (
                          <Btn size="sm" variant="outline" onClick={() => setExecuteId(r.id)}>
                            تسجيل التنفيذ
                          </Btn>
                        ) : (
                          <span className="text-caption">—</span>
                        )}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DataCard>
          )}
        </SectionCard>
      </div>

      {/* تسجيل نسخة */}
      <Modal
        open={recordOpen}
        onClose={() => {
          setRecordOpen(false);
          setRecordErrors({});
        }}
        title="تسجيل نسخة احتياطية"
        description="سجل بيانات نسخة تمت خارجياً (استضافة/مزوّد قاعدة بيانات) — لا يُنشئ هذا نسخة فعلية."
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="النوع" required>
              <select
                className={inputCls}
                value={recordDraft.kind}
                onChange={(e) => setRecordDraft({ ...recordDraft, kind: e.target.value as BackupKind })}
              >
                {Object.entries(BACKUP_KINDS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="الحجم (بايت)" hint="اختياري">
              <input
                type="number"
                className={inputCls}
                dir="ltr"
                value={recordDraft.sizeBytes}
                onChange={(e) => setRecordDraft({ ...recordDraft, sizeBytes: e.target.value })}
              />
            </FormField>
          </div>
          <FormField label="المصدر" required hint="مثال: Supabase Daily Snapshot / نسخة يدوية عبر pg_dump">
            <input
              className={inputCls}
              value={recordDraft.source}
              onChange={(e) => setRecordDraft({ ...recordDraft, source: e.target.value })}
            />
          </FormField>
          <FormField label="الرقم المرجعي" hint="اختياري — معرّف النسخة لدى المزوّد">
            <input
              className={inputCls}
              dir="ltr"
              value={recordDraft.externalId}
              onChange={(e) => setRecordDraft({ ...recordDraft, externalId: e.target.value })}
            />
          </FormField>
          <FormField label="الاحتفاظ حتى" hint="اختياري — لتنبيهك عند انتهاء سياسة الاحتفاظ">
            <input
              type="date"
              className={inputCls}
              value={recordDraft.retentionUntil}
              onChange={(e) => setRecordDraft({ ...recordDraft, retentionUntil: e.target.value })}
            />
          </FormField>
          <FormField label="ملاحظات">
            <textarea
              className={`${inputCls} min-h-24`}
              value={recordDraft.notes}
              onChange={(e) => setRecordDraft({ ...recordDraft, notes: e.target.value })}
            />
          </FormField>
          {recordErrors.form && <p className="text-[12px] text-danger">{recordErrors.form}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Btn variant="outline" onClick={() => setRecordOpen(false)}>
              إلغاء
            </Btn>
            <Btn
              loading={recordMutation.isPending}
              disabled={!recordDraft.source.trim()}
              onClick={() => recordMutation.mutate()}
            >
              <DatabaseBackup className="h-4 w-4" aria-hidden /> حفظ
            </Btn>
          </div>
        </div>
      </Modal>

      {/* طلب استعادة */}
      <Modal
        open={requestOpen}
        onClose={() => {
          setRequestOpen(false);
          setRequestErrors({});
        }}
        title="طلب استعادة نسخة احتياطية"
        description="يتطلب اعتماد موظف آخر يملك صلاحية «اعتماد الاستعادة» قبل أي تنفيذ."
      >
        <div className="space-y-4">
          <FormField label="النسخة المرجوّة" hint="اختياري — اتركه فارغاً إن كانت الاستعادة جزئية بلا نسخة محددة">
            <select
              className={inputCls}
              value={requestSnapshot}
              onChange={(e) => setRequestSnapshot(e.target.value)}
            >
              <option value="">بدون تحديد</option>
              {snapshots.map((s) => (
                <option key={s.id} value={s.id}>
                  {BACKUP_KINDS[s.kind]} · {s.source} · {fmtDateTime(s.created_at)}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="نطاق الاستعادة" required>
            <input className={inputCls} value={requestScope} onChange={(e) => setRequestScope(e.target.value)} placeholder="مثال: جدول الفواتير فقط — منظمة كذا" />
          </FormField>
          <FormField label="السبب" required hint="لا يقل عن ١٠ أحرف">
            <textarea
              className={`${inputCls} min-h-24`}
              value={requestReason}
              onChange={(e) => setRequestReason(e.target.value)}
            />
          </FormField>
          {requestErrors.form && <p className="text-[12px] text-danger">{requestErrors.form}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Btn variant="outline" onClick={() => setRequestOpen(false)}>
              إلغاء
            </Btn>
            <Btn
              loading={requestMutation.isPending}
              disabled={requestScope.trim().length < 2 || requestReason.trim().length < 10}
              onClick={() => requestMutation.mutate()}
            >
              إرسال الطلب
            </Btn>
          </div>
        </div>
      </Modal>

      {/* قرار الاعتماد */}
      <Modal
        open={decisionTarget !== null}
        onClose={() => {
          setDecisionTarget(null);
          setDecisionNote("");
        }}
        title={decisionTarget?.decision === "approved" ? "اعتماد طلب الاستعادة" : "رفض طلب الاستعادة"}
      >
        <div className="space-y-4">
          <FormField label="ملاحظة القرار" hint="اختياري">
            <textarea className={`${inputCls} min-h-20`} value={decisionNote} onChange={(e) => setDecisionNote(e.target.value)} />
          </FormField>
          <div className="flex justify-end gap-2 pt-2">
            <Btn variant="outline" onClick={() => setDecisionTarget(null)}>
              إلغاء
            </Btn>
            <Btn
              variant={decisionTarget?.decision === "rejected" ? "danger" : "primary"}
              loading={decideMutation.isPending}
              onClick={() => decideMutation.mutate()}
            >
              تأكيد
            </Btn>
          </div>
        </div>
      </Modal>

      {/* تسجيل التنفيذ */}
      <Modal open={executeId !== null} onClose={() => setExecuteId(null)} title="تسجيل تنفيذ الاستعادة">
        <div className="space-y-4">
          <p className="text-body-sm text-muted-foreground">
            هذا يوثّق أن فريق البنية التحتية نفّذ الاستعادة يدوياً على مستوى الاستضافة — لا يُشغّل أي عملية فعلية.
          </p>
          <FormField label="ملاحظة التنفيذ" hint="اختياري">
            <textarea className={`${inputCls} min-h-20`} value={executeNote} onChange={(e) => setExecuteNote(e.target.value)} />
          </FormField>
          <div className="flex justify-end gap-2 pt-2">
            <Btn variant="outline" onClick={() => setExecuteId(null)}>
              إلغاء
            </Btn>
            <Btn loading={executeMutation.isPending} onClick={() => executeMutation.mutate()}>
              تأكيد التسجيل
            </Btn>
          </div>
        </div>
      </Modal>
    </AdminShell>
  );
}
