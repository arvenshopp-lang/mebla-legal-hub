import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { DashboardShell } from "@/components/dashboard/shell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, canEdit, canManage } from "@/hooks/use-auth";
import { CLIENT_TYPE, asOptions, fmtDate } from "@/lib/enums";
import {
  PageToolbar, EmptyState, LoadingBlock, ErrorBlock, DataCard, Th, Td, BusyOverlay, IconBtn,
  Modal, FormField, inputCls, Btn, Badge, useDebounced, ConfirmDialog, Pagination,
} from "@/lib/list-utils";
import { Pencil, Trash2 } from "lucide-react";
import { describeMutationError } from "@/lib/subscription.shared";
import { useServerFn } from "@tanstack/react-start";
import { saveClientSecure, searchClientsByPii } from "@/lib/pii.functions";
import { PiiSecureInput, useMaskedPii } from "@/components/security/pii-value";
import { normalizePiiValue } from "@/lib/crypto/pii.shared";
import { useDialogDraft } from "@/lib/drafts/use-dialog-draft";
import { DraftPrompt, DraftStatus } from "@/lib/drafts/draft-ui";

export const Route = createFileRoute("/_authenticated/clients")({
  component: Page,
});

const PAGE_SIZE = 20;

const clientSchema = z.object({
  full_name: z.string().trim().min(2, "الاسم مطلوب").max(150),
  client_type: z.enum(["individual", "company", "government"]),
  company_name: z.string().max(150).optional().nullable(),
  email: z.string().email("بريد غير صالح").max(150).optional().or(z.literal("")),
  phone: z.string().max(30).optional().nullable(),
  city: z.string().max(60).optional().nullable(),
  address: z.string().max(300).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});
type ClientForm = z.infer<typeof clientSchema>;

type ClientRow = {
  id: string; full_name: string; client_type: string; company_name: string | null;
  phone: string | null; email: string | null; city: string | null; status: string;
  created_at: string;
};

function Page() {
  const { activeOrgId, activeRole } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [type, setType] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<ClientRow | null>(null);
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState<ClientRow | null>(null);
  const q = useDebounced(search);
  const piiSearch = useServerFn(searchClientsByPii);

  const { data, isLoading, isFetching, error } = useQuery({
    placeholderData: keepPreviousData,
    queryKey: ["clients", activeOrgId, q, type, page],
    enabled: !!activeOrgId,
    queryFn: async () => {
      // بحث بالرقم الحساس: يمر عبر البصمة الحتمية على الخادم، فلا يُخزَّن الرقم صريحاً.
      const digits = normalizePiiValue(q);
      let piiIds: string[] | null = null;
      if (digits.length >= 5 && /^\d+$/.test(digits)) {
        const res = await piiSearch({ data: { organizationId: activeOrgId!, value: digits } });
        piiIds = res.ids;
      }
      let query = supabase.from("clients").select("*", { count: "exact" })
        .eq("organization_id", activeOrgId!).order("created_at", { ascending: false })
        .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
      if (piiIds?.length) {
        query = query.in("id", piiIds);
      } else if (q) {
        query = query.or(`full_name.ilike.%${q}%,phone.ilike.%${q}%,company_name.ilike.%${q}%`);
      }
      if (type !== "all") query = query.eq("client_type", type as any);
      const { data, error, count } = await query;
      if (error) throw error;
      return { rows: (data ?? []) as ClientRow[], count: count ?? 0 };
    },
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("clients").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم الحذف");
      qc.invalidateQueries({ queryKey: ["clients"] });
      setDeleting(null);
    },
    onError: (e: any) => toast.error("تعذّر الحذف", { description: e.message }),
  });

  return (
    <DashboardShell title="العملاء">
      <PageToolbar
        searching={isFetching && !isLoading}
        search={search}
        setSearch={(v) => { setSearch(v); setPage(1); }}
        canAdd={canEdit(activeRole)}
        onAdd={() => { setEditing(null); setOpen(true); }}
        addLabel="عميل جديد"
        filters={
          <select value={type} onChange={(e) => { setType(e.target.value); setPage(1); }} className={inputCls + " max-w-[160px]"}>
            <option value="all">كل الأنواع</option>
            {asOptions(CLIENT_TYPE).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        }
      />
      {isLoading ? <LoadingBlock /> : error ? <ErrorBlock message={(error as any).message} /> :
        !data?.rows.length ? (
          <EmptyState
            title="لا يوجد عملاء بعد"
            hint="أضف أول عميل لبدء إدارة قضاياه"
            action={canEdit(activeRole) && <Btn onClick={() => { setEditing(null); setOpen(true); }}>إضافة عميل</Btn>}
          />
        ) : (
          <>
            <BusyOverlay busy={isFetching && !isLoading}>
            <DataCard>
              <table className="min-w-full">
                <thead className="bg-surface-muted/60">
                  <tr><Th>الاسم</Th><Th>النوع</Th><Th>الجوال</Th><Th>المدينة</Th><Th>تاريخ الإضافة</Th><Th>{" "}</Th></tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.rows.map((c) => (
                    <tr key={c.id} className="hover:bg-surface-muted/40">
                      <Td className="font-medium">
                        {c.full_name}
                        {c.company_name && <div className="text-xs text-muted-foreground">{c.company_name}</div>}
                      </Td>
                      <Td><Badge>{CLIENT_TYPE[c.client_type] ?? c.client_type}</Badge></Td>
                      <Td>{c.phone ?? "—"}</Td>
                      <Td>{c.city ?? "—"}</Td>
                      <Td>{fmtDate(c.created_at)}</Td>
                      <Td>
                        <div className="flex justify-end gap-1">
                          {canEdit(activeRole) && (
                            <button onClick={() => { setEditing(c); setOpen(true); }} className="rounded-lg p-1.5 hover:bg-surface-muted">
                              <Pencil className="h-4 w-4" />
                            </button>
                          )}
                          {canManage(activeRole) && (
                            <IconBtn tone="danger" aria-label="حذف" title="حذف" loading={del.isPending && deleting?.id === c.id} onClick={() => setDeleting(c)}><Trash2 className="h-4 w-4" /></IconBtn>
                          )}
                        </div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DataCard>
            </BusyOverlay>
            <Pagination page={page} setPage={setPage} total={data.count} pageSize={PAGE_SIZE} />
          </>
        )}

      <ClientDialog open={open} onClose={() => setOpen(false)} editing={editing} />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && del.mutate(deleting.id)}
        loading={del.isPending}
        title="حذف العميل"
        message={`سيتم حذف "${deleting?.full_name}" وجميع قضاياه ومستنداته. هل أنت متأكد؟`}
      />
    </DashboardShell>
  );
}

export function ClientDialog({ open, onClose, editing, onCreated }: { open: boolean; onClose: () => void; editing: ClientRow | null; onCreated?: (c: any) => void }) {
  const { activeOrgId } = useAuth();
  const qc = useQueryClient();
  const [form, setForm] = useState<Partial<ClientForm>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const saveSecure = useServerFn(saveClientSecure);
  const { data: mask } = useMaskedPii(activeOrgId, "client", editing?.id);
  const [piiEdit, setPiiEdit] = useState<{ field: "national_id" | "commercial_registration"; value: string } | null>(null);
  const draft = useDialogDraft<ClientForm>({
    name: "clients",
    open,
    isNew: !editing,
    userKey: activeOrgId ?? "anon",
    form,
    setForm,
  });

  // reset form on every open (including two consecutive "new" records)
  const key = open ? (editing?.id ?? "new") : "closed";
  const [formKey, setFormKey] = useState("closed");
  if (formKey !== key) {
    setFormKey(key);
    setErrors({});
    setPiiEdit(null);
    setForm(editing ? { ...(editing as any) } : { client_type: "individual" });
  }

  const save = async () => {
    const res = clientSchema.safeParse({ ...form, client_type: form.client_type ?? "individual" });
    if (!res.success) {
      const errs: Record<string, string> = {};
      res.error.issues.forEach((i) => { errs[i.path[0] as string] = i.message; });
      setErrors(errs);
      toast.error("تحقق من الحقول المطلوبة", { description: Object.values(errs)[0] as string });
      return;
    }
    setSaving(true);
    try {
      const row = await saveSecure({
        data: {
          organizationId: activeOrgId!,
          ...(editing ? { id: editing.id } : {}),
          values: res.data as never,
          ...(piiEdit ? { pii: { [piiEdit.field]: piiEdit.value.trim() || null } } : {}),
        },
      });
      toast.success(editing ? "تم التحديث" : "تم إنشاء العميل");
      draft.clear();
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["pii-mask"] });
      onCreated?.(row);
      onClose();
    } catch (error) {
      toast.error("تعذّر الحفظ", {
        description: describeMutationError(error instanceof Error ? error.message : ""),
      });
    } finally {
      setSaving(false);
    }
  };

  const piiField = form.client_type === "individual" || !form.client_type ? "national_id" : "commercial_registration";
  const piiMask = (mask?.[piiField] ?? "—") as string;

  return (
    <Modal open={open} onClose={onClose} title={editing ? "تعديل عميل" : "عميل جديد"} size="lg">
      <DraftPrompt draft={draft as never} />
      <div className="grid gap-4 md:grid-cols-2">
        <FormField label="الاسم الكامل *">
          <input value={form.full_name ?? ""} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className={inputCls} />
          {errors.full_name && <span className="text-xs text-danger">{errors.full_name}</span>}
        </FormField>
        <FormField label="نوع العميل *">
          <select
            value={form.client_type ?? "individual"}
            onChange={(e) => {
              const next = e.target.value as ClientForm["client_type"];
              // تفريغ حقول الجهة عند التحويل إلى «فرد» حتى لا تُحفظ بيانات لا تنتمي للعميل
              setForm((prev) => (next === "individual"
                ? { ...prev, client_type: next, company_name: null }
                : { ...prev, client_type: next }));
              setPiiEdit(null);
              setErrors((prev) => {
                const { company_name: _omit, ...rest } = prev;
                return rest;
              });
            }}
            className={inputCls}
          >
            {asOptions(CLIENT_TYPE).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </FormField>
        {form.client_type !== "individual" && (
          <FormField label="اسم الجهة/الشركة">
            <input value={form.company_name ?? ""} onChange={(e) => setForm({ ...form, company_name: e.target.value })} className={inputCls} />
          </FormField>
        )}
        <PiiSecureInput
          label={piiField === "national_id" ? "رقم الهوية" : "السجل التجاري"}
          mask={piiMask}
          value={piiEdit?.field === piiField ? piiEdit.value : ""}
          editing={piiEdit?.field === piiField || (piiMask === "—" && !editing)}
          onChange={(next) => setPiiEdit({ field: piiField, value: next })}
          onStartEdit={() => setPiiEdit({ field: piiField, value: "" })}
          onCancelEdit={() => setPiiEdit(null)}
        />
        <FormField label="الجوال">
          <input value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inputCls} />
        </FormField>
        <FormField label="البريد الإلكتروني">
          <input type="email" value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputCls} />
          {errors.email && <span className="text-xs text-danger">{errors.email}</span>}
        </FormField>
        <FormField label="المدينة">
          <input value={form.city ?? ""} onChange={(e) => setForm({ ...form, city: e.target.value })} className={inputCls} />
        </FormField>
        <FormField label="العنوان">
          <input value={form.address ?? ""} onChange={(e) => setForm({ ...form, address: e.target.value })} className={inputCls} />
        </FormField>
        <div className="md:col-span-2">
          <FormField label="ملاحظات">
            <textarea rows={3} value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={inputCls} />
          </FormField>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
        <div className="me-auto">
          <DraftStatus draft={draft as never} />
        </div>
        <Btn variant="outline" onClick={onClose} disabled={saving}>إلغاء</Btn>
        <Btn onClick={save} loading={saving}>{saving ? "جاري الحفظ…" : "حفظ"}</Btn>
      </div>
    </Modal>
  );
}
