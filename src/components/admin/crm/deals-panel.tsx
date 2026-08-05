/**
 * لوحة الصفقات: بحث وتصفية بالحالة والمرحلة، إنشاء/تعديل، تحريك مرحلة، إسناد، حذف، تصدير.
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, MoveRight, Pencil, Trash2, UserCheck } from "lucide-react";
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
import {
  deleteDeal,
  listCompanies,
  listContacts,
  listDeals,
  listPipelineStages,
  listStaffOptions,
} from "@/lib/crm.functions";
import { CRM_DEAL_STATUS_LABEL, type CrmDealRow, type CrmDealStatus } from "@/lib/crm.shared";
import { DealFormModal, dealDraftFromRow, emptyDealDraft, type DealDraft } from "./deal-form";
import { AssignModal, MoveDealStageModal } from "./action-modals";
import { DealStatusBadge, Money, OwnerCell, useCrmCsvExport } from "./shared";

const PAGE_SIZE = 20;
const STATUSES: (CrmDealStatus | "all")[] = ["all", "open", "won", "lost", "abandoned"];

type Dialog =
  | { kind: "none" }
  | { kind: "form"; initial: DealDraft; editId?: string }
  | { kind: "assign"; row: CrmDealRow }
  | { kind: "stage"; row: CrmDealRow }
  | { kind: "delete"; row: CrmDealRow };

export function DealsPanel() {
  const { can } = usePlatformAdmin();
  const queryClient = useQueryClient();
  const listFn = useServerFn(listDeals);
  const stagesFn = useServerFn(listPipelineStages);
  const staffFn = useServerFn(listStaffOptions);
  const companiesFn = useServerFn(listCompanies);
  const contactsFn = useServerFn(listContacts);
  const removeFn = useServerFn(deleteDeal);
  const { download, exporting } = useCrmCsvExport();

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<CrmDealStatus | "all">("all");
  const [stageId, setStageId] = useState("");
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<Dialog>({ kind: "none" });
  const [removing, setRemoving] = useState(false);
  const debounced = useDebounced(search);

  const filters = useMemo(
    () => ({
      search: debounced,
      status,
      stageId,
      page,
      pageSize: PAGE_SIZE,
      ownerStaffId: "",
      companyId: "",
    }),
    [debounced, status, stageId, page],
  );
  const query = useQuery({
    queryKey: ["crm-deals", filters],
    queryFn: () => listFn({ data: filters }),
  });
  const stagesQuery = useQuery({
    queryKey: ["crm-stages"],
    queryFn: () => stagesFn({ data: undefined }),
  });
  const staffQuery = useQuery({
    queryKey: ["crm-staff"],
    queryFn: () => staffFn({ data: undefined }),
  });
  const companiesQuery = useQuery({
    queryKey: ["crm-company-options"],
    queryFn: () =>
      companiesFn({ data: { search: "", page: 1, pageSize: 200, status: "", ownerStaffId: "" } }),
  });
  const contactsQuery = useQuery({
    queryKey: ["crm-contact-options"],
    queryFn: () =>
      contactsFn({ data: { search: "", page: 1, pageSize: 200, companyId: "", ownerStaffId: "" } }),
  });

  const stages = stagesQuery.data?.stages ?? [];
  const activeStages = stages.filter((stage) => stage.is_active);
  const staffOptions = staffQuery.data?.staff ?? [];
  const companyOptions = (companiesQuery.data?.rows ?? []).map((row) => ({
    id: row.id,
    name: row.name,
  }));
  const contactOptions = (contactsQuery.data?.rows ?? []).map((row) => ({
    id: row.id,
    full_name: row.full_name,
  }));

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["crm-deals"] });
    void queryClient.invalidateQueries({ queryKey: ["crm-pipeline"] });
    setDialog({ kind: "none" });
  };

  const confirmDelete = async () => {
    if (dialog.kind !== "delete") return;
    setRemoving(true);
    try {
      await removeFn({ data: { id: dialog.row.id } });
      toast.success("تم حذف الصفقة.");
      refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذّر حذف الصفقة.");
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
        placeholder="بحث بعنوان الصفقة…"
        searching={query.isFetching}
        canAdd={can("crm.create") && activeStages.length > 0}
        addLabel="صفقة"
        onAdd={() =>
          setDialog({ kind: "form", initial: emptyDealDraft(activeStages[0]?.id ?? "") })
        }
        filters={
          <>
            <label className="sr-only" htmlFor="crm-deal-status">
              تصفية بالحالة
            </label>
            <select
              id="crm-deal-status"
              className={`${inputCls} h-11 w-auto min-w-[8.5rem]`}
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as CrmDealStatus | "all");
                setPage(1);
              }}
            >
              {STATUSES.map((value) => (
                <option key={value} value={value}>
                  {value === "all" ? "كل الحالات" : CRM_DEAL_STATUS_LABEL[value]}
                </option>
              ))}
            </select>
            <label className="sr-only" htmlFor="crm-deal-stage">
              تصفية بالمرحلة
            </label>
            <select
              id="crm-deal-stage"
              className={`${inputCls} h-11 w-auto min-w-[9rem]`}
              value={stageId}
              onChange={(event) => {
                setStageId(event.target.value);
                setPage(1);
              }}
            >
              <option value="">كل المراحل</option>
              {stages.map((stage) => (
                <option key={stage.id} value={stage.id}>
                  {stage.name}
                </option>
              ))}
            </select>
            {can("crm.export") && (
              <Btn
                variant="outline"
                loading={exporting === "deals"}
                onClick={() => void download("deals")}
              >
                <Download className="h-4 w-4" aria-hidden /> تصدير
              </Btn>
            )}
          </>
        }
      />

      {query.isLoading ? (
        <LoadingBlock rows={6} cols={5} />
      ) : query.isError ? (
        <ErrorBlock message="تعذّر جلب الصفقات. تأكد من صلاحية «قراءة CRM» ثم أعد المحاولة." />
      ) : (query.data?.rows.length ?? 0) === 0 ? (
        <EmptyState
          title="لا توجد صفقات"
          hint={
            activeStages.length === 0
              ? "أنشئ مراحل خط البيع أولاً من تبويب «مراحل خط البيع»."
              : "أضف أول صفقة لبدء متابعة خط البيع."
          }
        />
      ) : (
        <>
          <DataCard>
            <table className="w-full min-w-[52rem] text-body-sm">
              <thead>
                <tr>
                  <Th>الصفقة</Th>
                  <Th>القيمة</Th>
                  <Th>المرحلة</Th>
                  <Th>الحالة</Th>
                  <Th>الشركة</Th>
                  <Th>الإغلاق المتوقع</Th>
                  <Th>المسؤول</Th>
                  <Th className="text-left">إجراءات</Th>
                </tr>
              </thead>
              <tbody>
                {query.data?.rows.map((row) => (
                  <tr key={row.id} className="border-t border-border">
                    <Td>
                      <span className="font-semibold">{row.title}</span>
                      <span className="text-caption block">{fmtDateTime(row.created_at)}</span>
                    </Td>
                    <Td>
                      <Money value={row.amount} currency={row.currency} />
                      <span className="text-caption block">احتمالية {row.probability}%</span>
                    </Td>
                    <Td>{row.stage_name ?? "—"}</Td>
                    <Td>
                      <DealStatusBadge status={row.status} />
                    </Td>
                    <Td>{row.company_name ?? "—"}</Td>
                    <Td>{row.expected_close_date ?? "—"}</Td>
                    <Td>
                      <OwnerCell owner={row.owner} />
                    </Td>
                    <Td className="text-left">
                      <div className="flex items-center justify-end gap-1">
                        {can("crm.update") && (
                          <>
                            <IconBtn
                              aria-label="تعديل"
                              title="تعديل"
                              onClick={() =>
                                setDialog({
                                  kind: "form",
                                  initial: dealDraftFromRow(row),
                                  editId: row.id,
                                })
                              }
                            >
                              <Pencil className="h-4 w-4" aria-hidden />
                            </IconBtn>
                            <IconBtn
                              aria-label="تحريك المرحلة"
                              title="تحريك المرحلة"
                              onClick={() => setDialog({ kind: "stage", row })}
                            >
                              <MoveRight className="h-4 w-4" aria-hidden />
                            </IconBtn>
                          </>
                        )}
                        {can("crm.assign") && (
                          <IconBtn
                            aria-label="إسناد لموظف"
                            title="إسناد لموظف"
                            onClick={() => setDialog({ kind: "assign", row })}
                          >
                            <UserCheck className="h-4 w-4" aria-hidden />
                          </IconBtn>
                        )}
                        {can("crm.delete") && (
                          <IconBtn
                            aria-label="حذف"
                            title="حذف"
                            tone="danger"
                            onClick={() => setDialog({ kind: "delete", row })}
                          >
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
          <Pagination
            page={page}
            setPage={setPage}
            total={query.data?.total ?? 0}
            pageSize={PAGE_SIZE}
          />
        </>
      )}

      {dialog.kind === "form" && (
        <DealFormModal
          open
          onClose={() => setDialog({ kind: "none" })}
          onSaved={refresh}
          initial={dialog.initial}
          editId={dialog.editId}
          staffOptions={staffOptions}
          companyOptions={companyOptions}
          contactOptions={contactOptions}
          stageOptions={activeStages}
        />
      )}
      {dialog.kind === "assign" && (
        <AssignModal
          open
          onClose={() => setDialog({ kind: "none" })}
          onSaved={refresh}
          entity="deal"
          id={dialog.row.id}
          label={dialog.row.title}
          staffOptions={staffOptions}
        />
      )}
      {dialog.kind === "stage" && (
        <MoveDealStageModal
          open
          onClose={() => setDialog({ kind: "none" })}
          onSaved={refresh}
          id={dialog.row.id}
          dealTitle={dialog.row.title}
          stageOptions={activeStages}
        />
      )}
      <ConfirmDialog
        open={dialog.kind === "delete"}
        onClose={() => setDialog({ kind: "none" })}
        onConfirm={() => void confirmDelete()}
        title="حذف صفقة"
        message={dialog.kind === "delete" ? `سيتم حذف «${dialog.row.title}» نهائياً.` : ""}
        loading={removing}
      />
    </div>
  );
}
