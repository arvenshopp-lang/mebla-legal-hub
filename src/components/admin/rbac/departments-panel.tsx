/** شجرة الأقسام: إنشاء وتعديل، ربط المدير، ونقل الموظفين — مع منع الحلقات. */
import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ChevronLeft, Pencil, Plus, Users } from "lucide-react";
import { Badge, Btn, DataCard, EmptyState, Modal, SectionCard, inputCls } from "@/lib/list-utils";
import { saveRbacDepartment, updateRbacStaffOrg } from "@/lib/rbac/rbac.functions";
import { Field, StaffSelect, staffName, type RbacDepartment, type RbacOverview } from "./shared";

type DeptForm = {
  id: string | null;
  code: string;
  name_ar: string;
  description: string;
  parent_department_id: string;
  manager_user_id: string;
  default_role_id: string;
  is_active: boolean;
};

const EMPTY: DeptForm = {
  id: null,
  code: "",
  name_ar: "",
  description: "",
  parent_department_id: "",
  manager_user_id: "",
  default_role_id: "",
  is_active: true,
};

/** معرفات القسم وكل أبنائه — تُستخدم لمنع اختيار أب يُنشئ حلقة. */
function descendantsOf(all: RbacDepartment[], id: string): Set<string> {
  const out = new Set<string>([id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const d of all) {
      if (d.parent_department_id && out.has(d.parent_department_id) && !out.has(d.id)) {
        out.add(d.id);
        changed = true;
      }
    }
  }
  return out;
}

export function DepartmentsPanel({
  data,
  canManage,
  refresh,
}: {
  data: RbacOverview;
  canManage: boolean;
  refresh: () => void;
}) {
  const [form, setForm] = useState<DeptForm | null>(null);
  const [move, setMove] = useState<{
    staffUserId: string;
    department_id: string;
    manager_user_id: string;
    role_id: string;
  } | null>(null);

  const saveFn = useServerFn(saveRbacDepartment);
  const moveFn = useServerFn(updateRbacStaffOrg);

  const save = useMutation({
    mutationFn: () => {
      const f = form!;
      return saveFn({
        data: {
          id: f.id,
          code: f.code,
          name_ar: f.name_ar,
          description: f.description || null,
          parent_department_id: f.parent_department_id || null,
          manager_user_id: f.manager_user_id || null,
          default_role_id: f.default_role_id || null,
          is_active: f.is_active,
        },
      });
    },
    onSuccess: () => {
      toast.success("تم حفظ القسم.");
      setForm(null);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const moveMut = useMutation({
    mutationFn: () =>
      moveFn({
        data: {
          staffUserId: move!.staffUserId,
          department_id: move!.department_id || null,
          manager_user_id: move!.manager_user_id || null,
          role_id: move!.role_id || null,
        },
      }),
    onSuccess: () => {
      toast.success("تم تحديث ارتباط الموظف.");
      setMove(null);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const children = useMemo(() => {
    const map = new Map<string | null, RbacDepartment[]>();
    for (const d of data.departments) {
      const key = d.parent_department_id ?? null;
      map.set(key, [...(map.get(key) ?? []), d]);
    }
    return map;
  }, [data.departments]);

  const blocked = form?.id ? descendantsOf(data.departments, form.id) : new Set<string>();

  const renderNode = (dept: RbacDepartment, depth: number) => {
    const members = data.staff.filter((s) => s.department_id === dept.id);
    return (
      <li key={dept.id}>
        <div
          className="flex flex-wrap items-center gap-2 rounded-[var(--radius-m)] px-2 py-2 hover:bg-surface-muted"
          style={{ marginInlineStart: depth * 18 }}
        >
          {depth > 0 && <ChevronLeft className="h-3.5 w-3.5 text-text-muted" aria-hidden />}
          <span className="font-semibold">{dept.name_ar}</span>
          <span className="font-mono text-[11px] text-text-muted">{dept.code}</span>
          {!dept.is_active && <Badge tone="muted">معطّل</Badge>}
          <span className="text-caption">
            المدير: {staffName(data.staff, dept.manager_user_id)}
          </span>
          <span className="text-caption inline-flex items-center gap-1">
            <Users className="h-3.5 w-3.5" aria-hidden /> {members.length}
          </span>
          {canManage && (
            <button
              type="button"
              className="text-[12px] font-medium text-primary underline underline-offset-2"
              onClick={() =>
                setForm({
                  id: dept.id,
                  code: dept.code,
                  name_ar: dept.name_ar,
                  description: dept.description ?? "",
                  parent_department_id: dept.parent_department_id ?? "",
                  manager_user_id: dept.manager_user_id ?? "",
                  default_role_id: dept.default_role_id ?? "",
                  is_active: dept.is_active,
                })
              }
            >
              <Pencil className="inline h-3.5 w-3.5" aria-hidden /> تعديل
            </button>
          )}
        </div>
        {(children.get(dept.id) ?? []).length > 0 && (
          <ul>{(children.get(dept.id) ?? []).map((c) => renderNode(c, depth + 1))}</ul>
        )}
      </li>
    );
  };

  const roots = children.get(null) ?? [];

  return (
    <div className="space-y-5">
      <SectionCard
        title="شجرة الأقسام"
        description="القسم الأب لا يمكن أن يكون القسم نفسه أو أحد فروعه."
        actions={
          canManage ? (
            <Btn size="sm" onClick={() => setForm({ ...EMPTY })}>
              <Plus className="h-4 w-4" aria-hidden /> قسم جديد
            </Btn>
          ) : undefined
        }
      >
        {roots.length === 0 ? (
          <EmptyState title="لا توجد أقسام" hint="ابدأ بإنشاء قسم رئيسي ثم أضف الفروع تحته." />
        ) : (
          <ul className="text-[13px]">{roots.map((d) => renderNode(d, 0))}</ul>
        )}
      </SectionCard>

      <SectionCard
        title="ارتباط الموظفين"
        description="نقل الموظف بين الأقسام وتحديد مديره المباشر ودوره."
      >
        {data.staff.length === 0 ? (
          <EmptyState title="لا يوجد موظفون" />
        ) : (
          <DataCard>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-right text-[13px]">
                <thead>
                  <tr className="text-[11px] text-text-muted">
                    <th className="px-4 py-2.5 font-semibold">الموظف</th>
                    <th className="px-4 py-2.5 font-semibold">القسم</th>
                    <th className="px-4 py-2.5 font-semibold">المدير المباشر</th>
                    <th className="px-4 py-2.5 font-semibold">الدور</th>
                    <th className="px-4 py-2.5 font-semibold" />
                  </tr>
                </thead>
                <tbody>
                  {data.staff.map((s) => (
                    <tr key={s.user_id} className="border-t border-border">
                      <td className="px-4 py-3">
                        <span className="block font-semibold">{s.full_name}</span>
                        <span className="block text-[11px] text-text-muted">{s.email}</span>
                      </td>
                      <td className="px-4 py-3">
                        {data.departments.find((d) => d.id === s.department_id)?.name_ar ?? "—"}
                      </td>
                      <td className="px-4 py-3">{staffName(data.staff, s.manager_user_id)}</td>
                      <td className="px-4 py-3">
                        {data.roles.find((r) => r.id === s.role_id)?.name_ar ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        {canManage && (
                          <Btn
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setMove({
                                staffUserId: s.user_id,
                                department_id: s.department_id ?? "",
                                manager_user_id: s.manager_user_id ?? "",
                                role_id: s.role_id ?? "",
                              })
                            }
                          >
                            تعديل الارتباط
                          </Btn>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </DataCard>
        )}
      </SectionCard>

      <Modal
        open={!!form}
        onClose={() => setForm(null)}
        title={form?.id ? "تعديل قسم" : "قسم جديد"}
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
              <Field label="الرمز">
                <input
                  className={inputCls}
                  value={form.code}
                  disabled={!!form.id}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  required
                />
              </Field>
              <Field label="اسم القسم">
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
            <Field label="القسم الأب" hint="الفروع التابعة لهذا القسم غير متاحة لمنع الحلقات.">
              <select
                className={inputCls}
                value={form.parent_department_id}
                onChange={(e) => setForm({ ...form, parent_department_id: e.target.value })}
              >
                <option value="">قسم رئيسي</option>
                {data.departments
                  .filter((d) => !blocked.has(d.id))
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name_ar}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="مدير القسم">
              <StaffSelect
                value={form.manager_user_id}
                onChange={(v) => setForm({ ...form, manager_user_id: v })}
                staff={data.staff}
                placeholder="بدون مدير"
              />
            </Field>
            <Field label="الدور الافتراضي للقسم">
              <select
                className={inputCls}
                value={form.default_role_id}
                onChange={(e) => setForm({ ...form, default_role_id: e.target.value })}
              >
                <option value="">بدون دور افتراضي</option>
                {data.roles
                  .filter((r) => r.is_active)
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name_ar}
                    </option>
                  ))}
              </select>
            </Field>
            <label className="flex items-center gap-2 text-[13px]">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[var(--color-primary)]"
                checked={form.is_active}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              />
              قسم مفعّل
            </label>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Btn variant="outline" onClick={() => setForm(null)}>
                إلغاء
              </Btn>
              <Btn type="submit" loading={save.isPending}>
                حفظ القسم
              </Btn>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={!!move} onClose={() => setMove(null)} title="ارتباط الموظف">
        {move && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              moveMut.mutate();
            }}
          >
            <Field label="القسم">
              <select
                className={inputCls}
                value={move.department_id}
                onChange={(e) => setMove({ ...move, department_id: e.target.value })}
              >
                <option value="">بدون قسم</option>
                {data.departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name_ar}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="المدير المباشر" hint="سلسلة المدير لا تسمح بالحلقات.">
              <StaffSelect
                value={move.manager_user_id}
                onChange={(v) => setMove({ ...move, manager_user_id: v })}
                staff={data.staff}
                placeholder="بدون مدير"
                exclude={move.staffUserId}
              />
            </Field>
            <Field label="الدور">
              <select
                className={inputCls}
                value={move.role_id}
                onChange={(e) => setMove({ ...move, role_id: e.target.value })}
              >
                <option value="">بدون دور</option>
                {data.roles
                  .filter((r) => r.is_active)
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name_ar}
                    </option>
                  ))}
              </select>
            </Field>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Btn variant="outline" onClick={() => setMove(null)}>
                إلغاء
              </Btn>
              <Btn type="submit" loading={moveMut.isPending}>
                حفظ
              </Btn>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
