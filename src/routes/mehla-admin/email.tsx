import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { AdminShell } from "@/components/admin/shell";
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
import { fmtDateTime } from "@/lib/enums";
import { usePlatformAdmin } from "@/hooks/use-platform-admin";
import {
  deleteEmailTemplate,
  getPlatformSettings,
  listEmailTemplates,
  saveEmailTemplate,
  savePlatformSettings,
} from "@/lib/admin-ops.functions";

export const Route = createFileRoute("/mehla-admin/email")({
  head: () => ({ meta: [{ title: "البريد والقوالب · إدارة مِهلة" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: EmailPage,
});

type TemplateForm = {
  id?: string;
  code: string;
  name_ar: string;
  subject: string;
  body_html: string;
  is_active: boolean;
};

const EMPTY: TemplateForm = {
  code: "",
  name_ar: "",
  subject: "",
  body_html: "<p>مرحباً {{name}}،</p>\n<p>…</p>\n<p>فريق مِهلة</p>",
  is_active: true,
};

function EmailPage() {
  const qc = useQueryClient();
  const { can } = usePlatformAdmin();
  const canManage = can("email.manage");

  const settingsFn = useServerFn(getPlatformSettings);
  const settings = useQuery({ queryKey: ["admin-settings"], queryFn: () => settingsFn({ data: undefined }) });

  const [sender, setSender] = useState({ from_name: "", from_email: "", reply_to: "", footer: "" });
  useEffect(() => {
    const s = settings.data?.settings?.email as Record<string, string> | undefined;
    if (s) setSender({ from_name: s.from_name ?? "", from_email: s.from_email ?? "", reply_to: s.reply_to ?? "", footer: s.footer ?? "" });
  }, [settings.data]);

  const saveSettingsFn = useServerFn(savePlatformSettings);
  const saveSender = useMutation({
    mutationFn: () => saveSettingsFn({ data: { group: "email", values: { email: sender } } }),
    onSuccess: () => {
      toast.success("تم حفظ بيانات المُرسل.");
      qc.invalidateQueries({ queryKey: ["admin-settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const listFn = useServerFn(listEmailTemplates);
  const templates = useQuery({ queryKey: ["admin-email-templates"], queryFn: () => listFn({ data: undefined }) });

  const [form, setForm] = useState<TemplateForm | null>(null);
  const [toDelete, setToDelete] = useState<{ id: string; name: string } | null>(null);

  const saveFn = useServerFn(saveEmailTemplate);
  const save = useMutation({
    mutationFn: () => saveFn({ data: form! }),
    onSuccess: () => {
      toast.success("تم حفظ القالب.");
      setForm(null);
      qc.invalidateQueries({ queryKey: ["admin-email-templates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteFn = useServerFn(deleteEmailTemplate);
  const remove = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("تم حذف القالب.");
      setToDelete(null);
      qc.invalidateQueries({ queryKey: ["admin-email-templates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AdminShell title="البريد والقوالب" description="بيانات المُرسل الرسمي وقوالب الرسائل التي تُستخدم في مراسلات المنصة.">
      <div className="space-y-6">
        <SectionCard title="المُرسل الرسمي" description="يظهر هذا الاسم والبريد للمستلمين في كل رسائل المنصة.">
          {settings.isLoading ? (
            <LoadingBlock rows={2} cols={2} />
          ) : (
            <form
              className="grid gap-4 sm:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault();
                saveSender.mutate();
              }}
            >
              <FormField label="اسم المُرسل">
                <input
                  className={inputCls}
                  value={sender.from_name}
                  onChange={(e) => setSender({ ...sender, from_name: e.target.value })}
                  placeholder="منصة مِهلة"
                  disabled={!canManage}
                />
              </FormField>
              <FormField label="بريد المُرسل">
                <input
                  type="email"
                  className={inputCls}
                  value={sender.from_email}
                  onChange={(e) => setSender({ ...sender, from_email: e.target.value })}
                  placeholder="no-reply@mehlalex.com"
                  disabled={!canManage}
                />
              </FormField>
              <FormField label="بريد الردود">
                <input
                  type="email"
                  className={inputCls}
                  value={sender.reply_to}
                  onChange={(e) => setSender({ ...sender, reply_to: e.target.value })}
                  placeholder="support@mehlalex.com"
                  disabled={!canManage}
                />
              </FormField>
              <FormField label="تذييل الرسائل">
                <input
                  className={inputCls}
                  value={sender.footer}
                  onChange={(e) => setSender({ ...sender, footer: e.target.value })}
                  placeholder="مِهلة — منصة إدارة الأعمال القانونية"
                  disabled={!canManage}
                />
              </FormField>
              {canManage && (
                <div className="sm:col-span-2">
                  <Btn type="submit" loading={saveSender.isPending}>
                    حفظ بيانات المُرسل
                  </Btn>
                </div>
              )}
            </form>
          )}
        </SectionCard>

        <SectionCard
          title="قوالب الرسائل"
          description="محتوى HTML يمكن أن يتضمن متغيرات مثل {{name}} و {{plan}} و {{date}}."
          actions={
            canManage ? (
              <Btn size="sm" onClick={() => setForm(EMPTY)}>
                <Plus className="h-4 w-4" aria-hidden /> قالب جديد
              </Btn>
            ) : undefined
          }
        >
          {templates.isLoading ? (
            <LoadingBlock rows={3} cols={2} />
          ) : (templates.data?.templates.length ?? 0) === 0 ? (
            <EmptyState
              title="لا توجد قوالب"
              hint="أنشئ قالباً للترحيب أو تنبيه انتهاء الاشتراك أو تأكيد التفعيل."
            />
          ) : (
            <ul className="space-y-3">
              {templates.data!.templates.map((t) => (
                <li key={t.id} className="rounded-[var(--radius-m)] border border-border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold">
                        {t.name_ar} <span className="text-[12px] text-muted-foreground">({t.code})</span>
                      </p>
                      <p className="mt-0.5 truncate text-body-sm text-muted-foreground">{t.subject}</p>
                      <p className="text-caption mt-1">آخر تحديث {fmtDateTime(t.updated_at)}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge tone={t.is_active ? "green" : "muted"}>{t.is_active ? "مُفعّل" : "معطّل"}</Badge>
                      {canManage && (
                        <>
                          <IconBtn
                            aria-label="تعديل القالب"
                            onClick={() =>
                              setForm({
                                id: t.id,
                                code: t.code,
                                name_ar: t.name_ar,
                                subject: t.subject,
                                body_html: t.body_html,
                                is_active: t.is_active,
                              })
                            }
                          >
                            <Pencil className="h-4 w-4" aria-hidden />
                          </IconBtn>
                          <IconBtn aria-label="حذف القالب" tone="danger" onClick={() => setToDelete({ id: t.id, name: t.name_ar })}>
                            <Trash2 className="h-4 w-4 text-danger" aria-hidden />
                          </IconBtn>
                        </>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <Modal
        open={Boolean(form)}
        onClose={() => setForm(null)}
        title={form?.id ? "تعديل قالب" : "قالب جديد"}
        size="lg"
      >
        {form && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="اسم القالب" required>
                <input
                  className={inputCls}
                  value={form.name_ar}
                  onChange={(e) => setForm({ ...form, name_ar: e.target.value })}
                  required
                />
              </FormField>
              <FormField label="رمز القالب" required hint="حروف إنجليزية صغيرة وشرطات فقط، ولا يُعاد استخدامه.">
                <input
                  className={inputCls}
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  disabled={Boolean(form.id)}
                  required
                />
              </FormField>
            </div>
            <FormField label="عنوان الرسالة" required>
              <input
                className={inputCls}
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
                required
              />
            </FormField>
            <FormField label="محتوى الرسالة (HTML)" required>
              <textarea
                className={`${inputCls} min-h-56 font-mono text-[13px]`}
                value={form.body_html}
                onChange={(e) => setForm({ ...form, body_html: e.target.value })}
                required
                dir="ltr"
              />
            </FormField>
            <label className="flex items-center gap-2 text-body-sm">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                className="h-4 w-4 rounded border-border"
              />
              تفعيل هذا القالب
            </label>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Btn variant="outline" onClick={() => setForm(null)}>
                إلغاء
              </Btn>
              <Btn type="submit" loading={save.isPending}>
                حفظ القالب
              </Btn>
            </div>
          </form>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(toDelete)}
        onClose={() => setToDelete(null)}
        onConfirm={() => toDelete && remove.mutate(toDelete.id)}
        title="حذف القالب"
        message={`سيتم حذف قالب «${toDelete?.name ?? ""}» نهائياً.`}
        loading={remove.isPending}
      />
    </AdminShell>
  );
}
