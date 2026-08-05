/**
 * لوحة العملاء المحتملين: بحث وتصفية، إنشاء/تعديل، إسناد، استبعاد، تحويل، حذف، تصدير.
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, Pencil, Trash2, UserCheck, UserX, Wand2 } from "lucide-react";
import { toast } from "sonner";
import {
  Btn,
  ConfirmDialog,
  DataCard,
  EmptyState,
  ErrorBlock,
  IconBtn,
  LoadingBlock,
  PageToolbar,
  Pagination,
  Td,
  Th,
  inputCls,
  useDebounced,
} from "@/lib/list-utils";
import { fmtDateTime } from "@/lib/enums";
import { usePlatformAdmin } from "@/hooks/use-platform-admin";
import { deleteLead, listLeads, listPipelineStages, listStaffOptions } from "@/lib/crm.functions";
import { CRM_LEAD_STATUS_LABEL, type CrmLeadRow, type CrmLeadStatus } from "@/lib/crm.shared";
import { LeadFormModal, emptyLeadDraft, leadDraftFromRow, type LeadDraft } from "./lead-form";
import { AssignModal, ConvertLeadModal, DisqualifyLeadModal } from "./action-modals";
import { LeadStatusBadge, OwnerCell, useCrmCsvExport } from "./shared";

const PAGE_SIZE = 20;
const STATUSES: (CrmLeadStatus | "all")[] = ["all", "new", "contacted", "qualified", "unqualified", "converted", "lost"];

type Dialog =
  | { kind: "none" }
  | { kind: "form"; initial: LeadDraft; editId?: string }
  | { kind: "assign"; row: CrmLeadRow }
  | { kind: "disqualify"; row: CrmLeadRow }
  | { kind: "convert"; row: CrmLeadRow }
  | { kind: "delete"; row: CrmLeadRow };

export function LeadsPanel() {
  const { can } = usePlatformAdmin();
  const queryClient = useQueryClient();
  const listFn = useServerFn(listLeads);
  const staffFn = useServerFn(listStaffOptions);
  const stagesFn = useServerFn(listPipelineStages);
  const removeFn = useServerFn(deleteLead);
  const { download, exporting } = useCrmCsvExport();

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<CrmLeadStatus | "all">("all");
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<Dialog>({ kind: "none" });
  const [removing, setRemoving] = useState(false);
  const debounced = useDebounced(search);

  const filters = useMemo(
    () => ({ search: debounced, status, page, pageSize: PAGE_SIZE, source: "", ownerStaffId: "" }),
    [debounced, status, page],
  );

  const query = useQuery({
    queryKey: ["crm-leads", filters],
    queryFn: () => listFn({ data: filters }),
  });
  const staffQuery = useQuery({ queryKey: ["crm-staff"], queryFn: () => staffFn({ data: undefined }) });
  const stagesQuery = useQuery({ queryKey: ["crm-stages"], queryFn: () => stagesFn({ data: undefined }) });

  const staffOptions = staffQuery.data ?? [];
  const stageOptions = (stagesQuery.data ?? []).filter((stage) => stage.is_active);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["crm-leads"] });
    void queryClient.invalidateQueries({ queryKey: ["crm-pipeline"] });
    setDialog({ kind: "none" });
  };

  const confirmDelete = async () => {
    if (dialog.kind !== "delete") return;
    setRemoving(true);
    try {
      await removeFn({ data: { id: dialog.row.id } });
      toast.success("تم حذف العميل المحتمل.");
      refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذّر حذف العميل المحتمل.");
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div>
      <PageToolbar
        search={search}
        setSearch={(value) => {
          setSearch(value);
          setPage(1);
        }}
        placeholder="بحث بالاسم أو البريد أو الجوال…"
        searching={query.isFetching}
        canAdd={can("crm.create")}
        addLabel="عميل محتمل"
        onAdd={() => setDialog({ kind: "form", initial: emptyLeadDraft() })}
        filters={
          <>
            <label className="sr-only" htmlFor="crm-lead-status">
              تصفية بالحالة
            </label>
            <select
              id="crm-lead-status"
              className={`${inputCls} h-11 w-auto min-w-[9rem]`}
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as CrmLeadStatus | "all");
                setPage(1);
              }}
            >
              {STATUSES.map((value) => (
                <option key={value} value={value}>
                  {value === "all" ? "كل الحالات" : CRM_LEAD_STATUS_LABEL[value]}
                </option>
              ))}
            </select>
            {can("crm.export") && (
              <Btn variant="outline" loading={exporting === "leads"} onClick={() => void download("leads")}>
                <Download className="h-4 w-4" aria-hidden /> تصدير
              </Btn>
            )}
          </>
        }
      />

      {query.isLoading ? (
        <LoadingBlock rows={6} cols={5} />
      ) : query.isError ? (
        <ErrorBlock message="تعذّر جلب قائمة العملاء المحتملين. تأكد من صلاحية «قراءة CRM» ثم أعد المحاولة." />
      ) : (query.data?.rows.length ?? 0) === 0 ? (
        <EmptyState
          title="لا يوجد عملاء محتملون"
          hint="أضف أول عميل محتمل لتبدأ متابعة الفرص التجارية."
          action={
            can("crm.create") ? (
              <Btn onClick={() => setDialog({ kind: "form", initial: emptyLeadDraft() })}>إضافة عميل محتمل</Btn>
            ) : undefined
          }
        />
      ) : (
        <>
          <DataCard>
            <table className="w-full min-w-[52rem] text-body-sm">
              <thead>
                <tr>
                  <Th>الاسم</Th>
                  <Th>الشركة</Th>
                  <Th>التواصل</Th>
                  <Th>الحالة</Th>
                  <Th>المصدر</Th>
                  <Th>المسؤول</Th>
                  <Th>أُضيف</Th>
                  <Th className="text-left">إجراءات</Th>
                </tr>
              </thead>
              <tbody>
                {query.data?.rows.map((row) => (
                  <tr key={row.id} className="border-t border-border">
                    <Td>
                      <span className="font-semibold">{row.full_name}</span>
                      {row.city && <span className="text-caption block">{row.city}</span>}
                    </Td>
                    <Td>{row.company_name ?? "—"}</Td>
                    <Td>
                      <span className="block" dir="ltr">
                        {row.email ?? "—"}
                      </span>
                      <span className="text-caption block" dir="ltr">
                        {row.phone ?? ""}
                      </span>
                    </Td>
                    <Td>
                      <LeadStatusBadge status={row.status} />
                    </Td>
                    <Td>{row.source ?? "—"}</Td>
                    <Td>
                      <OwnerCell owner={row.owner} />
                    </Td>
                    <Td>{fmtDateTime(row.created_at)}</Td>
                    <Td className="text-left">
                      <div className="flex items-center justify-end gap-1">
                        {can("crm.update") && (
                          <>
                            <IconBtn
                              label="تعديل"
                              onClick={() => setDialog({ kind: "form", initial: leadDraftFromRow(row), editId: row.id })}
                            >
                              <Pencil className="h-4 w-4" aria-hidden />
                            </IconBtn>
                            <IconBtn label="إسناد لموظف" onClick={() => setDialog({ kind: "assign", row })}>
                              <UserCheck className="h-4 w-4" aria-hidden />
                            </IconBtn>
                          </>
                        )}
                        {can("crm.convert") && row.status !== "converted" && (
                          <IconBtn label="تحويل إلى شركة وصفقة" onClick={() => setDialog({ kind: "convert", row })}>
                            <Wand2 className="h-4 w-4" aria-hidden />
                          </IconBtn>
                        )}
                        {can("crm.update") && row.status !== "unqualified" && (
                          <IconBtn label="استبعاد" onClick={() => setDialog({ kind: "disqualify", row })}>
                            <UserX className="h-4 w-4" aria-hidden />
                          </IconBtn>
                        )}
                        {can("crm.delete") && (
                          <IconBtn label="حذف" danger onClick={() => setDialog({ kind: "delete", row })}>
                            <Trash2 className="h-4 w-4" aria-hidden />
                          </IconBtn>
                        )}
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DataCard>
          <Pagination page={page} setPage={setPage} total={query.data?.total ?? 0} pageSize={PAGE_SIZE} />
        </>
      )}

      {dialog.kind === "form" && (
        <LeadFormModal
          open
          onClose={() => setDialog({ kind: "none" })}
          onSaved={refresh}
          initial={dialog.initial}
          editId={dialog.editId}
          staffOptions={staffOptions}
        />
      )}
      {dialog.kind === "assign" && (
        <AssignModal
          open
          onClose={() => setDialog({ kind: "none" })}
          onSaved={refresh}
          entity="lead"
          id={dialog.row.id}
          label={dialog.row.full_name}
          staffOptions={staffOptions}
        />
      )}
      {dialog.kind === "disqualify" && (
        <DisqualifyLeadModal open onClose={() => setDialog({ kind: "none" })} onSaved={refresh} id={dialog.row.id} />
      )}
      {dialog.kind === "convert" && (
        <ConvertLeadModal
          open
          onClose={() => setDialog({ kind: "none" })}
          onSaved={refresh}
          id={dialog.row.id}
          leadName={dialog.row.full_name}
          companyName={dialog.row.company_name}
          staffOptions={staffOptions}
          stageOptions={stageOptions}
        />
      )}
      <ConfirmDialog
        open={dialog.kind === "delete"}
        onClose={() => setDialog({ kind: "none" })}
        onConfirm={() => void confirmDelete()}
        title="حذف عميل محتمل"
        message={dialog.kind === "delete" ? `سيتم حذف «${dialog.row.full_name}» نهائياً.` : ""}
        loading={removing}
      />
    </div>
  );
}
