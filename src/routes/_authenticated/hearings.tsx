import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { DashboardShell } from "@/components/dashboard/shell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, canEdit, canManage } from "@/hooks/use-auth";
import { HEARING_STATUS, asOptions, fmtDateTime } from "@/lib/enums";
import {
  PageToolbar, EmptyState, LoadingBlock, ErrorBlock, DataCard, Th, Td,
  Modal, FormField, inputCls, Btn, Badge, useDebounced, ConfirmDialog, Pagination,
} from "@/lib/list-utils";
import { Pencil, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/hearings")({
  component: Page,
});

const PAGE_SIZE = 20;

const schema = z.object({
  case_id: z.string().uuid("اختر القضية"),
  title: z.string().trim().min(2, "العنوان مطلوب").max(200),
  hearing_date: z.string().min(1, "التاريخ مطلوب"),
  court_name: z.string().max(150).optional().nullable(),
  judicial_circuit: z.string().max(80).optional().nullable(),
  hearing_type: z.string().max(80).optional().nullable(),
  location: z.string().max(200).optional().nullable(),
  remote_link: z.string().max(500).optional().nullable(),
  status: z.enum(["scheduled","completed","postponed","cancelled","missed"]),
  result: z.string().max(1000).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});
type Form = z.infer<typeof schema>;

function Page() {
  const { activeOrgId, activeRole, user } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [when, setWhen] = useState<"all" | "upcoming" | "past">("upcoming");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<any | null>(null);
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState<any | null>(null);
  const q = useDebounced(search);

  const { data, isLoading, error } = useQuery({
    queryKey: ["hearings", activeOrgId, q, status, when, page],
    enabled: !!activeOrgId,
    queryFn: async () => {
      let query = supabase.from("hearings")
        .select("*, case:cases(id, case_title, case_number, client:clients(full_name))", { count: "exact" })
        .eq("organization_id", activeOrgId!)
        .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
      if (q) query = query.or(`title.ilike.%${q}%,court_name.ilike.%${q}%`);
      if (status !== "all") query = query.eq("status", status as any);
      const now = new Date().toISOString();
      if (when === "upcoming") query = query.gte("hearing_date", now).order("hearing_date", { ascending: true });
      else if (when === "past") query = query.lt("hearing_date", now).order("hearing_date", { ascending: false });
      else query = query.order("hearing_date", { ascending: false });
      const { data, error, count } = await query;
      if (error) throw error;
      return { rows: data ?? [], count: count ?? 0 };
    },
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("hearings").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم الحذف");
      qc.invalidateQueries({ queryKey: ["hearings"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      setDeleting(null);
    },
    onError: (e: any) => toast.error("تعذّر الحذف", { description: e.message }),
  });

  return (
    <DashboardShell title="الجلسات">
      <PageToolbar
        search={search}
        setSearch={(v) => { setSearch(v); setPage(1); }}
        canAdd={canEdit(activeRole)}
        onAdd={() => { setEditing(null); setOpen(true); }}
        addLabel="جلسة جديدة"
        filters={
          <>
            <select value={when} onChange={(e) => { setWhen(e.target.value as any); setPage(1); }} className={inputCls + " max-w-[140px]"}>
              <option value="upcoming">القادمة</option>
              <option value="past">السابقة</option>
              <option value="all">الكل</option>
            </select>
            <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className={inputCls + " max-w-[160px]"}>
              <option value="all">كل الحالات</option>
              {asOptions(HEARING_STATUS).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </>
        }
      />
      {isLoading ? <LoadingBlock /> : error ? <ErrorBlock message={(error as any).message} /> :
        !data?.rows.length ? (
          <EmptyState title="لا توجد جلسات" hint="أضف جلسة لبدء التتبع" action={canEdit(activeRole) && <Btn onClick={() => { setEditing(null); setOpen(true); }}>إضافة جلسة</Btn>} />
        ) : (
          <>
            <DataCard>
              <table className="min-w-full">
                <thead className="bg-[#F5F3EE]/60">
                  <tr><Th>العنوان</Th><Th>القضية</Th><Th>العميل</Th><Th>التاريخ والوقت</Th><Th>المحكمة</Th><Th>الحالة</Th><Th>{" "}</Th></tr>
                </thead>
                <tbody className="divide-y divide-[#123C32]/5">
                  {data.rows.map((h: any) => (
                    <tr key={h.id} className="hover:bg-[#F5F3EE]/40">
                      <Td className="font-medium">{h.title}</Td>
                      <Td>{h.case?.case_title ?? "—"}</Td>
                      <Td>{h.case?.client?.full_name ?? "—"}</Td>
                      <Td>{fmtDateTime(h.hearing_date)}</Td>
                      <Td>{h.court_name ?? "—"}</Td>
                      <Td><Badge tone={h.status === "completed" ? "green" : h.status === "missed" ? "red" : h.status === "postponed" ? "warn" : "muted"}>{HEARING_STATUS[h.status] ?? h.status}</Badge></Td>
                      <Td>
                        <div className="flex justify-end gap-1">
                          {canEdit(activeRole) && <button onClick={() => { setEditing(h); setOpen(true); }} className="rounded-lg p-1.5 hover:bg-[#F5F3EE]"><Pencil className="h-4 w-4" /></button>}
                          {canManage(activeRole) && <button onClick={() => setDeleting(h)} className="rounded-lg p-1.5 text-[#7A2E20] hover:bg-[#FBEDE9]"><Trash2 className="h-4 w-4" /></button>}
                        </div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DataCard>
            <Pagination page={page} setPage={setPage} total={data.count} pageSize={PAGE_SIZE} />
          </>
        )}
      <HearingDialog open={open} onClose={() => setOpen(false)} editing={editing} orgId={activeOrgId!} userId={user?.id} />
      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={() => deleting && del.mutate(deleting.id)} loading={del.isPending} title="حذف الجلسة" message={`سيتم حذف "${deleting?.title}".`} />
    </DashboardShell>
  );
}

function HearingDialog({ open, onClose, editing, orgId, userId }: { open: boolean; onClose: () => void; editing: any; orgId: string; userId?: string }) {
  const qc = useQueryClient();
  const { activeOrgId } = useAuth();
  const [form, setForm] = useState<Partial<Form>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const key = editing?.id ?? "new";
  const [k, setK] = useState(key);

  const { data: cases } = useQuery({
    queryKey: ["cases-basic", activeOrgId],
    enabled: !!activeOrgId && open,
    queryFn: async () => (await supabase.from("cases").select("id, case_title, case_number").eq("organization_id", activeOrgId!).order("last_activity_at", { ascending: false })).data ?? [],
  });

  if (open && k !== key) {
    setK(key); setErrors({});
    setForm(editing ? { ...editing, hearing_date: editing.hearing_date?.slice(0, 16) } : { status: "scheduled" });
  }

  const save = async () => {
    const res = schema.safeParse({ ...form, status: form.status ?? "scheduled" });
    if (!res.success) {
      const errs: Record<string, string> = {};
      res.error.issues.forEach((i) => { errs[i.path[0] as string] = i.message; });
      setErrors(errs);
      toast.error("تحقق من الحقول المطلوبة", { description: Object.values(errs)[0] as string });
      return;
    }
    setSaving(true);
    const payload: any = { ...res.data, hearing_date: new Date(res.data.hearing_date).toISOString() };
    Object.keys(payload).forEach((k) => { if (payload[k] === "") payload[k] = null; });
    const q = editing
      ? supabase.from("hearings").update(payload).eq("id", editing.id)
      : supabase.from("hearings").insert({ ...payload, organization_id: orgId, created_by: userId });
    const { error } = await q;
    setSaving(false);
    if (error) return toast.error("تعذّر الحفظ", { description: error.message });
    toast.success(editing ? "تم التحديث" : "تم إنشاء الجلسة");
    qc.invalidateQueries({ queryKey: ["hearings"] });
    qc.invalidateQueries({ queryKey: ["case-hearings"] });
    qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={editing ? "تعديل جلسة" : "جلسة جديدة"} size="lg">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2"><FormField label="القضية *">
          <select value={form.case_id ?? ""} onChange={(e) => setForm({ ...form, case_id: e.target.value })} className={inputCls}>
            <option value="">— اختر —</option>
            {(cases ?? []).map((c: any) => <option key={c.id} value={c.id}>{c.case_title}{c.case_number ? ` (${c.case_number})` : ""}</option>)}
          </select>
          {errors.case_id && <span className="text-xs text-[#7A2E20]">{errors.case_id}</span>}
        </FormField></div>
        <div className="md:col-span-2"><FormField label="عنوان الجلسة *">
          <input value={form.title ?? ""} onChange={(e) => setForm({ ...form, title: e.target.value })} className={inputCls} />
          {errors.title && <span className="text-xs text-[#7A2E20]">{errors.title}</span>}
        </FormField></div>
        <FormField label="التاريخ والوقت *">
          <input type="datetime-local" value={form.hearing_date ?? ""} onChange={(e) => setForm({ ...form, hearing_date: e.target.value })} className={inputCls} />
          {errors.hearing_date && <span className="text-xs text-[#7A2E20]">{errors.hearing_date}</span>}
        </FormField>
        <FormField label="الحالة *">
          <select value={form.status ?? "scheduled"} onChange={(e) => setForm({ ...form, status: e.target.value as any })} className={inputCls}>
            {asOptions(HEARING_STATUS).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </FormField>
        <FormField label="المحكمة"><input value={form.court_name ?? ""} onChange={(e) => setForm({ ...form, court_name: e.target.value })} className={inputCls} /></FormField>
        <FormField label="الدائرة"><input value={form.judicial_circuit ?? ""} onChange={(e) => setForm({ ...form, judicial_circuit: e.target.value })} className={inputCls} /></FormField>
        <FormField label="نوع الجلسة"><input value={form.hearing_type ?? ""} onChange={(e) => setForm({ ...form, hearing_type: e.target.value })} className={inputCls} placeholder="مرافعة / نطق حكم / تصالح" /></FormField>
        <FormField label="المكان"><input value={form.location ?? ""} onChange={(e) => setForm({ ...form, location: e.target.value })} className={inputCls} /></FormField>
        <div className="md:col-span-2"><FormField label="رابط عن بُعد"><input value={form.remote_link ?? ""} onChange={(e) => setForm({ ...form, remote_link: e.target.value })} className={inputCls} placeholder="https://…" /></FormField></div>
        <div className="md:col-span-2"><FormField label="نتيجة الجلسة"><textarea rows={2} value={form.result ?? ""} onChange={(e) => setForm({ ...form, result: e.target.value })} className={inputCls} /></FormField></div>
        <div className="md:col-span-2"><FormField label="ملاحظات"><textarea rows={2} value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={inputCls} /></FormField></div>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Btn variant="outline" onClick={onClose} disabled={saving}>إلغاء</Btn>
        <Btn onClick={save} disabled={saving}>{saving ? "جاري…" : "حفظ"}</Btn>
      </div>
    </Modal>
  );
}
