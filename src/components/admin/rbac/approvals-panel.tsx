/** طلبات الاعتماد بمبدأ «أربع أعين»: عرض المراجعة قبل/بعد ومنع اعتماد صاحب الطلب. */
import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Badge,
  Btn,
  DataCard,
  EmptyState,
  Modal,
  PageToolbar,
  SectionCard,
  inputCls,
} from "@/lib/list-utils";
import { decideRbacApproval } from "@/lib/rbac/rbac.functions";
import {
  Field,
  KeyValue,
  formatRiyadh,
  remainingLabel,
  staffName,
  type RbacApproval,
  type RbacOverview,
} from "./shared";

const STATUS: Record<
  RbacApproval["status"],
  { label: string; tone: "gold" | "green" | "red" | "muted" | "info" }
> = {
  pending: { label: "معلّق", tone: "gold" },
  approved: { label: "معتمد", tone: "green" },
  rejected: { label: "مرفوض", tone: "red" },
  expired: { label: "منتهي", tone: "muted" },
  executed: { label: "منفَّذ", tone: "info" },
};

function DiffView({ payload }: { payload: Record<string, unknown> | null }) {
  const before = (payload?.["before"] ?? null) as Record<string, unknown> | null;
  const after = (payload?.["after"] ?? null) as Record<string, unknown> | null;
  if (!before && !after) {
    return (
      <pre
        dir="ltr"
        className="max-h-56 overflow-auto rounded-[var(--radius-m)] bg-surface-muted p-3 text-[11px]"
      >
        {JSON.stringify(payload ?? {}, null, 2)}
      </pre>
    );
  }
  const keys = Array.from(new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]));
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] text-right text-[12px]">
        <thead>
          <tr className="text-[11px] text-text-muted">
            <th className="px-2 py-1.5 font-semibold">الحقل</th>
            <th className="px-2 py-1.5 font-semibold">قبل</th>
            <th className="px-2 py-1.5 font-semibold">بعد</th>
          </tr>
        </thead>
        <tbody>
          {keys.map((k) => {
            const b = JSON.stringify(before?.[k] ?? null);
            const a = JSON.stringify(after?.[k] ?? null);
            return (
              <tr
                key={k}
                className={
                  b === a ? "border-t border-border" : "border-t border-border bg-warning-soft/40"
                }
              >
                <td className="px-2 py-1.5 font-mono">{k}</td>
                <td className="px-2 py-1.5" dir="ltr">
                  {b}
                </td>
                <td className="px-2 py-1.5 font-semibold" dir="ltr">
                  {a}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function ApprovalsPanel({
  data,
  canDecide,
  refresh,
}: {
  data: RbacOverview;
  canDecide: boolean;
  refresh: () => void;
}) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"pending" | "all" | RbacApproval["status"]>("pending");
  const [review, setReview] = useState<{
    req: RbacApproval;
    decision: "approved" | "rejected";
    reason: string;
  } | null>(null);
  const [details, setDetails] = useState<RbacApproval | null>(null);

  const decideFn = useServerFn(decideRbacApproval);
  const now = new Date(data.now).getTime();

  const decide = useMutation({
    mutationFn: () =>
      decideFn({
        data: { id: review!.req.id, decision: review!.decision, reason: review!.reason },
      }),
    onSuccess: () => {
      toast.success("تم تسجيل القرار.");
      setReview(null);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = useMemo(() => {
    const q = search.trim();
    return data.approvals.filter((a) => {
      if (status !== "all" && a.status !== status) return false;
      if (!q) return true;
      return a.action.includes(q) || a.resource_type.includes(q) || a.reason.includes(q);
    });
  }, [data.approvals, search, status]);

  const mine = data.approvals.filter(
    (a) => a.status === "pending" && a.requested_by === data.me.userId,
  ).length;

  return (
    <div className="space-y-5">
      <SectionCard
        title="مبدأ أربع أعين"
        description="كل عملية حساسة تتطلب طلباً واعتماداً من شخصين مختلفين."
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <KeyValue label="طلبات معلّقة">
            {data.approvals.filter((a) => a.status === "pending").length}
          </KeyValue>
          <KeyValue label="طلباتي المعلّقة">{mine}</KeyValue>
          <KeyValue label="صلاحية الاعتماد">{canDecide ? "متاحة لك" : "غير متاحة"}</KeyValue>
        </div>
      </SectionCard>

      <div>
        <PageToolbar
          search={search}
          setSearch={setSearch}
          placeholder="بحث بالعملية أو المورد أو السبب…"
          filters={
            <select
              className={`${inputCls} h-11 w-auto`}
              value={status}
              onChange={(e) => setStatus(e.target.value as typeof status)}
              aria-label="تصفية بالحالة"
            >
              <option value="pending">المعلّقة</option>
              <option value="approved">المعتمدة</option>
              <option value="rejected">المرفوضة</option>
              <option value="executed">المنفّذة</option>
              <option value="expired">المنتهية</option>
              <option value="all">الكل</option>
            </select>
          }
        />
        {rows.length === 0 ? (
          <DataCard>
            <EmptyState
              title="لا توجد طلبات مطابقة"
              hint="الطلبات الحساسة تظهر هنا لاعتمادها أو رفضها."
            />
          </DataCard>
        ) : (
          <ul className="grid gap-3">
            {rows.map((a) => {
              const self = a.requested_by === data.me.userId;
              const expired = new Date(a.expires_at).getTime() <= now;
              return (
                <li key={a.id} className="surface-card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold">
                        <span className="font-mono text-[12px]">{a.action}</span> ·{" "}
                        {a.resource_type}
                      </p>
                      <p className="text-caption mt-0.5">{a.reason}</p>
                    </div>
                    <Badge tone={STATUS[a.status].tone}>{STATUS[a.status].label}</Badge>
                  </div>

                  <div className="mt-3 grid gap-3 sm:grid-cols-4">
                    <KeyValue label="مقدّم الطلب">
                      {a.requested_by_email ?? staffName(data.staff, a.requested_by)}
                    </KeyValue>
                    <KeyValue label="تاريخ الطلب">{formatRiyadh(a.requested_at)}</KeyValue>
                    <KeyValue label="ينتهي">
                      {formatRiyadh(a.expires_at)}
                      {a.status === "pending" &&
                        !expired &&
                        ` — ${remainingLabel(a.expires_at, now)}`}
                    </KeyValue>
                    <KeyValue label="القرار">
                      {a.decided_at
                        ? `${a.decided_by_email ?? staffName(data.staff, a.decided_by)} · ${formatRiyadh(a.decided_at)}`
                        : "—"}
                    </KeyValue>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Btn size="sm" variant="outline" onClick={() => setDetails(a)}>
                      مراجعة التغييرات
                    </Btn>
                    {a.status === "pending" && !expired && (
                      <>
                        <Btn
                          size="sm"
                          disabled={!canDecide || self}
                          title={self ? "لا يمكنك اعتماد طلب أنشأته بنفسك" : undefined}
                          onClick={() => setReview({ req: a, decision: "approved", reason: "" })}
                        >
                          اعتماد
                        </Btn>
                        <Btn
                          size="sm"
                          variant="danger"
                          disabled={!canDecide || self}
                          onClick={() => setReview({ req: a, decision: "rejected", reason: "" })}
                        >
                          رفض
                        </Btn>
                        {self && (
                          <span className="text-[12px] text-warning">
                            أنت مقدّم الطلب — يعتمده زميل آخر.
                          </span>
                        )}
                      </>
                    )}
                  </div>
                  {a.decision_reason && (
                    <p className="text-caption mt-2">تعليل القرار: {a.decision_reason}</p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Modal open={!!details} onClose={() => setDetails(null)} title="مراجعة التغييرات" size="lg">
        {details && <DiffView payload={details.payload} />}
      </Modal>

      <Modal
        open={!!review}
        onClose={() => setReview(null)}
        title={review?.decision === "approved" ? "اعتماد الطلب" : "رفض الطلب"}
      >
        {review && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              decide.mutate();
            }}
          >
            <DiffView payload={review.req.payload} />
            <Field label="تعليل القرار">
              <textarea
                className={inputCls}
                rows={3}
                value={review.reason}
                onChange={(e) => setReview({ ...review, reason: e.target.value })}
              />
            </Field>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Btn variant="outline" onClick={() => setReview(null)}>
                إلغاء
              </Btn>
              <Btn
                type="submit"
                variant={review.decision === "approved" ? "primary" : "danger"}
                loading={decide.isPending}
              >
                {review.decision === "approved" ? "تأكيد الاعتماد" : "تأكيد الرفض"}
              </Btn>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
