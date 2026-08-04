/** سجل تدقيق RBAC مع ترقيم صفحات خادمي وتصفية بالعملية. */
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Badge,
  DataCard,
  EmptyState,
  ErrorBlock,
  LoadingBlock,
  Modal,
  PageToolbar,
  Pagination,
  Td,
  Th,
  inputCls,
  useDebounced,
} from "@/lib/list-utils";
import { getRbacAuditPage } from "@/lib/rbac/rbac.functions";
import { formatRiyadh, type RbacAuditRow } from "./shared";

const ACTION_LABELS: Record<string, string> = {
  "authz.denied": "رفض وصول",
  "authz.allowed": "سماح موثّق",
  "rbac.role_saved": "حفظ دور",
  "rbac.role_deleted": "حذف دور",
  "rbac.department_saved": "حفظ قسم",
  "rbac.staff_org_updated": "تحديث ارتباط موظف",
  "rbac.grant_created": "إصدار منح",
  "rbac.grant_revoked": "سحب منح",
  "rbac.approval_requested": "طلب اعتماد",
  "rbac.approval_decided": "قرار اعتماد",
  "rbac.session_revoked": "إبطال جلسة",
  "rbac.restrictions_saved": "حفظ قيود",
  "rbac.impersonation_requested": "طلب انتحال",
  "rbac.impersonation_approved": "اعتماد انتحال",
  "rbac.impersonation_ended": "إنهاء انتحال",
  "rbac.impersonation_page": "زيارة صفحة (انتحال)",
};

const PAGE_SIZE = 20;

export function AuditPanel() {
  const [search, setSearch] = useState("");
  const [action, setAction] = useState("");
  const [page, setPage] = useState(1);
  const [details, setDetails] = useState<RbacAuditRow | null>(null);
  const debounced = useDebounced(search, 350);

  useEffect(() => {
    setPage(1);
  }, [debounced, action]);

  const fetchFn = useServerFn(getRbacAuditPage);
  const query = useQuery({
    queryKey: ["rbac-audit", debounced, action, page],
    queryFn: () =>
      fetchFn({
        data: {
          ...(debounced.trim() ? { search: debounced.trim() } : {}),
          ...(action ? { action } : {}),
          page,
          pageSize: PAGE_SIZE,
        },
      }),
  });

  const rows = (query.data?.rows ?? []) as RbacAuditRow[];

  return (
    <div>
      <PageToolbar
        search={search}
        setSearch={setSearch}
        placeholder="بحث بالبريد أو الوصف أو نوع المورد…"
        searching={query.isFetching}
        filters={
          <select
            className={`${inputCls} h-11 w-auto`}
            value={action}
            onChange={(e) => setAction(e.target.value)}
            aria-label="تصفية بالعملية"
          >
            <option value="">كل العمليات</option>
            {Object.entries(ACTION_LABELS).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        }
      />

      {query.isPending ? (
        <DataCard>
          <LoadingBlock rows={6} cols={4} />
        </DataCard>
      ) : query.isError ? (
        <ErrorBlock message="تعذّر تحميل سجل التدقيق. حدّث الصفحة وحاول مرة أخرى." />
      ) : rows.length === 0 ? (
        <DataCard>
          <EmptyState title="لا توجد سجلات مطابقة" hint="جرّب توسيع نطاق البحث أو إلغاء التصفية." />
        </DataCard>
      ) : (
        <>
          <DataCard>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-right">
                <thead>
                  <tr>
                    <Th>الوقت (الرياض)</Th>
                    <Th>المنفّذ</Th>
                    <Th>العملية</Th>
                    <Th>المورد</Th>
                    <Th>الوصف</Th>
                    <Th className="w-24"><span className="sr-only">تفاصيل</span></Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t border-border">
                      <Td>
                        <span className="text-[12px]">{formatRiyadh(r.created_at)}</span>
                      </Td>
                      <Td>
                        <span className="block text-[12px]">{r.actor_email ?? "—"}</span>
                        <span dir="ltr" className="block font-mono text-[11px] text-text-muted">
                          {r.ip ?? "—"}
                        </span>
                      </Td>
                      <Td>
                        <Badge tone={r.action === "authz.denied" ? "red" : "muted"}>
                          {ACTION_LABELS[r.action] ?? r.action}
                        </Badge>
                      </Td>
                      <Td>
                        <span className="block text-[12px]">{r.entity_type}</span>
                        {r.entity_id && (
                          <span dir="ltr" className="block font-mono text-[11px] text-text-muted">
                            {r.entity_id.slice(0, 8)}
                          </span>
                        )}
                      </Td>
                      <Td>
                        <span className="text-[12px]">{r.description ?? "—"}</span>
                      </Td>
                      <Td>
                        <button
                          type="button"
                          className="text-[12px] font-medium text-primary underline underline-offset-2"
                          onClick={() => setDetails(r)}
                        >
                          التفاصيل
                        </button>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </DataCard>
          <Pagination page={page} setPage={setPage} total={query.data?.total ?? 0} pageSize={PAGE_SIZE} />
        </>
      )}

      <Modal open={!!details} onClose={() => setDetails(null)} title="تفاصيل السجل" size="lg">
        {details && (
          <div className="space-y-3 text-[12px]">
            <p>
              <span className="text-text-muted">الوقت: </span>
              {formatRiyadh(details.created_at)}
            </p>
            <p>
              <span className="text-text-muted">الجهاز: </span>
              {details.device ?? "—"} · {details.browser ?? "—"}
            </p>
            <pre dir="ltr" className="max-h-72 overflow-auto rounded-[var(--radius-m)] bg-surface-muted p-3 text-[11px]">
              {JSON.stringify(details.metadata ?? {}, null, 2)}
            </pre>
          </div>
        )}
      </Modal>
    </div>
  );
}
