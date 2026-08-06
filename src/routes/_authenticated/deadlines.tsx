import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import type { Tables, Enums, TablesInsert } from "@/integrations/supabase/types";
import { z } from "zod";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { DashboardShell } from "@/components/dashboard/shell";
import { supabase } from "@/integrations/supabase/client";
import { track } from "@/lib/product-analytics";
import { useAuth, canEdit, canManage } from "@/hooks/use-auth";
import {
  DEADLINE_STATUS,
  DEADLINE_TYPE,
  CASE_PRIORITY,
  asOptions,
  fmtDate,
  daysUntil,
} from "@/lib/enums";
import {
  PageToolbar,
  EmptyState,
  LoadingBlock,
  ErrorBlock,
  DataCard,
  Th,
  Td,
  BusyOverlay,
  IconBtn,
  Modal,
  FormField,
  inputCls,
  Btn,
  Badge,
  useDebounced,
  ConfirmDialog,
  Pagination,
} from "@/lib/list-utils";
import { Pencil, Trash2, Check } from "lucide-react";
import { useDialogDraft } from "@/lib/drafts/use-dialog-draft";
import { DraftPrompt, DraftStatus } from "@/lib/drafts/draft-ui";

export const Route = createFileRoute("/_authenticated/deadlines")({
  component: Page,
  head: () => ({
    meta: [
      { title: "المهل النظامية | مِهلة" },
      {
        name: "description",
        content: "متابعة المهل النظامية والاعتراضات ومواعيد التقديم قبل انقضائها.",
      },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "المهل النظامية | مِهلة" },
      {
        property: "og:description",
        content: "متابعة المهل النظامية والاعتراضات ومواعيد التقديم قبل انقضائها.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const PAGE_SIZE = 20;

const schema = z.object({
  case_id: z.string().uuid().optional().nullable(),
  title: z.string().trim().min(2, "العنوان مطلوب").max(200),
  deadline_type: z.enum([
    "objection",
    "appeal",
    "response",
    "submission",
    "execution",
    "expert_report",
    "document_request",
    "custom",
  ]),
  due_date: z.string().min(1, "التاريخ مطلوب"),
  status: z.enum(["active", "completed", "cancelled", "overdue"]),
  priority: z.enum(["low", "medium", "high", "urgent"]),
  responsible_user_id: z.string().uuid().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});
type Form = z.infer<typeof schema>;

type DeadlineRow = Tables<"deadlines"> & {
  case?: { case_title: string; case_number: string | null } | null;
};

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function Page() {
  const { activeOrgId, activeRole, user } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [type, setType] = useState("all");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<DeadlineRow | null>(null);
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState<DeadlineRow | null>(null);
  const q = useDebounced(search);

  const { data, isLoading, isFetching, error } = useQuery({
    placeholderData: keepPreviousData,
    queryKey: ["deadlines", activeOrgId, q, status, type, page],
    enabled: !!activeOrgId,
    queryFn: async () => {
      let query = supabase
        .from("deadlines")
        .select("*, case:cases(case_title, case_number)", { count: "exact" })
        .eq("organization_id", activeOrgId!)
        .order("due_date", { ascending: true })
        .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
      if (q) query = query.ilike("title", `%${q}%`);
      if (status !== "all") query = query.eq("status", status as Enums<"deadline_status">);
      if (type !== "all") query = query.eq("deadline_type", type as Enums<"deadline_type">);
      const { data, error, count } = await query;
      if (error) throw error;
      return { rows: data ?? [], count: count ?? 0 };
    },
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("deadlines").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم الحذف");
      qc.invalidateQueries({ queryKey: ["deadlines"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      setDeleting(null);
    },
    onError: (e: unknown) => toast.error("تعذّر الحذف", { description: errMsg(e) }),
  });

  const complete = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("deadlines")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم الإنجاز");
      qc.invalidateQueries({ queryKey: ["deadlines"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
  });

  return (
    <DashboardShell title="المهل">
      <PageToolbar
        searching={isFetching && !isLoading}
        search={search}
        setSearch={(v) => {
          setSearch(v);
          setPage(1);
        }}
        canAdd={canEdit(activeRole)}
        onAdd={() => {
          setEditing(null);
          setOpen(true);
        }}
        addLabel="مهلة جديدة"
        filters={
          <>
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
              className={inputCls + " max-w-[140px]"}
            >
              <option value="all">كل الحالات</option>
              {asOptions(DEADLINE_STATUS).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <select
              value={type}
              onChange={(e) => {
                setType(e.target.value);
                setPage(1);
              }}
              className={inputCls + " max-w-[160px]"}
            >
              <option value="all">كل الأنواع</option>
              {asOptions(DEADLINE_TYPE).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </>
        }
      />
      {isLoading ? (
        <LoadingBlock />
      ) : error ? (
        <ErrorBlock message={errMsg(error)} />
      ) : !data?.rows.length ? (
        <EmptyState
          title="لا توجد مهل"
          hint="أضف أول مهلة قانونية"
          action={
            canEdit(activeRole) && (
              <Btn
                onClick={() => {
                  setEditing(null);
                  setOpen(true);
                }}
              >
                إضافة مهلة
              </Btn>
            )
          }
        />
      ) : (
        <>
          <BusyOverlay busy={isFetching && !isLoading}>
            <DataCard>
              <table className="min-w-full">
                <thead className="bg-surface-muted/60">
                  <tr>
                    <Th>العنوان</Th>
                    <Th>القضية</Th>
                    <Th>النوع</Th>
                    <Th>الاستحقاق</Th>
                    <Th>الأيام المتبقية</Th>
                    <Th>الحالة</Th>
                    <Th>الأولوية</Th>
                    <Th> </Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.rows.map((d: DeadlineRow) => {
                    const days = daysUntil(d.due_date);
                    const isOverdue = d.status === "active" && days !== null && days < 0;
                    const isSoon = d.status === "active" && days !== null && days >= 0 && days <= 3;
                    return (
                      <tr
                        key={d.id}
                        className={`hover:bg-surface-muted/40 ${isOverdue ? "bg-danger-soft/40" : isSoon ? "bg-warning-soft/40" : ""}`}
                      >
                        <Td className="font-medium">{d.title}</Td>
                        <Td>{d.case?.case_title ?? "—"}</Td>
                        <Td>{DEADLINE_TYPE[d.deadline_type] ?? d.deadline_type}</Td>
                        <Td>{fmtDate(d.due_date)}</Td>
                        <Td>
                          {days === null ? (
                            "—"
                          ) : (
                            <Badge tone={isOverdue ? "red" : isSoon ? "warn" : "muted"}>
                              {isOverdue
                                ? `متأخرة بـ ${Math.abs(days)} يوم`
                                : days === 0
                                  ? "اليوم"
                                  : `${days} يوم`}
                            </Badge>
                          )}
                        </Td>
                        <Td>
                          <Badge
                            tone={
                              d.status === "overdue"
                                ? "red"
                                : d.status === "completed"
                                  ? "green"
                                  : d.status === "cancelled"
                                    ? "muted"
                                    : "default"
                            }
                          >
                            {DEADLINE_STATUS[d.status]}
                          </Badge>
                        </Td>
                        <Td>
                          <Badge
                            tone={
                              d.priority === "urgent"
                                ? "red"
                                : d.priority === "high"
                                  ? "warn"
                                  : "muted"
                            }
                          >
                            {CASE_PRIORITY[d.priority]}
                          </Badge>
                        </Td>
                        <Td>
                          <div className="flex justify-end gap-1">
                            {canEdit(activeRole) && d.status === "active" && (
                              <button
                                onClick={() => complete.mutate(d.id)}
                                className="rounded-lg p-1.5 text-foreground hover:bg-primary-soft"
                                title="إنجاز"
                              >
                                <Check className="h-4 w-4" />
                              </button>
                            )}
                            {canEdit(activeRole) && (
                              <button
                                onClick={() => {
                                  setEditing(d);
                                  setOpen(true);
                                }}
                                className="rounded-lg p-1.5 hover:bg-surface-muted"
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                            )}
                            {canManage(activeRole) && (
                              <IconBtn
                                tone="danger"
                                aria-label="حذف"
                                title="حذف"
                                loading={del.isPending && deleting?.id === d.id}
                                onClick={() => setDeleting(d)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </IconBtn>
                            )}
                          </div>
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </DataCard>
          </BusyOverlay>
          <Pagination page={page} setPage={setPage} total={data.count} pageSize={PAGE_SIZE} />
        </>
      )}
      <DeadlineDialog
        open={open}
        onClose={() => setOpen(false)}
        editing={editing}
        orgId={activeOrgId!}
        userId={user?.id}
      />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && del.mutate(deleting.id)}
        loading={del.isPending}
        title="حذف المهلة"
        message={`سيتم حذف "${deleting?.title}".`}
      />
    </DashboardShell>
  );
}

function DeadlineDialog({
  open,
  onClose,
  editing,
  orgId,
  userId,
}: {
  open: boolean;
  onClose: () => void;
  editing: DeadlineRow | null;
  orgId: string;
  userId?: string;
}) {
  const qc = useQueryClient();
  const { activeOrgId } = useAuth();
  const [form, setForm] = useState<Partial<Form>>({});
  const draft = useDialogDraft<Form>({
    name: "deadlines",
    open,
    isNew: !editing,
    userKey: activeOrgId ?? "anon",
    form,
    setForm,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const key = editing?.id ?? "new";
  const [k, setK] = useState(key);

  const { data: cases, isLoading: loadingCases } = useQuery({
    queryKey: ["cases-basic", activeOrgId],
    enabled: !!activeOrgId && open,
    queryFn: async () =>
      (
        await supabase
          .from("cases")
          .select("id, case_title, case_number")
          .eq("organization_id", activeOrgId!)
          .order("last_activity_at", { ascending: false })
      ).data ?? [],
  });
  const { data: members, isLoading: loadingMembers } = useQuery({
    queryKey: ["members-basic", activeOrgId],
    enabled: !!activeOrgId && open,
    queryFn: async () => {
      const { data } = await supabase
        .from("organization_members")
        .select("user_id, profile:profiles(full_name)")
        .eq("organization_id", activeOrgId!)
        .eq("status", "active");
      return (data ?? []).map((m) => ({ id: m.user_id, name: m.profile?.full_name ?? "—" }));
    },
  });

  if (open && k !== key) {
    setK(key);
    setErrors({});
    setForm(
      editing
        ? { ...editing, due_date: editing.due_date?.slice(0, 16) }
        : { status: "active", priority: "medium", deadline_type: "custom" },
    );
  }

  const save = async () => {
    const res = schema.safeParse({
      ...form,
      status: form.status ?? "active",
      priority: form.priority ?? "medium",
      deadline_type: form.deadline_type ?? "custom",
    });
    if (!res.success) {
      const errs: Record<string, string> = {};
      res.error.issues.forEach((i) => {
        errs[i.path[0] as string] = i.message;
      });
      setErrors(errs);
      toast.error("تحقق من الحقول المطلوبة", { description: Object.values(errs)[0] as string });
      return;
    }
    setSaving(true);
    const payload: Record<string, unknown> = {
      ...res.data,
      due_date: new Date(res.data.due_date).toISOString(),
    };
    Object.keys(payload).forEach((k) => {
      if (payload[k] === "") payload[k] = null;
    });
    const q = editing
      ? supabase
          .from("deadlines")
          .update(payload as Partial<TablesInsert<"deadlines">>)
          .eq("id", editing.id)
      : supabase.from("deadlines").insert({
          ...(payload as Partial<TablesInsert<"deadlines">>),
          organization_id: orgId,
          created_by: userId,
        } as TablesInsert<"deadlines">);
    const { error } = await q;
    setSaving(false);
    if (error) return toast.error("تعذّر الحفظ", { description: error.message });
    toast.success(editing ? "تم التحديث" : "تمت الإضافة");
    draft.clear();
    qc.invalidateQueries({ queryKey: ["deadlines"] });
    qc.invalidateQueries({ queryKey: ["case-deadlines"] });
    qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? "تعديل مهلة" : "مهلة جديدة"}
      size="lg"
      busy={loadingCases || loadingMembers}
      busyLabel="جاري تجهيز النموذج…"
    >
      <DraftPrompt draft={draft as never} />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <FormField label="العنوان *">
            <input
              value={form.title ?? ""}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className={inputCls}
            />
            {errors.title && <span className="text-xs text-danger">{errors.title}</span>}
          </FormField>
        </div>
        <FormField label="النوع *">
          <select
            value={form.deadline_type ?? "custom"}
            onChange={(e) =>
              setForm({ ...form, deadline_type: e.target.value as Enums<"deadline_type"> })
            }
            className={inputCls}
          >
            {asOptions(DEADLINE_TYPE).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="القضية">
          <select
            value={form.case_id ?? ""}
            onChange={(e) => setForm({ ...form, case_id: e.target.value || null })}
            className={inputCls}
          >
            <option value="">— بدون —</option>
            {(cases ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.case_title}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="تاريخ الاستحقاق *">
          <input
            type="datetime-local"
            value={form.due_date ?? ""}
            onChange={(e) => setForm({ ...form, due_date: e.target.value })}
            className={inputCls}
          />
          {errors.due_date && <span className="text-xs text-danger">{errors.due_date}</span>}
        </FormField>
        <FormField label="الحالة *">
          <select
            value={form.status ?? "active"}
            onChange={(e) =>
              setForm({ ...form, status: e.target.value as Enums<"deadline_status"> })
            }
            className={inputCls}
          >
            {asOptions(DEADLINE_STATUS).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="الأولوية *">
          <select
            value={form.priority ?? "medium"}
            onChange={(e) =>
              setForm({ ...form, priority: e.target.value as Enums<"case_priority"> })
            }
            className={inputCls}
          >
            {asOptions(CASE_PRIORITY).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="المسؤول">
          <select
            value={form.responsible_user_id ?? ""}
            onChange={(e) => setForm({ ...form, responsible_user_id: e.target.value || null })}
            className={inputCls}
          >
            <option value="">—</option>
            {(members ?? []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </FormField>
        <div className="md:col-span-2">
          <FormField label="ملاحظات">
            <textarea
              rows={2}
              value={form.notes ?? ""}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className={inputCls}
            />
          </FormField>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
        <div className="me-auto">
          <DraftStatus draft={draft as never} />
        </div>
        <Btn variant="outline" onClick={onClose} disabled={saving}>
          إلغاء
        </Btn>
        <Btn onClick={save} loading={saving}>
          {saving ? "جاري الحفظ…" : "حفظ"}
        </Btn>
      </div>
    </Modal>
  );
}
