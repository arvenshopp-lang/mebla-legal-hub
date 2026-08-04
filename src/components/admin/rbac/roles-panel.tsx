/** إدارة أدوار المنصة: إنشاء، تعديل، استنساخ، تفعيل/تعطيل، وحذف. */
import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Copy, Pencil, Power, Trash2 } from "lucide-react";
import {
  Badge,
  Btn,
  ConfirmDialog,
  DataCard,
  EmptyState,
  IconBtn,
  Modal,
  PageToolbar,
  Td,
  Th,
  inputCls,
} from "@/lib/list-utils";
import { cloneRbacRole, deleteRbacRole, saveRbacRole } from "@/lib/rbac/rbac.functions";
import { Field, PermissionBadges, PermissionPicker, type RbacOverview, type RbacRole } from "./shared";

type RoleForm = {
  id: string | null;
  code: string;
  name_ar: string;
  description: string;
  permissions: string[];
  is_active: boolean;
};

const EMPTY: RoleForm = { id: null, code: "", name_ar: "", description: "", permissions: [], is_active: true };

export function RolesPanel({
  data,
  canManage,
  refresh,
}: {
  data: RbacOverview;
  canManage: boolean;
  refresh: () => void;
}) {
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<RoleForm | null>(null);
  const [clone, setClone] = useState<{ sourceId: string; code: string; name_ar: string } | null>(null);
  const [toDelete, setToDelete] = useState<RbacRole | null>(null);

  const isSuper = data.me.role === "super_admin";
  const saveFn = useServerFn(saveRbacRole);
  const cloneFn = useServerFn(cloneRbacRole);
  const deleteFn = useServerFn(deleteRbacRole);

  const done = (msg: string) => {
    toast.success(msg);
    setForm(null);
    setClone(null);
    setToDelete(null);
    refresh();
  };

  const save = useMutation({
    mutationFn: () => {
      const f = form!;
      if (f.name_ar.trim().length < 2) throw new Error("اكتب اسماً واضحاً للدور.");
      return saveFn({
        data: {
          id: f.id,
          code: f.code,
          name_ar: f.name_ar,
          description: f.description || null,
          permissions: f.permissions,
          is_active: f.is_active,
        },
      });
    },
    onSuccess: () => done("تم حفظ الدور."),
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: (role: RbacRole) =>
      saveFn({
        data: {
          id: role.id,
          code: role.code,
          name_ar: role.name_ar,
          description: role.description,
          permissions: role.permissions ?? [],
          is_active: !role.is_active,
        },
      }),
    onSuccess: () => done("تم تحديث حالة الدور."),
    onError: (e: Error) => toast.error(e.message),
  });

  const cloneMut = useMutation({
    mutationFn: () => cloneFn({ data: clone! }),
    onSuccess: () => done("تم استنساخ الدور."),
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: () => deleteFn({ data: { id: toDelete!.id } }),
    onSuccess: () => done("تم حذف الدور."),
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = useMemo(() => {
    const q = search.trim();
    return data.roles.filter((r) => !q || r.name_ar.includes(q) || r.code.includes(q));
  }, [data.roles, search]);

  const staffCount = (roleId: string) => data.staff.filter((s) => s.role_id === roleId).length;

  return (
    <>
      <PageToolbar
        search={search}
        setSearch={setSearch}
        placeholder="بحث بالاسم أو الرمز…"
        onAdd={() => setForm({ ...EMPTY })}
        addLabel="دور جديد"
        canAdd={canManage}
      />

      {rows.length === 0 ? (
        <DataCard>
          <EmptyState title="لا توجد أدوار مطابقة" hint="أنشئ دوراً جديداً أو عدّل معايير البحث." />
        </DataCard>
      ) : (
        <DataCard>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-right">
              <thead>
                <tr>
                  <Th>الدور</Th>
                  <Th>الصلاحيات</Th>
                  <Th>الموظفون</Th>
                  <Th>الحالة</Th>
                  <Th className="w-32">إجراءات</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <Td>
                      <span className="block font-semibold">{r.name_ar}</span>
                      <span className="block font-mono text-[11px] text-text-muted">{r.code}</span>
                      {r.description && <span className="text-caption mt-0.5 block">{r.description}</span>}
                    </Td>
                    <Td>
                      <PermissionBadges permissions={r.permissions ?? []} max={4} />
                    </Td>
                    <Td>
                      <span className="tabular-nums">{staffCount(r.id)}</span>
                    </Td>
                    <Td>
                      <div className="flex flex-wrap gap-1.5">
                        {r.is_system && <Badge tone="info">نظامي</Badge>}
                        {r.is_active ? <Badge tone="green">مفعّل</Badge> : <Badge tone="muted">معطّل</Badge>}
                      </div>
                    </Td>
                    <Td>
                      <div className="flex items-center gap-1">
                        <IconBtn
                          label="تعديل الدور"
                          onClick={() =>
                            setForm({
                              id: r.id,
                              code: r.code,
                              name_ar: r.name_ar,
                              description: r.description ?? "",
                              permissions: r.permissions ?? [],
                              is_active: r.is_active,
                            })
                          }
                          disabled={!canManage}
                        >
                          <Pencil className="h-4 w-4" aria-hidden />
                        </IconBtn>
                        <IconBtn
                          label="استنساخ الدور"
                          onClick={() => setClone({ sourceId: r.id, code: "", name_ar: `${r.name_ar} (نسخة)` })}
                          disabled={!canManage}
                        >
                          <Copy className="h-4 w-4" aria-hidden />
                        </IconBtn>
                        <IconBtn
                          label={r.is_active ? "تعطيل الدور" : "تفعيل الدور"}
                          onClick={() => toggle.mutate(r)}
                          disabled={!canManage || r.is_system || toggle.isPending}
                        >
                          <Power className="h-4 w-4" aria-hidden />
                        </IconBtn>
                        <IconBtn
                          label="حذف الدور"
                          onClick={() => setToDelete(r)}
                          disabled={!canManage || r.is_system}
                        >
                          <Trash2 className="h-4 w-4 text-danger" aria-hidden />
                        </IconBtn>
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DataCard>
      )}

      <Modal
        open={!!form}
        onClose={() => setForm(null)}
        title={form?.id ? "تعديل دور" : "دور جديد"}
        description="الصلاحيات مجمّعة حسب المورد، ولا يمكن منح صلاحية لا تملكها."
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
              <Field label="الرمز" hint="حروف لاتينية صغيرة وأرقام وشرطة سفلية">
                <input
                  className={inputCls}
                  value={form.code}
                  disabled={!!form.id}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  required
                />
              </Field>
              <Field label="الاسم بالعربية">
                <input
                  className={inputCls}
                  value={form.name_ar}
                  onChange={(e) => setForm({ ...form, name_ar: e.target.value })}
                  required
                />
              </Field>
            </div>
            <Field label="الوصف">
              <textarea
                className={inputCls}
                rows={2}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </Field>
            <label className="flex items-center gap-2 text-[13px]">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[var(--color-primary)]"
                checked={form.is_active}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              />
              دور مفعّل (الأدوار المعطّلة لا تمنح أي صلاحية)
            </label>

            <PermissionPicker
              selected={form.permissions}
              onChange={(permissions) => setForm({ ...form, permissions })}
              holderPermissions={data.me.effectivePermissions}
              isSuperAdmin={isSuper}
            />

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

      <Modal open={!!clone} onClose={() => setClone(null)} title="استنساخ دور">
        {clone && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              cloneMut.mutate();
            }}
          >
            <Field label="رمز الدور الجديد">
              <input
                className={inputCls}
                value={clone.code}
                onChange={(e) => setClone({ ...clone, code: e.target.value })}
                required
              />
            </Field>
            <Field label="اسم الدور الجديد">
              <input
                className={inputCls}
                value={clone.name_ar}
                onChange={(e) => setClone({ ...clone, name_ar: e.target.value })}
                required
              />
            </Field>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Btn variant="outline" onClick={() => setClone(null)}>
                إلغاء
              </Btn>
              <Btn type="submit" loading={cloneMut.isPending}>
                استنساخ
              </Btn>
            </div>
          </form>
        )}
      </Modal>

      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={() => remove.mutate()}
        title="حذف الدور"
        message={`سيتم حذف الدور «${toDelete?.name_ar ?? ""}». لا يمكن حذف دور مرتبط بموظفين.`}
        loading={remove.isPending}
      />
    </>
  );
}
