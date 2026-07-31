import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Building2, ShieldQuestion } from "lucide-react";
import { AdminShell } from "@/components/admin/shell";
import {
  Badge,
  Btn,
  DataCard,
  EmptyState,
  ErrorBlock,
  FormField,
  LoadingBlock,
  Modal,
  PageToolbar,
  Pagination,
  Td,
  Th,
  inputCls,
  useDebounced,
} from "@/lib/list-utils";
import { fmtDate, fmtDateTime } from "@/lib/enums";
import { usePlatformAdmin } from "@/hooks/use-platform-admin";
import {
  deleteOrganization,
  listOrganizationMembers,
  listOrganizations,
  listSupportAccessGrants,
  requestSupportAccess,
  revokeSupportAccess,
  setOrganizationActive,
  updateOrganization,
  type AdminOrgRow,
} from "@/lib/admin-orgs.functions";

export const Route = createFileRoute("/mehla-admin/organizations")({
  head: () => ({ meta: [{ title: "المكاتب · إدارة مِهلة" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: OrganizationsPage,
});

const PAGE_SIZE = 20;
const ROLE_LABELS: Record<string, string> = {
  owner: "مالك المكتب",
  admin: "مدير",
  lawyer: "محامٍ",
  legal_assistant: "مساعد قانوني",
  viewer: "مشاهد",
};

const SCOPES = [
  { value: "technical", label: "مشكلة تقنية" },
  { value: "billing", label: "الاشتراك والفواتير" },
  { value: "cases", label: "بيانات قضايا (استثنائي)" },
  { value: "documents", label: "مستندات (استثنائي)" },
] as const;

function bytes(n: number) {
  if (!n) return "0 م.ب";
  const mb = n / 1024 / 1024;
  return mb >= 1024 ? `${(mb / 1024).toFixed(2)} ج.ب` : `${mb.toFixed(1)} م.ب`;
}

function OrganizationsPage() {
  const qc = useQueryClient();
  const { can } = usePlatformAdmin();
  const canUpdate = can("organizations.update");
  const canDelete = can("organizations.delete");
  const canSupport = can("support_access.request");

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "suspended" | "subscribed" | "unsubscribed">("all");
  const [page, setPage] = useState(1);
  const debounced = useDebounced(search, 350);
  const [detail, setDetail] = useState<AdminOrgRow | null>(null);
  const [editForm, setEditForm] = useState<AdminOrgRow | null>(null);
  const [suspendReason, setSuspendReason] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [grantForm, setGrantForm] = useState<{ reason: string; scope: string; hours: number } | null>(null);

  const listFn = useServerFn(listOrganizations);
  const query = useQuery({
    queryKey: ["admin-orgs", debounced, status, page],
    queryFn: () => listFn({ data: { search: debounced, status, page, pageSize: PAGE_SIZE } }),
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin-orgs"] });

  const membersFn = useServerFn(listOrganizationMembers);
  const members = useQuery({
    queryKey: ["admin-org-members", detail?.id],
    enabled: Boolean(detail),
    queryFn: () => membersFn({ data: { organizationId: detail!.id } }),
  });

  const grantsFn = useServerFn(listSupportAccessGrants);
  const grants = useQuery({
    queryKey: ["admin-support-grants", detail?.id],
    enabled: Boolean(detail) && can("audit.read"),
    queryFn: () => grantsFn({ data: { organizationId: detail!.id } }),
  });

  const updateFn = useServerFn(updateOrganization);
  const save = useMutation({
    mutationFn: () =>
      updateFn({
        data: {
          organizationId: editForm!.id,
          name: editForm!.name,
          legal_name: editForm!.legal_name ?? "",
          city: editForm!.city ?? "",
          phone: editForm!.phone ?? "",
          email: editForm!.email ?? "",
          commercial_registration: editForm!.commercial_registration ?? "",
          tax_number: editForm!.tax_number ?? "",
          address: editForm!.address ?? "",
        },
      }),
    onSuccess: () => {
      toast.success("تم تحديث بيانات المكتب.");
      setEditForm(null);
      setDetail(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleFn = useServerFn(setOrganizationActive);
  const toggle = useMutation({
    mutationFn: (v: { active: boolean }) =>
      toggleFn({ data: { organizationId: detail!.id, active: v.active, reason: suspendReason || undefined } }),
    onSuccess: (_r, v) => {
      toast.success(v.active ? "تم إعادة تفعيل المكتب." : "تم إيقاف المكتب.");
      setSuspendReason("");
      setDetail(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteFn = useServerFn(deleteOrganization);
  const remove = useMutation({
    mutationFn: () => deleteFn({ data: { organizationId: detail!.id, confirmName: deleteConfirm } }),
    onSuccess: () => {
      toast.success("تم حذف المكتب.");
      setDeleteConfirm("");
      setDetail(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const requestFn = useServerFn(requestSupportAccess);
  const requestGrant = useMutation({
    mutationFn: () =>
      requestFn({
        data: {
          organizationId: detail!.id,
          reason: grantForm!.reason,
          scope: grantForm!.scope as "cases" | "documents" | "billing" | "technical",
          hours: grantForm!.hours,
        },
      }),
    onSuccess: () => {
      toast.success("تم تسجيل طلب وصول الدعم. لا يُفتح الوصول قبل موافقة المكتب.");
      setGrantForm(null);
      qc.invalidateQueries({ queryKey: ["admin-support-grants"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revokeFn = useServerFn(revokeSupportAccess);
  const revoke = useMutation({
    mutationFn: (grantId: string) => revokeFn({ data: { grantId } }),
    onSuccess: () => {
      toast.success("تم إلغاء المنحة.");
      qc.invalidateQueries({ queryKey: ["admin-support-grants"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = query.data?.rows ?? [];

  return (
    <AdminShell
      title="المكاتب"
      description="إحصاءات عددية فقط لكل مكتب. محتوى القضايا والمستندات غير متاح لهذه اللوحة."
    >
      <PageToolbar
        search={search}
        setSearch={(v) => {
          setSearch(v);
          setPage(1);
        }}
        placeholder="ابحث باسم المكتب أو المدينة…"
        searching={query.isFetching}
        filters={
          <select
            aria-label="تصفية الحالة"
            className={`${inputCls} h-11 w-auto`}
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as typeof status);
              setPage(1);
            }}
          >
            <option value="all">كل المكاتب</option>
            <option value="active">نشطة</option>
            <option value="suspended">موقوفة</option>
            <option value="subscribed">لديها اشتراك نشط</option>
            <option value="unsubscribed">بدون اشتراك</option>
          </select>
        }
      />

      {query.isLoading ? (
        <LoadingBlock rows={8} cols={5} />
      ) : query.isError ? (
        <ErrorBlock message="تعذّر جلب قائمة المكاتب." />
      ) : rows.length === 0 ? (
        <DataCard>
          <EmptyState title="لا توجد مكاتب مطابقة" hint="جرّب تعديل البحث أو التصفية." />
        </DataCard>
      ) : (
        <>
          <DataCard>
            <table className="w-full min-w-[900px] text-right">
              <thead>
                <tr>
                  <Th>المكتب</Th>
                  <Th>المستخدمون</Th>
                  <Th>القضايا</Th>
                  <Th>العملاء</Th>
                  <Th>المستندات</Th>
                  <Th>الاشتراك</Th>
                  <Th className="text-left">إجراءات</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => (
                  <tr key={o.id} className="border-t border-border">
                    <Td>
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{o.name}</p>
                        <p className="truncate text-[12px] text-muted-foreground">
                          {o.city ?? "—"} · انضم {fmtDate(o.created_at)}
                        </p>
                      </div>
                    </Td>
                    <Td>
                      {o.users_count}
                      <span className="text-muted-foreground"> ({o.lawyers_count} محامٍ)</span>
                    </Td>
                    <Td>{o.cases_count}</Td>
                    <Td>{o.clients_count}</Td>
                    <Td>
                      {o.documents_count}
                      <span className="block text-[11px] text-muted-foreground">{bytes(Number(o.storage_bytes))}</span>
                    </Td>
                    <Td>
                      {o.subscription_status === "active" ? (
                        <Badge tone="green">{o.plan_label ?? "نشط"}</Badge>
                      ) : (
                        <Badge tone="muted">لا يوجد</Badge>
                      )}
                      {!o.is_active && (
                        <span className="ms-1.5">
                          <Badge tone="red">موقوف</Badge>
                        </span>
                      )}
                    </Td>
                    <Td className="text-left">
                      <Btn variant="outline" size="sm" onClick={() => setDetail(o)}>
                        <Building2 className="h-4 w-4" aria-hidden /> التفاصيل
                      </Btn>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DataCard>
          <Pagination page={page} setPage={setPage} total={query.data?.total ?? 0} pageSize={PAGE_SIZE} />
        </>
      )}

      {/* تفاصيل المكتب */}
      <Modal open={Boolean(detail) && !editForm} onClose={() => setDetail(null)} title={detail?.name ?? ""} size="lg">
        {detail && (
          <div className="space-y-6">
            <dl className="grid gap-4 sm:grid-cols-3">
              <Info label="المستخدمون" value={String(detail.users_count)} />
              <Info label="القضايا" value={String(detail.cases_count)} />
              <Info label="العملاء" value={String(detail.clients_count)} />
              <Info label="المستندات" value={String(detail.documents_count)} />
              <Info label="التخزين" value={bytes(Number(detail.storage_bytes))} />
              <Info label="الحالة" value={detail.is_active ? "نشط" : "موقوف"} />
              <Info label="السجل التجاري" value={detail.commercial_registration ?? "—"} />
              <Info label="الرقم الضريبي" value={detail.tax_number ?? "—"} />
              <Info label="المدينة" value={detail.city ?? "—"} />
              <Info label="الجوال" value={detail.phone ?? "—"} />
              <Info label="البريد" value={detail.email ?? "—"} />
              <Info
                label="الاشتراك"
                value={
                  detail.subscription_status === "active"
                    ? `${detail.plan_label ?? "نشط"} حتى ${detail.subscription_ends_at ? fmtDate(detail.subscription_ends_at) : "—"}`
                    : "لا يوجد اشتراك نشط"
                }
              />
            </dl>

            <div>
              <h4 className="text-label mb-2">أعضاء المكتب</h4>
              {members.isLoading ? (
                <LoadingBlock rows={3} cols={2} />
              ) : (
                <ul className="divide-y divide-border rounded-[var(--radius-m)] border border-border">
                  {(members.data?.members ?? []).map((m) => (
                    <li key={m.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-body-sm font-medium">{m.profiles?.full_name ?? "—"}</p>
                        <p className="truncate text-[12px] text-muted-foreground">{m.profiles?.email ?? "—"}</p>
                      </div>
                      <Badge tone={m.status === "active" ? "green" : "muted"}>
                        {ROLE_LABELS[m.role] ?? m.role}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {can("audit.read") && (
              <div>
                <h4 className="text-label mb-2 flex items-center gap-2">
                  <ShieldQuestion className="h-4 w-4 text-muted-foreground" aria-hidden /> منح وصول الدعم
                </h4>
                {(grants.data?.grants.length ?? 0) === 0 ? (
                  <p className="text-body-sm text-muted-foreground">لا توجد منح وصول لهذا المكتب.</p>
                ) : (
                  <ul className="space-y-2">
                    {grants.data!.grants.map((g) => (
                      <li
                        key={g.id}
                        className="rounded-[var(--radius-m)] border border-border p-3 text-body-sm"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-medium">{g.staff_email}</span>
                          <Badge tone={g.status === "approved" ? "green" : g.status === "pending" ? "warn" : "muted"}>
                            {g.status === "approved" ? "مفعّلة" : g.status === "pending" ? "بانتظار موافقة المكتب" : "منتهية/ملغاة"}
                          </Badge>
                        </div>
                        <p className="mt-1 text-muted-foreground">{g.reason}</p>
                        <p className="text-caption mt-1">
                          طُلبت {fmtDateTime(g.requested_at)} · تنتهي {fmtDateTime(g.expires_at)}
                        </p>
                        {canSupport && g.status !== "revoked" && (
                          <Btn variant="outline" size="sm" className="mt-2" onClick={() => revoke.mutate(g.id)}>
                            إلغاء المنحة
                          </Btn>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {canSupport && (
                  <Btn
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() => setGrantForm({ reason: "", scope: "technical", hours: 4 })}
                  >
                    طلب وصول دعم مؤقت
                  </Btn>
                )}
              </div>
            )}

            {canUpdate && (
              <div className="space-y-3 border-t border-border pt-5">
                <div className="flex flex-wrap gap-2">
                  <Btn variant="outline" onClick={() => setEditForm(detail)}>
                    تعديل بيانات المكتب
                  </Btn>
                  {detail.is_active ? (
                    <Btn variant="danger" loading={toggle.isPending} onClick={() => toggle.mutate({ active: false })}>
                      إيقاف المكتب
                    </Btn>
                  ) : (
                    <Btn loading={toggle.isPending} onClick={() => toggle.mutate({ active: true })}>
                      إعادة التفعيل
                    </Btn>
                  )}
                </div>
                {detail.is_active && (
                  <FormField label="سبب الإيقاف (يُسجَّل في سجل التدقيق)">
                    <input
                      className={inputCls}
                      value={suspendReason}
                      onChange={(e) => setSuspendReason(e.target.value)}
                      placeholder="مثال: عدم سداد الاشتراك"
                      maxLength={300}
                    />
                  </FormField>
                )}
                {canDelete && (
                  <div className="rounded-[var(--radius-m)] border border-danger/30 bg-danger-soft/40 p-3">
                    <p className="text-body-sm font-semibold text-danger">حذف المكتب نهائياً</p>
                    <p className="text-caption mt-1">
                      اكتب اسم المكتب بدقة للتأكيد. تُحذف جميع بيانات المكتب ولا يمكن التراجع.
                    </p>
                    <input
                      className={`${inputCls} mt-2`}
                      value={deleteConfirm}
                      onChange={(e) => setDeleteConfirm(e.target.value)}
                      placeholder={detail.name}
                    />
                    <Btn
                      variant="danger"
                      size="sm"
                      className="mt-2"
                      loading={remove.isPending}
                      disabled={deleteConfirm.trim() !== detail.name.trim()}
                      onClick={() => remove.mutate()}
                    >
                      حذف المكتب
                    </Btn>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* تعديل بيانات المكتب */}
      <Modal open={Boolean(editForm)} onClose={() => setEditForm(null)} title="تعديل بيانات المكتب" size="lg">
        {editForm && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="اسم المكتب" required>
                <input
                  className={inputCls}
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  required
                />
              </FormField>
              <FormField label="الاسم النظامي">
                <input
                  className={inputCls}
                  value={editForm.legal_name ?? ""}
                  onChange={(e) => setEditForm({ ...editForm, legal_name: e.target.value })}
                />
              </FormField>
              <FormField label="المدينة">
                <input
                  className={inputCls}
                  value={editForm.city ?? ""}
                  onChange={(e) => setEditForm({ ...editForm, city: e.target.value })}
                />
              </FormField>
              <FormField label="الجوال">
                <input
                  className={inputCls}
                  value={editForm.phone ?? ""}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                />
              </FormField>
              <FormField label="البريد الرسمي">
                <input
                  className={inputCls}
                  value={editForm.email ?? ""}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                />
              </FormField>
              <FormField label="السجل التجاري">
                <input
                  className={inputCls}
                  value={editForm.commercial_registration ?? ""}
                  onChange={(e) => setEditForm({ ...editForm, commercial_registration: e.target.value })}
                />
              </FormField>
              <FormField label="الرقم الضريبي">
                <input
                  className={inputCls}
                  value={editForm.tax_number ?? ""}
                  onChange={(e) => setEditForm({ ...editForm, tax_number: e.target.value })}
                />
              </FormField>
              <FormField label="العنوان">
                <input
                  className={inputCls}
                  value={editForm.address ?? ""}
                  onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                />
              </FormField>
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Btn variant="outline" onClick={() => setEditForm(null)}>
                إلغاء
              </Btn>
              <Btn type="submit" loading={save.isPending}>
                حفظ التعديلات
              </Btn>
            </div>
          </form>
        )}
      </Modal>

      {/* طلب وصول دعم */}
      <Modal
        open={Boolean(grantForm)}
        onClose={() => setGrantForm(null)}
        title="طلب وصول دعم مؤقت"
        description="لا يُفتح أي وصول قبل موافقة المكتب، وينتهي تلقائياً بانتهاء المدة."
      >
        {grantForm && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              requestGrant.mutate();
            }}
          >
            <FormField label="نطاق الوصول" required>
              <select
                className={inputCls}
                value={grantForm.scope}
                onChange={(e) => setGrantForm({ ...grantForm, scope: e.target.value })}
              >
                {SCOPES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="المدة (ساعات)" required>
              <input
                type="number"
                min={1}
                max={72}
                className={inputCls}
                value={grantForm.hours}
                onChange={(e) => setGrantForm({ ...grantForm, hours: Number(e.target.value) })}
              />
            </FormField>
            <FormField label="سبب الطلب" required hint="يُسجَّل في سجل التدقيق ويُعرض على المكتب.">
              <textarea
                className={`${inputCls} min-h-24`}
                value={grantForm.reason}
                onChange={(e) => setGrantForm({ ...grantForm, reason: e.target.value })}
                maxLength={500}
                required
              />
            </FormField>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Btn variant="outline" onClick={() => setGrantForm(null)}>
                إلغاء
              </Btn>
              <Btn type="submit" loading={requestGrant.isPending} disabled={grantForm.reason.trim().length < 10}>
                إرسال الطلب
              </Btn>
            </div>
          </form>
        )}
      </Modal>
    </AdminShell>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-caption">{label}</dt>
      <dd className="mt-0.5 text-body-sm font-medium">{value}</dd>
    </div>
  );
}
