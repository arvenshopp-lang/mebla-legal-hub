/** الانتحال: طلب، اعتماد/رفض، إنهاء، وسجل الصفحات المزارة — قراءة فقط دائماً. */
import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Eye } from "lucide-react";
import { Badge, Btn, DataCard, EmptyState, Modal, SectionCard, inputCls } from "@/lib/list-utils";
import { decideRbacImpersonation, endRbacImpersonation, requestRbacImpersonation } from "@/lib/rbac/rbac.functions";
import {
  Field,
  KeyValue,
  formatRiyadh,
  remainingLabel,
  staffName,
  type RbacImpersonation,
  type RbacOverview,
} from "./shared";

const STATUS: Record<RbacImpersonation["status"], { label: string; tone: "gold" | "green" | "red" | "muted" }> = {
  pending: { label: "بانتظار الاعتماد", tone: "gold" },
  active: { label: "جلسة نشطة", tone: "green" },
  ended: { label: "منتهية", tone: "muted" },
  rejected: { label: "مرفوضة", tone: "red" },
  expired: { label: "انتهت المدة", tone: "muted" },
};

export function ImpersonationPanel({
  data,
  canRequest,
  canApprove,
  refresh,
}: {
  data: RbacOverview;
  canRequest: boolean;
  canApprove: boolean;
  refresh: () => void;
}) {
  const [form, setForm] = useState<{ targetUserId: string; reason: string; minutes: number } | null>(null);
  const [decision, setDecision] = useState<{
    row: RbacImpersonation;
    decision: "approved" | "rejected";
    reason: string;
  } | null>(null);
  const [end, setEnd] = useState<{ row: RbacImpersonation; reason: string } | null>(null);
  const [pages, setPages] = useState<RbacImpersonation | null>(null);

  const requestFn = useServerFn(requestRbacImpersonation);
  const decideFn = useServerFn(decideRbacImpersonation);
  const endFn = useServerFn(endRbacImpersonation);
  const now = new Date(data.now).getTime();

  const after = (msg: string) => {
    toast.success(msg);
    setForm(null);
    setDecision(null);
    setEnd(null);
    refresh();
  };

  const request = useMutation({
    mutationFn: () => {
      if (form!.reason.trim().length < 10) throw new Error("اكتب سبباً واضحاً لا يقل عن 10 أحرف.");
      return requestFn({ data: form! });
    },
    onSuccess: () => after("تم إرسال طلب الانتحال للاعتماد."),
    onError: (e: Error) => toast.error(e.message),
  });

  const decide = useMutation({
    mutationFn: () =>
      decideFn({ data: { id: decision!.row.id, decision: decision!.decision, reason: decision!.reason } }),
    onSuccess: () => after("تم تسجيل القرار."),
    onError: (e: Error) => toast.error(e.message),
  });

  const endMut = useMutation({
    mutationFn: () => endFn({ data: { id: end!.row.id, reason: end!.reason || undefined } }),
    onSuccess: () => after("تم إنهاء جلسة الانتحال."),
    onError: (e: Error) => toast.error(e.message),
  });

  const visitedPages = useMemo(() => {
    if (!pages) return [];
    return data.audit.filter(
      (a) => a.action === "rbac.impersonation_page" && (a.metadata?.["session_id"] as string | undefined) === pages.id,
    );
  }, [data.audit, pages]);

  return (
    <div className="space-y-5">
      <SectionCard
        title="ضوابط الانتحال"
        description="كل جلسة انتحال قراءة فقط، محدودة المدة، وتتطلب اعتماد شخص آخر، وتُسجَّل كل صفحة تُزار."
        actions={
          canRequest ? (
            <Btn size="sm" onClick={() => setForm({ targetUserId: "", reason: "", minutes: 30 })}>
              <Eye className="h-4 w-4" aria-hidden /> طلب انتحال
            </Btn>
          ) : undefined
        }
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <KeyValue label="جلسات نشطة">{data.impersonations.filter((i) => i.status === "active").length}</KeyValue>
          <KeyValue label="طلبات معلّقة">{data.impersonations.filter((i) => i.status === "pending").length}</KeyValue>
          <KeyValue label="جلستك الحالية">
            {data.me.impersonation ? `${data.me.impersonation.target_email ?? "—"}` : "لا يوجد"}
          </KeyValue>
        </div>
      </SectionCard>

      {data.impersonations.length === 0 ? (
        <DataCard>
          <EmptyState title="لا توجد جلسات انتحال" hint="تُستخدم للدعم الفني فقط وبموافقة موثّقة." />
        </DataCard>
      ) : (
        <ul className="grid gap-3">
          {data.impersonations.map((i) => {
            const self = i.actor_user_id === data.me.userId;
            return (
              <li key={i.id} className="surface-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">
                      {i.actor_email ?? staffName(data.staff, i.actor_user_id)} ← {i.target_email ?? i.target_user_id}
                    </p>
                    <p className="text-caption mt-0.5">{i.reason}</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge tone={STATUS[i.status].tone}>{STATUS[i.status].label}</Badge>
                    {i.read_only && <Badge tone="info">قراءة فقط</Badge>}
                  </div>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-4">
                  <KeyValue label="أُنشئت">{formatRiyadh(i.created_at)}</KeyValue>
                  <KeyValue label="بدأت">{formatRiyadh(i.started_at)}</KeyValue>
                  <KeyValue label="تنتهي">
                    {formatRiyadh(i.expires_at)}
                    {i.status === "active" && ` — ${remainingLabel(i.expires_at, now)}`}
                  </KeyValue>
                  <KeyValue label="أُنهيت">{formatRiyadh(i.ended_at)}</KeyValue>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Btn size="sm" variant="outline" onClick={() => setPages(i)}>
                    سجل الصفحات
                  </Btn>
                  {i.status === "pending" && (
                    <>
                      <Btn
                        size="sm"
                        disabled={!canApprove || self}
                        title={self ? "لا يمكنك اعتماد طلبك" : undefined}
                        onClick={() => setDecision({ row: i, decision: "approved", reason: "" })}
                      >
                        اعتماد وبدء
                      </Btn>
                      <Btn
                        size="sm"
                        variant="danger"
                        disabled={!canApprove || self}
                        onClick={() => setDecision({ row: i, decision: "rejected", reason: "" })}
                      >
                        رفض
                      </Btn>
                    </>
                  )}
                  {i.status === "active" && (
                    <Btn size="sm" variant="danger" onClick={() => setEnd({ row: i, reason: "" })}>
                      إنهاء الجلسة
                    </Btn>
                  )}
                </div>
                {i.end_reason && <p className="text-caption mt-2">سبب الإنهاء: {i.end_reason}</p>}
              </li>
            );
          })}
        </ul>
      )}

      <Modal open={!!form} onClose={() => setForm(null)} title="طلب انتحال حساب">
        {form && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              request.mutate();
            }}
          >
            <Field label="معرّف المستخدم المستهدف" hint="UUID للمستخدم داخل المنصة — لا يمكن انتحال حسابك.">
              <input
                className={inputCls}
                dir="ltr"
                value={form.targetUserId}
                onChange={(e) => setForm({ ...form, targetUserId: e.target.value.trim() })}
                required
              />
            </Field>
            <Field label="مدة الجلسة (دقيقة)" hint="بين 5 و120 دقيقة.">
              <input
                type="number"
                min={5}
                max={120}
                className={inputCls}
                value={form.minutes}
                onChange={(e) => setForm({ ...form, minutes: Number(e.target.value) })}
              />
            </Field>
            <Field label="سبب الانتحال" hint="لا يقل عن 10 أحرف — يظهر في سجل التدقيق وطلب الاعتماد.">
              <textarea
                className={inputCls}
                rows={3}
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                required
              />
            </Field>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Btn variant="outline" onClick={() => setForm(null)}>
                إلغاء
              </Btn>
              <Btn type="submit" loading={request.isPending}>
                إرسال الطلب
              </Btn>
            </div>
          </form>
        )}
      </Modal>

      <Modal
        open={!!decision}
        onClose={() => setDecision(null)}
        title={decision?.decision === "approved" ? "اعتماد الانتحال" : "رفض الانتحال"}
      >
        {decision && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              decide.mutate();
            }}
          >
            <p className="text-body-sm text-muted-foreground">
              {decision.row.actor_email} ← {decision.row.target_email ?? decision.row.target_user_id}
            </p>
            <Field label="تعليل القرار">
              <textarea
                className={inputCls}
                rows={3}
                value={decision.reason}
                onChange={(e) => setDecision({ ...decision, reason: e.target.value })}
              />
            </Field>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Btn variant="outline" onClick={() => setDecision(null)}>
                إلغاء
              </Btn>
              <Btn
                type="submit"
                variant={decision.decision === "approved" ? "primary" : "danger"}
                loading={decide.isPending}
              >
                تأكيد
              </Btn>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={!!end} onClose={() => setEnd(null)} title="إنهاء جلسة الانتحال">
        {end && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              endMut.mutate();
            }}
          >
            <Field label="سبب الإنهاء">
              <textarea
                className={inputCls}
                rows={3}
                value={end.reason}
                onChange={(e) => setEnd({ ...end, reason: e.target.value })}
              />
            </Field>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Btn variant="outline" onClick={() => setEnd(null)}>
                إلغاء
              </Btn>
              <Btn type="submit" variant="danger" loading={endMut.isPending}>
                إنهاء الآن
              </Btn>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={!!pages} onClose={() => setPages(null)} title="الصفحات التي زارها المنتحِل" size="lg">
        {visitedPages.length === 0 ? (
          <p className="text-caption">لا توجد صفحات مسجَّلة لهذه الجلسة.</p>
        ) : (
          <ul className="max-h-[50vh] space-y-1.5 overflow-y-auto text-[12px]">
            {visitedPages.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 border-b border-border pb-1.5">
                <span dir="ltr" className="font-mono">
                  {(p.metadata?.["path"] as string | undefined) ?? p.description}
                </span>
                <span className="shrink-0 text-text-muted">{formatRiyadh(p.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </div>
  );
}
