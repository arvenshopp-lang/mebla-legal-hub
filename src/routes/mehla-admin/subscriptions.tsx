import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Ban, Eye, PauseCircle, PlayCircle, Plus, RefreshCcw } from "lucide-react";
import { AdminShell } from "@/components/admin/shell";
import { supabase } from "@/integrations/supabase/client";
import {
  activateSubscription,
  cancelSubscription,
  getSubscriptionAdminDetail,
  resumeSubscription,
  setSubscriptionAutoRenew,
  suspendSubscription,
} from "@/lib/admin.functions";
import { SUBSCRIPTION_STATUS_LABELS } from "@/lib/admin-permissions";
import {
  Badge,
  Btn,
  ConfirmDialog,
  DataCard,
  EmptyState,
  FormField,
  LoadingBlock,
  Modal,
  PageToolbar,
  Td,
  Th,
  inputCls,
  useDebounced,
} from "@/lib/list-utils";
import { fmtDate, fmtDateTime, fmtSize } from "@/lib/enums";
import { fmtDecimal } from "@/lib/format";

export const Route = createFileRoute("/mehla-admin/subscriptions")({
  head: () => ({
    meta: [{ title: "الاشتراكات · إدارة مِهلة" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: SubscriptionsPage,
});

type DurationMode = "months" | "years" | "date";

function addMonths(d: Date, n: number) {
  const out = new Date(d);
  out.setMonth(out.getMonth() + n);
  return out;
}

function SubscriptionsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [cancelling, setCancelling] = useState<{ id: string; email: string } | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [suspending, setSuspending] = useState<{ id: string; email: string } | null>(null);
  const debounced = useDebounced(search);
  const cancelFn = useServerFn(cancelSubscription);
  const resumeFn = useServerFn(resumeSubscription);
  const autoRenewFn = useServerFn(setSubscriptionAutoRenew);

  const {
    data: rows,
    isLoading,
    isFetching,
  } = useQuery({
    queryKey: ["admin-subscriptions", debounced, statusFilter],
    queryFn: async () => {
      let q = supabase
        .from("subscriptions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (debounced.trim()) q = q.ilike("email", `%${debounced.trim()}%`);
      if (statusFilter !== "all") q = q.eq("status", statusFilter as never);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const cancel = useMutation({
    mutationFn: async (id: string) => cancelFn({ data: { id } }),
    onSuccess: () => {
      toast.success("تم إلغاء الاشتراك");
      qc.invalidateQueries({ queryKey: ["admin-subscriptions"] });
      setCancelling(null);
    },
    onError: (e: Error) => toast.error("تعذّر الإلغاء", { description: e.message }),
  });

  const resume = useMutation({
    mutationFn: async (id: string) => resumeFn({ data: { id } }),
    onSuccess: () => {
      toast.success("تم إعادة تفعيل الاشتراك");
      qc.invalidateQueries({ queryKey: ["admin-subscriptions"] });
    },
    onError: (e: Error) => toast.error("تعذّر إعادة التفعيل", { description: e.message }),
  });

  const toggleRenew = useMutation({
    mutationFn: async (v: { id: string; autoRenew: boolean }) => autoRenewFn({ data: v }),
    onSuccess: () => {
      toast.success("تم تحديث التجديد التلقائي");
      qc.invalidateQueries({ queryKey: ["admin-subscriptions"] });
    },
    onError: (e: Error) => toast.error("تعذّر التحديث", { description: e.message }),
  });

  return (
    <AdminShell
      title="الاشتراكات"
      description="تفعيل ومتابعة اشتراكات المشتركين في منصة مِهلة."
      actions={
        <Btn onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" aria-hidden /> اشتراك جديد
        </Btn>
      }
    >
      <PageToolbar
        search={search}
        setSearch={setSearch}
        placeholder="بحث بالبريد الإلكتروني…"
        searching={isFetching && !isLoading}
        filters={
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="حالة الاشتراك"
            className={`${inputCls} w-auto min-w-[150px]`}
          >
            <option value="all">كل الحالات</option>
            {Object.entries(SUBSCRIPTION_STATUS_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        }
      />

      {isLoading ? (
        <LoadingBlock rows={6} cols={6} />
      ) : (rows ?? []).length === 0 ? (
        <EmptyState title="لا توجد اشتراكات" hint="ابدأ بتفعيل اشتراك لأحد المشتركين المسجلين." />
      ) : (
        <DataCard>
          <table className="w-full min-w-[760px] text-right">
            <thead>
              <tr>
                <Th>البريد الإلكتروني</Th>
                <Th>الباقة</Th>
                <Th>القيمة</Th>
                <Th>البداية</Th>
                <Th>الانتهاء</Th>
                <Th>الحالة</Th>
                <Th>التجديد التلقائي</Th>
                <Th className="text-left">إجراءات</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows!.map((s) => {
                const expired = new Date(String(s.ends_at)) < new Date();
                const suspended = !!s.suspended_at;
                const status = suspended
                  ? "suspended"
                  : s.status === "active" && expired
                    ? "expired"
                    : String(s.status);
                return (
                  <tr key={String(s.id)} className="hover:bg-surface-muted/60">
                    <Td>{String(s.email)}</Td>
                    <Td>{String(s.plan_label)}</Td>
                    <Td className="tabular-nums">
                      {fmtDecimal(Number(s.amount))} {String(s.currency)}
                    </Td>
                    <Td>{fmtDate(String(s.starts_at))}</Td>
                    <Td>{fmtDate(String(s.ends_at))}</Td>
                    <Td>
                      <Badge
                        tone={
                          status === "active"
                            ? "green"
                            : status === "expired"
                              ? "red"
                              : status === "suspended"
                                ? "warn"
                                : "muted"
                        }
                      >
                        {status === "suspended"
                          ? "موقوف"
                          : (SUBSCRIPTION_STATUS_LABELS[status] ?? status)}
                      </Badge>
                      {suspended && s.suspension_reason && (
                        <span className="mt-1 block max-w-[220px] truncate text-[11px] text-muted-foreground">
                          {String(s.suspension_reason)}
                        </span>
                      )}
                    </Td>
                    <Td>
                      <button
                        onClick={() =>
                          toggleRenew.mutate({ id: String(s.id), autoRenew: !s.auto_renew })
                        }
                        className="inline-flex min-h-[44px] items-center gap-1 rounded-[var(--radius-s)] px-2 py-1 text-[12px] sm:min-h-0 text-muted-foreground hover:bg-surface-muted"
                      >
                        <RefreshCcw className="h-3.5 w-3.5" aria-hidden />
                        {s.auto_renew ? "مفعّل" : "غير مفعّل"}
                      </button>
                    </Td>
                    <Td className="text-left">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setDetailId(String(s.id))}
                          className="inline-flex min-h-[44px] items-center gap-1 rounded-[var(--radius-s)] px-2 py-1 text-[12px] sm:min-h-0 text-muted-foreground hover:bg-surface-muted"
                        >
                          <Eye className="h-3.5 w-3.5" aria-hidden /> تفاصيل
                        </button>
                        {suspended ? (
                          <button
                            onClick={() => resume.mutate(String(s.id))}
                            className="inline-flex min-h-[44px] items-center gap-1 rounded-[var(--radius-s)] px-2 py-1 text-[12px] sm:min-h-0 text-success hover:bg-success-soft"
                          >
                            <PlayCircle className="h-3.5 w-3.5" aria-hidden /> إعادة تفعيل
                          </button>
                        ) : (
                          s.status === "active" && (
                            <button
                              onClick={() =>
                                setSuspending({ id: String(s.id), email: String(s.email) })
                              }
                              className="inline-flex min-h-[44px] items-center gap-1 rounded-[var(--radius-s)] px-2 py-1 text-[12px] sm:min-h-0 text-warning hover:bg-warning-soft"
                            >
                              <PauseCircle className="h-3.5 w-3.5" aria-hidden /> إيقاف
                            </button>
                          )
                        )}
                        {s.status === "active" && (
                          <button
                            onClick={() =>
                              setCancelling({ id: String(s.id), email: String(s.email) })
                            }
                            className="inline-flex min-h-[44px] items-center gap-1 rounded-[var(--radius-s)] px-2 py-1 text-[12px] sm:min-h-0 text-danger hover:bg-danger-soft"
                          >
                            <Ban className="h-3.5 w-3.5" aria-hidden /> إلغاء
                          </button>
                        )}
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </DataCard>
      )}

      <ActivateDialog open={open} onClose={() => setOpen(false)} />
      <DetailDialog id={detailId} onClose={() => setDetailId(null)} />
      <SuspendDialog
        target={suspending}
        onClose={() => setSuspending(null)}
        onDone={() => {
          setSuspending(null);
          qc.invalidateQueries({ queryKey: ["admin-subscriptions"] });
        }}
      />
      <ConfirmDialog
        open={!!cancelling}
        onClose={() => setCancelling(null)}
        onConfirm={() => cancelling && cancel.mutate(cancelling.id)}
        loading={cancel.isPending}
        title="إلغاء الاشتراك"
        message={`سيتم إيقاف اشتراك ${cancelling?.email ?? ""} فوراً.`}
        confirmLabel="إلغاء الاشتراك"
      />
    </AdminShell>
  );
}

function ActivateDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return <ActivateDialogInner open={open} onClose={onClose} />;
}

function SuspendDialog({
  target,
  onClose,
  onDone,
}: {
  target: { id: string; email: string } | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const suspendFn = useServerFn(suspendSubscription);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const run = useMutation({
    mutationFn: async () => suspendFn({ data: { id: target!.id, reason: reason.trim() } }),
    onSuccess: () => {
      toast.success("تم إيقاف الاشتراك");
      setReason("");
      onDone();
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <Modal
      open={!!target}
      onClose={onClose}
      title="إيقاف الاشتراك"
      description={`سيتم تعليق صلاحيات ${target?.email ?? ""} مع الاحتفاظ ببياناته.`}
    >
      <div className="space-y-4">
        <FormField label="سبب الإيقاف" required hint="يظهر للمشترك داخل صفحة الاشتراك.">
          <input value={reason} onChange={(e) => setReason(e.target.value)} className={inputCls} />
        </FormField>
        {error && (
          <p
            role="alert"
            className="rounded-[var(--radius-m)] bg-danger-soft px-3 py-2.5 text-[12px] text-danger"
          >
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Btn variant="ghost" onClick={onClose}>
            إلغاء
          </Btn>
          <Btn
            onClick={() => {
              setError(null);
              if (reason.trim().length < 3) return setError("اذكر سبب الإيقاف.");
              run.mutate();
            }}
            loading={run.isPending}
          >
            إيقاف الاشتراك
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

function DetailDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const detailFn = useServerFn(getSubscriptionAdminDetail);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-subscription-detail", id],
    enabled: !!id,
    queryFn: async () => detailFn({ data: { id: id! } }),
  });

  const limits: [string, number, number | null][] = data
    ? [
        ["المستخدمون", data.usage.users, data.plan?.max_users ?? null],
        ["القضايا", data.usage.cases, data.plan?.max_cases ?? null],
        ["العملاء", data.usage.clients, data.plan?.max_clients ?? null],
        ["المستندات", data.usage.documents, data.plan?.max_documents ?? null],
      ]
    : [];

  return (
    <Modal
      open={!!id}
      onClose={onClose}
      title="تفاصيل الاشتراك"
      description="بيانات تشغيلية فقط دون أي محتوى قانوني."
    >
      {isLoading || !data ? (
        <LoadingBlock rows={4} cols={2} />
      ) : (
        <div className="space-y-5 text-[13px]">
          <dl className="grid gap-3 sm:grid-cols-2">
            <Row label="المشترك">{data.subscription.email}</Row>
            <Row label="المكتب">{data.organizationName ?? "—"}</Row>
            <Row label="الباقة">{data.plan?.name_ar ?? data.subscription.plan_label}</Row>
            <Row label="طريقة التفعيل">{data.subscription.activation_method}</Row>
            <Row label="البداية">{fmtDate(data.subscription.starts_at)}</Row>
            <Row label="الانتهاء">{fmtDate(data.subscription.ends_at)}</Row>
            <Row label="التجديد التلقائي">
              {data.subscription.auto_renew ? "مفعّل" : "غير مفعّل"}
            </Row>
            <Row label="مساحة التخزين">{fmtSize(data.usage.storage_bytes)}</Row>
            {data.subscription.suspended_at && (
              <Row label="موقوف بتاريخ">{fmtDateTime(data.subscription.suspended_at)}</Row>
            )}
            {data.subscription.suspension_reason && (
              <Row label="سبب الإيقاف">{data.subscription.suspension_reason}</Row>
            )}
            <Row label="آخر تعديل">
              {data.subscription.last_modified_at
                ? fmtDateTime(data.subscription.last_modified_at)
                : "—"}
              {data.lastModifiedByName ? ` · ${data.lastModifiedByName}` : ""}
            </Row>
          </dl>

          <div className="space-y-2">
            <p className="text-[12px] font-semibold text-muted-foreground">
              الاستخدام مقابل حدود الباقة
            </p>
            {limits.map(([label, used, max]) => (
              <div
                key={label}
                className="flex items-center justify-between rounded-[var(--radius-m)] bg-surface-muted px-3 py-2"
              >
                <span>{label}</span>
                <span className="tabular-nums">
                  {used} / {max === null ? "غير محدود" : max}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[12px] text-muted-foreground">{label}</dt>
      <dd className="font-medium text-foreground">{children}</dd>
    </div>
  );
}

function ActivateDialogInner({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const activateFn = useServerFn(activateSubscription);
  const [email, setEmail] = useState("");
  const [planCode, setPlanCode] = useState("basic");
  const [customLabel, setCustomLabel] = useState("");
  const [durationMode, setDurationMode] = useState<DurationMode>("months");
  const [months, setMonths] = useState(12);
  const [years, setYears] = useState(1);
  const [manualEnd, setManualEnd] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: plans } = useQuery({
    queryKey: ["admin-plans-options"],
    queryFn: async () =>
      (await supabase.from("platform_plans").select("code, name_ar").order("sort_order")).data ??
      [],
  });

  // تاريخ بداية التفعيل يُثبَّت عند كل فتح للنافذة حتى لا يتغيّر أثناء التعبئة.
  const [startsAt, setStartsAt] = useState(() => new Date());
  useEffect(() => {
    if (open) setStartsAt(new Date());
  }, [open]);
  const endsAt = useMemo(() => {
    if (durationMode === "date") return manualEnd ? new Date(`${manualEnd}T23:59:59`) : null;
    if (durationMode === "years") return addMonths(startsAt, Math.max(1, years) * 12);
    return addMonths(startsAt, Math.max(1, months));
  }, [durationMode, months, years, manualEnd, startsAt]);

  const planLabel =
    planCode === "custom"
      ? customLabel.trim() || "باقة مخصصة"
      : ((plans ?? []).find((p: { code: string; name_ar: string }) => p.code === planCode)
          ?.name_ar ?? planCode);

  const reset = () => {
    setEmail("");
    setPlanCode("basic");
    setCustomLabel("");
    setDurationMode("months");
    setMonths(12);
    setYears(1);
    setManualEnd("");
    setAmount("");
    setNote("");
    setError(null);
  };

  const activate = useMutation({
    mutationFn: async () => {
      if (!endsAt) throw new Error("حدد تاريخ انتهاء صالحاً.");
      return activateFn({
        data: {
          email: email.trim().toLowerCase(),
          planCode,
          planLabel,
          amount: Number(amount || 0),
          currency: "SAR",
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
          note: note.trim() || null,
        },
      });
    },
    onSuccess: (res) => {
      if (!res.ok) {
        setError("هذا البريد غير مسجل داخل المنصة.");
        return;
      }
      toast.success("تم تفعيل الاشتراك", { description: `المشترك: ${res.subscriberName}` });
      qc.invalidateQueries({ queryKey: ["admin-subscriptions"] });
      qc.invalidateQueries({ queryKey: ["platform-overview"] });
      reset();
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  const submit = () => {
    setError(null);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()))
      return setError("أدخل بريداً إلكترونياً صالحاً.");
    if (amount.trim() === "" || Number.isNaN(Number(amount)) || Number(amount) < 0)
      return setError("أدخل قيمة اشتراك صالحة.");
    if (!endsAt) return setError("حدد مدة الاشتراك أو تاريخ الانتهاء.");
    activate.mutate();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="تفعيل اشتراك جديد"
      description="يُفعّل الاشتراك للمشتركين المسجلين فقط."
    >
      <div className="space-y-4">
        <FormField label="الباقة" required>
          <select
            value={planCode}
            onChange={(e) => setPlanCode(e.target.value)}
            className={inputCls}
          >
            {(plans ?? []).map((p: { code: string; name_ar: string }) => (
              <option key={p.code} value={p.code}>
                {p.name_ar}
              </option>
            ))}
            <option value="custom">باقة مخصصة</option>
          </select>
        </FormField>

        {planCode === "custom" && (
          <FormField label="اسم الباقة المخصصة">
            <input
              value={customLabel}
              onChange={(e) => setCustomLabel(e.target.value)}
              className={inputCls}
              placeholder="مثال: اتفاقية مكتب الرياض"
            />
          </FormField>
        )}

        <FormField label="مدة الاشتراك" required>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["months", "بالأشهر"],
                ["years", "بالسنوات"],
                ["date", "تاريخ يدوي"],
              ] as [DurationMode, string][]
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => setDurationMode(mode)}
                className={`rounded-[var(--radius-m)] border px-3 py-2 text-[13px] transition ${
                  durationMode === mode
                    ? "border-primary bg-primary/10 font-semibold text-primary"
                    : "border-border hover:border-border-strong"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </FormField>

        {durationMode === "months" && (
          <FormField label="عدد الأشهر" required>
            <input
              type="number"
              min={1}
              max={120}
              value={months}
              onChange={(e) => setMonths(Number(e.target.value))}
              className={inputCls}
            />
          </FormField>
        )}
        {durationMode === "years" && (
          <FormField label="عدد السنوات" required>
            <input
              type="number"
              min={1}
              max={10}
              value={years}
              onChange={(e) => setYears(Number(e.target.value))}
              className={inputCls}
            />
          </FormField>
        )}
        {durationMode === "date" && (
          <FormField label="تاريخ الانتهاء" required>
            <input
              type="date"
              value={manualEnd}
              onChange={(e) => setManualEnd(e.target.value)}
              className={inputCls}
            />
          </FormField>
        )}

        <FormField label="قيمة الاشتراك (ريال)" required hint="يمكن إدخال أي مبلغ دون قيود.">
          <input
            type="number"
            min={0}
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={inputCls}
            placeholder="0.00"
          />
        </FormField>

        <FormField label="البريد الإلكتروني للعميل" required>
          <input
            type="email"
            dir="ltr"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={`${inputCls} text-left`}
            placeholder="client@example.com"
          />
        </FormField>

        <FormField label="ملاحظة داخلية">
          <input value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} />
        </FormField>

        {endsAt && (
          <p className="rounded-[var(--radius-m)] bg-surface-muted px-3 py-2.5 text-[12px] text-muted-foreground">
            يبدأ اليوم وينتهي في{" "}
            <strong className="text-foreground">{fmtDate(endsAt.toISOString())}</strong>
          </p>
        )}

        {error && (
          <p
            role="alert"
            className="rounded-[var(--radius-m)] bg-danger-soft px-3 py-2.5 text-[12px] text-danger"
          >
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Btn variant="ghost" onClick={onClose}>
            إلغاء
          </Btn>
          <Btn onClick={submit} loading={activate.isPending}>
            تفعيل الاشتراك
          </Btn>
        </div>
      </div>
    </Modal>
  );
}
