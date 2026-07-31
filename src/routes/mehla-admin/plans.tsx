import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { AdminShell } from "@/components/admin/shell";
import { supabase } from "@/integrations/supabase/client";
import {
  Badge,
  Btn,
  ConfirmDialog,
  EmptyState,
  FormField,
  IconBtn,
  LoadingBlock,
  Modal,
  SectionCard,
  inputCls,
} from "@/lib/list-utils";

export const Route = createFileRoute("/mehla-admin/plans")({
  head: () => ({ meta: [{ title: "الباقات · إدارة مِهلة" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: PlansPage,
});

type PlanForm = {
  id?: string;
  code: string;
  name_ar: string;
  description: string;
  price_monthly: string;
  price_yearly: string;
  max_users: string;
  max_cases: string;
  max_documents: string;
  max_branches: string;
  storage_gb: string;
  ai_enabled: boolean;
  is_active: boolean;
  is_public: boolean;
  features: string;
};

const EMPTY_FORM: PlanForm = {
  code: "",
  name_ar: "",
  description: "",
  price_monthly: "0",
  price_yearly: "0",
  max_users: "",
  max_cases: "",
  max_documents: "",
  max_branches: "",
  storage_gb: "",
  ai_enabled: false,
  is_active: true,
  is_public: true,
  features: "",
};

const num = (v: string) => (v.trim() === "" ? null : Number(v));

function PlansPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState<PlanForm | null>(null);
  const [deleting, setDeleting] = useState<{ id: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: plans, isLoading } = useQuery({
    queryKey: ["admin-plans"],
    queryFn: async () => {
      const { data, error: e } = await supabase.from("platform_plans").select("*").order("sort_order");
      if (e) throw e;
      return data ?? [];
    },
  });

  const save = useMutation({
    mutationFn: async (f: PlanForm) => {
      const payload = {
        code: f.code.trim(),
        name_ar: f.name_ar.trim(),
        description: f.description.trim() || null,
        price_monthly: Number(f.price_monthly || 0),
        price_yearly: Number(f.price_yearly || 0),
        max_users: num(f.max_users),
        max_cases: num(f.max_cases),
        max_documents: num(f.max_documents),
        max_branches: num(f.max_branches),
        storage_gb: num(f.storage_gb),
        ai_enabled: f.ai_enabled,
        is_active: f.is_active,
        is_public: f.is_public,
        features: f.features
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
      };
      const res = f.id
        ? await supabase.from("platform_plans").update(payload).eq("id", f.id)
        : await supabase.from("platform_plans").insert(payload);
      if (res.error) throw res.error;
    },
    onSuccess: () => {
      toast.success("تم حفظ الباقة");
      qc.invalidateQueries({ queryKey: ["admin-plans"] });
      setForm(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error: e } = await supabase.from("platform_plans").delete().eq("id", id);
      if (e) throw e;
    },
    onSuccess: () => {
      toast.success("تم حذف الباقة");
      qc.invalidateQueries({ queryKey: ["admin-plans"] });
      setDeleting(null);
    },
    onError: (e: Error) => toast.error("تعذّر الحذف", { description: e.message }),
  });

  return (
    <AdminShell
      title="الباقات"
      description="أسعار وحدود الباقات المعروضة على الموقع والمستخدمة في التفعيل."
      actions={
        <Btn onClick={() => { setError(null); setForm(EMPTY_FORM); }}>
          <Plus className="h-4 w-4" aria-hidden /> باقة جديدة
        </Btn>
      }
    >
      {isLoading ? (
        <LoadingBlock rows={3} cols={3} />
      ) : (plans ?? []).length === 0 ? (
        <EmptyState title="لا توجد باقات" hint="أضف أول باقة لعرضها في صفحة الأسعار." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {plans!.map((p) => (
            <SectionCard
              key={p.id}
              title={p.name_ar}
              description={p.description ?? undefined}
              actions={
                <div className="flex gap-1">
                  <IconBtn
                    title="تعديل"
                    aria-label="تعديل الباقة"
                    onClick={() => {
                      setError(null);
                      setForm({
                        id: p.id,
                        code: p.code,
                        name_ar: p.name_ar,
                        description: p.description ?? "",
                        price_monthly: String(p.price_monthly),
                        price_yearly: String(p.price_yearly),
                        max_users: p.max_users?.toString() ?? "",
                        max_cases: p.max_cases?.toString() ?? "",
                        max_documents: p.max_documents?.toString() ?? "",
                        max_branches: p.max_branches?.toString() ?? "",
                        storage_gb: p.storage_gb?.toString() ?? "",
                        ai_enabled: p.ai_enabled,
                        is_active: p.is_active,
                        is_public: p.is_public,
                        features: Array.isArray(p.features) ? (p.features as string[]).join("\n") : "",
                      });
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </IconBtn>
                  <IconBtn
                    tone="danger"
                    title="حذف"
                    aria-label="حذف الباقة"
                    onClick={() => setDeleting({ id: p.id, name: p.name_ar })}
                  >
                    <Trash2 className="h-4 w-4" />
                  </IconBtn>
                </div>
              }
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={p.is_active ? "green" : "muted"}>{p.is_active ? "مفعّلة" : "معطّلة"}</Badge>
                {p.is_public && <Badge tone="info">معروضة للعامة</Badge>}
                {p.ai_enabled && <Badge tone="gold">ذكاء اصطناعي</Badge>}
              </div>
              <p className="mt-3 text-[20px] font-bold tabular-nums">
                {Number(p.price_monthly).toLocaleString("ar-SA")}{" "}
                <span className="text-[12px] font-normal text-muted-foreground">ريال / شهر</span>
              </p>
              <p className="text-[12px] text-muted-foreground">
                سنوياً: {Number(p.price_yearly).toLocaleString("ar-SA")} ريال
              </p>
              <ul className="mt-3 space-y-1 text-[12px] text-muted-foreground">
                <li>المستخدمون: {p.max_users ?? "بلا حد"}</li>
                <li>القضايا: {p.max_cases ?? "بلا حد"}</li>
                <li>المستندات: {p.max_documents ?? "بلا حد"}</li>
                <li>الفروع: {p.max_branches ?? "بلا حد"}</li>
                <li>التخزين: {p.storage_gb ? `${p.storage_gb} جيجابايت` : "بلا حد"}</li>
              </ul>
            </SectionCard>
          ))}
        </div>
      )}

      <Modal
        open={!!form}
        onClose={() => setForm(null)}
        size="lg"
        title={form?.id ? "تعديل الباقة" : "باقة جديدة"}
      >
        {form && (
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="الرمز البرمجي" required hint="حروف إنجليزية صغيرة بدون مسافات.">
              <input
                dir="ltr"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                className={`${inputCls} text-left`}
              />
            </FormField>
            <FormField label="اسم الباقة" required>
              <input value={form.name_ar} onChange={(e) => setForm({ ...form, name_ar: e.target.value })} className={inputCls} />
            </FormField>
            <div className="sm:col-span-2">
              <FormField label="الوصف">
                <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={inputCls} />
              </FormField>
            </div>
            <FormField label="السعر الشهري" required>
              <input type="number" min={0} value={form.price_monthly} onChange={(e) => setForm({ ...form, price_monthly: e.target.value })} className={inputCls} />
            </FormField>
            <FormField label="السعر السنوي" required>
              <input type="number" min={0} value={form.price_yearly} onChange={(e) => setForm({ ...form, price_yearly: e.target.value })} className={inputCls} />
            </FormField>
            <FormField label="عدد المستخدمين" hint="اتركه فارغاً لبلا حد">
              <input type="number" min={0} value={form.max_users} onChange={(e) => setForm({ ...form, max_users: e.target.value })} className={inputCls} />
            </FormField>
            <FormField label="عدد القضايا" hint="اتركه فارغاً لبلا حد">
              <input type="number" min={0} value={form.max_cases} onChange={(e) => setForm({ ...form, max_cases: e.target.value })} className={inputCls} />
            </FormField>
            <FormField label="عدد المستندات" hint="اتركه فارغاً لبلا حد">
              <input type="number" min={0} value={form.max_documents} onChange={(e) => setForm({ ...form, max_documents: e.target.value })} className={inputCls} />
            </FormField>
            <FormField label="عدد الفروع" hint="اتركه فارغاً لبلا حد">
              <input type="number" min={0} value={form.max_branches} onChange={(e) => setForm({ ...form, max_branches: e.target.value })} className={inputCls} />
            </FormField>
            <FormField label="التخزين (جيجابايت)" hint="اتركه فارغاً لبلا حد">
              <input type="number" min={0} value={form.storage_gb} onChange={(e) => setForm({ ...form, storage_gb: e.target.value })} className={inputCls} />
            </FormField>
            <div className="sm:col-span-2">
              <FormField label="المميزات" hint="ميزة واحدة في كل سطر.">
                <textarea
                  rows={4}
                  value={form.features}
                  onChange={(e) => setForm({ ...form, features: e.target.value })}
                  className={inputCls}
                />
              </FormField>
            </div>
            <div className="flex flex-wrap gap-4 sm:col-span-2">
              {(
                [
                  ["ai_enabled", "تفعيل الذكاء الاصطناعي"],
                  ["is_active", "الباقة مفعّلة"],
                  ["is_public", "عرضها في صفحة الأسعار"],
                ] as [keyof PlanForm, string][]
              ).map(([key, label]) => (
                <label key={String(key)} className="flex items-center gap-2 text-[13px]">
                  <input
                    type="checkbox"
                    checked={Boolean(form[key])}
                    onChange={(e) => setForm({ ...form, [key]: e.target.checked })}
                    className="h-4 w-4 rounded border-border"
                  />
                  {label}
                </label>
              ))}
            </div>

            {error && (
              <p role="alert" className="rounded-[var(--radius-m)] bg-danger-soft px-3 py-2.5 text-[12px] text-danger sm:col-span-2">
                {error}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-2 sm:col-span-2">
              <Btn variant="ghost" onClick={() => setForm(null)}>
                إلغاء
              </Btn>
              <Btn
                loading={save.isPending}
                onClick={() => {
                  setError(null);
                  if (!form.code.trim() || !form.name_ar.trim()) return setError("الرمز والاسم مطلوبان.");
                  save.mutate(form);
                }}
              >
                حفظ الباقة
              </Btn>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        loading={remove.isPending}
        title="حذف الباقة"
        message={`سيتم حذف «${deleting?.name ?? ""}». الاشتراكات القائمة لن تتأثر.`}
      />
    </AdminShell>
  );
}