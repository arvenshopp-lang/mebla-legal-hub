/**
 * لوحة الأنشطة: تصفية بالنوع والسجل، إكمال، حذف.
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Badge,
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
  completeActivity,
  deleteActivity,
  listActivities,
  listStaffOptions,
} from "@/lib/crm.functions";
import {
  CRM_ACTIVITY_KIND_LABEL,
  CRM_ENTITY_KIND_LABEL,
  type CrmActivityKind,
  type CrmActivityRow,
  type CrmEntityKind,
} from "@/lib/crm.shared";
import { ActivityFormModal, emptyActivityDraft } from "./activity-form";
import { ActivityKindBadge, OwnerCell } from "./shared";

const PAGE_SIZE = 20;
const KINDS: (CrmActivityKind | "all")[] = [
  "all",
  "meeting",
  "call",
  "note",
  "task",
  "followup",
  "email",
];
const ENTITIES: (CrmEntityKind | "all")[] = ["all", "lead", "company", "contact", "deal"];

type Dialog =
  | { kind: "none" }
  | { kind: "complete"; row: CrmActivityRow }
  | { kind: "delete"; row: CrmActivityRow };

export function ActivitiesPanel() {
  const { can } = usePlatformAdmin();
  const queryClient = useQueryClient();
  const listFn = useServerFn(listActivities);
  const staffFn = useServerFn(listStaffOptions);
  const completeFn = useServerFn(completeActivity);
  const removeFn = useServerFn(deleteActivity);

  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<CrmActivityKind | "all">("all");
  const [entityKind, setEntityKind] = useState<CrmEntityKind | "all">("all");
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<Dialog>({ kind: "none" });
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const debounced = useDebounced(search);

  const filters = useMemo(
    () => ({
      search: debounced,
      kind,
      entityKind,
      onlyOpen,
      page,
      pageSize: PAGE_SIZE,
      ownerStaffId: "",
    }),
    [debounced, kind, entityKind, onlyOpen, page],
  );
  const query = useQuery({
    queryKey: ["crm-activities", filters],
    queryFn: () => listFn({ data: filters }),
  });
  const staffQuery = useQuery({
    queryKey: ["crm-staff"],
    queryFn: () => staffFn({ data: undefined }),
  });
  const staffOptions = staffQuery.data?.staff ?? [];

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["crm-activities"] });
    setDialog({ kind: "none" });
    setShowForm(false);
  };

  const runAction = async (action: "complete" | "delete") => {
    if (dialog.kind === "none") return;
    setBusy(true);
    try {
      if (action === "complete") await completeFn({ data: { id: dialog.row.id, outcome: "" } });
      else await removeFn({ data: { id: dialog.row.id } });
      toast.success(action === "complete" ? "تم إكمال النشاط." : "تم حذف النشاط.");
      refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذّر تنفيذ العملية.");
    } finally {
      setBusy(false);
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
        placeholder="بحث بعنوان النشاط…"
        searching={query.isFetching}
        canAdd={false}
        filters={
          <>
            <label className="sr-only" htmlFor="crm-activity-kind">
              تصفية بالنوع
            </label>
            <select
              id="crm-activity-kind"
              className={`${inputCls} h-11 w-auto min-w-[8.5rem]`}
              value={kind}
              onChange={(event) => {
                setKind(event.target.value as CrmActivityKind | "all");
                setPage(1);
              }}
            >
              {KINDS.map((value) => (
                <option key={value} value={value}>
                  {value === "all" ? "كل الأنواع" : CRM_ACTIVITY_KIND_LABEL[value]}
                </option>
              ))}
            </select>
            <label className="sr-only" htmlFor="crm-activity-entity">
              تصفية بالسجل
            </label>
            <select
              id="crm-activity-entity"
              className={`${inputCls} h-11 w-auto min-w-[8.5rem]`}
              value={entityKind}
              onChange={(event) => {
                setEntityKind(event.target.value as CrmEntityKind | "all");
                setPage(1);
              }}
            >
              {ENTITIES.map((value) => (
                <option key={value} value={value}>
                  {value === "all" ? "كل السجلات" : CRM_ENTITY_KIND_LABEL[value]}
                </option>
              ))}
            </select>
            <label className="flex h-11 items-center gap-2 rounded-lg border border-border px-3 text-body-sm">
              <input
                type="checkbox"
                className="h-4 w-4 accent-primary"
                checked={onlyOpen}
                onChange={(event) => {
                  setOnlyOpen(event.target.checked);
                  setPage(1);
                }}
              />
              غير المكتملة فقط
            </label>
          </>
        }
      />

      {query.isLoading ? (
        <LoadingBlock rows={6} cols={5} />
      ) : query.isError ? (
        <ErrorBlock message="تعذّر جلب الأنشطة. تأكد من صلاحية «قراءة CRM» ثم أعد المحاولة." />
      ) : (query.data?.rows.length ?? 0) === 0 ? (
        <EmptyState
          title="لا توجد أنشطة"
          hint="تُنشأ الأنشطة من صفحات العملاء المحتملين والصفقات."
        />
      ) : (
        <>
          <DataCard>
            <table className="w-full min-w-[46rem] text-body-sm">
              <thead>
                <tr>
                  <Th>النشاط</Th>
                  <Th>النوع</Th>
                  <Th>السجل</Th>
                  <Th>الاستحقاق</Th>
                  <Th>الحالة</Th>
                  <Th>المسؤول</Th>
                  <Th className="text-left">إجراءات</Th>
                </tr>
              </thead>
              <tbody>
                {query.data?.rows.map((row) => (
                  <tr key={row.id} className="border-t border-border">
                    <Td>
                      <span className="font-semibold">{row.subject}</span>
                      {row.body && (
                        <span className="text-caption line-clamp-1 block">{row.body}</span>
                      )}
                    </Td>
                    <Td>
                      <ActivityKindBadge kind={row.kind} />
                    </Td>
                    <Td>{CRM_ENTITY_KIND_LABEL[row.entity_kind]}</Td>
                    <Td>{row.due_at ? fmtDateTime(row.due_at) : "—"}</Td>
                    <Td>
                      {row.completed_at ? (
                        <Badge tone="green">مكتمل</Badge>
                      ) : (
                        <Badge tone="warn">قائم</Badge>
                      )}
                    </Td>
                    <Td>
                      <OwnerCell owner={row.owner} />
                    </Td>
                    <Td className="text-left">
                      <div className="flex items-center justify-end gap-1">
                        {can("crm.update") && !row.completed_at && (
                          <IconBtn
                            aria-label="إكمال"
                            title="إكمال"
                            onClick={() => setDialog({ kind: "complete", row })}
                          >
                            <Check className="h-4 w-4" aria-hidden />
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

      {showForm && (
        <ActivityFormModal
          open
          onClose={() => setShowForm(false)}
          onSaved={refresh}
          initial={emptyActivityDraft("lead", "")}
          staffOptions={staffOptions}
          lockEntity={false}
        />
      )}
      <ConfirmDialog
        open={dialog.kind === "complete"}
        onClose={() => setDialog({ kind: "none" })}
        onConfirm={() => void runAction("complete")}
        title="إكمال نشاط"
        message={dialog.kind === "complete" ? `سيتم تعليم «${dialog.row.subject}» كمكتمل.` : ""}
        loading={busy}
      />
      <ConfirmDialog
        open={dialog.kind === "delete"}
        onClose={() => setDialog({ kind: "none" })}
        onConfirm={() => void runAction("delete")}
        title="حذف نشاط"
        message={dialog.kind === "delete" ? `سيتم حذف «${dialog.row.subject}» نهائياً.` : ""}
        loading={busy}
      />
    </div>
  );
}
