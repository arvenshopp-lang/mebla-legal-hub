import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { DashboardShell } from "@/components/dashboard/shell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, canManage } from "@/hooks/use-auth";
import { FormField, inputCls, Btn, LoadingBlock } from "@/lib/list-utils";

export const Route = createFileRoute("/_authenticated/settings")({
  component: Page,
});

function Page() {
  const { activeOrgId, activeRole, user } = useAuth();
  const [tab, setTab] = useState<"profile" | "organization" | "notifications">("profile");

  return (
    <DashboardShell title="الإعدادات">
      <div className="mb-5 flex gap-2 border-b border-border">
        {[
          { k: "profile", l: "حسابي" },
          { k: "organization", l: "المكتب" },
          { k: "notifications", l: "التنبيهات" },
        ].map((t) => (
          <button key={t.k} onClick={() => setTab(t.k as any)}
            className={`px-4 py-2 text-sm font-medium ${tab === t.k ? "border-b-2 border-[#123C32] text-[#123C32]" : "text-muted-foreground"}`}>
            {t.l}
          </button>
        ))}
      </div>
      {tab === "profile" && <ProfileTab userId={user?.id} />}
      {tab === "organization" && <OrgTab orgId={activeOrgId} canManage={canManage(activeRole)} />}
      {tab === "notifications" && <NotifTab orgId={activeOrgId} userId={user?.id} />}
    </DashboardShell>
  );
}

function ProfileTab({ userId }: { userId?: string }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["profile", userId], enabled: !!userId,
    queryFn: async () => (await supabase.from("profiles").select("*").eq("id", userId!).maybeSingle()).data,
  });
  const [form, setForm] = useState<any>({});
  useEffect(() => { if (data) setForm(data); }, [data]);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from("profiles").update({
      full_name: form.full_name ?? "", phone: form.phone ?? null, job_title: form.job_title ?? null,
    }).eq("id", userId!);
    setSaving(false);
    if (error) return toast.error("تعذّر الحفظ", { description: error.message });
    toast.success("تم الحفظ");
    qc.invalidateQueries({ queryKey: ["profile"] });
  };

  if (isLoading) return <LoadingBlock />;
  return (
    <div className="max-w-2xl rounded-[var(--radius-l)] border border-border bg-surface p-6">
      <div className="grid gap-4 md:grid-cols-2">
        <FormField label="الاسم الكامل"><input value={form.full_name ?? ""} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className={inputCls} /></FormField>
        <FormField label="البريد"><input value={form.email ?? ""} disabled className={inputCls + " bg-[#F5F3EE]"} /></FormField>
        <FormField label="الجوال"><input value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inputCls} /></FormField>
        <FormField label="المسمى الوظيفي"><input value={form.job_title ?? ""} onChange={(e) => setForm({ ...form, job_title: e.target.value })} className={inputCls} /></FormField>
      </div>
      <div className="mt-5 flex justify-end"><Btn onClick={save} disabled={saving}>{saving ? "جاري…" : "حفظ"}</Btn></div>
    </div>
  );
}

function OrgTab({ orgId, canManage: canEdit }: { orgId: string | null; canManage: boolean }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["organization", orgId], enabled: !!orgId,
    queryFn: async () => (await supabase.from("organizations").select("*").eq("id", orgId!).maybeSingle()).data,
  });
  const [form, setForm] = useState<any>({});
  useEffect(() => { if (data) setForm(data); }, [data]);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from("organizations").update({
      name: form.name ?? "", legal_name: form.legal_name ?? null, commercial_registration: form.commercial_registration ?? null,
      tax_number: form.tax_number ?? null, phone: form.phone ?? null, email: form.email ?? null,
      city: form.city ?? null, address: form.address ?? null,
    }).eq("id", orgId!);
    setSaving(false);
    if (error) return toast.error("تعذّر الحفظ", { description: error.message });
    toast.success("تم الحفظ");
    qc.invalidateQueries({ queryKey: ["organization"] });
  };

  if (isLoading) return <LoadingBlock />;
  return (
    <div className="max-w-3xl rounded-[var(--radius-l)] border border-border bg-surface p-6">
      {!canEdit && <div className="mb-4 rounded-[var(--radius-m)] bg-[#F5F3EE] p-3 text-xs text-muted-foreground">التعديل متاح للمدراء فقط.</div>}
      <fieldset disabled={!canEdit} className="grid gap-4 md:grid-cols-2 disabled:opacity-70">
        <FormField label="اسم المكتب *"><input value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} /></FormField>
        <FormField label="الاسم القانوني"><input value={form.legal_name ?? ""} onChange={(e) => setForm({ ...form, legal_name: e.target.value })} className={inputCls} /></FormField>
        <FormField label="السجل التجاري"><input value={form.commercial_registration ?? ""} onChange={(e) => setForm({ ...form, commercial_registration: e.target.value })} className={inputCls} /></FormField>
        <FormField label="الرقم الضريبي"><input value={form.tax_number ?? ""} onChange={(e) => setForm({ ...form, tax_number: e.target.value })} className={inputCls} /></FormField>
        <FormField label="الجوال"><input value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inputCls} /></FormField>
        <FormField label="البريد"><input value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputCls} /></FormField>
        <FormField label="المدينة"><input value={form.city ?? ""} onChange={(e) => setForm({ ...form, city: e.target.value })} className={inputCls} /></FormField>
        <FormField label="العنوان"><input value={form.address ?? ""} onChange={(e) => setForm({ ...form, address: e.target.value })} className={inputCls} /></FormField>
      </fieldset>
      {canEdit && <div className="mt-5 flex justify-end"><Btn onClick={save} disabled={saving}>{saving ? "جاري…" : "حفظ"}</Btn></div>}
    </div>
  );
}

function NotifTab({ orgId, userId }: { orgId: string | null; userId?: string }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["notif-prefs", orgId, userId], enabled: !!orgId && !!userId,
    queryFn: async () => (await supabase.from("user_notification_preferences").select("*").eq("organization_id", orgId!).eq("user_id", userId!).maybeSingle()).data,
  });
  const [form, setForm] = useState<any>({});
  useEffect(() => {
    setForm(data ?? {
      hearing_7_days: true, hearing_3_days: true, hearing_1_day: true, hearing_same_day: true,
      deadline_7_days: true, deadline_3_days: true, deadline_1_day: true, deadline_same_day: true,
      task_overdue: true, inactive_cases: true, email_enabled: true, in_app_enabled: true,
    });
  }, [data]);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const payload = { ...form, organization_id: orgId, user_id: userId };
    const q = data
      ? supabase.from("user_notification_preferences").update(payload).eq("id", data.id)
      : supabase.from("user_notification_preferences").insert(payload);
    const { error } = await q;
    setSaving(false);
    if (error) return toast.error("تعذّر الحفظ", { description: error.message });
    toast.success("تم الحفظ");
    qc.invalidateQueries({ queryKey: ["notif-prefs"] });
  };

  if (isLoading) return <LoadingBlock />;
  const Tog = ({ k, l }: { k: string; l: string }) => (
    <label className="flex items-center justify-between rounded-[var(--radius-m)] border border-border bg-surface p-3">
      <span className="text-sm">{l}</span>
      <input type="checkbox" checked={!!form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.checked })} />
    </label>
  );
  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h3 className="mb-2 text-sm font-bold">قنوات التنبيه</h3>
        <div className="grid gap-2 md:grid-cols-2">
          <Tog k="email_enabled" l="عبر البريد الإلكتروني" />
          <Tog k="in_app_enabled" l="داخل التطبيق" />
        </div>
      </div>
      <div>
        <h3 className="mb-2 text-sm font-bold">تنبيهات الجلسات</h3>
        <div className="grid gap-2 md:grid-cols-2">
          <Tog k="hearing_7_days" l="قبل 7 أيام" />
          <Tog k="hearing_3_days" l="قبل 3 أيام" />
          <Tog k="hearing_1_day" l="قبل يوم" />
          <Tog k="hearing_same_day" l="نفس اليوم" />
        </div>
      </div>
      <div>
        <h3 className="mb-2 text-sm font-bold">تنبيهات المهل</h3>
        <div className="grid gap-2 md:grid-cols-2">
          <Tog k="deadline_7_days" l="قبل 7 أيام" />
          <Tog k="deadline_3_days" l="قبل 3 أيام" />
          <Tog k="deadline_1_day" l="قبل يوم" />
          <Tog k="deadline_same_day" l="نفس اليوم" />
        </div>
      </div>
      <div>
        <h3 className="mb-2 text-sm font-bold">تنبيهات أخرى</h3>
        <div className="grid gap-2 md:grid-cols-2">
          <Tog k="task_overdue" l="مهام متأخرة" />
          <Tog k="inactive_cases" l="قضايا خاملة" />
        </div>
      </div>
      <div className="flex justify-end"><Btn onClick={save} disabled={saving}>{saving ? "جاري…" : "حفظ"}</Btn></div>
    </div>
  );
}
