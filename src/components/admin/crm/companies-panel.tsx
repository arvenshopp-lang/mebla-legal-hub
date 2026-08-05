/**
 * لوحة الشركات: بحث، إنشاء/تعديل، إسناد، حذف، تصدير.
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, Pencil, Trash2, UserCheck } from "lucide-react";
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
  useDebounced,
} from "@/lib/list-utils";
import { fmtDateTime } from "@/lib/enums";
import { usePlatformAdmin } from "@/hooks/use-platform-admin";
import { deleteCompany, listCompanies, listStaffOptions } from "@/lib/crm.functions";
import type { CrmCompanyRow } from "@/lib/crm.shared";
import { CompanyFormModal, companyDraftFromRow, emptyCompanyDraft, type CompanyDraft } from "./company-form";
import { AssignModal } from "./action-modals";
import { OwnerCell, useCrmCsvExport } from "./shared";

const PAGE_SIZE = 20;

type Dialog =
  | { kind: "none" }
  | { kind: "form"; initial: CompanyDraft; editId?: string }
  | { kind: "assign"; row: CrmCompanyRow }
  | { kind: "delete"; row: CrmCompanyRow };

export function CompaniesPanel() {
  const { can } = usePlatformAdmin();
  const queryClient = useQueryClient();
  const listFn = useServerFn(listCompanies);
  const staffFn = useServerFn(listStaffOptions);
  const removeFn = useServerFn(deleteCompany);
  const { download, exporting } = useCrmCsvExport();

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<Dialog>({ kind: "none" });
  const [removing, setRemoving] = useState(false);
  const debounced = useDebounced(search);

  const filters = useMemo(
    () => ({ search: debounced, page, pageSize: PAGE_SIZE, status: "", ownerStaffId: "" }),
    [debounced, page],
  );
  const query = useQuery({ queryKey: ["crm-companies", filters], queryFn: () => listFn({ data: filters }) });
  const staffQuery = useQuery({ queryKey: ["crm-staff"], queryFn: () => staffFn({ data: undefined }) });
  const staffOptions = staffQuery.data?.staff ?? [];

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["crm-companies"] });
    setDialog({ kind: "none" });
  };

  const confirmDelete = async () => {
    if (dialog.kind !== "delete") return;
    setRemoving(true);
    try {
      await removeFn({ data: { id: dialog.row.id } });
      toast.success("تم حذف الشركة.");
      refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذّر حذف الشركة.");
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
        placeholder="بحث بالاسم أو البريد أو المدينة…"
        searching={query.isFetching}
        canAdd={can("crm.create")}
        addLabel="شركة"
        onAdd={() => setDialog({ kind: "form", initial: emptyCompanyDraft() })}
        filters={
          can("crm.export") ? (
            <Btn variant="outline" loading={exporting === "companies"} onClick={() => void download("companies")}>
              <Download className="h-4 w-4" aria-hidden /> تصدير
            </Btn>
          ) : undefined
        }
      />

      {query.isLoading ? (
        <LoadingBlock rows={6} cols={5} />
      ) : query.isError ? (
        <ErrorBlock message="تعذّر جلب قائمة الشركات. تأكد من صلاحية «قراءة CRM» ثم أعد المحاولة." />
      ) : (query.data?.rows.length ?? 0) === 0 ? (
        <EmptyState title="لا توجد شركات" hint="أضف الشركات لربط جهات الاتصال والصفقات بها." />
      ) : (
        <>
          <DataCard>
            <table className="w-full min-w-[48rem] text-body-sm">
              <thead>
                <tr>
                  <Th>الشركة</Th>
                  <Th>القطاع</Th>
                  <Th>المدينة</Th>
                  <Th>التواصل</Th>
                  <Th>المسؤول</Th>
                  <Th>أُضيفت</Th>
                  <Th className="text-left">إجراءات</Th>
                </tr>
              </thead>
              <tbody>
                {query.data?.rows.map((row) => (
                  <tr key={row.id} className="border-t border-border">
                    <Td>
                      <span className="font-semibold">{row.name}</span>
                      {row.legal_name && <span className="text-caption block">{row.legal_name}</span>}
                    </Td>
                    <Td>{row.sector ?? "—"}</Td>
                    <Td>{row.city ?? "—"}</Td>
                    <Td>
                      <span className="block" dir="ltr">
                        {row.email ?? "—"}
                      </span>
                      <span className="text-caption block" dir="ltr">
                        {row.phone ?? ""}
                      </span>
                    </Td>
                    <Td>
                      <OwnerCell owner={row.owner} />
                    </Td>
                    <Td>{fmtDateTime(row.created_at)}</Td>
                    <Td className="text-left">
                      <div className="flex items-center justify-end gap-1">
                        {can("crm.update") && (
                          <IconBtn
                            aria-label="تعديل"
                            title="تعديل"
                            onClick={() => setDialog({ kind: "form", initial: companyDraftFromRow(row), editId: row.id })}
                          >
                            <Pencil className="h-4 w-4" aria-hidden />
                          </IconBtn>
                        )}
                        {can("crm.assign") && (
                          <IconBtn aria-label="إسناد لموظف" title="إسناد لموظف" onClick={() => setDialog({ kind: "assign", row })}>
                            <UserCheck className="h-4 w-4" aria-hidden />
                          </IconBtn>
                        )}
                        {can("crm.delete") && (
                          <IconBtn aria-label="حذف" title="حذف" tone="danger" onClick={() => setDialog({ kind: "delete", row })}>
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
        <CompanyFormModal
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
          entity="company"
          id={dialog.row.id}
          label={dialog.row.name}
          staffOptions={staffOptions}
        />
      )}
      <ConfirmDialog
        open={dialog.kind === "delete"}
        onClose={() => setDialog({ kind: "none" })}
        onConfirm={() => void confirmDelete()}
        title="حذف شركة"
        message={dialog.kind === "delete" ? `سيتم حذف «${dialog.row.name}» نهائياً.` : ""}
        loading={removing}
      />
    </div>
  );
}
