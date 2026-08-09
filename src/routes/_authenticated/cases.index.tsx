import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { DashboardShell } from "@/components/dashboard/shell";
import { supabase } from "@/integrations/supabase/client";
import { track } from "@/lib/product-analytics";
import { useAuth, canEdit, canManage } from "@/hooks/use-auth";
import { CASE_STATUS, CASE_PRIORITY, CLIENT_ROLE, asOptions, fmtDate } from "@/lib/enums";
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
import { Pencil, Archive, ExternalLink } from "lucide-react";
import { describeMutationError } from "@/lib/subscription.shared";
import type { Enums, Tables, TablesInsert } from "@/integrations/supabase/types";
import { useDialogDraft } from "@/lib/drafts/use-dialog-draft";
import { DraftPrompt, DraftStatus } from "@/lib/drafts/draft-ui";

export const Route = createFileRoute("/_authenticated/cases/")({
  component: Page,
  head: () => ({
    meta: [
      { title: "القضايا | مِهلة" },
      {
        name: "description",
        content: "إدارة قضايا المكتب: الأطراف، المحكمة، الحالة، والأولوية مع بحث وترتيب سريع.",
      },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "القضايا | مِهلة" },
      {
        property: "og:description",
        content: "إدارة قضايا المكتب: الأطراف، المحكمة، الحالة، والأولوية مع بحث وترتيب سريع.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const PAGE_SIZE = 20;

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

const caseSchema = z.object({
  case_title: z.string().trim().min(2, "العنوان مطلوب").max(250),
  case_number: z.string().max(80).optional().nullable(),
  case_type: z.string().max(80).optional().nullable(),
  client_id: z.string().uuid().optional().nullable(),
  client_role: z
    .enum([
      "plaintiff",
      "defendant",
      "appellant",
      "respondent",
      "execution_applicant",
      "execution_against",
      "other",
    ])
    .optional()
    .nullable(),
  court_name: z.string().max(150).optional().nullable(),
  court_branch: z.string().max(150).optional().nullable(),
  judicial_circuit: z.string().max(80).optional().nullable(),
  judge_name: z.string().max(150).optional().nullable(),
  opponent_name: z.string().max(250).optional().nullable(),
  status: z.enum([
    "draft",
    "open",
    "in_progress",
    "waiting",
    "judgment_issued",
    "execution",
    "closed",
    "archived",
  ]),
  priority: z.enum(["low", "medium", "high", "urgent"]),
  assigned_lawyer_id: z.string().uuid().optional().nullable(),
  opened_at: z.string().optional().nullable(),
  description: z.string().max(3000).optional().nullable(),
  internal_notes: z.string().max(3000).optional().nullable(),
});
type CaseForm = z.infer<typeof caseSchema>;

type CaseRow = {
  id: string;
  case_title: string;
  case_number: string | null;
  case_type: string | null;
  court_name: string | null;
  status: string;
  priority: string;
  assigned_lawyer_id: string | null;
  client_id: string | null;
  next_action_date: string | null;
  last_activity_at: string;
  client?: { full_name: string } | null;
  lawyer?: { full_name: string } | null;
};

function Page() {
  const { activeOrgId, activeRole } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [caseType, setCaseType] = useState("");
  const [court, setCourt] = useState("");
  const [lawyer, setLawyer] = useState("all");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<CaseRow | null>(null);
  const [open, setOpen] = useState(false);
  const [archiving, setArchiving] = useState<CaseRow | null>(null);
  const q = useDebounced(search);

  const { data: members } = useQuery({
    queryKey: ["members-basic", activeOrgId],
    enabled: !!activeOrgId,
    queryFn: async () => {
      const { data } = await supabase
        .from("organization_members")
        .select("user_id, profile:profiles(id, full_name)")
        .eq("organization_id", activeOrgId!)
        .eq("status", "active");
      return (data ?? []).map((m) => ({ id: m.user_id, name: m.profile?.full_name ?? "—" }));
    },
  });

  const { data, isLoading, isFetching, error } = useQuery({
    placeholderData: keepPreviousData,
    queryKey: ["cases", activeOrgId, q, status, caseType, court, lawyer, page],
    enabled: !!activeOrgId,
    queryFn: async () => {
      let query = supabase
        .from("cases")
        .select(
          "id, case_title, case_number, case_type, court_name, status, priority, assigned_lawyer_id, client_id, next_action_date, last_activity_at, client:clients(full_name), lawyer:profiles!cases_assigned_lawyer_id_fkey(full_name)",
          { count: "exact" },
        )
        .eq("organization_id", activeOrgId!)
        .order("last_activity_at", { ascending: false })
        // مفتاح فرز ثانوي ثابت يضمن ترقيماً غير متكرر عند تساوي آخر نشاط
        .order("id", { ascending: false })
        .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
      if (q)
        query = query.or(
          `case_title.ilike.%${q}%,case_number.ilike.%${q}%,opponent_name.ilike.%${q}%`,
        );
      if (status !== "all") query = query.eq("status", status as Enums<"case_status">);
      if (caseType) query = query.ilike("case_type", `%${caseType}%`);
      if (court) query = query.ilike("court_name", `%${court}%`);
      if (lawyer !== "all") query = query.eq("assigned_lawyer_id", lawyer);
      const { data, error, count } = await query;
      if (error) throw error;
      return { rows: (data ?? []) as unknown as CaseRow[], count: count ?? 0 };
    },
  });

  const archive = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("cases")
        .update({ status: "archived" as const, closed_at: new Date().toISOString().slice(0, 10) })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تمت الأرشفة");
      qc.invalidateQueries({ queryKey: ["cases"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      setArchiving(null);
    },
    onError: (e: unknown) => toast.error("تعذّرت الأرشفة", { description: errMsg(e) }),
  });

  const statusTone = (s: string) =>
    s === "closed" || s === "archived"
      ? "muted"
      : s === "judgment_issued"
        ? "green"
        : s === "waiting"
          ? "warn"
          : s === "execution"
            ? "gold"
            : "default";

  return (
    <DashboardShell title="القضايا">
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
        addLabel="قضية جديدة"
        filters={
          <>
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
              className={inputCls + " max-w-[160px]"}
            >
              <option value="all">كل الحالات</option>
              {asOptions(CASE_STATUS).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <input
              placeholder="نوع القضية"
              value={caseType}
              onChange={(e) => {
                setCaseType(e.target.value);
                setPage(1);
              }}
              className={inputCls + " max-w-[140px]"}
            />
            <input
              placeholder="المحكمة"
              value={court}
              onChange={(e) => {
                setCourt(e.target.value);
                setPage(1);
              }}
              className={inputCls + " max-w-[140px]"}
            />
            <select
              value={lawyer}
              onChange={(e) => {
                setLawyer(e.target.value);
                setPage(1);
              }}
              className={inputCls + " max-w-[160px]"}
            >
              <option value="all">كل المحامين</option>
              {(members ?? []).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
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
          title="لا توجد قضايا بعد"
          hint="ابدأ بإضافة أول قضية"
          action={
            canEdit(activeRole) && (
              <Btn
                onClick={() => {
                  setEditing(null);
                  setOpen(true);
                }}
              >
                إضافة قضية
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
                    <Th>الرقم</Th>
                    <Th>العميل</Th>
                    <Th>المحكمة</Th>
                    <Th>الحالة</Th>
                    <Th>الأولوية</Th>
                    <Th>المسؤول</Th>
                    <Th>آخر نشاط</Th>
                    <Th> </Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.rows.map((c) => (
                    <tr key={c.id} className="hover:bg-surface-muted/40">
                      <Td className="font-medium">
                        <Link to="/cases/$id" params={{ id: c.id }} className="hover:underline">
                          {c.case_title}
                        </Link>
                      </Td>
                      <Td>{c.case_number ?? "—"}</Td>
                      <Td>{c.client?.full_name ?? "—"}</Td>
                      <Td>{c.court_name ?? "—"}</Td>
                      <Td>
                        <Badge tone={statusTone(c.status)}>
                          {CASE_STATUS[c.status] ?? c.status}
                        </Badge>
                      </Td>
                      <Td>
                        <Badge
                          tone={
                            c.priority === "urgent"
                              ? "red"
                              : c.priority === "high"
                                ? "warn"
                                : "muted"
                          }
                        >
                          {CASE_PRIORITY[c.priority] ?? c.priority}
                        </Badge>
                      </Td>
                      <Td>{c.lawyer?.full_name ?? "—"}</Td>
                      <Td>{fmtDate(c.last_activity_at)}</Td>
                      <Td>
                        <div className="flex justify-end gap-1">
                          <Link
                            to="/cases/$id"
                            params={{ id: c.id }}
                            className="rounded-lg p-1.5 hover:bg-surface-muted"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Link>
                          {canEdit(activeRole) && (
                            <button
                              onClick={() => {
                                setEditing(c);
                                setOpen(true);
                              }}
                              className="rounded-lg p-1.5 hover:bg-surface-muted"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                          )}
                          {canManage(activeRole) && c.status !== "archived" && (
                            <button
                              onClick={() => setArchiving(c)}
                              className="rounded-lg p-1.5 text-warning hover:bg-warning-soft"
                            >
                              <Archive className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DataCard>
          </BusyOverlay>
          <Pagination page={page} setPage={setPage} total={data.count} pageSize={PAGE_SIZE} />
        </>
      )}

      <CaseDialog
        open={open}
        onClose={() => setOpen(false)}
        editing={editing}
        members={members ?? []}
      />
      <ConfirmDialog
        open={!!archiving}
        onClose={() => setArchiving(null)}
        onConfirm={() => archiving && archive.mutate(archiving.id)}
        loading={archive.isPending}
        danger={false}
        title="أرشفة القضية"
        message={`سيتم نقل القضية "${archiving?.case_title}" إلى الأرشيف. يمكنك استعادتها لاحقاً بتغيير حالتها.`}
        confirmLabel="أرشفة"
      />
    </DashboardShell>
  );
}

export function CaseDialog({
  open,
  onClose,
  editing,
  members,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  editing: CaseRow | null;
  members: { id: string; name: string }[];
  onCreated?: (c: Tables<"cases">) => void;
}) {
  const { activeOrgId, user } = useAuth();
  const qc = useQueryClient();
  const [form, setForm] = useState<Partial<CaseForm>>({});
  const draft = useDialogDraft<CaseForm>({
    name: "cases",
    open,
    isNew: !editing,
    userKey: activeOrgId ?? "anon",
    form,
    setForm,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const key = open ? (editing?.id ?? "new") : "closed";
  const [formKey, setFormKey] = useState("closed");

  const { data: clients, isLoading: loadingClients } = useQuery({
    queryKey: ["clients-basic", activeOrgId],
    enabled: !!activeOrgId && open,
    queryFn: async () => {
      const { data } = await supabase
        .from("clients")
        .select("id, full_name")
        .eq("organization_id", activeOrgId!)
        .order("full_name");
      return data ?? [];
    },
  });

  if (formKey !== key) {
    setFormKey(key);
    setErrors({});
    setForm(
      editing
        ? { ...(editing as unknown as Partial<CaseForm>) }
        : { status: "open", priority: "medium" },
    );
  }

  const save = async () => {
    const res = caseSchema.safeParse({
      ...form,
      status: form.status ?? "open",
      priority: form.priority ?? "medium",
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
    const payload: Partial<TablesInsert<"cases">> = { ...res.data };
    (Object.keys(payload) as Array<keyof typeof payload>).forEach((k) => {
      if (payload[k] === "" || payload[k] === undefined)
        (payload as Record<string, unknown>)[k] = null;
    });
    let result: { data: Tables<"cases"> | null; error: { message: string } | null };
    if (editing) {
      const { data, error } = await supabase
        .from("cases")
        .update(payload)
        .eq("id", editing.id)
        .select()
        .single();
      result = { data, error };
    } else {
      const { data, error } = await supabase
        .from("cases")
        .insert({
          ...(payload as TablesInsert<"cases">),
          organization_id: activeOrgId!,
          created_by: user?.id,
        })
        .select()
        .single();
      if (!error && data) {
        await supabase.from("case_updates").insert({
          organization_id: activeOrgId!,
          case_id: data.id,
          update_type: "case_created",
          title: "تم إنشاء القضية",
          event_date: new Date().toISOString(),
          created_by: user?.id,
        });
      }
      result = { data, error };
    }
    setSaving(false);
    if (result.error)
      return toast.error("تعذّر الحفظ", {
        description: describeMutationError(result.error.message),
      });
    toast.success(editing ? "تم التحديث" : "تم إنشاء القضية");
    if (!editing) {
      // «أول قضية» تُقاس من الخادم بعد نجاح الإنشاء فعلياً
      const { count } = await supabase
        .from("cases")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", activeOrgId!);
      if (count === 1) track("first_case_created", { action_source: "dashboard" });
    }
    draft.clear();
    qc.invalidateQueries({ queryKey: ["cases"] });
    qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    if (result.data) onCreated?.(result.data);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? "تعديل قضية" : "قضية جديدة"}
      size="lg"
      busy={loadingClients}
      busyLabel="جاري تجهيز النموذج…"
    >
      <DraftPrompt draft={draft as never} />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <FormField label="عنوان القضية *">
            <input
              value={form.case_title ?? ""}
              onChange={(e) => setForm({ ...form, case_title: e.target.value })}
              className={inputCls}
            />
            {errors.case_title && <span className="text-xs text-danger">{errors.case_title}</span>}
          </FormField>
        </div>
        <FormField label="رقم القضية">
          <input
            value={form.case_number ?? ""}
            onChange={(e) => setForm({ ...form, case_number: e.target.value })}
            className={inputCls}
          />
        </FormField>
        <FormField label="نوع القضية">
          <input
            value={form.case_type ?? ""}
            onChange={(e) => setForm({ ...form, case_type: e.target.value })}
            placeholder="تجاري، أحوال، عمالي…"
            className={inputCls}
          />
        </FormField>
        <FormField label="العميل">
          <select
            value={form.client_id ?? ""}
            onChange={(e) => setForm({ ...form, client_id: e.target.value || null })}
            className={inputCls}
          >
            <option value="">— بدون —</option>
            {(clients ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.full_name}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="صفة العميل">
          <select
            value={form.client_role ?? ""}
            onChange={(e) =>
              setForm({
                ...form,
                client_role: (e.target.value || null) as Enums<"client_role"> | null,
              })
            }
            className={inputCls}
          >
            <option value="">—</option>
            {asOptions(CLIENT_ROLE).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="اسم الخصم">
          <input
            value={form.opponent_name ?? ""}
            onChange={(e) => setForm({ ...form, opponent_name: e.target.value })}
            className={inputCls}
          />
        </FormField>
        <FormField label="المحكمة">
          <input
            value={form.court_name ?? ""}
            onChange={(e) => setForm({ ...form, court_name: e.target.value })}
            className={inputCls}
          />
        </FormField>
        <FormField label="الفرع">
          <input
            value={form.court_branch ?? ""}
            onChange={(e) => setForm({ ...form, court_branch: e.target.value })}
            className={inputCls}
          />
        </FormField>
        <FormField label="الدائرة">
          <input
            value={form.judicial_circuit ?? ""}
            onChange={(e) => setForm({ ...form, judicial_circuit: e.target.value })}
            className={inputCls}
          />
        </FormField>
        <FormField label="القاضي">
          <input
            value={form.judge_name ?? ""}
            onChange={(e) => setForm({ ...form, judge_name: e.target.value })}
            className={inputCls}
          />
        </FormField>
        <FormField label="الحالة *">
          <select
            value={form.status ?? "open"}
            onChange={(e) => setForm({ ...form, status: e.target.value as Enums<"case_status"> })}
            className={inputCls}
          >
            {asOptions(CASE_STATUS).map((o) => (
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
        <FormField label="المحامي المسؤول">
          <select
            value={form.assigned_lawyer_id ?? ""}
            onChange={(e) => setForm({ ...form, assigned_lawyer_id: e.target.value || null })}
            className={inputCls}
          >
            <option value="">—</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="تاريخ الفتح">
          <input
            type="date"
            value={form.opened_at ?? ""}
            onChange={(e) => setForm({ ...form, opened_at: e.target.value })}
            className={inputCls}
          />
        </FormField>
        <div className="md:col-span-2">
          <FormField label="الوصف">
            <textarea
              rows={3}
              value={form.description ?? ""}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className={inputCls}
            />
          </FormField>
        </div>
        <div className="md:col-span-2">
          <FormField label="ملاحظات داخلية">
            <textarea
              rows={2}
              value={form.internal_notes ?? ""}
              onChange={(e) => setForm({ ...form, internal_notes: e.target.value })}
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
