import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Ban, Plus } from "lucide-react";
import { AdminShell } from "@/components/admin/shell";
import { supabase } from "@/integrations/supabase/client";
import { activateSubscription, cancelSubscription } from "@/lib/admin.functions";
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
import { fmtDate } from "@/lib/enums";

export const Route = createFileRoute("/mehla-admin/subscriptions")({
  head: () => ({ meta: [{ title: "الاشتراكات · إدارة مِهلة" }, { name: "robots", content: "noindex, nofollow" }] }),
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
  const debounced = useDebounced(search);
  const cancelFn = useServerFn(cancelSubscription);

  const { data: rows, isLoading, isFetching } = useQuery({
    queryKey: ["admin-subscriptions", debounced, statusFilter],
    queryFn: async () => {
      let q = supabase.from("subscriptions").select("*").order("created_at", { ascending: false }).limit(200);
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
                <Th className="text-left">إجراءات</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows!.map((s) => {
                const expired = new Date(String(s.ends_at)) < new Date();
                const status = s.status === "active" && expired ? "expired" : String(s.status);
                return (
                  <tr key={String(s.id)} className="hover:bg-surface-muted/60">
                    <Td>{String(s.email)}</Td>
                    <Td>{String(s.plan_label)}</Td>
                    <Td className="tabular-nums">
                      {Number(s.amount).toLocaleString("ar-SA")} {String(s.currency)}
                    </Td>
                    <Td>{fmtDate(String(s.starts_at))}</Td>
                    <Td>{fmtDate(String(s.ends_at))}</Td>
                    <Td>
                      <Badge tone={status === "active" ? "green" : status === "expired" ? "red" : "muted"}>
                        {SUBSCRIPTION_STATUS_LABELS[status] ?? status}
                      </Badge>
                    </Td>
                    <Td className="text-left">
                      {s.status === "active" && (
                        <button
                          onClick={() => setCancelling({ id: String(s.id), email: String(s.email) })}
                          className="inline-flex items-center gap-1 rounded-[var(--radius-s)] px-2 py-1 text-[12px] text-danger hover:bg-danger-soft"
                        >
                          <Ban className="h-3.5 w-3.5" aria-hidden /> إلغاء
                        </button>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </DataCard>
      )}

      <ActivateDialog open={open} onClose={() => setOpen(false)} />
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
    queryFn: async () => (await supabase.from("platform_plans").select("code, name_ar").order("sort_order")).data ?? [],
  });

  const startsAt = useMemo(() => new Date(), [open]);
  const endsAt = useMemo(() => {
    if (durationMode === "date") return manualEnd ? new Date(`${manualEnd}T23:59:59`) : null;
    if (durationMode === "years") return addMonths(startsAt, Math.max(1, years) * 12);
    return addMonths(startsAt, Math.max(1, months));
  }, [durationMode, months, years, manualEnd, startsAt]);

  const planLabel =
    planCode === "custom"
      ? customLabel.trim() || "باقة مخصصة"
      : ((plans ?? []).find((p: { code: string; name_ar: string }) => p.code === planCode)?.name_ar ?? planCode);

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
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setError("أدخل بريداً إلكترونياً صالحاً.");
    if (amount.trim() === "" || Number.isNaN(Number(amount)) || Number(amount) < 0)
      return setError("أدخل قيمة اشتراك صالحة.");
    if (!endsAt) return setError("حدد مدة الاشتراك أو تاريخ الانتهاء.");
    activate.mutate();
  };

  return (
    <Modal open={open} onClose={onClose} title="تفعيل اشتراك جديد" description="يُفعّل الاشتراك للمشتركين المسجلين فقط.">
      <div className="space-y-4">
        <FormField label="الباقة" required>
          <select value={planCode} onChange={(e) => setPlanCode(e.target.value)} className={inputCls}>
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
            <input type="date" value={manualEnd} onChange={(e) => setManualEnd(e.target.value)} className={inputCls} />
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
            يبدأ اليوم وينتهي في <strong className="text-foreground">{fmtDate(endsAt.toISOString())}</strong>
          </p>
        )}

        {error && (
          <p role="alert" className="rounded-[var(--radius-m)] bg-danger-soft px-3 py-2.5 text-[12px] text-danger">
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