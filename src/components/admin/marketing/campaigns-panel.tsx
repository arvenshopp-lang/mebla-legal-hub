import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Download, Pencil, Plus, Trash2 } from "lucide-react";
import {
  Badge,
  Btn,
  ConfirmDialog,
  DataCard,
  EmptyState,
  ErrorBlock,
  FormField,
  IconBtn,
  LoadingBlock,
  Modal,
  PageToolbar,
  Pagination,
  Td,
  Th,
  inputCls,
  useDebounced,
} from "@/lib/list-utils";
import { fmtDate } from "@/lib/enums";
import {
  MARKETING_CAMPAIGN_STATUS,
  MARKETING_CAMPAIGN_STATUS_LABELS,
  type MarketingCampaignRow,
  type MarketingCampaignStatus,
} from "@/lib/marketing.shared";
import {
  createMarketingCampaign,
  deleteMarketingCampaign,
  exportMarketingCampaigns,
  listCouponsForMarketing,
  listMarketingCampaigns,
  updateMarketingCampaign,
} from "@/lib/marketing.functions";

const STATUS_TONE: Record<MarketingCampaignStatus, "green" | "info" | "warn" | "muted" | "red"> = {
  draft: "muted",
  scheduled: "info",
  running: "green",
  paused: "warn",
  completed: "muted",
  cancelled: "red",
};

function toCsv(rows: Record<string, unknown>[]) {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => escape(r[h])).join(","))].join(
    "\n",
  );
}

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function CampaignsPanel({
  canManage,
  canExport,
}: {
  canManage: boolean;
  canExport: boolean;
}) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | MarketingCampaignStatus>("all");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<MarketingCampaignRow | null | "new">(null);
  const [deleting, setDeleting] = useState<MarketingCampaignRow | null>(null);
  const debounced = useDebounced(search);
  const pageSize = 20;

  const listFn = useServerFn(listMarketingCampaigns);
  const deleteFn = useServerFn(deleteMarketingCampaign);
  const exportFn = useServerFn(exportMarketingCampaigns);

  const query = useQuery({
    queryKey: ["marketing-campaigns", debounced, status, page],
    queryFn: () => listFn({ data: { search: debounced, status, page, pageSize } }),
  });

  const removeMutation = useMutation({
    mutationFn: async (id: string) => deleteFn({ data: { campaignId: id } }),
    onSuccess: () => {
      toast.success("تم حذف الحملة");
      qc.invalidateQueries({ queryKey: ["marketing-campaigns"] });
      qc.invalidateQueries({ queryKey: ["marketing-performance"] });
      setDeleting(null);
    },
    onError: (e: Error) => toast.error("تعذّر حذف الحملة", { description: e.message }),
  });

  const exportMutation = useMutation({
    mutationFn: async () => exportFn({ data: {} }),
    onSuccess: (res) => {
      const csv = toCsv(res.rows as Record<string, unknown>[]);
      if (!csv) {
        toast.error("لا توجد بيانات لتصديرها");
        return;
      }
      downloadCsv(`حملات-التسويق-${new Date().toISOString().slice(0, 10)}.csv`, csv);
      toast.success("تم تصدير الحملات بنجاح");
    },
    onError: (e: Error) => toast.error("تعذّر تصدير الحملات", { description: e.message }),
  });

  return (
    <div className="space-y-4">
      <PageToolbar
        search={search}
        setSearch={(v) => {
          setSearch(v);
          setPage(1);
        }}
        placeholder="بحث باسم الحملة أو UTM…"
        searching={query.isFetching && !query.isLoading}
        filters={
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as typeof status);
              setPage(1);
            }}
            aria-label="حالة الحملة"
            className={`${inputCls} w-auto min-w-[150px]`}
          >
            <option value="all">كل الحالات</option>
            {MARKETING_CAMPAIGN_STATUS.map((s) => (
              <option key={s} value={s}>
                {MARKETING_CAMPAIGN_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        }
        onAdd={canManage ? () => setEditing("new") : undefined}
        addLabel="حملة جديدة"
      />

      {canExport && (
        <div className="flex justify-end">
          <Btn
            variant="outline"
            size="sm"
            loading={exportMutation.isPending}
            onClick={() => exportMutation.mutate()}
          >
            <Download className="h-4 w-4" aria-hidden /> تصدير CSV
          </Btn>
        </div>
      )}

      {query.isLoading ? (
        <LoadingBlock rows={6} cols={6} />
      ) : query.isError ? (
        <ErrorBlock message="تعذّر تحميل قائمة الحملات." />
      ) : (query.data?.rows.length ?? 0) === 0 ? (
        <EmptyState title="لا توجد حملات" hint="أنشئ حملتك التسويقية الأولى لبدء تتبع الأداء." />
      ) : (
        <>
          <DataCard>
            <table className="w-full min-w-[880px] text-right">
              <thead>
                <tr>
                  <Th>الحملة</Th>
                  <Th>القناة</Th>
                  <Th>الحالة</Th>
                  <Th>الميزانية</Th>
                  <Th>الإنفاق</Th>
                  <Th>الفترة</Th>
                  <Th>الكوبون</Th>
                  <Th className="text-left">إجراءات</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {query.data!.rows.map((c: MarketingCampaignRow) => (
                  <tr key={c.id} className="hover:bg-surface-muted/60">
                    <Td>
                      <span className="block max-w-[220px] truncate font-medium">{c.name}</span>
                      {c.utm_campaign && (
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {c.utm_campaign}
                        </span>
                      )}
                    </Td>
                    <Td>{c.channel}</Td>
                    <Td>
                      <Badge tone={STATUS_TONE[c.status]}>
                        {MARKETING_CAMPAIGN_STATUS_LABELS[c.status]}
                      </Badge>
                    </Td>
                    <Td className="tabular-nums">
                      {c.budget_amount.toLocaleString("ar-SA")} {c.currency}
                    </Td>
                    <Td className="tabular-nums">
                      {c.spend_amount.toLocaleString("ar-SA")} {c.currency}
                    </Td>
                    <Td>
                      {c.starts_on ? fmtDate(c.starts_on) : "—"} —{" "}
                      {c.ends_on ? fmtDate(c.ends_on) : "مستمرة"}
                    </Td>
                    <Td>{c.coupon_code ?? "—"}</Td>
                    <Td className="text-left">
                      {canManage && (
                        <div className="flex items-center justify-end gap-1">
                          <IconBtn aria-label="تعديل الحملة" onClick={() => setEditing(c)}>
                            <Pencil className="h-4 w-4" aria-hidden />
                          </IconBtn>
                          <IconBtn
                            aria-label="حذف الحملة"
                            tone="danger"
                            onClick={() => setDeleting(c)}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden />
                          </IconBtn>
                        </div>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DataCard>
          <Pagination page={page} setPage={setPage} total={query.data!.total} pageSize={pageSize} />
        </>
      )}

      <CampaignDialog
        target={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          qc.invalidateQueries({ queryKey: ["marketing-campaigns"] });
          qc.invalidateQueries({ queryKey: ["marketing-performance"] });
        }}
      />

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && removeMutation.mutate(deleting.id)}
        loading={removeMutation.isPending}
        title="حذف الحملة"
        message={`سيتم حذف حملة «${deleting?.name ?? ""}» نهائياً. تأكد من عدم وجود أحداث تحويل مرتبطة بها.`}
        confirmLabel="حذف الحملة"
      />
    </div>
  );
}

function CampaignDialog({
  target,
  onClose,
  onSaved,
}: {
  target: MarketingCampaignRow | "new" | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const open = !!target;
  const editingRow = target && target !== "new" ? target : null;
  const createFn = useServerFn(createMarketingCampaign);
  const updateFn = useServerFn(updateMarketingCampaign);
  const couponsFn = useServerFn(listCouponsForMarketing);

  const { data: couponsData } = useQuery({
    queryKey: ["marketing-coupons-options"],
    queryFn: () => couponsFn({ data: {} }),
    enabled: open,
    staleTime: 60_000,
  });

  const [form, setForm] = useState(() => emptyForm(editingRow));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setForm(emptyForm(target && target !== "new" ? target : null));
    setError(null);
  }, [target]);

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        channel: form.channel.trim(),
        objective: form.objective,
        status: form.status,
        budgetAmount: Number(form.budgetAmount) || 0,
        spendAmount: Number(form.spendAmount) || 0,
        currency: form.currency.trim() || "SAR",
        startsOn: form.startsOn,
        endsOn: form.endsOn,
        utmSource: form.utmSource,
        utmMedium: form.utmMedium,
        utmCampaign: form.utmCampaign,
        landingPageSlug: form.landingPageSlug,
        couponId: form.couponId,
        notes: form.notes,
      };
      if (editingRow) return updateFn({ data: { ...payload, campaignId: editingRow.id } });
      return createFn({ data: payload });
    },
    onSuccess: () => {
      toast.success(editingRow ? "تم تحديث الحملة" : "تم إنشاء الحملة");
      onSaved();
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editingRow ? "تعديل الحملة" : "حملة تسويقية جديدة"}
      description="تُستخدم بيانات UTM لربط الحملة بالعملاء المحتملين والصفقات تلقائياً."
      size="lg"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="اسم الحملة" required>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className={inputCls}
          />
        </FormField>
        <FormField label="القناة" required hint="مثال: بحث مدفوع، سوشيال ميديا، بريد إلكتروني">
          <input
            value={form.channel}
            onChange={(e) => setForm({ ...form, channel: e.target.value })}
            className={inputCls}
          />
        </FormField>
        <FormField label="الحالة">
          <select
            value={form.status}
            onChange={(e) =>
              setForm({ ...form, status: e.target.value as MarketingCampaignStatus })
            }
            className={inputCls}
          >
            {MARKETING_CAMPAIGN_STATUS.map((s) => (
              <option key={s} value={s}>
                {MARKETING_CAMPAIGN_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="الهدف">
          <input
            value={form.objective}
            onChange={(e) => setForm({ ...form, objective: e.target.value })}
            className={inputCls}
          />
        </FormField>
        <FormField label="الميزانية">
          <input
            type="number"
            min={0}
            value={form.budgetAmount}
            onChange={(e) => setForm({ ...form, budgetAmount: e.target.value })}
            className={inputCls}
          />
        </FormField>
        <FormField label="الإنفاق حتى الآن">
          <input
            type="number"
            min={0}
            value={form.spendAmount}
            onChange={(e) => setForm({ ...form, spendAmount: e.target.value })}
            className={inputCls}
          />
        </FormField>
        <FormField label="العملة">
          <input
            value={form.currency}
            onChange={(e) => setForm({ ...form, currency: e.target.value })}
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
        <FormField label="تاريخ البدء">
          <input
            type="date"
            value={form.startsOn}
            onChange={(e) => setForm({ ...form, startsOn: e.target.value })}
            className={inputCls}
          />
        </FormField>
        <FormField label="تاريخ الانتهاء">
          <input
            type="date"
            value={form.endsOn}
            onChange={(e) => setForm({ ...form, endsOn: e.target.value })}
            className={inputCls}
          />
        </FormField>
        <FormField label="مصدر UTM (utm_source)">
          <input
            value={form.utmSource}
            onChange={(e) => setForm({ ...form, utmSource: e.target.value })}
            className={inputCls}
          />
        </FormField>
        <FormField label="وسيط UTM (utm_medium)">
          <input
            value={form.utmMedium}
            onChange={(e) => setForm({ ...form, utmMedium: e.target.value })}
            className={inputCls}
          />
        </FormField>
        <FormField label="حملة UTM (utm_campaign)">
          <input
            value={form.utmCampaign}
            onChange={(e) => setForm({ ...form, utmCampaign: e.target.value })}
            className={inputCls}
          />
        </FormField>
        <FormField label="مسار صفحة الهبوط">
          <input
            value={form.landingPageSlug}
            onChange={(e) => setForm({ ...form, landingPageSlug: e.target.value })}
            className={inputCls}
          />
        </FormField>
      </div>
      <div className="mt-4">
        <FormField label="ملاحظات">
          <textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            className={`${inputCls} min-h-24`}
          />
        </FormField>
      </div>
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
            if (form.name.trim().length < 2) return setError("اسم الحملة مطلوب.");
            if (form.channel.trim().length < 2) return setError("قناة الحملة مطلوبة.");
            save.mutate();
          }}
          loading={save.isPending}
        >
          {editingRow ? "حفظ التعديلات" : "إنشاء الحملة"}
        </Btn>
      </div>
    </Modal>
  );
}

function emptyForm(row: MarketingCampaignRow | null) {
  return {
    name: row?.name ?? "",
    channel: row?.channel ?? "",
    objective: row?.objective ?? "",
    status: row?.status ?? ("draft" as MarketingCampaignStatus),
    budgetAmount: row ? String(row.budget_amount) : "0",
    spendAmount: row ? String(row.spend_amount) : "0",
    currency: row?.currency ?? "SAR",
    startsOn: row?.starts_on ?? "",
    endsOn: row?.ends_on ?? "",
    utmSource: row?.utm_source ?? "",
    utmMedium: row?.utm_medium ?? "",
    utmCampaign: row?.utm_campaign ?? "",
    landingPageSlug: row?.landing_page_slug ?? "",
    couponId: row?.coupon_id ?? "",
    notes: row?.notes ?? "",
  };
}
