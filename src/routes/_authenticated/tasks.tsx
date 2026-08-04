import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { DashboardShell } from "@/components/dashboard/shell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, canEdit, canManage } from "@/hooks/use-auth";
import { TASK_STATUS, TASK_PRIORITY, asOptions, fmtDate, daysUntil } from "@/lib/enums";
import {
  PageToolbar, EmptyState, LoadingBlock, ErrorBlock, DataCard, Th, Td, BusyOverlay, IconBtn,
  Modal, FormField, inputCls, Btn, Badge, useDebounced, ConfirmDialog, Pagination,
} from "@/lib/list-utils";
import { Pencil, Trash2, Check } from "lucide-react";
import { useDialogDraft } from "@/lib/drafts/use-dialog-draft";
import { DraftPrompt, DraftStatus } from "@/lib/drafts/draft-ui";

export const Route = createFileRoute("/_authenticated/tasks")({
  component: Page,
  head: () => ({
    meta: [
      { title: "المهام | مِهلة" },
      { name: "description", content: "توزيع مهام الفريق ومتابعة أولوياتها وتواريخ استحقاقها داخل المكتب." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "المهام | مِهلة" },
      { property: "og:description", content: "توزيع مهام الفريق ومتابعة أولوياتها وتواريخ استحقاقها داخل المكتب." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const PAGE_SIZE = 20;

const schema = z.object({
  case_id: z.string().uuid().optional().nullable(),
  title: z.string().trim().min(2, "العنوان مطلوب").max(200),
  description: z.string().max(2000).optional().nullable(),
  assigned_to: z.string().uuid().optional().nullable(),
  due_date: z.string().optional().nullable(),
  status: z.enum(["pending","in_progress","completed","cancelled","overdue"]),
  priority: z.enum(["low","medium","high","urgent"]),
});
type Form = z.infer<typeof schema>;

function Page() {
  const { activeOrgId, activeRole, user } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [mine, setMine] = useState(false);
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<any | null>(null);
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState<any | null>(null);
  const q = useDebounced(search);

  const { data, isLoading, isFetching, error } = useQuery({
    placeholderData: keepPreviousData,
    queryKey: ["tasks", activeOrgId, q, status, mine, user?.id, page],
    enabled: !!activeOrgId,
    queryFn: async () => {
      let query = supabase.from("tasks")
        .select("*, case:cases(case_title), assignee:profiles!tasks_assigned_to_fkey(full_name)", { count: "exact" })
        .eq("organization_id", activeOrgId!)
        .order("due_date", { ascending: true, nullsFirst: false })
        .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
      if (q) query = query.ilike("title", `%${q}%`);
      if (status !== "all") query = query.eq("status", status as any);
      if (mine && user?.id) query = query.eq("assigned_to", user.id);
      const { data, error, count } = await query;
      if (error) throw error;
      return { rows: data ?? [], count: count ?? 0 };
    },
  });

  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("tasks").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { toast.success("تم الحذف"); qc.invalidateQueries({ queryKey: ["tasks"] }); qc.invalidateQueries({ queryKey: ["dashboard-stats"] }); setDeleting(null); },
    onError: (e: any) => toast.error("تعذّر الحذف", { description: e.message }),
  });
  const complete = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("tasks").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", id); if (error) throw error; },
    onSuccess: () => { toast.success("تم الإنجاز"); qc.invalidateQueries({ queryKey: ["tasks"] }); qc.invalidateQueries({ queryKey: ["dashboard-stats"] }); },
  });

  return (
    <DashboardShell title="المهام">
      <PageToolbar
        searching={isFetching && !isLoading}
        search={search} setSearch={(v) => { setSearch(v); setPage(1); }}
        canAdd={canEdit(activeRole)}
        onAdd={() => { setEditing(null); setOpen(true); }}
        addLabel="مهمة جديدة"
        filters={
          <>
            <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className={inputCls + " max-w-[140px]"}>
              <option value="all">كل الحالات</option>
              {asOptions(TASK_STATUS).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input type="checkbox" checked={mine} onChange={(e) => { setMine(e.target.checked); setPage(1); }} /> مهامي فقط
            </label>
          </>
        }
      />
      {isLoading ? <LoadingBlock /> : error ? <ErrorBlock message={(error as any).message} /> :
        !data?.rows.length ? (
          <EmptyState title="لا توجد مهام" action={canEdit(activeRole) && <Btn onClick={() => { setEditing(null); setOpen(true); }}>إضافة مهمة</Btn>} />
        ) : (
          <>
            <BusyOverlay busy={isFetching && !isLoading}>
            <DataCard>
              <table className="min-w-full">
                <thead className="bg-surface-muted/60">
                  <tr><Th>العنوان</Th><Th>القضية</Th><Th>المسؤول</Th><Th>الاستحقاق</Th><Th>الحالة</Th><Th>الأولوية</Th><Th>{" "}</Th></tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.rows.map((t: any) => {
                    const days = daysUntil(t.due_date);
                    const isOverdue = t.status !== "completed" && t.status !== "cancelled" && days !== null && days < 0;
                    return (
                      <tr key={t.id} className={`hover:bg-surface-muted/40 ${isOverdue ? "bg-danger-soft/40" : ""}`}>
                        <Td className="font-medium">{t.title}</Td>
                        <Td>{t.case?.case_title ?? "—"}</Td>
                        <Td>{t.assignee?.full_name ?? "—"}</Td>
                        <Td>{fmtDate(t.due_date)}</Td>
                        <Td><Badge tone={t.status === "completed" ? "green" : t.status === "overdue" ? "red" : t.status === "in_progress" ? "warn" : "muted"}>{TASK_STATUS[t.status]}</Badge></Td>
                        <Td><Badge tone={t.priority === "urgent" ? "red" : t.priority === "high" ? "warn" : "muted"}>{TASK_PRIORITY[t.priority]}</Badge></Td>
                        <Td>
                          <div className="flex justify-end gap-1">
                            {canEdit(activeRole) && t.status !== "completed" && (
                              <button onClick={() => complete.mutate(t.id)} className="rounded-lg p-1.5 hover:bg-primary-soft" title="إنجاز"><Check className="h-4 w-4" /></button>
                            )}
                            {canEdit(activeRole) && <button onClick={() => { setEditing(t); setOpen(true); }} className="rounded-lg p-1.5 hover:bg-surface-muted"><Pencil className="h-4 w-4" /></button>}
                            {canManage(activeRole) && <IconBtn tone="danger" aria-label="حذف" title="حذف" loading={del.isPending && deleting?.id === t.id} onClick={() => setDeleting(t)}><Trash2 className="h-4 w-4" /></IconBtn>}
                          </div>
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </DataCard>
            </BusyOverlay>
            <Pagination page={page} setPage={setPage} total={data.count} pageSize={PAGE_SIZE} />
          </>
        )}
      <TaskDialog open={open} onClose={() => setOpen(false)} editing={editing} orgId={activeOrgId!} userId={user?.id} />
      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={() => deleting && del.mutate(deleting.id)} loading={del.isPending} title="حذف المهمة" message={`سيتم حذف "${deleting?.title}".`} />
    </DashboardShell>
  );
}

function TaskDialog({ open, onClose, editing, orgId, userId }: { open: boolean; onClose: () => void; editing: any; orgId: string; userId?: string }) {
  const qc = useQueryClient();
  const { activeOrgId } = useAuth();
  const [form, setForm] = useState<Partial<Form>>({});
  const draft = useDialogDraft<Form>({
    name: "tasks",
    open,
    isNew: !editing,
    userKey: activeOrgId ?? "anon",
    form,
    setForm,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const key = editing?.id ?? "new";
  const [k, setK] = useState(key);

  const { data: cases, isLoading: loadingCases } = useQuery({
    queryKey: ["cases-basic", activeOrgId], enabled: !!activeOrgId && open,
    queryFn: async () => (await supabase.from("cases").select("id, case_title").eq("organization_id", activeOrgId!)).data ?? [],
  });
  const { data: members, isLoading: loadingMembers } = useQuery({
    queryKey: ["members-basic", activeOrgId], enabled: !!activeOrgId && open,
    queryFn: async () => {
      const { data } = await supabase.from("organization_members").select("user_id, profile:profiles(full_name)").eq("organization_id", activeOrgId!).eq("status", "active");
      return (data ?? []).map((m: any) => ({ id: m.user_id, name: m.profile?.full_name ?? "—" }));
    },
  });

  if (open && k !== key) {
    setK(key); setErrors({});
    setForm(editing ? { ...editing, due_date: editing.due_date?.slice(0, 16) ?? "" } : { status: "pending", priority: "medium" });
  }

  const save = async () => {
    const res = schema.safeParse({ ...form, status: form.status ?? "pending", priority: form.priority ?? "medium" });
    if (!res.success) {
      const errs: Record<string, string> = {};
      res.error.issues.forEach((i) => { errs[i.path[0] as string] = i.message; });
      setErrors(errs);
      toast.error("تحقق من الحقول المطلوبة", { description: Object.values(errs)[0] as string });
      return;
    }
    setSaving(true);
    const payload: any = { ...res.data, due_date: res.data.due_date ? new Date(res.data.due_date).toISOString() : null };
    Object.keys(payload).forEach((k) => { if (payload[k] === "") payload[k] = null; });
    const q = editing
      ? supabase.from("tasks").update(payload).eq("id", editing.id)
      : supabase.from("tasks").insert({ ...payload, organization_id: orgId, created_by: userId });
    const { error } = await q;
    setSaving(false);
    if (error) return toast.error("تعذّر الحفظ", { description: error.message });
    toast.success(editing ? "تم التحديث" : "تمت الإضافة");
    draft.clear();
    qc.invalidateQueries({ queryKey: ["tasks"] });
    qc.invalidateQueries({ queryKey: ["case-tasks"] });
    qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={editing ? "تعديل مهمة" : "مهمة جديدة"} size="lg" busy={loadingCases || loadingMembers} busyLabel="جاري تجهيز النموذج…">
      <DraftPrompt draft={draft as never} />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2"><FormField label="العنوان *">
          <input value={form.title ?? ""} onChange={(e) => setForm({ ...form, title: e.target.value })} className={inputCls} />
          {errors.title && <span className="text-xs text-danger">{errors.title}</span>}
        </FormField></div>
        <FormField label="القضية">
          <select value={form.case_id ?? ""} onChange={(e) => setForm({ ...form, case_id: e.target.value || null })} className={inputCls}>
            <option value="">— بدون —</option>
            {(cases ?? []).map((c: any) => <option key={c.id} value={c.id}>{c.case_title}</option>)}
          </select>
        </FormField>
        <FormField label="المسؤول">
          <select value={form.assigned_to ?? ""} onChange={(e) => setForm({ ...form, assigned_to: e.target.value || null })} className={inputCls}>
            <option value="">—</option>
            {(members ?? []).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </FormField>
        <FormField label="تاريخ الاستحقاق"><input type="datetime-local" value={form.due_date ?? ""} onChange={(e) => setForm({ ...form, due_date: e.target.value })} className={inputCls} /></FormField>
        <FormField label="الحالة *">
          <select value={form.status ?? "pending"} onChange={(e) => setForm({ ...form, status: e.target.value as any })} className={inputCls}>
            {asOptions(TASK_STATUS).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </FormField>
        <FormField label="الأولوية *">
          <select value={form.priority ?? "medium"} onChange={(e) => setForm({ ...form, priority: e.target.value as any })} className={inputCls}>
            {asOptions(TASK_PRIORITY).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </FormField>
        <div className="md:col-span-2"><FormField label="الوصف"><textarea rows={3} value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} className={inputCls} /></FormField></div>
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
        <div className="me-auto"><DraftStatus draft={draft as never} /></div>
        <Btn variant="outline" onClick={onClose} disabled={saving}>إلغاء</Btn>
        <Btn onClick={save} loading={saving}>{saving ? "جاري الحفظ…" : "حفظ"}</Btn>
      </div>
    </Modal>
  );
}
