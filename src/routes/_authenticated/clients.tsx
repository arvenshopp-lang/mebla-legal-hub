import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { DashboardShell } from "@/components/dashboard/shell";
import { supabase } from "@/integrations/supabase/client";
import { track } from "@/lib/product-analytics";
import { useAuth, canEdit, canManage } from "@/hooks/use-auth";
import { useHashCreate } from "@/hooks/use-hash-create";
import { CLIENT_TYPE, asOptions, fmtDate } from "@/lib/enums";
import {
  PageToolbar,
  EmptyState,
  LoadingBlock,
  ErrorBlock,
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
import { DataView, type Column } from "@/components/data/data-view";
import { Pencil, Trash2, Receipt } from "lucide-react";
import { describeMutationError } from "@/lib/subscription.shared";
import { useServerFn } from "@tanstack/react-start";
import { saveClientSecure, searchClientsByPii } from "@/lib/pii.functions";
import { PiiSecureInput, useMaskedPii } from "@/components/security/pii-value";
import { normalizePiiValue } from "@/lib/crypto/pii.shared";
import { useDialogDraft } from "@/lib/drafts/use-dialog-draft";
import { DraftPrompt, DraftStatus } from "@/lib/drafts/draft-ui";
import type { Enums } from "@/integrations/supabase/types";
import { errMsg } from "@/lib/errors";
import { getClientStatement } from "@/lib/office-billing/billing.functions";
import { printStatement } from "@/lib/office-billing/export";
import { can as canBilling } from "@/lib/office-billing/permissions";

export const Route = createFileRoute("/_authenticated/clients")({
  component: Page,
  head: () => ({
    meta: [
      { title: "العملاء | مِهلة" },
      {
        name: "description",
        content: "سجل عملاء المكتب مع بيانات التواصل والهويات المشفّرة وربطهم بالقضايا.",
      },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "العملاء | مِهلة" },
      {
        property: "og:description",
        content: "سجل عملاء المكتب مع بيانات التواصل والهويات المشفّرة وربطهم بالقضايا.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const PAGE_SIZE = 20;

const clientSchema = z.object({
  full_name: z.string().trim().min(2, "الاسم مطلوب").max(150),
  client_type: z.enum(["individual", "company", "government"]),
  company_name: z.string().max(150).optional().nullable(),
  email: z.string().email("بريد غير صالح").max(150).optional().or(z.literal("")),
  phone: z.string().max(30).optional().nullable(),
  city: z.string().max(60).optional().nullable(),
  address: z.string().max(300).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});
type ClientForm = z.infer<typeof clientSchema>;

type ClientRow = {
  id: string;
  full_name: string;
  client_type: string;
  company_name: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  status: string;
  created_at: string;
};

function Page() {
  const { activeOrgId, activeRole } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [type, setType] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<ClientRow | null>(null);
  const [open, setOpen] = useState(false);

  // زر «إنشاء» في الشريط العلوي يفتح نموذج هذه الصفحة عبر الهاش #new.
  useHashCreate(canEdit(activeRole), () => {
    setEditing(null);
    setOpen(true);
  });
  const [deleting, setDeleting] = useState<ClientRow | null>(null);
  const q = useDebounced(search);
  const piiSearch = useServerFn(searchClientsByPii);
  const fetchStatement = useServerFn(getClientStatement);
  const [statementFor, setStatementFor] = useState<string | null>(null);

  /** طباعة كشف حساب العميل — البيانات والصلاحية يتحقق منها الخادم. */
  async function openStatement(clientId: string) {
    if (!activeOrgId) return;
    setStatementFor(clientId);
    try {
      const statement = await fetchStatement({ data: { organizationId: activeOrgId, clientId } });
      printStatement(statement);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setStatementFor(null);
    }
  }

  const { data, isLoading, isFetching, error } = useQuery({
    placeholderData: keepPreviousData,
    queryKey: ["clients", activeOrgId, q, type, page],
    enabled: !!activeOrgId,
    queryFn: async () => {
      // بحث بالرقم الحساس: يمر عبر البصمة الحتمية على الخادم، فلا يُخزَّن الرقم صريحاً.
      const digits = normalizePiiValue(q);
      let piiIds: string[] | null = null;
      if (digits.length >= 5 && /^\d+$/.test(digits)) {
        const res = await piiSearch({ data: { organizationId: activeOrgId!, value: digits } });
        piiIds = res.ids;
      }
      let query = supabase
        .from("clients")
        .select("*", { count: "exact" })
        .eq("organization_id", activeOrgId!)
        .order("created_at", { ascending: false })
        // مفتاح فرز ثانوي ثابت: يمنع تكرار/تخطي الصفوف بين الصفحات عند تساوي التواريخ
        .order("id", { ascending: false })
        .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
      if (piiIds?.length) {
        query = query.in("id", piiIds);
      } else if (q) {
        query = query.or(
          `full_name.ilike.%${q}%,phone.ilike.%${q}%,company_name.ilike.%${q}%,email.ilike.%${q}%,city.ilike.%${q}%`,
        );
      }
      if (type !== "all") query = query.eq("client_type", type as Enums<"client_type">);
      const { data, error, count } = await query;
      if (error) throw error;
      return { rows: (data ?? []) as ClientRow[], count: count ?? 0 };
    },
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("clients").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم الحذف");
      qc.invalidateQueries({ queryKey: ["clients"] });
      setDeleting(null);
    },
    onError: (e: unknown) => toast.error("تعذّر الحذف", { description: errMsg(e) }),
  });

  const columns: Column<ClientRow>[] = [
    {
      id: "name",
      header: "الاسم",
      mobile: "title",
      wrap: true,
      cell: (c) => (
        <>
          {c.full_name}
          {c.company_name && <div className="text-xs text-muted-foreground">{c.company_name}</div>}
        </>
      ),
    },
    {
      id: "type",
      header: "النوع",
      cell: (c) => <Badge>{CLIENT_TYPE[c.client_type] ?? c.client_type}</Badge>,
    },
    { id: "phone", header: "الجوال", cell: (c) => c.phone ?? "—" },
    { id: "city", header: "المدينة", cell: (c) => c.city ?? "—" },
    { id: "created", header: "تاريخ الإضافة", cell: (c) => fmtDate(c.created_at) },
    {
      id: "actions",
      header: " ",
      mobile: "actions",
      cell: (c) => (
        <div className="flex justify-end gap-1">
          {canBilling(activeRole, "billing.view") && (
            <IconBtn
              aria-label={`كشف حساب ${c.full_name}`}
              title="كشف حساب العميل"
              loading={statementFor === c.id}
              onClick={() => void openStatement(c.id)}
            >
              <Receipt className="h-4 w-4" />
            </IconBtn>
          )}
          {canEdit(activeRole) && (
            <IconBtn
              aria-label="تعديل"
              title="تعديل"
              onClick={() => {
                setEditing(c);
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
              loading={del.isPending && deleting?.id === c.id}
              onClick={() => setDeleting(c)}
            >
              <Trash2 className="h-4 w-4" />
            </IconBtn>
          )}
        </div>
      ),
    },
  ];

  return (
    <DashboardShell title="العملاء">
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
        addLabel="عميل جديد"
        activeFilters={type === "all" ? 0 : 1}
        filters={
          <select
            value={type}
            onChange={(e) => {
              setType(e.target.value);
              setPage(1);
            }}
            className={inputCls + " max-w-[160px]"}
          >
            <option value="all">كل الأنواع</option>
            {asOptions(CLIENT_TYPE).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        }
      />
      {isLoading ? (
        <LoadingBlock />
      ) : error ? (
        <ErrorBlock message={errMsg(error)} />
      ) : !data?.rows.length ? (
        <EmptyState
          title="لا يوجد عملاء بعد"
          hint="أضف أول عميل لبدء إدارة قضاياه"
          action={
            canEdit(activeRole) && (
              <Btn
                onClick={() => {
                  setEditing(null);
                  setOpen(true);
                }}
              >
                إضافة عميل
              </Btn>
            )
          }
        />
      ) : (
        <>
          <BusyOverlay busy={isFetching && !isLoading}>
            <DataView
              label="جدول العملاء"
              rows={data.rows}
              rowKey={(c) => c.id}
              columns={columns}
            />
          </BusyOverlay>
          <Pagination page={page} setPage={setPage} total={data.count} pageSize={PAGE_SIZE} />
        </>
      )}

      <ClientDialog open={open} onClose={() => setOpen(false)} editing={editing} />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && del.mutate(deleting.id)}
        loading={del.isPending}
        title="حذف العميل"
        message={`سيتم حذف "${deleting?.full_name}" وجميع قضاياه ومستنداته. هل أنت متأكد؟`}
      />
    </DashboardShell>
  );
}

export function ClientDialog({
  open,
  onClose,
  editing,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  editing: ClientRow | null;
  onCreated?: (c: ClientRow) => void;
}) {
  const { activeOrgId } = useAuth();
  const qc = useQueryClient();
  const [form, setForm] = useState<Partial<ClientForm>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const saveSecure = useServerFn(saveClientSecure);
  const { data: mask } = useMaskedPii(activeOrgId, "client", editing?.id);
  const [piiEdit, setPiiEdit] = useState<{
    field: "national_id" | "commercial_registration";
    value: string;
  } | null>(null);
  const draft = useDialogDraft<ClientForm>({
    name: "clients",
    open,
    isNew: !editing,
    userKey: activeOrgId ?? "anon",
    form,
    setForm,
  });

  // reset form on every open (including two consecutive "new" records)
  const key = open ? (editing?.id ?? "new") : "closed";
  const [formKey, setFormKey] = useState("closed");
  if (formKey !== key) {
    setFormKey(key);
    setErrors({});
    setPiiEdit(null);
    setForm(
      editing
        ? {
            full_name: editing.full_name,
            client_type: editing.client_type as ClientForm["client_type"],
            company_name: editing.company_name,
            email: editing.email ?? "",
            phone: editing.phone,
            city: editing.city,
          }
        : { client_type: "individual" },
    );
  }

  const save = async () => {
    const res = clientSchema.safeParse({ ...form, client_type: form.client_type ?? "individual" });
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
    try {
      const row = await saveSecure({
        data: {
          organizationId: activeOrgId!,
          ...(editing ? { id: editing.id } : {}),
          values: res.data as never,
          ...(piiEdit ? { pii: { [piiEdit.field]: piiEdit.value.trim() || null } } : {}),
        },
      });
      toast.success(editing ? "تم التحديث" : "تم إنشاء العميل");
      if (!editing) {
        // «أول عميل» يُقاس من الخادم بعد نجاح الإنشاء فعلياً — لا نعتمد على حالة الواجهة
        const { count } = await supabase
          .from("clients")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", activeOrgId!);
        if (count === 1) track("first_client_created", { action_source: "dashboard" });
      }
      draft.clear();
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["pii-mask"] });
      onCreated?.(row);
      onClose();
    } catch (error) {
      toast.error("تعذّر الحفظ", {
        description: describeMutationError(error instanceof Error ? error.message : ""),
      });
    } finally {
      setSaving(false);
    }
  };

  const piiField =
    form.client_type === "individual" || !form.client_type
      ? "national_id"
      : "commercial_registration";
  const piiMask = (mask?.[piiField] ?? "—") as string;

  // التحقق الحيّ من الإلزاميات: زر الحفظ معطّل حتى تكتمل، مع بيان السبب للمستخدم.
  const parsed = clientSchema.safeParse({
    ...form,
    client_type: form.client_type ?? "individual",
  });
  const canSave = parsed.success;
  /** يعرض خطأ الحقل عند مغادرته فقط، حتى لا تظهر أخطاء قبل الكتابة. */
  const markTouched = (field: keyof ClientForm) => {
    const issue = parsed.success
      ? null
      : (parsed.error.issues.find((i) => i.path[0] === field) ?? null);
    setErrors((prev) => {
      const next = { ...prev };
      if (issue) next[field as string] = issue.message;
      else delete next[field as string];
      return next;
    });
  };

  return (
    <Modal open={open} onClose={onClose} title={editing ? "تعديل عميل" : "عميل جديد"} size="lg">
      <DraftPrompt draft={draft as never} />
      <div className="grid gap-4 md:grid-cols-2">
        <FormField label="الاسم الكامل" required error={errors.full_name}>
          <input
            value={form.full_name ?? ""}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            onBlur={() => markTouched("full_name")}
            required
            aria-required
            className={inputCls}
          />
        </FormField>
        <FormField label="نوع العميل" required>
          <select
            value={form.client_type ?? "individual"}
            aria-required
            onChange={(e) => {
              const next = e.target.value as ClientForm["client_type"];
              // تفريغ حقول الجهة عند التحويل إلى «فرد» حتى لا تُحفظ بيانات لا تنتمي للعميل
              setForm((prev) =>
                next === "individual"
                  ? { ...prev, client_type: next, company_name: null }
                  : { ...prev, client_type: next },
              );
              setPiiEdit(null);
              setErrors((prev) => {
                const { company_name: _omit, ...rest } = prev;
                return rest;
              });
            }}
            className={inputCls}
          >
            {asOptions(CLIENT_TYPE).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </FormField>
        {form.client_type !== "individual" && (
          <FormField label="اسم الجهة/الشركة" optional>
            <input
              value={form.company_name ?? ""}
              onChange={(e) => setForm({ ...form, company_name: e.target.value })}
              className={inputCls}
            />
          </FormField>
        )}
        <PiiSecureInput
          label={piiField === "national_id" ? "رقم الهوية" : "السجل التجاري"}
          mask={piiMask}
          value={piiEdit?.field === piiField ? piiEdit.value : ""}
          editing={piiEdit?.field === piiField || (piiMask === "—" && !editing)}
          onChange={(next) => setPiiEdit({ field: piiField, value: next })}
          onStartEdit={() => setPiiEdit({ field: piiField, value: "" })}
          onCancelEdit={() => setPiiEdit(null)}
        />
        <FormField label="الجوال" optional>
          <input
            value={form.phone ?? ""}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            className={inputCls}
          />
        </FormField>
        <FormField label="البريد الإلكتروني" optional error={errors.email}>
          <input
            type="email"
            value={form.email ?? ""}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            onBlur={() => markTouched("email")}
            className={inputCls}
          />
        </FormField>
        <FormField label="المدينة" optional>
          <input
            value={form.city ?? ""}
            onChange={(e) => setForm({ ...form, city: e.target.value })}
            className={inputCls}
          />
        </FormField>
        <FormField label="العنوان" optional>
          <input
            value={form.address ?? ""}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
            className={inputCls}
          />
        </FormField>
        <div className="md:col-span-2">
          <FormField label="ملاحظات" optional>
            <textarea
              rows={3}
              value={form.notes ?? ""}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className={inputCls}
            />
          </FormField>
        </div>
      </div>
      {!canSave && (
        <p id="client-form-required-hint" className="text-caption mt-4 text-text-muted">
          أكمل الحقول الإلزامية المعلَّمة بنجمة حمراء لتفعيل الحفظ.
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
        <div className="me-auto">
          <DraftStatus draft={draft as never} />
        </div>
        <Btn variant="outline" onClick={onClose} disabled={saving}>
          إلغاء
        </Btn>
        <Btn
          onClick={save}
          loading={saving}
          disabled={!canSave}
          {...(!canSave ? { "aria-describedby": "client-form-required-hint" } : {})}
        >
          {saving ? "جاري الحفظ…" : "حفظ"}
        </Btn>
      </div>
    </Modal>
  );
}
