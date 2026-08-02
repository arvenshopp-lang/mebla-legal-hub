import { createFileRoute } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { KeyRound, ShieldAlert, ShieldCheck, RefreshCw, Lock } from "lucide-react";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin/shell";
import { Badge, EmptyState, LoadingBlock, Td, Th } from "@/lib/list-utils";
import { fmtDateTime } from "@/lib/enums";
import {
  registerEncryptionKeyVersion,
  retireEncryptionKeyVersion,
  runReencryptionBatch,
  securityCenterOverview,
  securityDocumentDenials,
  securityRevealFeed,
} from "@/lib/admin-security.functions";
import { usePlatformAdmin } from "@/hooks/use-platform-admin";

export const Route = createFileRoute("/mehla-admin/security")({
  head: () => ({
    meta: [{ title: "مركز الأمان · إدارة مِهلة" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: SecurityCenterPage,
});

const OUTCOME_LABEL: Record<string, { label: string; tone: "green" | "red" | "warn" }> = {
  success: { label: "نجحت", tone: "green" },
  denied: { label: "مرفوضة", tone: "red" },
  rate_limited: { label: "تجاوز حد", tone: "warn" },
  mfa_required: { label: "بلا تحقق بخطوتين", tone: "warn" },
};

const ACTION_LABEL: Record<string, string> = {
  VIEW: "عرض",
  PREVIEW: "معاينة",
  DOWNLOAD: "تنزيل",
  PRINT: "طباعة",
  EXPORT: "تصدير",
  SHARE: "مشاركة",
};

const FIELD_LABEL: Record<string, string> = {
  national_id: "رقم الهوية",
  commercial_registration: "السجل التجاري",
};

function Panel({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="surface-card overflow-hidden">
      <header className="border-b border-border px-4 py-3">
        <h2 className="text-[15px] font-semibold text-foreground">{title}</h2>
        {description && <p className="mt-0.5 text-[12px] text-muted-foreground">{description}</p>}
      </header>
      <div className="overflow-x-auto">{children}</div>
    </section>
  );
}

function Metric({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "danger" | "success";
}) {
  return (
    <div className="rounded-[var(--radius-l)] border border-border bg-surface p-4">
      <p className="text-[12px] text-muted-foreground">{label}</p>
      <p
        className={
          tone === "danger"
            ? "mt-1 text-h4 font-bold text-danger"
            : tone === "success"
              ? "mt-1 text-h4 font-bold text-success"
              : "mt-1 text-h4 font-bold text-foreground"
        }
      >
        {value}
      </p>
      {hint && <p className="mt-1 text-[11px] text-text-muted">{hint}</p>}
    </div>
  );
}

function SecurityCenterPage() {
  const { can } = usePlatformAdmin();
  const qc = useQueryClient();
  const overviewFn = useServerFn(securityCenterOverview);
  const revealFn = useServerFn(securityRevealFeed);
  const denialsFn = useServerFn(securityDocumentDenials);
  const registerFn = useServerFn(registerEncryptionKeyVersion);
  const batchFn = useServerFn(runReencryptionBatch);
  const retireFn = useServerFn(retireEncryptionKeyVersion);

  const [busy, setBusy] = useState<string | null>(null);
  const [newVersion, setNewVersion] = useState("");

  const { data: overview, isLoading } = useQuery({
    queryKey: ["admin-security-overview"],
    queryFn: () => overviewFn(),
  });
  const { data: reveals } = useQuery({
    queryKey: ["admin-security-reveals"],
    enabled: can("audit.read"),
    queryFn: () => revealFn({ data: { limit: 25 } }),
  });
  const { data: denials } = useQuery({
    queryKey: ["admin-security-denials"],
    enabled: can("audit.read"),
    queryFn: () => denialsFn({ data: { limit: 25 } }),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin-security-overview"] });
    qc.invalidateQueries({ queryKey: ["admin-security-reveals"] });
    qc.invalidateQueries({ queryKey: ["admin-security-denials"] });
  };

  const run = async (key: string, action: () => Promise<unknown>, success: string) => {
    setBusy(key);
    try {
      await action();
      toast.success(success);
      refresh();
    } catch (error) {
      toast.error("تعذّرت العملية", { description: error instanceof Error ? error.message : undefined });
    } finally {
      setBusy(null);
    }
  };

  const canManageKeys = can("settings.manage");

  return (
    <AdminShell
      title="مركز الأمان"
      description="تغطية التحقق بخطوتين، محاولات الوصول المرفوضة، حالة مفاتيح التشفير ومستودع الملفات."
      actions={
        <button
          type="button"
          onClick={refresh}
          className="inline-flex h-10 items-center gap-2 rounded-[var(--radius-m)] border border-border px-3 text-sm font-medium hover:bg-surface-muted"
        >
          <RefreshCw className="h-4 w-4" aria-hidden /> تحديث
        </button>
      }
    >
      {isLoading || !overview ? (
        <LoadingBlock />
      ) : (
        <div className="grid gap-6">
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric
              label="تغطية التحقق بخطوتين (فريق المنصة)"
              value={`${overview.mfa.coverage}%`}
              hint={`${overview.mfa.enrolled} من ${overview.mfa.total} عضواً`}
              tone={overview.mfa.coverage === 100 ? "success" : "danger"}
            />
            <Metric
              label="محاولات كشف مرفوضة (٧ أيام)"
              value={String(overview.attempts.reveal_denied_7d)}
              tone={overview.attempts.reveal_denied_7d > 0 ? "danger" : "success"}
            />
            <Metric
              label="محاولات مستندات مرفوضة (٧ أيام)"
              value={String(overview.attempts.document_denied_7d)}
              tone={overview.attempts.document_denied_7d > 0 ? "danger" : "success"}
            />
            <Metric
              label="عمليات كشف ناجحة (٢٤ ساعة)"
              value={String(overview.attempts.reveal_success_24h)}
              hint="كل عملية مسجَّلة باسم المستخدم ومعرّف تتبع"
            />
          </section>

          {overview.mfa.pending.length > 0 && (
            <Panel
              title="أعضاء لم يفعّلوا التحقق بخطوتين"
              description="لا يستطيع هؤالء تنفيذ أي عملية إدارية حساسة حتى التفعيل."
            >
              <ul className="divide-y divide-border">
                {overview.mfa.pending.map((member) => (
                  <li key={member.email} className="flex items-center justify-between gap-3 px-4 py-3">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{member.name}</span>
                      <span className="block truncate text-[12px] text-muted-foreground" dir="ltr">
                        {member.email}
                      </span>
                    </span>
                    <Badge tone="warn">
                      <ShieldAlert className="h-3.5 w-3.5" aria-hidden /> غير مفعّل
                    </Badge>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          <Panel
            title="مستودع الملفات والروابط المؤقتة"
            description="جميع الملفات في مستودع خاص؛ الوصول عبر تذاكر مؤقتة بعلامة مائية فقط."
          >
            <div className="grid gap-3 p-4 sm:grid-cols-3">
              <Metric
                label="حالة المستودع"
                value={overview.storage.all_private ? "خاص بالكامل" : "يوجد مستودع عام"}
                tone={overview.storage.all_private ? "success" : "danger"}
              />
              <Metric label="تذاكر وصول سارية" value={String(overview.storage.active_tokens)} />
              <Metric
                label="عدد المستودعات"
                value={String(overview.storage.buckets.length)}
                hint={overview.storage.buckets.map((b) => b.name).join("، ")}
              />
            </div>
          </Panel>

          <Panel
            title="مفاتيح التشفير وتدويرها"
            description="لا تُخزَّن مادة أي مفتاح في قاعدة البيانات أو الواجهة؛ يظهر هنا وجودها فقط."
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-right">
                <thead>
                  <tr>
                    <Th>الإصدار</Th>
                    <Th>الحالة</Th>
                    <Th>مادة المفتاح</Th>
                    <Th>سجلات مرتبطة</Th>
                    <Th>التفعيل</Th>
                    <Th>إجراءات</Th>
                  </tr>
                </thead>
                <tbody>
                  {overview.keys.versions.map((version) => (
                    <tr key={version.key_version} className="border-t border-border">
                      <Td>
                        <span className="inline-flex items-center gap-2 font-mono" dir="ltr">
                          <KeyRound className="h-3.5 w-3.5 text-text-muted" aria-hidden />v{version.key_version}
                        </span>
                      </Td>
                      <Td>
                        {version.is_active_for_writes ? (
                          <Badge tone="green">نشط للكتابة</Badge>
                        ) : version.status === "retired" ? (
                          <Badge tone="muted">متقاعد</Badge>
                        ) : version.status === "unregistered" ? (
                          <Badge tone="warn">غير مسجَّل</Badge>
                        ) : (
                          <Badge tone="info">قراءة فقط</Badge>
                        )}
                      </Td>
                      <Td>
                        {version.master_key_present && version.blind_index_key_present ? (
                          <Badge tone="green">
                            <Lock className="h-3.5 w-3.5" aria-hidden /> متوفرة
                          </Badge>
                        ) : (
                          <Badge tone="red">ناقصة</Badge>
                        )}
                      </Td>
                      <Td>
                        <span dir="ltr">
                          {version.rows.total} ({version.rows.clients} / {version.rows.case_parties})
                        </span>
                      </Td>
                      <Td>{version.activated_at ? fmtDateTime(version.activated_at) : "—"}</Td>
                      <Td>
                        <div className="flex flex-wrap gap-2">
                          {canManageKeys && !version.is_active_for_writes && version.rows.total > 0 && (
                            <>
                              <button
                                type="button"
                                disabled={busy !== null}
                                onClick={() =>
                                  run(
                                    `clients-${version.key_version}`,
                                    () =>
                                      batchFn({
                                        data: {
                                          entity: "clients",
                                          fromVersion: version.key_version,
                                          batchSize: 100,
                                        },
                                      }),
                                    "تمت دفعة إعادة تشفير العملاء",
                                  )
                                }
                                className="rounded-[var(--radius-s)] border border-border px-2 py-1 text-[12px] hover:bg-surface-muted disabled:opacity-50"
                              >
                                {busy === `clients-${version.key_version}` ? "جارٍ…" : "إعادة تشفير العملاء"}
                              </button>
                              <button
                                type="button"
                                disabled={busy !== null}
                                onClick={() =>
                                  run(
                                    `parties-${version.key_version}`,
                                    () =>
                                      batchFn({
                                        data: {
                                          entity: "case_parties",
                                          fromVersion: version.key_version,
                                          batchSize: 100,
                                        },
                                      }),
                                    "تمت دفعة إعادة تشفير أطراف القضايا",
                                  )
                                }
                                className="rounded-[var(--radius-s)] border border-border px-2 py-1 text-[12px] hover:bg-surface-muted disabled:opacity-50"
                              >
                                {busy === `parties-${version.key_version}` ? "جارٍ…" : "إعادة تشفير الأطراف"}
                              </button>
                            </>
                          )}
                          {canManageKeys &&
                            !version.is_active_for_writes &&
                            version.rows.total === 0 &&
                            version.status !== "retired" &&
                            version.status !== "unregistered" && (
                              <button
                                type="button"
                                disabled={busy !== null}
                                onClick={() =>
                                  run(
                                    `retire-${version.key_version}`,
                                    () => retireFn({ data: { version: version.key_version } }),
                                    "تم تقاعد الإصدار",
                                  )
                                }
                                className="rounded-[var(--radius-s)] border border-border px-2 py-1 text-[12px] text-danger hover:bg-danger/5 disabled:opacity-50"
                              >
                                تقاعد الإصدار
                              </button>
                            )}
                          {canManageKeys && version.status === "unregistered" && version.master_key_present && (
                            <button
                              type="button"
                              disabled={busy !== null}
                              onClick={() =>
                                run(
                                  `register-${version.key_version}`,
                                  () => registerFn({ data: { version: version.key_version } }),
                                  "تم تسجيل الإصدار",
                                )
                              }
                              className="rounded-[var(--radius-s)] border border-border px-2 py-1 text-[12px] hover:bg-surface-muted disabled:opacity-50"
                            >
                              تسجيل الإصدار
                            </button>
                          )}
                        </div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {canManageKeys && (
              <div className="flex flex-wrap items-end gap-3 border-t border-border p-4">
                <label className="grid gap-1 text-[12px] text-muted-foreground">
                  رقم إصدار جديد (بعد إضافة سرّيه على الخادم)
                  <input
                    value={newVersion}
                    onChange={(e) => setNewVersion(e.target.value.replace(/[^0-9]/g, ""))}
                    inputMode="numeric"
                    dir="ltr"
                    className="h-10 w-28 rounded-[var(--radius-m)] border border-border bg-surface px-3 text-sm"
                  />
                </label>
                <button
                  type="button"
                  disabled={busy !== null || !newVersion}
                  onClick={() =>
                    run(
                      "register-new",
                      () => registerFn({ data: { version: Number(newVersion) } }),
                      "تم تسجيل إصدار المفتاح الجديد",
                    )
                  }
                  className="inline-flex h-10 items-center gap-2 rounded-[var(--radius-m)] bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                >
                  <ShieldCheck className="h-4 w-4" aria-hidden /> تسجيل وتفعيل
                </button>
                <p className="text-[11px] text-text-muted">
                  البيانات القديمة تبقى مقروءة بمفتاحها، ولا يُقاعد أي إصدار قبل نقل كل سجلاته.
                </p>
              </div>
            )}
          </Panel>

          {overview.rotation_jobs.length > 0 && (
            <Panel title="آخر عمليات إعادة التشفير">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-right">
                  <thead>
                    <tr>
                      <Th>النطاق</Th>
                      <Th>من / إلى</Th>
                      <Th>الحالة</Th>
                      <Th>منقولة</Th>
                      <Th>متعذّرة</Th>
                      <Th>آخر تحديث</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.rotation_jobs.map((job) => (
                      <tr key={job.id} className="border-t border-border">
                        <Td>{job.entity === "clients" ? "العملاء" : "أطراف القضايا"}</Td>
                        <Td>
                          <span dir="ltr">
                            v{job.from_version} → v{job.to_version}
                          </span>
                        </Td>
                        <Td>
                          <Badge
                            tone={
                              job.status === "completed"
                                ? "green"
                                : job.status === "failed"
                                  ? "red"
                                  : "info"
                            }
                          >
                            {job.status === "completed"
                              ? "مكتملة"
                              : job.status === "failed"
                                ? "متعذّرة"
                                : "جارية"}
                          </Badge>
                        </Td>
                        <Td>{job.processed}</Td>
                        <Td>{job.failed}</Td>
                        <Td>{fmtDateTime(job.updated_at)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}

          {can("audit.read") && (
            <Panel
              title="آخر عمليات كشف البيانات الحساسة"
              description="لا تُخزَّن أي قيمة مكشوفة — يُسجَّل نوع الحقل والسبب ومعرّف التتبع فقط."
            >
              {(reveals ?? []).length === 0 ? (
                <EmptyState title="لا توجد عمليات كشف" hint="لم تُسجَّل أي عملية كشف بعد." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[820px] text-right">
                    <thead>
                      <tr>
                        <Th>الحقل</Th>
                        <Th>السجل</Th>
                        <Th>النتيجة</Th>
                        <Th>التحقق</Th>
                        <Th>السبب</Th>
                        <Th>الجهاز</Th>
                        <Th>المرجع</Th>
                        <Th>التاريخ</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {(reveals ?? []).map((row) => {
                        const outcome = OUTCOME_LABEL[row.outcome] ?? { label: row.outcome, tone: "warn" as const };
                        return (
                          <tr key={row.id} className="border-t border-border">
                            <Td>{FIELD_LABEL[row.field] ?? row.field}</Td>
                            <Td>{row.entity_type}</Td>
                            <Td>
                              <Badge tone={outcome.tone}>{outcome.label}</Badge>
                            </Td>
                            <Td>
                              <span dir="ltr">{row.aal || "—"}</span>
                            </Td>
                            <Td className="max-w-[220px] truncate">{row.reason ?? "—"}</Td>
                            <Td>
                              {row.device ?? "—"} · {row.browser ?? "—"}
                            </Td>
                            <Td>
                              <span className="font-mono text-[12px]" dir="ltr">
                                {row.trace_ref ?? "—"}
                              </span>
                            </Td>
                            <Td>{fmtDateTime(row.created_at)}</Td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          )}

          {can("audit.read") && (
            <Panel
              title="محاولات وصول مرفوضة على المستندات"
              description="تُسجَّل المحاولة المرفوضة كما تُسجَّل الناجحة، مع سبب الرفض ومعرّف التتبع."
            >
              {(denials ?? []).length === 0 ? (
                <EmptyState title="لا محاولات مرفوضة" hint="لم تُرفض أي محاولة وصول خلال الفترة." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-right">
                    <thead>
                      <tr>
                        <Th>العملية</Th>
                        <Th>سبب الرفض</Th>
                        <Th>الجهاز</Th>
                        <Th>المرجع</Th>
                        <Th>التاريخ</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {(denials ?? []).map((row) => (
                        <tr key={row.id} className="border-t border-border">
                          <Td>{ACTION_LABEL[row.action_type] ?? row.action_type}</Td>
                          <Td>
                            {row.denial_reason === "MFA_REQUIRED" ? "بدون تحقق بخطوتين" : (row.denial_reason ?? "—")}
                          </Td>
                          <Td>
                            {row.device ?? "—"} · {row.browser ?? "—"}
                          </Td>
                          <Td>
                            <span className="font-mono text-[12px]" dir="ltr">
                              {row.trace_ref ?? "—"}
                            </span>
                          </Td>
                          <Td>{fmtDateTime(row.created_at)}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          )}
        </div>
      )}
    </AdminShell>
  );
}