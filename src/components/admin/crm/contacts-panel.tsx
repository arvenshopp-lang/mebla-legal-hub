/**
 * لوحة جهات الاتصال: بحث، إنشاء/تعديل، حذف، تصدير.
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Badge,
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
import { deleteContact, listCompanies, listContacts, listStaffOptions } from "@/lib/crm.functions";
import type { CrmContactRow } from "@/lib/crm.shared";
import { ContactFormModal, contactDraftFromRow, emptyContactDraft, type ContactDraft } from "./contact-form";
import { OwnerCell, useCrmCsvExport } from "./shared";

const PAGE_SIZE = 20;

type Dialog =
  | { kind: "none" }
  | { kind: "form"; initial: ContactDraft; editId?: string }
  | { kind: "delete"; row: CrmContactRow };

export function ContactsPanel() {
  const { can } = usePlatformAdmin();
  const queryClient = useQueryClient();
  const listFn = useServerFn(listContacts);
  const companiesFn = useServerFn(listCompanies);
  const staffFn = useServerFn(listStaffOptions);
  const removeFn = useServerFn(deleteContact);
  const { download, exporting } = useCrmCsvExport();

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<Dialog>({ kind: "none" });
  const [removing, setRemoving] = useState(false);
  const debounced = useDebounced(search);

  const filters = useMemo(
    () => ({ search: debounced, page, pageSize: PAGE_SIZE, companyId: "", ownerStaffId: "" }),
    [debounced, page],
  );
  const query = useQuery({ queryKey: ["crm-contacts", filters], queryFn: () => listFn({ data: filters }) });
  const staffQuery = useQuery({ queryKey: ["crm-staff"], queryFn: () => staffFn({ data: undefined }) });
  const companiesQuery = useQuery({
    queryKey: ["crm-company-options"],
    queryFn: () => companiesFn({ data: { search: "", page: 1, pageSize: 200, status: "", ownerStaffId: "" } }),
  });

  const staffOptions = staffQuery.data?.staff ?? [];
  const companyOptions = (companiesQuery.data?.rows ?? []).map((row) => ({ id: row.id, name: row.name }));

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["crm-contacts"] });
    setDialog({ kind: "none" });
  };

  const confirmDelete = async () => {
    if (dialog.kind !== "delete") return;
    setRemoving(true);
    try {
      await removeFn({ data: { id: dialog.row.id } });
      toast.success("تم حذف جهة الاتصال.");
      refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذّر حذف جهة الاتصال.");
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
        addLabel="جهة اتصال"
        onAdd={() => setDialog({ kind: "form", initial: emptyContactDraft() })}
        filters={
          can("crm.export") ? (
            <Btn variant="outline" loading={exporting === "contacts"} onClick={() => void download("contacts")}>
              <Download className="h-4 w-4" aria-hidden /> تصدير
            </Btn>
          ) : undefined
        }
      />

      {query.isLoading ? (
        <LoadingBlock rows={6} cols={5} />
      ) : query.isError ? (
        <ErrorBlock message="تعذّر جلب جهات الاتصال. تأكد من صلاحية «قراءة CRM» ثم أعد المحاولة." />
      ) : (query.data?.rows.length ?? 0) === 0 ? (
        <EmptyState title="لا توجد جهات اتصال" hint="أضف جهات الاتصال لربطها بالشركات والصفقات." />
      ) : (
        <>
          <DataCard>
            <table className="w-full min-w-[46rem] text-body-sm">
              <thead>
                <tr>
                  <Th>الاسم</Th>
                  <Th>الشركة</Th>
                  <Th>المسمى الوظيفي</Th>
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
                      <span className="font-semibold">{row.full_name}</span>
                      {row.is_primary && (
                        <Badge tone="gold" className="ms-2">
                          جهة أساسية
                        </Badge>
                      )}
                    </Td>
                    <Td>{row.company_name ?? "—"}</Td>
                    <Td>{row.job_title ?? "—"}</Td>
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
                            onClick={() => setDialog({ kind: "form", initial: contactDraftFromRow(row), editId: row.id })}
                          >
                            <Pencil className="h-4 w-4" aria-hidden />
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
        <ContactFormModal
          open
          onClose={() => setDialog({ kind: "none" })}
          onSaved={refresh}
          initial={dialog.initial}
          editId={dialog.editId}
          staffOptions={staffOptions}
          companyOptions={companyOptions}
        />
      )}
      <ConfirmDialog
        open={dialog.kind === "delete"}
        onClose={() => setDialog({ kind: "none" })}
        onConfirm={() => void confirmDelete()}
        title="حذف جهة اتصال"
        message={dialog.kind === "delete" ? `سيتم حذف «${dialog.row.full_name}» نهائياً.` : ""}
        loading={removing}
      />
    </div>
  );
}
