import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Settings2 } from "lucide-react";
import { AdminShell } from "@/components/admin/shell";
import { supabase } from "@/integrations/supabase/client";
import { createStaffMember, updateStaffMember } from "@/lib/admin.functions";
import {
  ADMIN_PERMISSIONS,
  PERMISSION_GROUPS,
  type AdminPermission,
} from "@/lib/admin-permissions";
import {
  Badge,
  Btn,
  DataCard,
  EmptyState,
  FormField,
  IconBtn,
  LoadingBlock,
  Modal,
  Td,
  Th,
  inputCls,
} from "@/lib/list-utils";
import { fmtDate } from "@/lib/enums";
import { usePlatformAdmin } from "@/hooks/use-platform-admin";
import { NOINDEX_META } from "@/config/indexing";

export const Route = createFileRoute("/mehla-admin/staff")({
  head: () => ({
    meta: [
      { title: "فريق الإدارة · إدارة مِهلة" },
      NOINDEX_META,
    ],
  }),
  component: StaffPage,
});

type Editing = {
  id?: string;
  email: string;
  fullName: string;
  jobTitle: string;
  role: "super_admin" | "staff";
  status: "active" | "suspended";
  permissions: string[];
};

const EMPTY: Editing = {
  email: "",
  fullName: "",
  jobTitle: "",
  role: "staff",
  status: "active",
  permissions: ["tickets.view"],
};

function StaffPage() {
  const qc = useQueryClient();
  const { can, staff: me } = usePlatformAdmin();
  const canManage = can("staff.manage");
  const [editing, setEditing] = useState<Editing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const createFn = useServerFn(createStaffMember);
  const updateFn = useServerFn(updateStaffMember);

  const { data: rows, isLoading } = useQuery({
    queryKey: ["admin-staff"],
    queryFn: async () => {
      const { data, error: e } = await supabase
        .from("platform_staff")
        .select("*")
        .order("created_at", { ascending: true });
      if (e) throw e;
      return data ?? [];
    },
  });

  const save = useMutation({
    mutationFn: async (f: Editing) => {
      const payload = {
        fullName: f.fullName.trim(),
        jobTitle: f.jobTitle.trim() || null,
        role: f.role,
        permissions: f.permissions,
      };
      return f.id
        ? updateFn({ data: { ...payload, id: f.id, status: f.status } })
        : createFn({ data: { ...payload, email: f.email.trim().toLowerCase() } });
    },
    onSuccess: () => {
      toast.success("تم حفظ بيانات الموظف");
      qc.invalidateQueries({ queryKey: ["admin-staff"] });
      setEditing(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <AdminShell
      title="فريق الإدارة"
      description="موظفو منصة مِهلة وصلاحياتهم التشغيلية. لا يملك أي موظف صلاحية الاطلاع على بيانات القضايا."
      actions={
        canManage ? (
          <Btn
            onClick={() => {
              setError(null);
              setEditing(EMPTY);
            }}
          >
            <Plus className="h-4 w-4" aria-hidden /> موظف جديد
          </Btn>
        ) : undefined
      }
    >
      {isLoading ? (
        <LoadingBlock rows={4} cols={5} />
      ) : (rows ?? []).length === 0 ? (
        <EmptyState
          title="لا يوجد موظفون"
          hint="أضف موظفاً مسجلاً في المنصة لمنحه صلاحيات الإدارة."
        />
      ) : (
        <DataCard>
          <table className="w-full min-w-[720px] text-right">
            <thead>
              <tr>
                <Th>الاسم</Th>
                <Th>البريد</Th>
                <Th>المسمى</Th>
                <Th>الدور</Th>
                <Th>الصلاحيات</Th>
                <Th>الحالة</Th>
                <Th>الانضمام</Th>
                {canManage && <Th className="text-left">إجراءات</Th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows!.map((s) => (
                <tr key={s.id} className="hover:bg-surface-muted/60">
                  <Td className="font-medium">{s.full_name}</Td>
                  <Td className="text-left text-[12px]">{s.email}</Td>
                  <Td>{s.job_title ?? "—"}</Td>
                  <Td>
                    <Badge tone={s.role === "super_admin" ? "gold" : "muted"}>
                      {s.role === "super_admin" ? "مالك المنصة" : "موظف"}
                    </Badge>
                  </Td>
                  <Td className="tabular-nums text-muted-foreground">
                    {s.role === "super_admin" ? "كامل الصلاحيات" : `${s.permissions.length} صلاحية`}
                  </Td>
                  <Td>
                    <Badge tone={s.status === "active" ? "green" : "red"}>
                      {s.status === "active" ? "نشط" : "موقوف"}
                    </Badge>
                  </Td>
                  <Td className="text-[12px] text-muted-foreground">{fmtDate(s.created_at)}</Td>
                  {canManage && (
                    <Td className="text-left">
                      <IconBtn
                        title="تعديل"
                        aria-label="تعديل الموظف"
                        disabled={s.user_id === me?.user_id}
                        onClick={() => {
                          setError(null);
                          setEditing({
                            id: s.id,
                            email: s.email,
                            fullName: s.full_name,
                            jobTitle: s.job_title ?? "",
                            role: s.role as Editing["role"],
                            status: s.status as Editing["status"],
                            permissions: s.permissions ?? [],
                          });
                        }}
                      >
                        <Settings2 className="h-4 w-4" />
                      </IconBtn>
                    </Td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </DataCard>
      )}

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        size="lg"
        title={editing?.id ? "تعديل موظف" : "إضافة موظف"}
        description="يجب أن يكون الموظف مسجلاً مسبقاً في المنصة بنفس البريد."
      >
        {editing && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="البريد الإلكتروني" required>
                <input
                  type="email"
                  dir="ltr"
                  disabled={!!editing.id}
                  value={editing.email}
                  onChange={(e) => setEditing({ ...editing, email: e.target.value })}
                  className={`${inputCls} text-left disabled:opacity-60`}
                />
              </FormField>
              <FormField label="الاسم الكامل" required>
                <input
                  value={editing.fullName}
                  onChange={(e) => setEditing({ ...editing, fullName: e.target.value })}
                  className={inputCls}
                />
              </FormField>
              <FormField label="المسمى الوظيفي">
                <input
                  value={editing.jobTitle}
                  onChange={(e) => setEditing({ ...editing, jobTitle: e.target.value })}
                  className={inputCls}
                />
              </FormField>
              <FormField label="الدور" required>
                <select
                  value={editing.role}
                  onChange={(e) =>
                    setEditing({ ...editing, role: e.target.value as Editing["role"] })
                  }
                  className={inputCls}
                >
                  <option value="staff">موظف</option>
                  {me?.role === "super_admin" && <option value="super_admin">مالك المنصة</option>}
                </select>
              </FormField>
              {editing.id && (
                <FormField label="الحالة" required>
                  <select
                    value={editing.status}
                    onChange={(e) =>
                      setEditing({ ...editing, status: e.target.value as Editing["status"] })
                    }
                    className={inputCls}
                  >
                    <option value="active">نشط</option>
                    <option value="suspended">موقوف</option>
                  </select>
                </FormField>
              )}
            </div>

            {editing.role === "staff" && (
              <div className="space-y-3">
                <p className="text-[13px] font-semibold">الصلاحيات</p>
                {PERMISSION_GROUPS.map((group) => (
                  <div key={group} className="rounded-[var(--radius-m)] border border-border p-3">
                    <p className="mb-2 text-[12px] font-semibold text-muted-foreground">{group}</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {ADMIN_PERMISSIONS.filter((p) => p.group === group).map((p) => (
                        <label key={p.id} className="flex items-start gap-2 text-[13px]">
                          <input
                            type="checkbox"
                            className="mt-0.5 h-4 w-4 rounded border-border"
                            checked={editing.permissions.includes(p.id)}
                            onChange={(e) =>
                              setEditing({
                                ...editing,
                                permissions: e.target.checked
                                  ? [...editing.permissions, p.id]
                                  : editing.permissions.filter(
                                      (x) => x !== (p.id as AdminPermission),
                                    ),
                              })
                            }
                          />
                          <span>
                            <span className="font-medium">{p.label}</span>
                            <span className="block text-[11px] text-muted-foreground">
                              {p.description}
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {error && (
              <p
                role="alert"
                className="rounded-[var(--radius-m)] bg-danger-soft px-3 py-2.5 text-[12px] text-danger"
              >
                {error}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Btn variant="ghost" onClick={() => setEditing(null)}>
                إلغاء
              </Btn>
              <Btn
                loading={save.isPending}
                onClick={() => {
                  setError(null);
                  if (editing.fullName.trim().length < 2) return setError("الاسم مطلوب.");
                  if (!editing.id && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(editing.email.trim()))
                    return setError("أدخل بريداً إلكترونياً صالحاً.");
                  save.mutate(editing);
                }}
              >
                حفظ
              </Btn>
            </div>
          </div>
        )}
      </Modal>
    </AdminShell>
  );
}
