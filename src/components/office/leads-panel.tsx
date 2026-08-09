/** طلبات الاستشارة القادمة من الصفحة العامة — عرض وتحديث وتحويل إلى عميل. */
import { useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { UserPlus } from "lucide-react";
import {
  Badge,
  Btn,
  DataCard,
  EmptyState,
  ErrorBlock,
  FormField,
  LoadingBlock,
  Modal,
  Pagination,
  Td,
  Th,
  inputCls,
  useDebounced,
} from "@/lib/list-utils";
import {
  OFFICE_LEAD_STATUSES,
  OFFICE_LEAD_STATUS_LABELS,
  PREFERRED_CONTACT_LABELS,
  serviceLabel,
  type OfficeLeadStatus,
} from "@/lib/office-page.shared";
import { convertOfficeLead, listOfficeLeads, updateOfficeLead } from "@/lib/office-page.functions";
import { errMsg } from "@/lib/errors";
import { fmtDate } from "@/lib/enums";

const STATUS_TONE: Record<OfficeLeadStatus, "green" | "info" | "muted" | "warn" | "red"> = {
  new: "info",
  contacted: "warn",
  qualified: "green",
  unqualified: "muted",
  converted: "green",
  archived: "muted",
};

type LeadRow = Awaited<ReturnType<typeof listOfficeLeads>>["rows"][number];

export function OfficeLeadsPanel({
  organizationId,
  canManageLeads,
}: {
  organizationId: string;
  canManageLeads: boolean;
}) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | OfficeLeadStatus>("all");
  const [page, setPage] = useState(1);
  const [active, setActive] = useState<LeadRow | null>(null);
  const debounced = useDebounced(search, 350);
  const pageSize = 20;

  const query = useQuery({
    queryKey: ["office-leads", organizationId, debounced, status, page],
    queryFn: () =>
      listOfficeLeads({
        data: { organizationId, search: debounced, status, page, pageSize },
      }),
    placeholderData: keepPreviousData,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["office-leads", organizationId] });

  const update = useMutation({
    mutationFn: (input: { leadId: string; status?: OfficeLeadStatus; internalNote?: string }) =>
      updateOfficeLead({ data: { organizationId, ...input } }),
    onSuccess: async () => {
      await invalidate();
      toast.success("تم تحديث الطلب.");
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const convert = useMutation({
    mutationFn: (leadId: string) => convertOfficeLead({ data: { organizationId, leadId } }),
    onSuccess: async (result) => {
      await invalidate();
      setActive(null);
      toast.success(
        result.alreadyConverted ? "هذا الطلب محوّل مسبقاً إلى عميل." : "تم إنشاء عميل من الطلب.",
      );
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  if (query.isPending) return <LoadingBlock rows={6} cols={4} />;
  if (query.isError) return <ErrorBlock message={errMsg(query.error)} />;

  const { rows, total } = query.data;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <input
          className={`${inputCls} sm:max-w-xs`}
          placeholder="بحث بالاسم أو الجوال أو البريد…"
          aria-label="بحث في الطلبات"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <select
          className={`${inputCls} sm:max-w-48`}
          aria-label="تصفية بالحالة"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as "all" | OfficeLeadStatus);
            setPage(1);
          }}
        >
          <option value="all">كل الحالات</option>
          {OFFICE_LEAD_STATUSES.map((s) => (
            <option key={s} value={s}>
              {OFFICE_LEAD_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="لا توجد طلبات بعد"
          hint="ستظهر هنا طلبات الاستشارة الواردة من صفحتك العامة."
        />
      ) : (
        <>
          {/* جدول لسطح المكتب */}
          <div className="hidden sm:block">
            <DataCard>
              <table className="w-full">
                <thead>
                  <tr>
                    <Th>الاسم</Th>
                    <Th>التواصل</Th>
                    <Th>الخدمة</Th>
                    <Th>القناة</Th>
                    <Th>الحالة</Th>
                    <Th>التاريخ</Th>
                    <Th>إجراء</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((lead) => (
                    <tr key={lead.id}>
                      <Td>{lead.full_name}</Td>
                      <Td>
                        <span dir="ltr">{lead.phone || lead.email || "—"}</span>
                      </Td>
                      <Td>{serviceLabel(lead.service_key) || "—"}</Td>
                      <Td>{lead.channel || "direct"}</Td>
                      <Td>
                        <Badge tone={STATUS_TONE[lead.status]}>
                          {OFFICE_LEAD_STATUS_LABELS[lead.status]}
                        </Badge>
                      </Td>
                      <Td>{fmtDate(lead.created_at)}</Td>
                      <Td>
                        <Btn variant="outline" size="sm" onClick={() => setActive(lead)}>
                          التفاصيل
                        </Btn>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DataCard>
          </div>

          {/* بطاقات للجوال */}
          <ul className="space-y-3 sm:hidden">
            {rows.map((lead) => (
              <li key={lead.id} className="surface-card space-y-2 p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-semibold">{lead.full_name}</p>
                  <Badge tone={STATUS_TONE[lead.status]}>
                    {OFFICE_LEAD_STATUS_LABELS[lead.status]}
                  </Badge>
                </div>
                <p dir="ltr" className="text-body-sm text-muted-foreground">
                  {lead.phone || lead.email || "—"}
                </p>
                <p className="text-caption text-muted-foreground">
                  {serviceLabel(lead.service_key) || "بدون خدمة محددة"} · {fmtDate(lead.created_at)}
                </p>
                <Btn variant="outline" size="sm" onClick={() => setActive(lead)}>
                  التفاصيل
                </Btn>
              </li>
            ))}
          </ul>

          <Pagination
            page={page}
            pageSize={pageSize}
            total={total}
            setPage={setPage}
          />
        </>
      )}

      <LeadModal
        lead={active}
        onClose={() => setActive(null)}
        canManageLeads={canManageLeads}
        onUpdate={(input) => update.mutate(input)}
        onConvert={(leadId) => convert.mutate(leadId)}
        updating={update.isPending}
        converting={convert.isPending}
      />
    </div>
  );
}

function LeadModal({
  lead,
  onClose,
  canManageLeads,
  onUpdate,
  onConvert,
  updating,
  converting,
}: {
  lead: LeadRow | null;
  onClose: () => void;
  canManageLeads: boolean;
  onUpdate: (input: { leadId: string; status?: OfficeLeadStatus; internalNote?: string }) => void;
  onConvert: (leadId: string) => void;
  updating: boolean;
  converting: boolean;
}) {
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<OfficeLeadStatus>("new");
  const [loadedId, setLoadedId] = useState<string | null>(null);

  if (lead && loadedId !== lead.id) {
    setLoadedId(lead.id);
    setNote(lead.internal_note ?? "");
    setStatus(lead.status);
  }

  return (
    <Modal open={!!lead} onClose={onClose} title="تفاصيل الطلب" size="lg">
      {lead && (
        <div className="space-y-4">
          <dl className="grid gap-3 sm:grid-cols-2">
            <Info label="الاسم">{lead.full_name}</Info>
            <Info label="الجوال">
              <span dir="ltr">{lead.phone || "—"}</span>
            </Info>
            <Info label="البريد">
              <span dir="ltr">{lead.email || "—"}</span>
            </Info>
            <Info label="المدينة">{lead.city || "—"}</Info>
            <Info label="الخدمة">{serviceLabel(lead.service_key) || "—"}</Info>
            <Info label="التواصل المفضّل">
              {lead.preferred_contact
                ? (PREFERRED_CONTACT_LABELS[lead.preferred_contact] ?? lead.preferred_contact)
                : "—"}
            </Info>
            <Info label="القناة">{lead.channel || "direct"}</Info>
            <Info label="تاريخ الاستلام">{fmtDate(lead.created_at)}</Info>
            <Info label="إقرار الموافقة">
              {lead.consent_at
                ? `${fmtDate(lead.consent_at)}${
                    lead.consent_policy_version ? ` — نسخة ${lead.consent_policy_version}` : ""
                  }`
                : "غير مطلوب"}
            </Info>
            <Info label="نسخة الصفحة">{lead.page_version ?? "—"}</Info>
          </dl>

          {lead.message && (
            <div>
              <p className="text-caption font-medium">تفاصيل الطلب</p>
              <p className="mt-1 whitespace-pre-line break-words rounded-[var(--radius-m)] border border-border p-3 text-body-sm">
                {lead.message}
              </p>
            </div>
          )}

          {lead.converted_client_id && (
            <p className="text-body-sm">
              تم تحويل الطلب إلى عميل.{" "}
              <Link to="/clients" className="text-primary underline">
                فتح سجل العملاء
              </Link>
            </p>
          )}

          <fieldset disabled={!canManageLeads} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="الحالة">
                <select
                  className={inputCls}
                  value={status}
                  onChange={(e) => setStatus(e.target.value as OfficeLeadStatus)}
                >
                  {OFFICE_LEAD_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {OFFICE_LEAD_STATUS_LABELS[s]}
                    </option>
                  ))}
                </select>
              </FormField>
            </div>
            <FormField label="ملاحظة داخلية" hint="لا تظهر للعميل إطلاقاً.">
              <textarea
                rows={3}
                maxLength={2000}
                className={`${inputCls} min-h-20`}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </FormField>
          </fieldset>

          {!canManageLeads && (
            <p className="text-caption text-muted-foreground">
              تحتاج صلاحية إدارة المكتب لتحديث الطلبات أو تحويلها إلى عملاء.
            </p>
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Btn variant="outline" onClick={onClose}>
              إغلاق
            </Btn>
            <Btn
              variant="outline"
              disabled={!canManageLeads || !!lead.converted_client_id}
              loading={converting}
              onClick={() => onConvert(lead.id)}
            >
              <UserPlus className="size-4" /> تحويل إلى عميل
            </Btn>
            <Btn
              disabled={!canManageLeads}
              loading={updating}
              onClick={() => onUpdate({ leadId: lead.id, status, internalNote: note })}
            >
              حفظ التغييرات
            </Btn>
          </div>
        </div>
      )}
    </Modal>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-caption text-muted-foreground">{label}</dt>
      <dd className="break-words text-body-sm">{children}</dd>
    </div>
  );
}
