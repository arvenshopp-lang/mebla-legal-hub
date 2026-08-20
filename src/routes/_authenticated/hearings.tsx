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
import { useHashCreate } from "@/hooks/use-hash-create";
import { HEARING_STATUS, asOptions, fmtDateTime } from "@/lib/enums";
import { RIYADH_TZ_HINT, isoToRiyadhLocalInput, riyadhLocalToIso } from "@/lib/format";
import { FIELD_LIMITS, optionalHttpsUrlSchema } from "@/lib/form-limits";
import {
  PageToolbar,
  EmptyState,
  LoadingBlock,
  ErrorBlock,
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
  sanitizeSearchTerm,
} from "@/lib/list-utils";
import { DataView, type Column } from "@/components/data/data-view";
import { Pencil, Trash2 } from "lucide-react";
import { useDialogDraft } from "@/lib/drafts/use-dialog-draft";
import { DraftPrompt, DraftStatus } from "@/lib/drafts/draft-ui";

export const Route = createFileRoute("/_authenticated/hearings")({
  component: Page,
  head: () => ({
    meta: [
      { title: "الجلسات | مِهلة" },
      {
        name: "description",
        content: "جدول جلسات المحاكم مع المحكمة والدائرة وحالة الجلسة ونتائجها.",
      },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "الجلسات | مِهلة" },
      {
        property: "og:description",
        content: "جدول جلسات المحاكم مع المحكمة والدائرة وحالة الجلسة ونتائجها.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const PAGE_SIZE = 20;

const schema = z.object({
  case_id: z.string().uuid("اختر القضية"),
  title: z.string().trim().min(2, "العنوان مطلوب").max(FIELD_LIMITS.title),
  hearing_date: z.string().min(1, "التاريخ مطلوب"),
  court_name: z.string().max(FIELD_LIMITS.court).optional().nullable(),
  judicial_circuit: z.string().max(FIELD_LIMITS.shortText).optional().nullable(),
  hearing_type: z.string().max(FIELD_LIMITS.shortText).optional().nullable(),
  location: z.string().max(FIELD_LIMITS.location).optional().nullable(),
  remote_link: optionalHttpsUrlSchema,
  status: z.enum(["scheduled", "completed", "postponed", "cancelled", "missed"]),
  result: z.string().max(FIELD_LIMITS.result).optional().nullable(),
  notes: z.string().max(FIELD_LIMITS.notes).optional().nullable(),
});
type Form = z.infer<typeof schema>;

type HearingRow = Tables<"hearings"> & {
  case?: {
    id: string;
    case_title: string;
    case_number: string | null;
    client?: { full_name: string } | null;
  } | null;
};

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function Page() {
  const { activeOrgId, activeRole, user } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [when, setWhen] = useState<"all" | "upcoming" | "past">("upcoming");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<HearingRow | null>(null);
  const [open, setOpen] = useState(false);

  // زر «إنشاء» في الشريط العلوي يفتح نموذج هذه الصفحة عبر الهاش #new.
  useHashCreate(canEdit(activeRole), () => {
    setEditing(null);
    setOpen(true);
  });
  const [deleting, setDeleting] = useState<HearingRow | null>(null);
  const q = sanitizeSearchTerm(useDebounced(search));

  const { data, isLoading, isFetching, error } = useQuery({
    placeholderData: keepPreviousData,
    queryKey: ["hearings", activeOrgId, q, status, when, page],
    enabled: !!activeOrgId,
    queryFn: async () => {
      let query = supabase
        .from("hearings")
        .select("*, case:cases(id, case_title, case_number, client:clients(full_name))", {
          count: "exact",
        })
        .eq("organization_id", activeOrgId!)
        .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
      if (q) query = query.or(`title.ilike.%${q}%,court_name.ilike.%${q}%`);
      if (status !== "all") query = query.eq("status", status as Enums<"hearing_status">);
      const now = new Date().toISOString();
      if (when === "upcoming")
        query = query
          .gte("hearing_date", now)
          .order("hearing_date", { ascending: true })
          .order("id", { ascending: true });
      else if (when === "past")
        query = query
          .lt("hearing_date", now)
          .order("hearing_date", { ascending: false })
          .order("id", { ascending: false });
      // مفتاح فرز ثانوي ثابت يمنع تكرار الصفوف بين صفحات الترقيم
      else
        query = query.order("hearing_date", { ascending: false }).order("id", { ascending: false });
      const { data, error, count } = await query;
      if (error) throw error;
      return { rows: data ?? [], count: count ?? 0 };
    },
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("hearings").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم الحذف");
      qc.invalidateQueries({ queryKey: ["hearings"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      setDeleting(null);
    },
    onError: (e: unknown) => toast.error("تعذّر الحذف", { description: errMsg(e) }),
  });

  const columns: Column<HearingRow>[] = [
    { id: "title", header: "العنوان", mobile: "title", wrap: true, cell: (h) => h.title },
    { id: "case", header: "القضية", cell: (h) => h.case?.case_title ?? "—" },
    { id: "client", header: "العميل", cell: (h) => h.case?.client?.full_name ?? "—" },
    {
      id: "date",
      header: "التاريخ والوقت",
      cell: (h) => <span className="whitespace-nowrap tabular-nums">{fmtDateTime(h.hearing_date)}</span>,
    },
    { id: "court", header: "المحكمة", cell: (h) => h.court_name ?? "—" },
    {
      id: "status",
      header: "الحالة",
      cell: (h) => (
        <Badge
          tone={
            h.status === "completed"
              ? "green"
              : h.status === "missed"
                ? "red"
                : h.status === "postponed"
                  ? "warn"
                  : "muted"
          }
        >
          {HEARING_STATUS[h.status] ?? h.status}
        </Badge>
      ),
    },
    {
      id: "actions",
      header: " ",
      mobile: "actions",
      cell: (h) => (
        <div className="flex justify-end gap-1">
          {canEdit(activeRole) && (
            <IconBtn
              aria-label="تعديل"
              title="تعديل"
              onClick={() => {
                setEditing(h);
                setOpen(true);
              }}
            >
              <Pencil className="h-4 w-4" />
            </IconBtn>
          )}
          {canManage(activeRole) && (
            <IconBtn
              tone="danger"
              aria-label="حذف"
              title="حذف"
              loading={del.isPending && deleting?.id === h.id}
              onClick={() => setDeleting(h)}
            >
              <Trash2 className="h-4 w-4" />
            </IconBtn>
          )}
        </div>
      ),
    },
  ];

  return (
    <DashboardShell title="الجلسات">
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
        addLabel="جلسة جديدة"
        activeFilters={(when === "upcoming" ? 0 : 1) + (status === "all" ? 0 : 1)}
        filters={
          <>
            <select
              value={when}
              onChange={(e) => {
                setWhen(e.target.value as "all" | "upcoming" | "past");
                setPage(1);
              }}
              className={inputCls + " max-w-[140px]"}
            >
              <option value="upcoming">القادمة</option>
              <option value="past">السابقة</option>
              <option value="all">الكل</option>
            </select>
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
              className={inputCls + " max-w-[160px]"}
            >
              <option value="all">كل الحالات</option>
              {asOptions(HEARING_STATUS).map((o) => (
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
          title="لا توجد جلسات"
          hint="أضف جلسة لبدء التتبع"
          action={
            canEdit(activeRole) && (
              <Btn
                onClick={() => {
                  setEditing(null);
                  setOpen(true);
                }}
              >
                إضافة جلسة
              </Btn>
            )
          }
        />
      ) : (
        <>
          <BusyOverlay busy={isFetching && !isLoading}>
            <DataView
              label="جدول الجلسات"
              rows={data.rows as HearingRow[]}
              rowKey={(h) => h.id}
              columns={columns}
            />
          </BusyOverlay>
          <Pagination page={page} setPage={setPage} total={data.count} pageSize={PAGE_SIZE} />
        </>
      )}
      <HearingDialog
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
        title="حذف الجلسة"
        message={`سيتم حذف "${deleting?.title}".`}
      />
    </DashboardShell>
  );
}

function HearingDialog({
  open,
  onClose,
  editing,
  orgId,
  userId,
}: {
  open: boolean;
  onClose: () => void;
  editing: HearingRow | null;
  orgId: string;
  userId?: string;
}) {
  const qc = useQueryClient();
  const { activeOrgId } = useAuth();
  const [form, setForm] = useState<Partial<Form>>({});
  const draft = useDialogDraft<Form>({
    name: "hearings",
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

  if (open && k !== key) {
    setK(key);
    setErrors({});
    setForm(
      editing
        ? { ...editing, hearing_date: isoToRiyadhLocalInput(editing.hearing_date) }
        : { status: "scheduled" },
    );
  }

  const save = async () => {
    const res = schema.safeParse({ ...form, status: form.status ?? "scheduled" });
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
    const hearingIso = riyadhLocalToIso(res.data.hearing_date);
    if (!hearingIso) {
      setSaving(false);
      setErrors({ hearing_date: "تاريخ ووقت الجلسة غير صحيح" });
      toast.error("تحقق من الحقول المطلوبة", { description: "تاريخ ووقت الجلسة غير صحيح" });
      return;
    }
    const payload: Record<string, unknown> = {
      ...res.data,
      hearing_date: hearingIso,
    };
    Object.keys(payload).forEach((k) => {
      if (payload[k] === "") payload[k] = null;
    });
    const q = editing
      ? supabase
          .from("hearings")
          .update(payload as Partial<TablesInsert<"hearings">>)
          .eq("id", editing.id)
      : supabase.from("hearings").insert({
          ...(payload as Partial<TablesInsert<"hearings">>),
          organization_id: orgId,
          created_by: userId,
        } as TablesInsert<"hearings">);
    const { error } = await q;
    setSaving(false);
    if (error) return toast.error("تعذّر الحفظ", { description: error.message });
    if (!editing) track("hearing_created", { action_source: "dashboard" });
    toast.success(editing ? "تم التحديث" : "تم إنشاء الجلسة");
    draft.clear();
    qc.invalidateQueries({ queryKey: ["hearings"] });
    qc.invalidateQueries({ queryKey: ["case-hearings"] });
    qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? "تعديل جلسة" : "جلسة جديدة"}
      size="lg"
      busy={loadingCases}
      busyLabel="جاري تجهيز النموذج…"
    >
      <DraftPrompt draft={draft as never} />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <FormField label="القضية" required>
            <select
              value={form.case_id ?? ""}
              onChange={(e) => setForm({ ...form, case_id: e.target.value })}
              className={inputCls}
            >
              <option value="">— اختر —</option>
              {(cases ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.case_title}
                  {c.case_number ? ` (${c.case_number})` : ""}
                </option>
              ))}
            </select>
            {errors.case_id && <span className="text-xs text-danger">{errors.case_id}</span>}
          </FormField>
        </div>
        <div className="md:col-span-2">
          <FormField label="عنوان الجلسة" required>
            <input
              value={form.title ?? ""}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              maxLength={FIELD_LIMITS.title}
              className={inputCls}
            />
            {errors.title && <span className="text-xs text-danger">{errors.title}</span>}
          </FormField>
        </div>
        <FormField label="التاريخ والوقت" required hint={RIYADH_TZ_HINT}>
          <input
            type="datetime-local"
            value={form.hearing_date ?? ""}
            onChange={(e) => setForm({ ...form, hearing_date: e.target.value })}
            className={inputCls}
          />
          {errors.hearing_date && (
            <span className="text-xs text-danger">{errors.hearing_date}</span>
          )}
        </FormField>
        <FormField label="الحالة" required>
          <select
            value={form.status ?? "scheduled"}
            onChange={(e) =>
              setForm({ ...form, status: e.target.value as Enums<"hearing_status"> })
            }
            className={inputCls}
          >
            {asOptions(HEARING_STATUS).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="المحكمة">
          <input
            value={form.court_name ?? ""}
            onChange={(e) => setForm({ ...form, court_name: e.target.value })}
            maxLength={FIELD_LIMITS.court}
            className={inputCls}
          />
        </FormField>
        <FormField label="الدائرة">
          <input
            value={form.judicial_circuit ?? ""}
            onChange={(e) => setForm({ ...form, judicial_circuit: e.target.value })}
            maxLength={FIELD_LIMITS.shortText}
            className={inputCls}
          />
        </FormField>
        <FormField label="نوع الجلسة">
          <input
            value={form.hearing_type ?? ""}
            onChange={(e) => setForm({ ...form, hearing_type: e.target.value })}
            maxLength={FIELD_LIMITS.shortText}
            className={inputCls}
            placeholder="مرافعة / نطق حكم / تصالح"
          />
        </FormField>
        <FormField label="المكان">
          <input
            value={form.location ?? ""}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
            maxLength={FIELD_LIMITS.location}
            className={inputCls}
          />
        </FormField>
        <div className="md:col-span-2">
          <FormField label="رابط عن بُعد" error={errors.remote_link}>
            <input
              type="url"
              dir="ltr"
              value={form.remote_link ?? ""}
              onChange={(e) => setForm({ ...form, remote_link: e.target.value })}
              maxLength={FIELD_LIMITS.url}
              className={inputCls}
              placeholder="https://…"
            />
          </FormField>
        </div>
        <div className="md:col-span-2">
          <FormField label="نتيجة الجلسة">
            <textarea
              rows={2}
              value={form.result ?? ""}
              onChange={(e) => setForm({ ...form, result: e.target.value })}
              maxLength={FIELD_LIMITS.result}
              className={inputCls}
            />
          </FormField>
        </div>
        <div className="md:col-span-2">
          <FormField label="ملاحظات">
            <textarea
              rows={2}
              value={form.notes ?? ""}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              maxLength={FIELD_LIMITS.notes}
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
