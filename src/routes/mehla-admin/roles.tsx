import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
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
import { usePlatformAdmin } from "@/hooks/use-platform-admin";
import { ADMIN_PERMISSIONS, PERMISSION_GROUPS } from "@/lib/admin-permissions";
import { deletePlatformRole, listPlatformRoles, savePlatformRole } from "@/lib/admin-ops.functions";

export const Route = createFileRoute("/mehla-admin/roles")({
  head: () => ({
    meta: [{ title: "الأدوار والصلاحيات · إدارة مِهلة" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: RolesPage,
});

type RoleForm = {
  id?: string;
  code: string;
  name_ar: string;
  description: string;
  permissions: string[];
};

const EMPTY: RoleForm = { code: "", name_ar: "", description: "", permissions: [] };

function RolesPage() {
  const qc = useQueryClient();
  const { can } = usePlatformAdmin();
  const canManage = can("roles.manage");

  const listFn = useServerFn(listPlatformRoles);
  const roles = useQuery({ queryKey: ["admin-roles"], queryFn: () => listFn({ data: undefined }) });

  const [form, setForm] = useState<RoleForm | null>(null);
  const [toDelete, setToDelete] = useState<{ id: string; name: string } | null>(null);

  const saveFn = useServerFn(savePlatformRole);
  const save = useMutation({
    mutationFn: () => saveFn({ data: form! }),
    onSuccess: () => {
      toast.success("تم حفظ الدور.");
      setForm(null);
      qc.invalidateQueries({ queryKey: ["admin-roles"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteFn = useServerFn(deletePlatformRole);
  const remove = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("تم حذف الدور.");
      setToDelete(null);
      qc.invalidateQueries({ queryKey: ["admin-roles"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = (id: string) =>
    setForm((prev) =>
      prev
        ? {
            ...prev,
            permissions: prev.permissions.includes(id)
              ? prev.permissions.filter((p) => p !== id)
              : [...prev.permissions, id],
          }
        : prev,
    );

  const toggleGroup = (group: string, checked: boolean) =>
    setForm((prev) => {
      if (!prev) return prev;
      const ids = ADMIN_PERMISSIONS.filter((p) => p.group === group).map((p) => p.id as string);
      const next = new Set(prev.permissions);
      for (const id of ids) (checked ? next.add(id) : next.delete(id));
      return { ...prev, permissions: Array.from(next) };
    });

  return (
    <AdminShell
      title="الأدوار والصلاحيات"
      description="أدوار مخصصة تُسند لموظفي المنصة، وتحدد بدقة ما يمكن لكل موظف الوصول إليه."
      actions={
        canManage ? (
          <Btn size="sm" onClick={() => setForm(EMPTY)}>
            <Plus className="h-4 w-4" aria-hidden /> دور جديد
          </Btn>
        ) : undefined
      }
    >
      <SectionCard
        title="الأدوار المتاحة"
        description="الأدوار النظامية غير قابلة للتعديل أو الحذف، ويمكن إنشاء أدوار تشغيلية إضافية."
      >
        {roles.isLoading ? (
          <LoadingBlock rows={4} cols={2} />
        ) : (roles.data?.roles.length ?? 0) === 0 ? (
          <EmptyState title="لا توجد أدوار" hint="أنشئ دوراً مثل «موظف دعم» أو «محاسب» وحدد صلاحياته." />
        ) : (
          <ul className="space-y-3">
            {roles.data!.roles.map((r) => (
              <li key={r.id} className="rounded-[var(--radius-m)] border border-border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">
                      {r.name_ar} <span className="text-[12px] text-muted-foreground">({r.code})</span>
                    </p>
                    {r.description && <p className="mt-0.5 text-body-sm text-muted-foreground">{r.description}</p>}
                    <p className="text-caption mt-1">
                      {r.permissions.length} صلاحية · {r.members} موظفاً
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {r.is_system && <Badge tone="gold">دور نظامي</Badge>}
                    {canManage && !r.is_system && (
                      <>
                        <IconBtn
                          aria-label="تعديل الدور"
                          onClick={() =>
                            setForm({
                              id: r.id,
                              code: r.code,
                              name_ar: r.name_ar,
                              description: r.description ?? "",
                              permissions: r.permissions,
                            })
                          }
                        >
                          <Pencil className="h-4 w-4" aria-hidden />
                        </IconBtn>
                        <IconBtn
                          aria-label="حذف الدور"
                          tone="danger"
                          onClick={() => setToDelete({ id: r.id, name: r.name_ar })}
                        >
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

      <Modal open={Boolean(form)} onClose={() => setForm(null)} title={form?.id ? "تعديل دور" : "دور جديد"} size="lg">
        {form && (
          <form
            className="space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="اسم الدور" required>
                <input
                  className={inputCls}
                  value={form.name_ar}
                  onChange={(e) => setForm({ ...form, name_ar: e.target.value })}
                  required
                />
              </FormField>
              <FormField label="رمز الدور" required hint="حروف إنجليزية صغيرة وشرطة سفلية فقط.">
                <input
                  className={inputCls}
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  disabled={Boolean(form.id)}
                  dir="ltr"
                  required
                />
              </FormField>
            </div>
            <FormField label="وصف الدور">
              <input
                className={inputCls}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="موظف دعم فني للرد على التذاكر ومتابعة المستخدمين."
              />
            </FormField>

            <div className="space-y-4">
              <p className="text-body-sm font-semibold">الصلاحيات ({form.permissions.length})</p>
              {PERMISSION_GROUPS.map((group) => {
                const items = ADMIN_PERMISSIONS.filter((p) => p.group === group);
                const all = items.every((p) => form.permissions.includes(p.id));
                return (
                  <fieldset key={group} className="rounded-[var(--radius-m)] border border-border p-4">
                    <legend className="flex items-center gap-2 px-1 text-body-sm font-semibold">{group}</legend>
                    <label className="mb-3 flex items-center gap-2 text-[12px] text-muted-foreground">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-border"
                        checked={all}
                        onChange={(e) => toggleGroup(group, e.target.checked)}
                      />
                      تحديد كل صلاحيات هذا القسم
                    </label>
                    <div className="grid gap-2.5 sm:grid-cols-2">
                      {items.map((p) => (
                        <label key={p.id} className="flex items-start gap-2 text-body-sm">
                          <input
                            type="checkbox"
                            className="mt-0.5 h-4 w-4 shrink-0 rounded border-border"
                            checked={form.permissions.includes(p.id)}
                            onChange={() => toggle(p.id)}
                          />
                          <span className="min-w-0">
                            <span className="block font-medium">{p.label}</span>
                            <span className="text-caption block">{p.description}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                );
              })}
            </div>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Btn variant="outline" onClick={() => setForm(null)}>
                إلغاء
              </Btn>
              <Btn type="submit" loading={save.isPending}>
                حفظ الدور
              </Btn>
            </div>
          </form>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(toDelete)}
        onClose={() => setToDelete(null)}
        onConfirm={() => toDelete && remove.mutate(toDelete.id)}
        title="حذف الدور"
        message={`سيتم حذف دور «${toDelete?.name ?? ""}» نهائياً. لا يمكن حذف دور مرتبط بموظفين.`}
        loading={remove.isPending}
      />
    </AdminShell>
  );
}