import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
import { DashboardShell } from "@/components/dashboard/shell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, canEdit, canManage } from "@/hooks/use-auth";
import {
  CASE_STATUS, CASE_PRIORITY, CLIENT_ROLE, HEARING_STATUS, DEADLINE_STATUS,
  TASK_STATUS, fmtDate, fmtDateTime,
} from "@/lib/enums";
import {
  LoadingBlock, ErrorBlock, Btn, Badge, Modal, FormField, inputCls, ConfirmDialog,
} from "@/lib/list-utils";
import { CaseDialog } from "./cases.index";
import { DocumentRequestsSection } from "@/components/dashboard/document-requests";
import { ArrowRight, Copy, Eye, EyeOff, Pencil, Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/cases/$id")({
  component: Page,
});

function Page() {
  const { id } = Route.useParams();
  const { activeOrgId, activeRole } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [partyOpen, setPartyOpen] = useState(false);
  const [editingParty, setEditingParty] = useState<any | null>(null);
  const [deletingParty, setDeletingParty] = useState<any | null>(null);
  const [updateOpen, setUpdateOpen] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["case", id],
    enabled: !!activeOrgId,
    queryFn: async () => {
      const { data, error } = await supabase.from("cases")
        .select("*, client:clients(id, full_name, phone, email), lawyer:profiles!cases_assigned_lawyer_id_fkey(id, full_name)")
        .eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: members } = useQuery({
    queryKey: ["members-basic", activeOrgId],
    enabled: !!activeOrgId,
    queryFn: async () => {
      const { data } = await supabase.from("organization_members")
        .select("user_id, profile:profiles(id, full_name)").eq("organization_id", activeOrgId!).eq("status", "active");
      return (data ?? []).map((m: any) => ({ id: m.user_id, name: m.profile?.full_name ?? "—" }));
    },
  });

  const { data: parties } = useQuery({
    queryKey: ["case-parties", id],
    queryFn: async () => {
      const { data } = await supabase.from("case_parties").select("*").eq("case_id", id).order("created_at");
      return data ?? [];
    },
  });

  const { data: hearings } = useQuery({
    queryKey: ["case-hearings", id],
    queryFn: async () => (await supabase.from("hearings").select("*").eq("case_id", id).order("hearing_date", { ascending: false })).data ?? [],
  });
  const { data: deadlines } = useQuery({
    queryKey: ["case-deadlines", id],
    queryFn: async () => (await supabase.from("deadlines").select("*").eq("case_id", id).order("due_date")).data ?? [],
  });
  const { data: tasks } = useQuery({
    queryKey: ["case-tasks", id],
    queryFn: async () => (await supabase.from("tasks").select("*").eq("case_id", id).order("created_at", { ascending: false })).data ?? [],
  });
  const { data: docs } = useQuery({
    queryKey: ["case-docs", id],
    queryFn: async () => (await supabase.from("documents").select("*").eq("case_id", id).order("created_at", { ascending: false })).data ?? [],
  });
  const { data: updates } = useQuery({
    queryKey: ["case-updates", id],
    queryFn: async () => (await supabase.from("case_updates").select("*").eq("case_id", id).order("event_date", { ascending: false })).data ?? [],
  });

  const delParty = useMutation({
    mutationFn: async (pid: string) => {
      const { error } = await supabase.from("case_parties").delete().eq("id", pid);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("تم الحذف"); qc.invalidateQueries({ queryKey: ["case-parties", id] }); setDeletingParty(null); },
    onError: (e: any) => toast.error("تعذّر الحذف", { description: e.message }),
  });

  const toggleVisibility = useMutation({
    mutationFn: async (u: any) => {
      const { error } = await supabase.from("case_updates")
        .update({ is_client_visible: !u.is_client_visible }).eq("id", u.id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["case-updates", id] }); toast.success("تم التحديث"); },
    onError: (e: any) => toast.error("تعذّر التحديث", { description: e.message }),
  });

  if (isLoading) return <DashboardShell title="القضية"><LoadingBlock /></DashboardShell>;
  if (error) return <DashboardShell title="القضية"><ErrorBlock message={(error as any).message} /></DashboardShell>;
  if (!data) return <DashboardShell title="القضية"><div className="rounded-[var(--radius-l)] bg-surface p-10 text-center">القضية غير موجودة</div></DashboardShell>;

  return (
    <DashboardShell title={data.case_title}>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link to="/cases" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-[#123C32]"><ArrowRight className="h-4 w-4" /> عودة للقضايا</Link>
        <div className="flex-1" />
        {canEdit(activeRole) && <Btn onClick={() => setEditOpen(true)} variant="outline"><Pencil className="ms-1 inline h-4 w-4" /> تعديل</Btn>}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-[var(--radius-l)] border border-border bg-surface p-5 lg:col-span-2">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Badge>{CASE_STATUS[data.status] ?? data.status}</Badge>
            <Badge tone={data.priority === "urgent" ? "red" : data.priority === "high" ? "warn" : "muted"}>{CASE_PRIORITY[data.priority] ?? data.priority}</Badge>
            {data.case_number && <span className="text-xs text-muted-foreground">رقم: {data.case_number}</span>}
            {data.public_code && (
              <button
                onClick={() => { navigator.clipboard?.writeText(data.public_code!); toast.success("تم نسخ رمز القضية"); }}
                className="inline-flex items-center gap-1 rounded-full bg-warning-soft px-2.5 py-1 text-[11px] font-medium text-warning hover:bg-[#f0dfb8]"
                title="رمز متابعة القضية للعميل"
              >
                <Copy className="h-3 w-3" /> رمز المتابعة: {data.public_code}
              </button>
            )}
          </div>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <Info label="نوع القضية" value={data.case_type} />
            <Info label="العميل" value={data.client?.full_name} />
            <Info label="صفة العميل" value={data.client_role ? CLIENT_ROLE[data.client_role] : null} />
            <Info label="الخصم" value={data.opponent_name} />
            <Info label="المحكمة" value={data.court_name} />
            <Info label="الفرع" value={data.court_branch} />
            <Info label="الدائرة" value={data.judicial_circuit} />
            <Info label="القاضي" value={data.judge_name} />
            <Info label="المحامي المسؤول" value={data.lawyer?.full_name} />
            <Info label="تاريخ الفتح" value={fmtDate(data.opened_at)} />
          </dl>
          {data.description && <div className="mt-4 border-t border-border pt-3 text-sm"><div className="mb-1 text-xs font-semibold text-muted-foreground">الوصف</div>{data.description}</div>}
          {data.internal_notes && <div className="mt-3 border-t border-border pt-3 text-sm"><div className="mb-1 text-xs font-semibold text-muted-foreground">ملاحظات داخلية</div>{data.internal_notes}</div>}
        </section>

        <section className="rounded-[var(--radius-l)] border border-border bg-surface p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-bold">الخصوم والأطراف</h3>
            {canEdit(activeRole) && <button onClick={() => { setEditingParty(null); setPartyOpen(true); }} className="rounded-lg p-1.5 hover:bg-[#F5F3EE]"><Plus className="h-4 w-4" /></button>}
          </div>
          {(parties ?? []).length === 0 ? (
            <p className="text-center text-xs text-text-muted py-4">لا يوجد أطراف</p>
          ) : (
            <ul className="space-y-2">
              {parties!.map((p: any) => (
                <li key={p.id} className="rounded-[var(--radius-m)] bg-[#F5F3EE]/60 p-3 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium">{p.party_name}</div>
                      <div className="text-xs text-muted-foreground">{[p.party_type, p.legal_role].filter(Boolean).join(" · ") || "—"}</div>
                      {p.phone && <div className="text-xs mt-1">📞 {p.phone}</div>}
                    </div>
                    {canEdit(activeRole) && (
                      <div className="flex gap-1">
                        <button onClick={() => { setEditingParty(p); setPartyOpen(true); }} className="rounded p-1 hover:bg-surface"><Pencil className="h-3.5 w-3.5" /></button>
                        <button onClick={() => setDeletingParty(p)} className="rounded p-1 text-danger hover:bg-surface"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <RelatedList title="الجلسات" empty="لا توجد جلسات">
          {(hearings ?? []).map((h: any) => (
            <div key={h.id} className="flex items-center justify-between py-2 text-sm">
              <div className="min-w-0"><div className="font-medium truncate">{h.title}</div><div className="text-xs text-muted-foreground">{fmtDateTime(h.hearing_date)} · {h.court_name ?? "—"}</div></div>
              <Badge tone={h.status === "completed" ? "green" : h.status === "missed" ? "red" : "muted"}>{HEARING_STATUS[h.status] ?? h.status}</Badge>
            </div>
          ))}
        </RelatedList>
        <RelatedList title="المهل" empty="لا توجد مهل">
          {(deadlines ?? []).map((d: any) => (
            <div key={d.id} className="flex items-center justify-between py-2 text-sm">
              <div className="min-w-0"><div className="font-medium truncate">{d.title}</div><div className="text-xs text-muted-foreground">{fmtDate(d.due_date)}</div></div>
              <Badge tone={d.status === "overdue" ? "red" : d.status === "completed" ? "green" : "muted"}>{DEADLINE_STATUS[d.status] ?? d.status}</Badge>
            </div>
          ))}
        </RelatedList>
        <RelatedList title="المهام" empty="لا توجد مهام">
          {(tasks ?? []).map((t: any) => (
            <div key={t.id} className="flex items-center justify-between py-2 text-sm">
              <div className="min-w-0"><div className="font-medium truncate">{t.title}</div><div className="text-xs text-muted-foreground">{t.due_date ? fmtDate(t.due_date) : "—"}</div></div>
              <Badge>{TASK_STATUS[t.status] ?? t.status}</Badge>
            </div>
          ))}
        </RelatedList>
        <RelatedList title="المستندات" empty="لا توجد مستندات">
          {(docs ?? []).map((d: any) => (
            <div key={d.id} className="flex items-center justify-between py-2 text-sm">
              <div className="min-w-0"><div className="font-medium truncate">{d.file_name}</div><div className="text-xs text-muted-foreground">{d.document_category ?? "—"}</div></div>
              <span className="text-xs text-muted-foreground">{fmtDate(d.created_at)}</span>
            </div>
          ))}
        </RelatedList>
      </div>

      <section className="mt-4 rounded-[var(--radius-l)] border border-border bg-surface p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold">الخط الزمني</h3>
          {canEdit(activeRole) && <Btn size="sm" variant="outline" onClick={() => setUpdateOpen(true)}><Plus className="ms-1 inline h-4 w-4" /> إضافة تحديث</Btn>}
        </div>
        {(updates ?? []).length === 0 ? (
          <p className="py-4 text-center text-xs text-text-muted">لا يوجد تحديثات</p>
        ) : (
          <ol className="relative border-r border-border pr-4 space-y-4">
            {updates!.map((u: any) => (
              <li key={u.id} className="relative">
                <span className="absolute -right-[22px] top-1.5 h-3 w-3 rounded-full bg-gold" />
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{u.title}</span>
                  {u.is_client_visible
                    ? <Badge tone="green">مرئي للعميل</Badge>
                    : <Badge tone="muted">داخلي فقط</Badge>}
                </div>
                {u.description && <div className="text-xs text-muted-foreground">{u.description}</div>}
                <div className="mt-0.5 flex flex-wrap items-center gap-3">
                  <span className="text-[11px] text-text-muted">{fmtDateTime(u.event_date)}</span>
                  {canEdit(activeRole) && (
                    <button
                      onClick={() => toggleVisibility.mutate(u)}
                      className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-[#123C32]"
                    >
                      {u.is_client_visible ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                      {u.is_client_visible ? "إخفاء عن العميل" : "إظهار للعميل"}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <DocumentRequestsSection caseId={id} />

      <UpdateDialog open={updateOpen} onClose={() => setUpdateOpen(false)} caseId={id} orgId={activeOrgId!} />
      <CaseDialog open={editOpen} onClose={() => { setEditOpen(false); qc.invalidateQueries({ queryKey: ["case", id] }); }} editing={data as any} members={members ?? []} />
      <PartyDialog open={partyOpen} onClose={() => setPartyOpen(false)} editing={editingParty} caseId={id} orgId={activeOrgId!} />
      <ConfirmDialog
        open={!!deletingParty}
        onClose={() => setDeletingParty(null)}
        onConfirm={() => deletingParty && delParty.mutate(deletingParty.id)}
        loading={delParty.isPending}
        title="حذف الطرف"
        message={`سيتم حذف "${deletingParty?.party_name}".`}
      />
    </DashboardShell>
  );
}

function Info({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value || "—"}</dd>
    </div>
  );
}

function RelatedList({ title, empty, children }: { title: string; empty: string; children: React.ReactNode }) {
  const arr = Array.isArray(children) ? children : [children];
  const has = arr.filter(Boolean).length > 0;
  return (
    <section className="rounded-[var(--radius-l)] border border-border bg-surface p-5">
      <h3 className="mb-3 text-sm font-bold">{title}</h3>
      {has ? <div className="divide-y divide-border">{children}</div> : <p className="py-4 text-center text-xs text-text-muted">{empty}</p>}
    </section>
  );
}

const partySchema = z.object({
  party_name: z.string().trim().min(2).max(200),
  party_type: z.string().max(80).optional().nullable(),
  legal_role: z.string().max(80).optional().nullable(),
  national_id: z.string().max(30).optional().nullable(),
  commercial_registration: z.string().max(30).optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
  email: z.string().email().optional().or(z.literal("")).nullable(),
  representative_name: z.string().max(150).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});

function PartyDialog({ open, onClose, editing, caseId, orgId }: { open: boolean; onClose: () => void; editing: any; caseId: string; orgId: string }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<any>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const key = editing?.id ?? "new";
  const [k, setK] = useState(key);
  if (open && k !== key) { setK(key); setErrors({}); setForm(editing ? { ...editing } : {}); }

  const save = async () => {
    const res = partySchema.safeParse(form);
    if (!res.success) {
      const errs: Record<string, string> = {};
      res.error.issues.forEach((i) => { errs[i.path[0] as string] = i.message; });
      setErrors(errs);
      toast.error("تحقق من الحقول المطلوبة", { description: Object.values(errs)[0] as string });
      return;
    }
    setSaving(true);
    const payload: any = { ...res.data };
    Object.keys(payload).forEach((k) => { if (payload[k] === "") payload[k] = null; });
    const q = editing
      ? supabase.from("case_parties").update(payload).eq("id", editing.id)
      : supabase.from("case_parties").insert({ ...payload, organization_id: orgId, case_id: caseId });
    const { error } = await q;
    setSaving(false);
    if (error) return toast.error("تعذّر الحفظ", { description: error.message });
    toast.success(editing ? "تم التحديث" : "تمت الإضافة");
    qc.invalidateQueries({ queryKey: ["case-parties", caseId] });
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={editing ? "تعديل طرف" : "إضافة طرف"}>
      <div className="grid gap-4 md:grid-cols-2">
        <FormField label="الاسم *">
          <input value={form.party_name ?? ""} onChange={(e) => setForm({ ...form, party_name: e.target.value })} className={inputCls} />
          {errors.party_name && <span className="text-xs text-danger">{errors.party_name}</span>}
        </FormField>
        <FormField label="النوع"><input value={form.party_type ?? ""} onChange={(e) => setForm({ ...form, party_type: e.target.value })} className={inputCls} placeholder="فرد / شركة" /></FormField>
        <FormField label="الصفة القانونية"><input value={form.legal_role ?? ""} onChange={(e) => setForm({ ...form, legal_role: e.target.value })} className={inputCls} placeholder="مدّعى عليه / شاهد…" /></FormField>
        <FormField label="رقم الهوية"><input value={form.national_id ?? ""} onChange={(e) => setForm({ ...form, national_id: e.target.value })} className={inputCls} /></FormField>
        <FormField label="السجل التجاري"><input value={form.commercial_registration ?? ""} onChange={(e) => setForm({ ...form, commercial_registration: e.target.value })} className={inputCls} /></FormField>
        <FormField label="الجوال"><input value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inputCls} /></FormField>
        <FormField label="البريد"><input value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputCls} />{errors.email && <span className="text-xs text-danger">{errors.email}</span>}</FormField>
        <FormField label="اسم الممثل"><input value={form.representative_name ?? ""} onChange={(e) => setForm({ ...form, representative_name: e.target.value })} className={inputCls} /></FormField>
        <div className="md:col-span-2"><FormField label="ملاحظات"><textarea rows={2} value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={inputCls} /></FormField></div>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Btn variant="outline" onClick={onClose} disabled={saving}>إلغاء</Btn>
        <Btn onClick={save} disabled={saving}>{saving ? "جاري…" : "حفظ"}</Btn>
      </div>
    </Modal>
  );
}
const UPDATE_TYPES: Array<[string, string]> = [
  ["note", "ملاحظة"], ["hearing", "جلسة"], ["memorandum", "مذكرة"], ["document", "مستند"],
  ["call", "اتصال"], ["meeting", "اجتماع"], ["court_update", "تحديث من المحكمة"],
  ["judgment", "حكم"], ["status_change", "تغيير الحالة"],
];

function UpdateDialog({ open, onClose, caseId, orgId }: { open: boolean; onClose: () => void; caseId: string; orgId: string }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState("note");
  const [visible, setVisible] = useState(false);
  const [saving, setSaving] = useState(false);

  const reset = () => { setTitle(""); setDescription(""); setType("note"); setVisible(false); };

  const save = async () => {
    if (title.trim().length < 2) return toast.error("أدخل عنوان التحديث");
    setSaving(true);
    const { error } = await supabase.from("case_updates").insert({
      organization_id: orgId,
      case_id: caseId,
      update_type: type as any,
      title: title.trim(),
      description: description.trim() || null,
      event_date: new Date().toISOString(),
      is_client_visible: visible,
      created_by: user?.id ?? null,
    });
    setSaving(false);
    if (error) return toast.error("تعذّر الحفظ", { description: error.message });
    toast.success("تمت الإضافة");
    qc.invalidateQueries({ queryKey: ["case-updates", caseId] });
    reset(); onClose();
  };

  return (
    <Modal open={open} onClose={() => { reset(); onClose(); }} title="إضافة تحديث">
      <div className="grid gap-4">
        <FormField label="العنوان *">
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} />
        </FormField>
        <FormField label="النوع">
          <select value={type} onChange={(e) => setType(e.target.value)} className={inputCls}>
            {UPDATE_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </FormField>
        <FormField label="التفاصيل">
          <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} className={inputCls} />
        </FormField>
        <label className="flex items-center gap-2 rounded-[var(--radius-m)] bg-[#F5F3EE] p-3 text-sm">
          <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} />
          <span>إظهار هذا التحديث للعميل في بوابة المتابعة</span>
        </label>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Btn variant="outline" onClick={() => { reset(); onClose(); }} disabled={saving}>إلغاء</Btn>
        <Btn onClick={save} disabled={saving}>{saving ? "جاري…" : "حفظ"}</Btn>
      </div>
    </Modal>
  );
}
