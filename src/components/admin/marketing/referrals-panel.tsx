import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Pencil, Plus } from "lucide-react";
import {
  Badge,
  Btn,
  DataCard,
  EmptyState,
  ErrorBlock,
  FormField,
  IconBtn,
  LoadingBlock,
  Modal,
  PageToolbar,
  Td,
  Th,
  inputCls,
  useDebounced,
} from "@/lib/list-utils";
import { fmtDate } from "@/lib/enums";
import type { MarketingReferralRow } from "@/lib/marketing.shared";
import {
  createMarketingReferral,
  listCouponsForMarketing,
  listMarketingReferrals,
  updateMarketingReferral,
} from "@/lib/marketing.functions";

export function ReferralsPanel({ canManage }: { canManage: boolean }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<MarketingReferralRow | "new" | null>(null);
  const debounced = useDebounced(search);

  const listFn = useServerFn(listMarketingReferrals);
  const query = useQuery({
    queryKey: ["marketing-referrals", debounced],
    queryFn: () => listFn({ data: { search: debounced } }),
  });

  return (
    <div className="space-y-4">
      <PageToolbar
        search={search}
        setSearch={setSearch}
        placeholder="بحث برمز الإحالة أو اسم المُحيل…"
        searching={query.isFetching && !query.isLoading}
        onAdd={canManage ? () => setEditing("new") : undefined}
        addLabel="برنامج إحالة جديد"
      />

      {query.isLoading ? (
        <LoadingBlock rows={6} cols={6} />
      ) : query.isError ? (
        <ErrorBlock message="تعذّر تحميل برامج الإحالة." />
      ) : (query.data?.rows.length ?? 0) === 0 ? (
        <EmptyState
          title="لا توجد برامج إحالة"
          hint="أنشئ برنامج إحالة لمتابعة العملاء المُحالين ومكافآتهم."
        />
      ) : (
        <DataCard>
          <table className="w-full min-w-[820px] text-right">
            <thead>
              <tr>
                <Th>الرمز</Th>
                <Th>نوع المُحيل</Th>
                <Th>اسم المُحيل</Th>
                <Th>الكوبون</Th>
                <Th>الاستخدام</Th>
                <Th>الحالة</Th>
                <Th className="text-left">إجراءات</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {query.data!.rows.map((r: MarketingReferralRow) => (
                <tr key={r.id} className="hover:bg-surface-muted/60">
                  <Td className="font-medium">{r.code}</Td>
                  <Td>{r.referrer_kind}</Td>
                  <Td>
                    <span className="block max-w-[180px] truncate">{r.referrer_name ?? "—"}</span>
                    {r.referrer_email && (
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {r.referrer_email}
                      </span>
                    )}
                  </Td>
                  <Td>{r.coupon_code ?? "—"}</Td>
                  <Td className="tabular-nums">
                    {r.uses_count} / {r.max_uses ?? "بلا حد"}
                  </Td>
                  <Td>
                    <Badge tone={r.is_active ? "green" : "muted"}>
                      {r.is_active ? "نشط" : "معطّل"}
                    </Badge>
                  </Td>
                  <Td className="text-left">
                    {canManage && (
                      <IconBtn aria-label="تعديل برنامج الإحالة" onClick={() => setEditing(r)}>
                        <Pencil className="h-4 w-4" aria-hidden />
                      </IconBtn>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataCard>
      )}

      <ReferralDialog
        target={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          qc.invalidateQueries({ queryKey: ["marketing-referrals"] });
        }}
      />
    </div>
  );
}

function ReferralDialog({
  target,
  onClose,
  onSaved,
}: {
  target: MarketingReferralRow | "new" | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const open = !!target;
  const editingRow = target && target !== "new" ? target : null;
  const createFn = useServerFn(createMarketingReferral);
  const updateFn = useServerFn(updateMarketingReferral);
  const couponsFn = useServerFn(listCouponsForMarketing);

  const { data: couponsData } = useQuery({
    queryKey: ["marketing-coupons-options"],
    queryFn: () => couponsFn({ data: {} }),
    enabled: open,
    staleTime: 60_000,
  });

  const [form, setForm] = useState(() => emptyForm(editingRow));
  const [error, setError] = useState<string | null>(null);

  useMemo(() => {
    setForm(emptyForm(editingRow));
    setError(null);
  }, [target]);

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        code: form.code.trim(),
        referrerKind: form.referrerKind.trim(),
        referrerName: form.referrerName,
        referrerEmail: form.referrerEmail,
        couponId: form.couponId,
        rewardNote: form.rewardNote,
        maxUses: form.maxUses ? Number(form.maxUses) : undefined,
        label: form.label,
        isActive: form.isActive,
      };
      if (editingRow) return updateFn({ data: { ...payload, referralId: editingRow.id } });
      return createFn({ data: payload });
    },
    onSuccess: () => {
      toast.success(editingRow ? "تم تحديث برنامج الإحالة" : "تم إنشاء برنامج الإحالة");
      onSaved();
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editingRow ? "تعديل برنامج الإحالة" : "برنامج إحالة جديد"}
      description="رمز الإحالة فريد ويُستخدم لتتبع العملاء المُحالين ومنح مكافآتهم."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="رمز الإحالة" required>
          <input
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
            className={inputCls}
            disabled={!!editingRow}
          />
        </FormField>
        <FormField label="نوع المُحيل" required hint="مثال: عميل، شريك، موظف">
          <input
            value={form.referrerKind}
            onChange={(e) => setForm({ ...form, referrerKind: e.target.value })}
            className={inputCls}
          />
        </FormField>
        <FormField label="اسم المُحيل">
          <input
            value={form.referrerName}
            onChange={(e) => setForm({ ...form, referrerName: e.target.value })}
            className={inputCls}
          />
        </FormField>
        <FormField label="بريد المُحيل">
          <input
            value={form.referrerEmail}
            onChange={(e) => setForm({ ...form, referrerEmail: e.target.value })}
            className={inputCls}
          />
        </FormField>
        <FormField label="الكوبون المرتبط">
          <select
            value={form.couponId}
            onChange={(e) => setForm({ ...form, couponId: e.target.value })}
            className={inputCls}
          >
            <option value="">بلا كوبون</option>
            {(couponsData?.coupons ?? []).map((c: { id: string; code: string }) => (
              <option key={c.id} value={c.id}>
                {c.code}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="الحد الأقصى للاستخدام" hint="اتركه فارغاً لعدم التحديد">
          <input
            type="number"
            min={0}
            value={form.maxUses}
            onChange={(e) => setForm({ ...form, maxUses: e.target.value })}
            className={inputCls}
          />
        </FormField>
        <FormField label="تسمية داخلية">
          <input
            value={form.label}
            onChange={(e) => setForm({ ...form, label: e.target.value })}
            className={inputCls}
          />
        </FormField>
        <FormField label="الحالة">
          <select
            value={form.isActive ? "1" : "0"}
            onChange={(e) => setForm({ ...form, isActive: e.target.value === "1" })}
            className={inputCls}
          >
            <option value="1">نشط</option>
            <option value="0">معطّل</option>
          </select>
        </FormField>
      </div>
      <div className="mt-4">
        <FormField label="ملاحظة المكافأة">
          <textarea
            value={form.rewardNote}
            onChange={(e) => setForm({ ...form, rewardNote: e.target.value })}
            className={`${inputCls} min-h-20`}
          />
        </FormField>
      </div>
      {editingRow && (
        <p className="mt-3 text-caption">آخر تحديث: {fmtDate(editingRow.updated_at)}</p>
      )}
      {error && (
        <p
          role="alert"
          className="mt-4 rounded-[var(--radius-m)] bg-danger-soft px-3 py-2.5 text-[12px] text-danger"
        >
          {error}
        </p>
      )}
      <div className="mt-6 flex justify-end gap-2">
        <Btn variant="outline" onClick={onClose} disabled={save.isPending}>
          إلغاء
        </Btn>
        <Btn
          onClick={() => {
            setError(null);
            if (form.code.trim().length < 2) return setError("رمز الإحالة مطلوب.");
            if (form.referrerKind.trim().length < 2) return setError("نوع المُحيل مطلوب.");
            save.mutate();
          }}
          loading={save.isPending}
        >
          {editingRow ? "حفظ التعديلات" : "إنشاء البرنامج"}
        </Btn>
      </div>
    </Modal>
  );
}

function emptyForm(row: MarketingReferralRow | null) {
  return {
    code: row?.code ?? "",
    referrerKind: row?.referrer_kind ?? "",
    referrerName: row?.referrer_name ?? "",
    referrerEmail: row?.referrer_email ?? "",
    couponId: row?.coupon_id ?? "",
    rewardNote: row?.reward_note ?? "",
    maxUses: row?.max_uses != null ? String(row.max_uses) : "",
    label: row?.label ?? "",
    isActive: row?.is_active ?? true,
  };
}
