import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin/shell";
import { Btn, FormField, LoadingBlock, SectionCard, inputCls } from "@/lib/list-utils";
import { usePlatformAdmin } from "@/hooks/use-platform-admin";
import { getPlatformSettings, savePlatformSettings } from "@/lib/admin-ops.functions";

export const Route = createFileRoute("/mehla-admin/settings")({
  head: () => ({
    meta: [{ title: "إعدادات المنصة · إدارة مِهلة" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: SettingsPage,
});

type GeneralSettings = {
  platform_name: string;
  legal_name: string;
  commercial_registration: string;
  tax_number: string;
  support_email: string;
  support_phone: string;
  whatsapp: string;
  address: string;
  working_hours: string;
  terms_url: string;
  privacy_url: string;
  maintenance_mode: boolean;
  maintenance_note: string;
};

const EMPTY: GeneralSettings = {
  platform_name: "",
  legal_name: "",
  commercial_registration: "",
  tax_number: "",
  support_email: "",
  support_phone: "",
  whatsapp: "",
  address: "",
  working_hours: "",
  terms_url: "",
  privacy_url: "",
  maintenance_mode: false,
  maintenance_note: "",
};

function SettingsPage() {
  const qc = useQueryClient();
  const { can } = usePlatformAdmin();
  const canManage = can("settings.manage");

  const settingsFn = useServerFn(getPlatformSettings);
  const settings = useQuery({ queryKey: ["admin-settings"], queryFn: () => settingsFn({ data: undefined }) });

  const [form, setForm] = useState<GeneralSettings>(EMPTY);
  useEffect(() => {
    const s = settings.data?.settings?.general as Partial<GeneralSettings> | undefined;
    if (s) setForm({ ...EMPTY, ...s, maintenance_mode: Boolean(s.maintenance_mode) });
  }, [settings.data]);

  const saveFn = useServerFn(savePlatformSettings);
  const save = useMutation({
    mutationFn: () => saveFn({ data: { group: "general", values: { general: form } } }),
    onSuccess: () => {
      toast.success("تم حفظ إعدادات المنصة.");
      qc.invalidateQueries({ queryKey: ["admin-settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const set = <K extends keyof GeneralSettings>(key: K, value: GeneralSettings[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  if (settings.isLoading) {
    return (
      <AdminShell title="إعدادات المنصة" description="الهوية الرسمية وبيانات التواصل والروابط النظامية.">
        <LoadingBlock rows={6} cols={2} />
      </AdminShell>
    );
  }

  return (
    <AdminShell
      title="إعدادات المنصة"
      description="الهوية الرسمية وبيانات التواصل والروابط النظامية التي تظهر للمستخدمين."
    >
      <form
        className="space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <SectionCard title="الهوية الرسمية" description="تُستخدم في الفواتير والمراسلات والصفحات النظامية.">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="اسم المنصة">
              <input
                className={inputCls}
                value={form.platform_name}
                onChange={(e) => set("platform_name", e.target.value)}
                placeholder="مِهلة"
                disabled={!canManage}
              />
            </FormField>
            <FormField label="الاسم النظامي للشركة">
              <input
                className={inputCls}
                value={form.legal_name}
                onChange={(e) => set("legal_name", e.target.value)}
                placeholder="شركة مِهلة لتقنية المعلومات"
                disabled={!canManage}
              />
            </FormField>
            <FormField label="السجل التجاري">
              <input
                className={inputCls}
                value={form.commercial_registration}
                onChange={(e) => set("commercial_registration", e.target.value)}
                inputMode="numeric"
                dir="ltr"
                disabled={!canManage}
              />
            </FormField>
            <FormField label="الرقم الضريبي">
              <input
                className={inputCls}
                value={form.tax_number}
                onChange={(e) => set("tax_number", e.target.value)}
                inputMode="numeric"
                dir="ltr"
                disabled={!canManage}
              />
            </FormField>
          </div>
        </SectionCard>

        <SectionCard title="بيانات التواصل" description="القنوات الرسمية التي يراها العملاء في صفحات الدعم.">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="بريد الدعم">
              <input
                type="email"
                className={inputCls}
                value={form.support_email}
                onChange={(e) => set("support_email", e.target.value)}
                placeholder="support@mehlalex.com"
                dir="ltr"
                disabled={!canManage}
              />
            </FormField>
            <FormField label="هاتف الدعم">
              <input
                className={inputCls}
                value={form.support_phone}
                onChange={(e) => set("support_phone", e.target.value)}
                placeholder="+966500000000"
                dir="ltr"
                disabled={!canManage}
              />
            </FormField>
            <FormField label="رقم واتساب">
              <input
                className={inputCls}
                value={form.whatsapp}
                onChange={(e) => set("whatsapp", e.target.value)}
                placeholder="+966500000000"
                dir="ltr"
                disabled={!canManage}
              />
            </FormField>
            <FormField label="ساعات العمل">
              <input
                className={inputCls}
                value={form.working_hours}
                onChange={(e) => set("working_hours", e.target.value)}
                placeholder="الأحد – الخميس، ٩ص – ٥م"
                disabled={!canManage}
              />
            </FormField>
            <div className="sm:col-span-2">
              <FormField label="العنوان">
                <input
                  className={inputCls}
                  value={form.address}
                  onChange={(e) => set("address", e.target.value)}
                  placeholder="الرياض، المملكة العربية السعودية"
                  disabled={!canManage}
                />
              </FormField>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="الروابط النظامية" description="روابط الشروط وسياسة الخصوصية المعروضة في الموقع.">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="رابط الشروط والأحكام">
              <input
                className={inputCls}
                value={form.terms_url}
                onChange={(e) => set("terms_url", e.target.value)}
                placeholder="https://mehlalex.com/terms"
                dir="ltr"
                disabled={!canManage}
              />
            </FormField>
            <FormField label="رابط سياسة الخصوصية">
              <input
                className={inputCls}
                value={form.privacy_url}
                onChange={(e) => set("privacy_url", e.target.value)}
                placeholder="https://mehlalex.com/privacy"
                dir="ltr"
                disabled={!canManage}
              />
            </FormField>
          </div>
        </SectionCard>

        <SectionCard title="وضع الصيانة" description="يُستخدم أثناء التحديثات الكبرى لإبلاغ المستخدمين مسبقاً.">
          <label className="flex items-center gap-2 text-body-sm">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-border"
              checked={form.maintenance_mode}
              onChange={(e) => set("maintenance_mode", e.target.checked)}
              disabled={!canManage}
            />
            تفعيل تنبيه الصيانة داخل المنصة
          </label>
          <div className="mt-4">
            <FormField label="نص التنبيه" hint="يظهر للمستخدمين عند تفعيل وضع الصيانة.">
              <textarea
                className={`${inputCls} min-h-24`}
                value={form.maintenance_note}
                onChange={(e) => set("maintenance_note", e.target.value)}
                placeholder="سيتم إجراء تحديث مجدول يوم الجمعة من ١٢ص حتى ٢ص."
                disabled={!canManage}
              />
            </FormField>
          </div>
        </SectionCard>

        {canManage ? (
          <div className="flex justify-end">
            <Btn type="submit" loading={save.isPending}>
              حفظ الإعدادات
            </Btn>
          </div>
        ) : (
          <p className="text-body-sm text-muted-foreground">
            لديك صلاحية المشاهدة فقط. تعديل إعدادات المنصة يتطلب صلاحية «إعدادات المنصة».
          </p>
        )}
      </form>
    </AdminShell>
  );
}