import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  Link2,
  Link2Off,
  Power,
  RefreshCw,
  ScrollText,
  Send,
  Sparkles,
  TimerReset,
  XCircle,
} from "lucide-react";
import { Badge, Btn, EmptyState, LoadingBlock, Modal, inputCls } from "@/lib/list-utils";
import { fmtDateTime } from "@/lib/enums";
import {
  CHECK_LABELS,
  LINK_STATUS_LABELS,
  OPERATION_LABELS,
  READINESS_CHECKS,
  type AgenticOperation,
} from "@/lib/email/agentic/agentic.shared";
import {
  activateAgenticMail,
  deactivateAgenticMail,
  discoverAgenticMailTools,
  dryRunAgenticSync,
  getAgenticMailLogs,
  getAgenticMailStatus,
  linkAgenticMailboxes,
  resetAgenticMailboxCursor,
  retryAgenticMailFailures,
  sendAgenticTestMessage,
  setAgenticMailboxSync,
  syncAgenticMailboxNow,
  syncAllAgenticMailboxesNow,
  testAgenticMailConnection,
  unlinkAgenticMailbox,
} from "@/lib/email/email.functions";

const STATUS_KEY = ["agentic-mail-status"];

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-body-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}

/**
 * لوحة تكامل Hostinger Agentic Mail داخل مركز التكاملات.
 *
 * كل حالة معروضة تأتي من الخادم: لا «متصل» بلا فحص فعلي، ولا تفعيل قبل استيفاء
 * الشروط، ولا عملية غير مدعومة تُعرض قابلة للنقر. لا تُعرض أي قيمة سر.
 */
export function AgenticMailPanel({ canManage = true }: { canManage?: boolean }) {
  const qc = useQueryClient();
  const statusFn = useServerFn(getAgenticMailStatus);
  const logsFn = useServerFn(getAgenticMailLogs);

  const status = useQuery({
    queryKey: STATUS_KEY,
    queryFn: () => statusFn({ data: undefined }),
    enabled: canManage,
  });

  const [logsOpen, setLogsOpen] = useState(false);
  const [testOpen, setTestOpen] = useState<{ mailboxId: string; address: string } | null>(null);
  const [testTo, setTestTo] = useState("");
  const [disableReason, setDisableReason] = useState("");
  const [disableOpen, setDisableOpen] = useState(false);

  const logs = useQuery({
    queryKey: ["agentic-mail-logs"],
    queryFn: () => logsFn({ data: { limit: 25 } }),
    enabled: canManage && logsOpen,
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: STATUS_KEY });
    void qc.invalidateQueries({ queryKey: ["agentic-mail-logs"] });
  };

  const notify = (message: string) => {
    toast.success(message);
    invalidate();
  };
  const fail = (error: Error) => toast.error(error.message);

  const connFn = useServerFn(testAgenticMailConnection);
  const conn = useMutation({
    mutationFn: () => connFn({ data: undefined }),
    onSuccess: (result) => {
      if (result.ok) notify(`نجح الاتصال (${result.latencyMs} م.ث)`);
      else {
        toast.error(result.error ?? "تعذّر الاتصال.");
        invalidate();
      }
    },
    onError: fail,
  });

  const discoverFn = useServerFn(discoverAgenticMailTools);
  const discover = useMutation({
    mutationFn: () => discoverFn({ data: undefined }),
    onSuccess: (result) => notify(`اكتُشفت ${result.tools.length} أداة عند المزوّد.`),
    onError: fail,
  });

  const linkFn = useServerFn(linkAgenticMailboxes);
  const link = useMutation({
    mutationFn: () => linkFn({ data: undefined }),
    onSuccess: (result) =>
      notify(
        `ربط ${result.linked} حساب حقيقي${result.aliased ? ` — ${result.aliased} اسم مستعار` : ""}${
          result.missing ? ` — ${result.missing} غير موجود عند المزوّد` : ""
        }`,
      ),
    onError: fail,
  });

  const unlinkFn = useServerFn(unlinkAgenticMailbox);
  const unlink = useMutation({
    mutationFn: (mailboxId: string) => unlinkFn({ data: { mailboxId } }),
    onSuccess: () => notify("تم فك ارتباط الصندوق."),
    onError: fail,
  });

  const dryFn = useServerFn(dryRunAgenticSync);
  const dry = useMutation({
    mutationFn: (mailboxId: string) => dryFn({ data: { mailboxId } }),
    onSuccess: (result) => {
      if (result.error) {
        toast.error(result.error);
        invalidate();
      } else {
        notify(`تشغيل تجريبي: ${result.fetched} رسالة مقروءة بلا أي كتابة.`);
      }
    },
    onError: fail,
  });

  const sendTestFn = useServerFn(sendAgenticTestMessage);
  const sendTest = useMutation({
    mutationFn: (input: { mailboxId: string; to: string }) => sendTestFn({ data: input }),
    onSuccess: (result) => {
      if (result.ok) {
        notify("تم إرسال رسالة الاختبار عبر المزوّد.");
        setTestOpen(null);
        setTestTo("");
      } else {
        toast.error(result.error ?? "تعذّر إرسال رسالة الاختبار.");
        invalidate();
      }
    },
    onError: fail,
  });

  const activateFn = useServerFn(activateAgenticMail);
  const activate = useMutation({
    mutationFn: () => activateFn({ data: undefined }),
    onSuccess: (result) => {
      if (result.ok) notify("تم تفعيل التكامل وبدأت الجدولة التزايدية.");
      else {
        toast.error(`منع التفعيل: ${result.blockers[0]}`);
        invalidate();
      }
    },
    onError: fail,
  });

  const deactivateFn = useServerFn(deactivateAgenticMail);
  const deactivate = useMutation({
    mutationFn: (reason: string) => deactivateFn({ data: { reason } }),
    onSuccess: () => {
      notify("تم تعطيل التكامل وإيقاف الجدولة.");
      setDisableOpen(false);
      setDisableReason("");
    },
    onError: fail,
  });

  const syncOneFn = useServerFn(syncAgenticMailboxNow);
  const syncOne = useMutation({
    mutationFn: (mailboxId: string) => syncOneFn({ data: { mailboxId } }),
    onSuccess: (result) => {
      if (result.error) {
        toast.error(result.error);
        invalidate();
      } else
        notify(result.ingested > 0 ? `مزامنة ${result.ingested} رسالة جديدة.` : "لا رسائل جديدة.");
      void qc.invalidateQueries({ queryKey: ["mail-threads"] });
    },
    onError: fail,
  });

  const syncAllFn = useServerFn(syncAllAgenticMailboxesNow);
  const syncAll = useMutation({
    mutationFn: () => syncAllFn({ data: undefined }),
    onSuccess: (result) =>
      notify(
        `مزامنة ${result.mailboxes} صندوق: ${result.ingested} رسالة جديدة، ${result.failed} فشل.`,
      ),
    onError: fail,
  });

  const retryFn = useServerFn(retryAgenticMailFailures);
  const retry = useMutation({
    mutationFn: () => retryFn({ data: undefined }),
    onSuccess: (result) => notify(`إعادة محاولة ${result.retried} صندوق، نجح ${result.recovered}.`),
    onError: fail,
  });

  const cursorFn = useServerFn(resetAgenticMailboxCursor);
  const resetCursor = useMutation({
    mutationFn: (mailboxId: string) => cursorFn({ data: { mailboxId } }),
    onSuccess: () => notify("أُعيد تعيين مؤشر المزامنة؛ منع التكرار يعتمد على معرّف الرسالة."),
    onError: fail,
  });

  const toggleFn = useServerFn(setAgenticMailboxSync);
  const toggleSync = useMutation({
    mutationFn: (input: { mailboxId: string; enabled: boolean }) => toggleFn({ data: input }),
    onSuccess: () => notify("تم تحديث حالة مزامنة الصندوق."),
    onError: fail,
  });

  if (!canManage) {
    return (
      <EmptyState
        title="لا تملك صلاحية إدارة مزوّدي البريد"
        hint="تواصل مع مسؤول المنصة لمنحك صلاحية إدارة مزوّدي البريد."
      />
    );
  }

  if (status.isLoading) return <LoadingBlock rows={4} cols={3} />;

  if (status.isError) {
    return (
      <EmptyState
        title="تعذّر عرض تكامل البريد الذكي"
        hint={
          status.error instanceof Error
            ? status.error.message
            : "تحقّق من صلاحياتك ثم أعد المحاولة."
        }
      />
    );
  }

  const data = status.data;
  if (!data) {
    return (
      <EmptyState
        title="تعذّر جلب حالة التكامل"
        hint="أعد المحاولة، وإن تكرر الأمر راجع سجل تشغيل البريد."
      />
    );
  }

  const { state, scheduler, mailboxes, fallback, ready, supported } = data;
  const sendSupported = Boolean(state.operations.sendMessage);
  const busy =
    conn.isPending ||
    discover.isPending ||
    link.isPending ||
    activate.isPending ||
    deactivate.isPending ||
    syncAll.isPending ||
    retry.isPending;

  return (
    <section
      aria-labelledby="agentic-mail-title"
      className="rounded-[var(--radius-l)] border border-border bg-surface p-5"
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-m)] bg-primary text-primary-foreground"
          >
            <Sparkles className="h-5 w-5" />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 id="agentic-mail-title" className="text-h6">
                Hostinger Agentic Mail
              </h3>
              <Badge tone={state.enabled ? "green" : "muted"}>
                {state.enabled ? "مُفعّل" : "غير مُفعّل"}
              </Badge>
              <Badge tone={state.secretPresent ? "green" : "red"}>
                {state.secretPresent ? "المفتاح مُعرّف" : "المفتاح غير مُعرّف"}
              </Badge>
              {!sendSupported && <Badge tone="warn">الإرسال عبر SMTP</Badge>}
            </div>
            <p className="mt-1 text-body-sm text-muted-foreground">
              ربط صناديق البريد عبر بروتوكول MCP لاستيراد الرسائل تزايدياً وربطها بمركز الدعم. لا
              تُعرض قيمة المفتاح ولا تُسجّل في أي مسار.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Btn variant="secondary" onClick={() => conn.mutate()} disabled={busy}>
            <RefreshCw className="h-4 w-4" aria-hidden /> اختبار الاتصال
          </Btn>
          <Btn variant="secondary" onClick={() => discover.mutate()} disabled={busy}>
            <Sparkles className="h-4 w-4" aria-hidden /> اكتشاف الأدوات
          </Btn>
          <Btn variant="secondary" onClick={() => link.mutate()} disabled={busy}>
            <Link2 className="h-4 w-4" aria-hidden /> ربط الصناديق
          </Btn>
          {state.enabled ? (
            <Btn variant="danger" onClick={() => setDisableOpen(true)} disabled={busy}>
              <Power className="h-4 w-4" aria-hidden /> تعطيل
            </Btn>
          ) : (
            <Btn onClick={() => activate.mutate()} disabled={busy || !ready}>
              <CheckCircle2 className="h-4 w-4" aria-hidden /> تفعيل
            </Btn>
          )}
        </div>
      </header>

      {state.lastError && (
        <p className="mt-4 flex items-start gap-2 rounded-[var(--radius-m)] bg-danger-soft px-4 py-3 text-body-sm text-danger">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            آخر خطأ ({fmtDateTime(state.lastError.at)}): {state.lastError.message}
          </span>
        </p>
      )}
      {scheduler.haltedReason && (
        <p className="mt-3 flex items-start gap-2 rounded-[var(--radius-m)] bg-warning-soft px-4 py-3 text-body-sm text-warning">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{scheduler.haltedReason}</span>
        </p>
      )}

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div className="rounded-[var(--radius-m)] border border-border p-4">
          <h4 className="text-body-sm font-semibold">شروط التفعيل</h4>
          <ul className="mt-3 space-y-2">
            {READINESS_CHECKS.map((check) => {
              const value = state.checks[check];
              const skipped = check === "test_send" && !sendSupported;
              return (
                <li key={check} className="flex items-start gap-2 text-body-sm">
                  {value.ok || skipped ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
                  ) : (
                    <XCircle
                      className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                  )}
                  <span className="min-w-0">
                    <span className="font-medium">{CHECK_LABELS[check]}</span>
                    <span className="block text-muted-foreground">
                      {skipped
                        ? "غير مطلوب: المزوّد لا يوفّر أداة إرسال."
                        : (value.detail ?? (value.ok ? "مستوفى" : "لم يُنفّذ بعد"))}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
          {!ready && !state.enabled && (
            <p className="mt-3 text-caption text-muted-foreground">
              التفعيل يبقى معطّلاً حتى تُستوفى كل الشروط فعلياً.
            </p>
          )}
        </div>

        <div className="rounded-[var(--radius-m)] border border-border p-4">
          <h4 className="text-body-sm font-semibold">التشغيل</h4>
          <div className="mt-3 space-y-1.5">
            <Row
              label="آخر اختبار"
              value={state.lastTestAt ? fmtDateTime(state.lastTestAt) : "—"}
            />
            <Row
              label="آخر مزامنة"
              value={state.lastSyncAt ? fmtDateTime(state.lastSyncAt) : "—"}
            />
            <Row
              label="الدورة القادمة"
              value={scheduler.nextRunAt ? fmtDateTime(scheduler.nextRunAt) : "—"}
            />
            <Row
              label="زمن الاستجابة"
              value={state.latencyMs != null ? `${state.latencyMs} م.ث` : "—"}
            />
            <Row label="رسائل مستوردة" value={String(state.counters.imported)} />
            <Row label="أخطاء مزامنة" value={String(state.counters.syncErrors)} />
            <Row label="فشل متتالٍ" value={String(scheduler.consecutiveFailures)} />
            <Row
              label="مسار الإرسال"
              value={
                sendSupported
                  ? `عبر المزوّد (${fallback.sentViaAgentic} رسالة) — SMTP احتياطي`
                  : "SMTP فقط"
              }
            />
            <Row
              label="قائمة الإرسال"
              value={`${fallback.pending} بالانتظار · ${fallback.failed} فشل`}
            />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Btn
              variant="secondary"
              onClick={() => syncAll.mutate()}
              disabled={busy || !state.enabled}
            >
              <RefreshCw className="h-4 w-4" aria-hidden /> مزامنة الكل
            </Btn>
            <Btn variant="secondary" onClick={() => retry.mutate()} disabled={busy}>
              <TimerReset className="h-4 w-4" aria-hidden /> إعادة المحاولة
            </Btn>
            <Btn variant="ghost" onClick={() => setLogsOpen(true)}>
              <ScrollText className="h-4 w-4" aria-hidden /> سجل الدورات
            </Btn>
          </div>
        </div>
      </div>

      <div className="mt-5">
        <h4 className="text-body-sm font-semibold">العمليات المدعومة فعلياً</h4>
        {supported.length === 0 ? (
          <p className="mt-2 text-body-sm text-muted-foreground">
            لم تُكتشف أي أداة بعد — نفّذ «اكتشاف الأدوات».
          </p>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-2">
            {supported.map((operation) => (
              <li key={operation}>
                <Badge tone="green">{OPERATION_LABELS[operation as AgenticOperation]}</Badge>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-5">
        <h4 className="text-body-sm font-semibold">الصناديق</h4>
        {mailboxes.length === 0 ? (
          <p className="mt-2 text-body-sm text-muted-foreground">لا توجد صناديق في نطاقك.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {mailboxes.map((box) => {
              // الحساب الحقيقي هو الصندوق المرتبط فعلياً عند المزوّد؛ الأسماء
              // المستعارة تُسلَّم إليه ولا تُزامن بذاتها.
              const isRealAccount = box.linkStatus === "linked";
              return (
                <li
                  key={box.id}
                  className="rounded-[var(--radius-m)] border border-border p-4 md:flex md:items-start md:justify-between md:gap-4"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium">{box.address}</span>
                      <Badge
                        tone={
                          box.linkStatus === "linked"
                            ? "green"
                            : box.linkStatus === "missing"
                              ? "red"
                              : "muted"
                        }
                      >
                        {LINK_STATUS_LABELS[box.linkStatus]}
                      </Badge>
                      {isRealAccount && !box.syncEnabled && (
                        <Badge tone="muted">المزامنة موقوفة</Badge>
                      )}
                      {isRealAccount && <Badge tone="muted">حساب حقيقي</Badge>}
                    </div>
                    <div className="mt-2 space-y-1">
                      <Row
                        label="آخر مزامنة"
                        value={box.lastSyncAt ? fmtDateTime(box.lastSyncAt) : "—"}
                      />
                      <Row label="غير مقروء" value={String(box.unreadCount)} />
                      {box.lastError && (
                        <p className="text-body-sm text-danger">آخر خطأ: {box.lastError}</p>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 md:mt-0 md:shrink-0">
                    <Btn
                      variant="secondary"
                      onClick={() => dry.mutate(box.id)}
                      disabled={dry.isPending || !isRealAccount}
                    >
                      تشغيل تجريبي
                    </Btn>
                    <Btn
                      variant="secondary"
                      onClick={() => syncOne.mutate(box.id)}
                      disabled={syncOne.isPending || !isRealAccount}
                    >
                      <RefreshCw className="h-4 w-4" aria-hidden /> مزامنة
                    </Btn>
                    {sendSupported && (
                      <Btn
                        variant="secondary"
                        onClick={() => setTestOpen({ mailboxId: box.id, address: box.address })}
                        disabled={!isRealAccount}
                      >
                        <Send className="h-4 w-4" aria-hidden /> رسالة اختبار
                      </Btn>
                    )}
                    <Btn
                      variant="ghost"
                      onClick={() =>
                        toggleSync.mutate({ mailboxId: box.id, enabled: !box.syncEnabled })
                      }
                      disabled={toggleSync.isPending || !isRealAccount}
                    >
                      {box.syncEnabled ? "إيقاف المزامنة" : "تفعيل المزامنة"}
                    </Btn>
                    <Btn
                      variant="ghost"
                      onClick={() => resetCursor.mutate(box.id)}
                      disabled={resetCursor.isPending || !isRealAccount}
                    >
                      <TimerReset className="h-4 w-4" aria-hidden /> تصفير المؤشر
                    </Btn>
                    {isRealAccount && (
                      <Btn
                        variant="ghost"
                        onClick={() => unlink.mutate(box.id)}
                        disabled={unlink.isPending}
                      >
                        <Link2Off className="h-4 w-4" aria-hidden /> فك الارتباط
                      </Btn>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Modal open={logsOpen} onClose={() => setLogsOpen(false)} title="سجل دورات المزامنة">
        {logs.isLoading ? (
          <LoadingBlock rows={4} cols={3} />
        ) : (logs.data?.runs.length ?? 0) === 0 ? (
          <EmptyState title="لا دورات مسجّلة" hint="ستظهر هنا كل دورة مزامنة يدوية أو مجدولة." />
        ) : (
          <ul className="space-y-3">
            {logs.data?.runs.map((run) => (
              <li key={run.id} className="rounded-[var(--radius-m)] border border-border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={run.outcome === "success" ? "green" : "red"}>{run.outcome}</Badge>
                  <Badge tone="muted">{run.triggerSource === "cron" ? "مجدولة" : "يدوية"}</Badge>
                  <span className="text-caption text-muted-foreground">
                    {fmtDateTime(run.createdAt)}
                  </span>
                </div>
                <p className="mt-2 text-body-sm">
                  مقروء {run.fetched} · مستورد {run.ingested} · مكرّر {run.duplicates} · تذاكر{" "}
                  {run.ticketsCreated} · {run.durationMs} م.ث
                </p>
                {run.errorMessage && (
                  <p className="mt-1 text-body-sm text-danger">{run.errorMessage}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Modal>

      <Modal open={Boolean(testOpen)} onClose={() => setTestOpen(null)} title="إرسال رسالة اختبار">
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!testOpen) return;
            sendTest.mutate({ mailboxId: testOpen.mailboxId, to: testTo.trim() });
          }}
        >
          <div>
            <label className="block text-body-sm font-medium" htmlFor="agentic-test-to">
              البريد المستلِم
            </label>
            <input
              id="agentic-test-to"
              type="email"
              required
              className={inputCls}
              value={testTo}
              onChange={(event) => setTestTo(event.target.value)}
              placeholder="name@example.com"
            />
            <p className="mt-1 text-caption text-muted-foreground">
              تُرسل من {testOpen?.address} عبر أداة المزوّد مباشرة، ولا تمر بقائمة الإرسال.
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Btn type="button" variant="ghost" onClick={() => setTestOpen(null)}>
              إلغاء
            </Btn>
            <Btn type="submit" disabled={sendTest.isPending || testTo.trim().length === 0}>
              إرسال
            </Btn>
          </div>
        </form>
      </Modal>

      <Modal open={disableOpen} onClose={() => setDisableOpen(false)} title="تعطيل التكامل">
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            deactivate.mutate(disableReason.trim());
          }}
        >
          <div>
            <label className="block text-body-sm font-medium" htmlFor="agentic-disable-reason">
              سبب التعطيل
            </label>
            <input
              id="agentic-disable-reason"
              required
              minLength={3}
              maxLength={200}
              className={inputCls}
              value={disableReason}
              onChange={(event) => setDisableReason(event.target.value)}
              placeholder="مثال: تدوير مفتاح المزوّد"
            />
            <p className="mt-1 text-caption text-muted-foreground">
              يوقف الجدولة فوراً ويُبقي الرسائل المستوردة كما هي. يُسجَّل السبب في سجل التدقيق.
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Btn type="button" variant="ghost" onClick={() => setDisableOpen(false)}>
              إلغاء
            </Btn>
            <Btn
              type="submit"
              variant="danger"
              disabled={deactivate.isPending || disableReason.trim().length < 3}
            >
              تعطيل
            </Btn>
          </div>
        </form>
      </Modal>
    </section>
  );
}
