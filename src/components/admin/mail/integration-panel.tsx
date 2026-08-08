import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, PlugZap, RefreshCw, XCircle } from "lucide-react";
import { Badge, Btn, EmptyState, LoadingBlock, SectionCard } from "@/lib/list-utils";
import { fmtDateTime } from "@/lib/enums";
import {
  getMailIntegrationStatus,
  syncMailboxNow,
  testMailConnection,
} from "@/lib/email/email.functions";

type TestResult = Awaited<ReturnType<ReturnType<typeof useServerFn<typeof testMailConnection>>>>;

/**
 * لوحة تكامل بريد Hostinger: حالة الأسرار، حالة المزامنة لكل صندوق، اختبار
 * الاتصال، وتشغيل مزامنة يدوية. لا تُعرض أي قيمة سر — توفر فقط.
 */
export function MailIntegrationPanel({ canManage }: { canManage: boolean }) {
  const qc = useQueryClient();
  const statusFn = useServerFn(getMailIntegrationStatus);
  const status = useQuery({
    queryKey: ["mail-integration"],
    queryFn: () => statusFn({ data: undefined }),
    enabled: canManage,
  });

  const [tests, setTests] = useState<Record<string, TestResult>>({});
  const testFn = useServerFn(testMailConnection);
  const test = useMutation({
    mutationFn: (mailboxId: string) => testFn({ data: { mailboxId } }),
    onSuccess: (result, mailboxId) => {
      setTests((prev) => ({ ...prev, [mailboxId]: result }));
      if (result.smtp.ok && result.imap.ok) toast.success("الاتصال بالخادمين ناجح.");
      else toast.error("فشل أحد الاتصالين — راجع التفاصيل أدناه.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const syncFn = useServerFn(syncMailboxNow);
  const sync = useMutation({
    mutationFn: (mailboxId: string) => syncFn({ data: { mailboxId } }),
    onSuccess: ({ outcomes }) => {
      const failed = outcomes.find((o) => o.error);
      if (failed) toast.error(failed.error?.message ?? "تعذّرت المزامنة.");
      else {
        const ingested = outcomes.reduce((sum, o) => sum + o.ingested, 0);
        toast.success(ingested > 0 ? `تمت مزامنة ${ingested} رسالة جديدة.` : "لا رسائل جديدة.");
      }
      qc.invalidateQueries({ queryKey: ["mail-integration"] });
      qc.invalidateQueries({ queryKey: ["mail-threads"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!canManage) {
    return (
      <EmptyState
        title="لا تملك صلاحية إدارة البريد"
        hint="إدارة تكامل الخادم مقصورة على حاملي صلاحية email.manage."
      />
    );
  }
  if (status.isLoading) return <LoadingBlock rows={4} cols={2} />;
  if (status.isError || !status.data) {
    return <EmptyState title="تعذّر قراءة حالة التكامل" hint="أعد المحاولة بعد قليل." />;
  }

  const { secrets, mailboxes, states, runs } = status.data;
  const transport = status.data.transport;
  const domainMismatch =
    transport.authAccount.includes("@") &&
    !transport.authAccount.toLowerCase().endsWith("@mehlalex.com");

  return (
    <div className="space-y-6">
      <SectionCard
        title="اتصال خادم البريد"
        description="الإرسال عبر SMTP والاستقبال عبر IMAP من خوادم Hostinger — كل الاتصالات خادمية ومشفّرة."
      >
        <dl className="grid gap-3 sm:grid-cols-2">
          <Row label="خادم الإرسال (SMTP)" ok={secrets.smtpHost} okText="مهيأ" />
          <Row label="خادم الاستقبال (IMAP)" ok={secrets.imapHost} okText="مهيأ" />
          <Row label="اسم المستخدم" ok={secrets.user} />
          <Row label="كلمة المرور" ok={secrets.password} />
        </dl>
        <div className="mt-4 space-y-2 rounded-[var(--radius-m)] border border-border bg-surface-2 p-3">
          <p className="text-body-sm">
            حساب النقل الحقيقي (المصادقة):{" "}
            <span dir="ltr" className="font-semibold">
              {transport.authAccount || "غير مُعرّف"}
            </span>
          </p>
          <p className="text-caption">
            كل الأسماء المستعارة تُرسل بنفس مصادقة هذا الحساب: المظروف{" "}
            <span dir="ltr">Envelope From</span> بالحساب الحقيقي، وترويسة{" "}
            <span dir="ltr">From</span> بعنوان القسم، و<span dir="ltr">Reply-To</span> للقسم نفسه.
            لا تُنشأ بيانات دخول لأي اسم مستعار.
          </p>
          {domainMismatch && (
            <p className="text-body-sm rounded-[var(--radius-s)] border border-danger/40 bg-danger/10 p-2">
              حساب النقل الحالي ليس على نطاق <span dir="ltr">mehlalex.com</span>، ولذلك ستفشل
              مصادقة خادم Hostinger ويُرسل البريد عبر الخدمة المُدارة. حدّث سرّي{" "}
              <span dir="ltr">MAIL_USER</span> و<span dir="ltr">MAIL_PASSWORD</span> ببيانات صندوق
              البريد الحقيقي.
            </p>
          )}
        </div>
        {!secrets.complete && (
          <p className="text-body-sm mt-4 rounded-[var(--radius-m)] border border-warning/40 bg-warning/10 p-3">
            التكامل غير مُفعّل: أضف أسرار الخادم (<span dir="ltr">MAIL_USER</span> و
            <span dir="ltr"> MAIL_PASSWORD</span>) ليبدأ الإرسال عبر SMTP والمزامنة عبر IMAP. حتى
            ذلك الحين يستمر الإرسال عبر خدمة البريد المُدارة، ولا تُسحب أي رسائل واردة.
          </p>
        )}
      </SectionCard>

      <SectionCard
        title="حالة الصناديق"
        description="الصناديق البشرية أسماء مستعارة تُرسل وتُستقبل عبر حساب النقل الحقيقي الواحد."
      >
        {mailboxes.length === 0 ? (
          <EmptyState title="لا توجد صناديق قابلة للمزامنة" />
        ) : (
          <ul className="space-y-4">
            {mailboxes.map((mailbox) => {
              const boxStates = states.filter((s) => s.mailbox_id === mailbox.id);
              const result = tests[mailbox.id];
              return (
                <li key={mailbox.id} className="rounded-[var(--radius-m)] border border-border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold" dir="ltr">
                        {mailbox.address}
                      </p>
                      <p className="text-caption mt-1">
                        المجلدات: <span dir="ltr">{mailbox.folders.join(", ")}</span>
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={mailbox.syncEnabled ? "green" : "muted"}>
                        {mailbox.syncEnabled ? "المزامنة مُفعّلة" : "المزامنة معطّلة"}
                      </Badge>
                      <Badge tone={mailbox.credentials.complete ? "green" : "warn"}>
                        {mailbox.credentials.complete ? "بيانات الاعتماد مكتملة" : "بيانات ناقصة"}
                      </Badge>
                      <Badge tone={mailbox.identity.isAlias ? "muted" : "green"}>
                        {mailbox.identity.isAlias ? "اسم مستعار" : "حساب حقيقي"}
                      </Badge>
                      <Btn
                        size="sm"
                        variant="outline"
                        loading={test.isPending && test.variables === mailbox.id}
                        disabled={!mailbox.credentials.complete}
                        onClick={() => test.mutate(mailbox.id)}
                      >
                        <PlugZap className="h-4 w-4" aria-hidden /> اختبار الاتصال
                      </Btn>
                      <Btn
                        size="sm"
                        loading={sync.isPending && sync.variables === mailbox.id}
                        disabled={!mailbox.credentials.complete || !mailbox.syncEnabled}
                        onClick={() => sync.mutate(mailbox.id)}
                      >
                        <RefreshCw className="h-4 w-4" aria-hidden /> مزامنة الآن
                      </Btn>
                    </div>
                  </div>

                  {boxStates.length > 0 && (
                    <ul className="mt-3 space-y-1.5">
                      {boxStates.map((state) => (
                        <li
                          key={`${state.mailbox_id}-${state.folder}`}
                          className="text-body-sm flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground"
                        >
                          <span dir="ltr" className="font-medium text-foreground">
                            {state.folder}
                          </span>
                          <span>UID {state.last_uid ?? 0}</span>
                          <span>UIDVALIDITY {state.uidvalidity ?? 0}</span>
                          {state.last_success_at && (
                            <span>آخر نجاح {fmtDateTime(state.last_success_at)}</span>
                          )}
                          {state.last_error && (
                            <span className="text-danger">تعذّر: {state.last_error}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}

                  {result && (
                    <div className="text-body-sm mt-3 space-y-1 rounded-[var(--radius-s)] bg-muted/40 p-3">
                      <p className="flex items-center gap-2">
                        {result.smtp.ok ? <Ok /> : <Fail />} SMTP —{" "}
                        {result.smtp.ok ? "مصادقة ناجحة" : result.smtp.message} (
                        {result.smtp.latencyMs}ms)
                      </p>
                      <p className="flex items-center gap-2">
                        {result.imap.ok ? <Ok /> : <Fail />} IMAP —{" "}
                        {result.imap.ok
                          ? `${result.imap.exists} رسالة في INBOX`
                          : result.imap.message}{" "}
                        ({result.imap.latencyMs}ms)
                      </p>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="آخر دورات المزامنة" description="سجل تشغيلي للدورات اليدوية والدورية.">
        {runs.length === 0 ? (
          <EmptyState title="لا توجد دورات مزامنة بعد" />
        ) : (
          <ul className="space-y-2">
            {runs.map((run, index) => (
              <li
                key={`${run.created_at}-${index}`}
                className="text-body-sm flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[var(--radius-s)] border border-border px-3 py-2"
              >
                <Badge tone={run.outcome === "success" ? "green" : "red"}>
                  {run.outcome === "success" ? "ناجحة" : "فاشلة"}
                </Badge>
                <span dir="ltr">{run.folder}</span>
                <span className="text-muted-foreground">
                  {run.trigger_source === "manual" ? "يدوية" : "دورية"}
                </span>
                <span className="text-muted-foreground">
                  جديد {run.ingested} · مكرر {run.duplicates} · مرفوض {run.rejected} · تذاكر{" "}
                  {run.tickets_created}
                </span>
                <span className="text-caption">{fmtDateTime(run.created_at)}</span>
                {run.error_code && <span className="text-danger">{run.error_code}</span>}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}

function Row({ label, ok, okText = "متوفر" }: { label: string; ok: boolean; okText?: string }) {
  return (
    <div className="flex items-center justify-between rounded-[var(--radius-s)] border border-border px-3 py-2">
      <dt className="text-body-sm">{label}</dt>
      <dd>
        <Badge tone={ok ? "green" : "warn"}>{ok ? okText : "غير مضبوط"}</Badge>
      </dd>
    </div>
  );
}

function Ok() {
  return <CheckCircle2 className="h-4 w-4 text-success" aria-hidden />;
}

function Fail() {
  return <XCircle className="h-4 w-4 text-danger" aria-hidden />;
}
