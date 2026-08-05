import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { KeyRound, MailCheck, MoreHorizontal, StickyNote } from "lucide-react";
import { AdminShell } from "@/components/admin/shell";
import {
  Badge,
  Btn,
  ConfirmDialog,
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
  addUserNote,
  deletePlatformUser,
  listPlatformUsers,
  listUserNotes,
  resendUserVerification,
  sendUserPasswordReset,
  setUserActive,
  type AdminUserRow,
} from "@/lib/admin-users.functions";

export const Route = createFileRoute("/mehla-admin/users")({
  head: () => ({
    meta: [{ title: "المستخدمون · إدارة مِهلة" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: UsersPage,
});

const STATUS_FILTERS = [
  { value: "all", label: "كل المستخدمين" },
  { value: "active", label: "الحسابات النشطة" },
  { value: "suspended", label: "الحسابات الموقوفة" },
  { value: "subscribed", label: "لديهم اشتراك نشط" },
  { value: "unsubscribed", label: "بدون اشتراك" },
  { value: "no_org", label: "بدون مكتب" },
] as const;

const PAGE_SIZE = 20;

function UsersPage() {
  const qc = useQueryClient();
  const { can } = usePlatformAdmin();
  const canUpdate = can("users.update");
  const canDelete = can("users.delete");

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<(typeof STATUS_FILTERS)[number]["value"]>("all");
  const [sort, setSort] = useState<"created_desc" | "created_asc" | "name_asc">("created_desc");
  const [page, setPage] = useState(1);
  const debounced = useDebounced(search, 350);

  const [detail, setDetail] = useState<AdminUserRow | null>(null);
  const [toDelete, setToDelete] = useState<AdminUserRow | null>(null);
  const [noteBody, setNoteBody] = useState("");

  const listFn = useServerFn(listPlatformUsers);
  const query = useQuery({
    queryKey: ["admin-users", debounced, status, sort, page],
    queryFn: () => listFn({ data: { search: debounced, status, sort, page, pageSize: PAGE_SIZE } }),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin-users"] });

  const toggleFn = useServerFn(setUserActive);
  const toggle = useMutation({
    mutationFn: (v: { userId: string; active: boolean }) => toggleFn({ data: v }),
    onSuccess: (_r, v) => {
      toast.success(v.active ? "تم تفعيل الحساب." : "تم إيقاف الحساب.");
      invalidate();
      setDetail(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteFn = useServerFn(deletePlatformUser);
  const remove = useMutation({
    mutationFn: (userId: string) => deleteFn({ data: { userId } }),
    onSuccess: () => {
      toast.success("تم حذف الحساب نهائياً.");
      setToDelete(null);
      setDetail(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resetFn = useServerFn(sendUserPasswordReset);
  const reset = useMutation({
    mutationFn: (v: { userId: string; email: string }) => resetFn({ data: v }),
    onSuccess: () => toast.success("تم إرسال رابط إعادة تعيين كلمة المرور."),
    onError: (e: Error) => toast.error(e.message),
  });

  const verifyFn = useServerFn(resendUserVerification);
  const verify = useMutation({
    mutationFn: (v: { userId: string; email: string }) => verifyFn({ data: v }),
    onSuccess: (r) =>
      toast.success(r.alreadyConfirmed ? "البريد مُفعّل مسبقاً." : "تم إرسال رابط التفعيل."),
    onError: (e: Error) => toast.error(e.message),
  });

  const notesFn = useServerFn(listUserNotes);
  const notes = useQuery({
    queryKey: ["admin-user-notes", detail?.id],
    enabled: Boolean(detail),
    queryFn: () => notesFn({ data: { userId: detail!.id } }),
  });

  const addNoteFn = useServerFn(addUserNote);
  const addNote = useMutation({
    mutationFn: () =>
      addNoteFn({ data: { userId: detail!.id, userEmail: detail!.email ?? "", body: noteBody } }),
    onSuccess: () => {
      setNoteBody("");
      toast.success("تم حفظ الملاحظة.");
      qc.invalidateQueries({ queryKey: ["admin-user-notes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = query.data?.rows ?? [];

  return (
    <AdminShell
      title="المستخدمون"
      description="حسابات المشتركين وحالة تفعيلها واشتراكاتها — دون أي وصول لبيانات القضايا."
    >
      <PageToolbar
        search={search}
        setSearch={(v) => {
          setSearch(v);
          setPage(1);
        }}
        placeholder="ابحث بالاسم أو البريد أو المكتب…"
        searching={query.isFetching}
        filters={
          <>
            <select
              aria-label="تصفية الحالة"
              className={`${inputCls} h-11 w-auto`}
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as typeof status);
                setPage(1);
              }}
            >
              {STATUS_FILTERS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
            <select
              aria-label="الترتيب"
              className={`${inputCls} h-11 w-auto`}
              value={sort}
              onChange={(e) => setSort(e.target.value as typeof sort)}
            >
              <option value="created_desc">الأحدث تسجيلاً</option>
              <option value="created_asc">الأقدم تسجيلاً</option>
              <option value="name_asc">الاسم أبجدياً</option>
            </select>
          </>
        }
      />

      {query.isLoading ? (
        <LoadingBlock rows={8} cols={5} />
      ) : query.isError ? (
        <ErrorBlock message="تعذّر جلب قائمة المستخدمين. حدّث الصفحة أو تحقّق من صلاحياتك." />
      ) : rows.length === 0 ? (
        <DataCard>
          <EmptyState title="لا يوجد مستخدمون مطابقون" hint="جرّب تعديل البحث أو التصفية." />
        </DataCard>
      ) : (
        <>
          <DataCard>
            <table className="w-full min-w-[860px] text-right">
              <thead>
                <tr>
                  <Th>المستخدم</Th>
                  <Th>المكتب</Th>
                  <Th>الاشتراك</Th>
                  <Th>الحالة</Th>
                  <Th>آخر دخول</Th>
                  <Th className="text-left">إجراءات</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => (
                  <tr key={u.id} className="border-t border-border">
                    <Td>
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{u.full_name}</p>
                        <p className="truncate text-[12px] text-muted-foreground">
                          {u.email ?? "—"}
                        </p>
                      </div>
                    </Td>
                    <Td>
                      {u.organization_name ? (
                        <span className="text-[13px]">
                          {u.organization_name}
                          <span className="text-muted-foreground">
                            {" "}
                            · {u.org_member_count} أعضاء
                          </span>
                        </span>
                      ) : (
                        <Badge tone="muted">بدون مكتب</Badge>
                      )}
                    </Td>
                    <Td>
                      {u.subscription_status === "active" ? (
                        <span className="inline-flex flex-col">
                          <Badge tone="green">{u.plan_label ?? "نشط"}</Badge>
                          <span className="mt-1 text-[11px] text-muted-foreground">
                            حتى {u.subscription_ends_at ? fmtDate(u.subscription_ends_at) : "—"}
                          </span>
                        </span>
                      ) : (
                        <Badge tone="muted">لا يوجد</Badge>
                      )}
                    </Td>
                    <Td>
                      <div className="flex flex-wrap gap-1.5">
                        {u.is_active ? (
                          <Badge tone="green">نشط</Badge>
                        ) : (
                          <Badge tone="red">موقوف</Badge>
                        )}
                        {!u.email_confirmed && <Badge tone="warn">بريد غير مُفعّل</Badge>}
                        {u.is_platform_staff && <Badge tone="info">فريق المنصة</Badge>}
                      </div>
                    </Td>
                    <Td>
                      <span className="text-[12px] text-muted-foreground">
                        {u.last_sign_in_at ? fmtDateTime(u.last_sign_in_at) : "لم يسجّل الدخول"}
                      </span>
                    </Td>
                    <Td className="text-left">
                      <Btn variant="outline" size="sm" onClick={() => setDetail(u)}>
                        <MoreHorizontal className="h-4 w-4" aria-hidden /> التفاصيل
                      </Btn>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DataCard>
          <Pagination
            page={page}
            setPage={setPage}
            total={query.data?.total ?? 0}
            pageSize={PAGE_SIZE}
          />
        </>
      )}

      <Modal
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={detail?.full_name ?? ""}
        description={detail?.email ?? undefined}
        size="lg"
      >
        {detail && (
          <div className="space-y-6">
            <dl className="grid gap-4 sm:grid-cols-2">
              <Info label="تاريخ التسجيل" value={fmtDate(detail.created_at)} />
              <Info label="الجوال" value={detail.phone ?? "—"} />
              <Info label="المكتب" value={detail.organization_name ?? "بدون مكتب"} />
              <Info label="عدد أعضاء المكتب" value={String(detail.org_member_count ?? 0)} />
              <Info label="الباقة" value={detail.plan_label ?? "لا يوجد اشتراك"} />
              <Info
                label="نهاية الاشتراك"
                value={detail.subscription_ends_at ? fmtDate(detail.subscription_ends_at) : "—"}
              />
              <Info
                label="آخر دخول"
                value={detail.last_sign_in_at ? fmtDateTime(detail.last_sign_in_at) : "—"}
              />
              <Info label="تفعيل البريد" value={detail.email_confirmed ? "مُفعّل" : "غير مُفعّل"} />
            </dl>

            {canUpdate && (
              <div className="flex flex-wrap gap-2 border-t border-border pt-5">
                <Btn
                  variant={detail.is_active ? "outline" : "primary"}
                  loading={toggle.isPending}
                  onClick={() => toggle.mutate({ userId: detail.id, active: !detail.is_active })}
                >
                  {detail.is_active ? "إيقاف الحساب" : "تفعيل الحساب"}
                </Btn>
                <Btn
                  variant="outline"
                  loading={reset.isPending}
                  onClick={() => reset.mutate({ userId: detail.id, email: detail.email ?? "" })}
                  disabled={!detail.email}
                >
                  <KeyRound className="h-4 w-4" aria-hidden /> إعادة تعيين كلمة المرور
                </Btn>
                {!detail.email_confirmed && (
                  <Btn
                    variant="outline"
                    loading={verify.isPending}
                    onClick={() => verify.mutate({ userId: detail.id, email: detail.email ?? "" })}
                    disabled={!detail.email}
                  >
                    <MailCheck className="h-4 w-4" aria-hidden /> إعادة إرسال التفعيل
                  </Btn>
                )}
                {canDelete && !detail.is_platform_staff && (
                  <Btn variant="danger" onClick={() => setToDelete(detail)}>
                    حذف الحساب
                  </Btn>
                )}
              </div>
            )}

            <div className="border-t border-border pt-5">
              <h4 className="text-label mb-3 flex items-center gap-2">
                <StickyNote className="h-4 w-4 text-muted-foreground" aria-hidden /> ملاحظات داخلية
              </h4>
              {canUpdate && (
                <div className="mb-4 space-y-2">
                  <FormField label="ملاحظة جديدة">
                    <textarea
                      className={`${inputCls} min-h-20`}
                      value={noteBody}
                      onChange={(e) => setNoteBody(e.target.value)}
                      placeholder="سياق تشغيلي يساعد فريق الدعم…"
                      maxLength={2000}
                    />
                  </FormField>
                  <Btn
                    size="sm"
                    loading={addNote.isPending}
                    disabled={noteBody.trim().length < 2}
                    onClick={() => addNote.mutate()}
                  >
                    حفظ الملاحظة
                  </Btn>
                </div>
              )}
              {notes.isLoading ? (
                <LoadingBlock rows={2} cols={1} />
              ) : (notes.data?.notes.length ?? 0) === 0 ? (
                <p className="text-body-sm text-muted-foreground">
                  لا توجد ملاحظات على هذا الحساب.
                </p>
              ) : (
                <ul className="space-y-3">
                  {notes.data!.notes.map((n) => (
                    <li
                      key={n.id}
                      className="rounded-[var(--radius-m)] border border-border bg-surface-muted p-3"
                    >
                      <p className="text-body-sm whitespace-pre-wrap">{n.body}</p>
                      <p className="text-caption mt-1.5">
                        {n.author_name} · {fmtDateTime(n.created_at)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(toDelete)}
        onClose={() => setToDelete(null)}
        onConfirm={() => toDelete && remove.mutate(toDelete.id)}
        title="حذف الحساب نهائياً"
        message={`سيتم حذف حساب ${toDelete?.email ?? ""} نهائياً ولا يمكن التراجع. بيانات المكتب المرتبطة لا تُحذف بهذه العملية.`}
        loading={remove.isPending}
      />
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
