import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { FileText, Plus, Settings2, UserCog, Users, UserCheck, UserX } from "lucide-react";
import { AdminShell } from "@/components/admin/shell";
import {
  createHrEmployee,
  listHrDepartments,
  listHrEmployees,
  listUnlinkedPlatformStaff,
  updateHrEmployee,
} from "@/lib/hr.functions";
import {
  HR_EMPLOYMENT_STATUS,
  HR_EMPLOYMENT_STATUS_LABELS,
  HR_EMPLOYMENT_TYPE,
  HR_EMPLOYMENT_TYPE_LABELS,
  type HrEmployeeRow,
  type HrEmploymentStatus,
  type HrEmploymentType,
} from "@/lib/hr.shared";
import { fmtDate } from "@/lib/enums";
import { usePlatformAdmin } from "@/hooks/use-platform-admin";
import {
  Badge,
  Btn,
  DataCard,
  EmptyState,
  ErrorBlock,
  IconBtn,
  LoadingBlock,
  Pagination,
  PageToolbar,
  Td,
  Th,
  inputCls,
  useDebounced,
} from "@/lib/list-utils";
import {
  EmployeeFormModal,
  emptyEmployeeForm,
  toEmployeeForm,
  type EmployeeFormValues,
} from "@/components/admin/hr/employee-form-modal";
import { EmployeeDocumentsModal } from "@/components/admin/hr/employee-documents-modal";
import { NOINDEX_META } from "@/config/indexing";

export const Route = createFileRoute("/mehla-admin/hr")({
  head: () => ({
    meta: [
      { title: "مركز الموظفين · إدارة مِهلة" },
      {
        name: "description",
        content: "سجل موظفي منصة مِهلة، أقسامهم، حالاتهم الوظيفية، ومستنداتهم.",
      },
      NOINDEX_META,
    ],
  }),
  component: HrPage,
});

const PAGE_SIZE = 20;

function HrPage() {
  const { can } = usePlatformAdmin();
  const canManage = can("hr.manage");
  const canReadDocs = can("hr.documents.read");
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounced(search, 350);
  const [departmentId, setDepartmentId] = useState<string>("all");
  const [status, setStatus] = useState<"all" | HrEmploymentStatus>("all");
  const [type, setType] = useState<"all" | HrEmploymentType>("all");
  const [page, setPage] = useState(1);

  const [editing, setEditing] = useState<EmployeeFormValues | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [docsEmployee, setDocsEmployee] = useState<HrEmployeeRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  const listFn = useServerFn(listHrEmployees);
  const deptFn = useServerFn(listHrDepartments);
  const unlinkedFn = useServerFn(listUnlinkedPlatformStaff);
  const createFn = useServerFn(createHrEmployee);
  const updateFn = useServerFn(updateHrEmployee);

  const employeesQuery = useQuery({
    queryKey: ["hr-employees", debouncedSearch, departmentId, status, type, page],
    queryFn: () =>
      listFn({
        data: {
          search: debouncedSearch,
          departmentId: departmentId === "all" ? undefined : departmentId,
          employmentStatus: status,
          employmentType: type,
          page,
          pageSize: PAGE_SIZE,
        },
      }),
  });

  const departmentsQuery = useQuery({
    queryKey: ["hr-departments"],
    queryFn: () => deptFn({ data: {} }),
    staleTime: 60_000,
  });

  const unlinkedQuery = useQuery({
    queryKey: ["hr-unlinked-staff"],
    queryFn: () => unlinkedFn({ data: {} }),
    enabled: !!editing,
    staleTime: 30_000,
  });

  const rows = useMemo(() => employeesQuery.data?.rows ?? [], [employeesQuery.data]);
  const total = employeesQuery.data?.total ?? 0;
  const departments = departmentsQuery.data?.departments ?? [];

  const managers = useMemo(
    () =>
      rows
        .filter((r: HrEmployeeRow) => r.id !== editingId)
        .map((r: HrEmployeeRow) => ({ id: r.id, full_name: r.full_name })),
    [rows, editingId],
  );

  const summary = useMemo(() => {
    const active = rows.filter((r: HrEmployeeRow) => r.employment_status === "active").length;
    const onNotice = rows.filter(
      (r: HrEmployeeRow) =>
        r.employment_status === "on_notice" || r.employment_status === "suspended",
    ).length;
    const departed = rows.filter(
      (r: HrEmployeeRow) =>
        r.employment_status === "terminated" || r.employment_status === "resigned",
    ).length;
    return { total, active, onNotice, departed };
  }, [rows, total]);

  const save = useMutation({
    mutationFn: async (f: EmployeeFormValues) => {
      const payload = {
        full_name: f.full_name.trim(),
        email: f.email.trim().toLowerCase(),
        phone: f.phone.trim(),
        job_title: f.job_title.trim(),
        department_id: f.department_id,
        manager_employee_id: f.manager_employee_id,
        staff_id: f.staff_id,
        employment_status: f.employment_status,
        employment_type: f.employment_type,
        work_location: f.work_location.trim(),
        joined_at: f.joined_at,
        notes: f.notes.trim(),
      };
      return editingId
        ? updateFn({ data: { ...payload, employeeId: editingId } })
        : createFn({ data: payload });
    },
    onSuccess: () => {
      toast.success("تم حفظ بيانات الموظف");
      void qc.invalidateQueries({ queryKey: ["hr-employees"] });
      setEditing(null);
      setEditingId(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <AdminShell
      title="مركز الموظفين"
      description="سجل موظفي منصة مِهلة نفسها — لا علاقة له ببيانات مكاتب العملاء أو قضاياهم."
      actions={
        canManage ? (
          <Btn
            onClick={() => {
              setError(null);
              setEditingId(null);
              setEditing(emptyEmployeeForm());
            }}
          >
            <Plus className="h-4 w-4" aria-hidden /> موظف جديد
          </Btn>
        ) : undefined
      }
    >
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          Icon={Users}
          label="إجمالي الموظفين (الصفحة الحالية)"
          value={total}
          tone="info"
        />
        <SummaryCard Icon={UserCheck} label="نشطون" value={summary.active} tone="green" />
        <SummaryCard
          Icon={UserCog}
          label="تحت الملاحظة/موقوفون"
          value={summary.onNotice}
          tone="warn"
        />
        <SummaryCard Icon={UserX} label="منتهية خدمتهم" value={summary.departed} tone="muted" />
      </div>

      <PageToolbar
        search={search}
        setSearch={(v) => {
          setSearch(v);
          setPage(1);
        }}
        placeholder="ابحث بالاسم أو البريد أو المسمى الوظيفي…"
        searching={employeesQuery.isFetching && !employeesQuery.isLoading}
        canAdd={false}
        filters={
          <>
            <select
              value={departmentId}
              onChange={(e) => {
                setDepartmentId(e.target.value);
                setPage(1);
              }}
              className={`${inputCls} h-11 w-auto`}
              aria-label="تصفية حسب القسم"
            >
              <option value="all">كل الأقسام</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name_ar}
                </option>
              ))}
            </select>
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as typeof status);
                setPage(1);
              }}
              className={`${inputCls} h-11 w-auto`}
              aria-label="تصفية حسب حالة التوظيف"
            >
              <option value="all">كل الحالات</option>
              {HR_EMPLOYMENT_STATUS.map((s) => (
                <option key={s} value={s}>
                  {HR_EMPLOYMENT_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
            <select
              value={type}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                setType(e.target.value as typeof type);
                setPage(1);
              }}
              className={`${inputCls} h-11 w-auto`}
              aria-label="تصفية حسب نوع العقد"
            >
              <option value="all">كل الأنواع</option>
              {HR_EMPLOYMENT_TYPE.map((t) => (
                <option key={t} value={t}>
                  {HR_EMPLOYMENT_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </>
        }
      />

      {employeesQuery.isLoading ? (
        <LoadingBlock rows={6} cols={6} />
      ) : employeesQuery.isError ? (
        <ErrorBlock message="تعذّر تحميل قائمة الموظفين. تأكد من صلاحية «مشاهدة الموظفين» ثم أعد المحاولة." />
      ) : rows.length === 0 ? (
        <EmptyState
          title="لا يوجد موظفون مطابقون"
          hint="عدّل معايير البحث أو التصفية، أو أضف موظفاً جديداً."
        />
      ) : (
        <>
          <DataCard>
            <table className="w-full min-w-[880px] text-right">
              <thead>
                <tr>
                  <Th>الاسم</Th>
                  <Th>البريد</Th>
                  <Th>المسمى الوظيفي</Th>
                  <Th>القسم</Th>
                  <Th>الحالة</Th>
                  <Th>نوع العقد</Th>
                  <Th>تاريخ الالتحاق</Th>
                  <Th className="text-left">إجراءات</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((e: HrEmployeeRow) => (
                  <tr key={e.id} className="hover:bg-surface-muted/60">
                    <Td className="font-medium">{e.full_name}</Td>
                    <Td className="text-left text-[12px]">
                      <span dir="ltr">{e.email}</span>
                    </Td>
                    <Td>{e.job_title ?? "—"}</Td>
                    <Td>{e.department_name ?? "—"}</Td>
                    <Td>
                      <Badge tone={statusTone(e.employment_status)}>
                        {HR_EMPLOYMENT_STATUS_LABELS[e.employment_status]}
                      </Badge>
                    </Td>
                    <Td>{HR_EMPLOYMENT_TYPE_LABELS[e.employment_type]}</Td>
                    <Td className="text-[12px] text-muted-foreground">
                      {e.joined_at ? fmtDate(e.joined_at) : "—"}
                    </Td>
                    <Td className="text-left">
                      <div className="flex items-center justify-end gap-1">
                        {canReadDocs && (
                          <IconBtn
                            title="المستندات"
                            aria-label={`مستندات ${e.full_name}`}
                            onClick={() => setDocsEmployee(e)}
                          >
                            <FileText className="h-4 w-4" />
                          </IconBtn>
                        )}
                        {canManage && (
                          <IconBtn
                            title="تعديل"
                            aria-label={`تعديل بيانات ${e.full_name}`}
                            onClick={() => {
                              setError(null);
                              setEditingId(e.id);
                              setEditing(toEmployeeForm(e));
                            }}
                          >
                            <Settings2 className="h-4 w-4" />
                          </IconBtn>
                        )}
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DataCard>
          <Pagination page={page} setPage={setPage} total={total} pageSize={PAGE_SIZE} />
        </>
      )}

      {editing && (
        <EmployeeFormModal
          open={!!editing}
          onClose={() => {
            setEditing(null);
            setEditingId(null);
          }}
          onSubmit={() => {
            setError(null);
            save.mutate(editing);
          }}
          value={editing}
          setValue={setEditing}
          busy={save.isPending}
          departments={departments}
          managers={managers}
          unlinkedStaff={unlinkedQuery.data?.staff ?? []}
          isEdit={!!editingId}
        />
      )}
      {error && (
        <p
          role="alert"
          className="mt-3 rounded-[var(--radius-m)] bg-danger-soft px-3 py-2.5 text-[12px] text-danger"
        >
          {error}
        </p>
      )}

      <EmployeeDocumentsModal
        open={!!docsEmployee}
        onClose={() => setDocsEmployee(null)}
        employeeId={docsEmployee?.id ?? null}
        employeeName={docsEmployee?.full_name ?? ""}
        canManage={canManage}
      />
    </AdminShell>
  );
}

function statusTone(s: HrEmploymentStatus): "green" | "warn" | "muted" | "info" {
  if (s === "active") return "green";
  if (s === "probation") return "info";
  if (s === "on_notice" || s === "suspended") return "warn";
  return "muted";
}

function SummaryCard({
  Icon,
  label,
  value,
  tone,
}: {
  Icon: typeof Users;
  label: string;
  value: number;
  tone: "green" | "warn" | "muted" | "info";
}) {
  return (
    <div className="surface-card p-5">
      <div className="flex items-center justify-between">
        <Icon className="h-5 w-5 text-muted-foreground" aria-hidden />
        <Badge tone={tone}>{value}</Badge>
      </div>
      <p className="mt-3 text-body-sm font-semibold">{label}</p>
    </div>
  );
}
