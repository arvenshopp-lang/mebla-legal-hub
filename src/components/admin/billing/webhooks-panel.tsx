import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Eye, RotateCcw, ShieldOff, Undo2 } from "lucide-react";
import {
  Btn,
  DataCard,
  EmptyState,
  ErrorBlock,
  FormField,
  LoadingBlock,
  Modal,
  PageToolbar,
  Pagination,
  Td,
  Th,
  inputCls,
  useDebounced,
  Badge,
} from "@/lib/list-utils";
import {
  billingDeadLetterWebhook,
  billingListWebhooks,
  billingReopenWebhook,
  billingRetryWebhook,
  billingRetryWebhooks,
  billingWebhookDetail,
} from "@/lib/billing/billing.functions";
import { WEBHOOK_STATUS_LABELS, formatDateTime } from "@/lib/billing/billing.shared";
import { usePlatformAdmin } from "@/hooks/use-platform-admin";
import { WebhookStatusBadge } from "./shared";

const PAGE_SIZE = 20;
const STATUSES = ["all", "received", "processed", "ignored", "failed", "dead_letter"] as const;

type WebhookRow = {
  id: string;
  provider: string;
  event_id: string | null;
  event_type: string | null;
  signature_valid: boolean;
  replay_detected: boolean;
  status: string;
  attempts: number;
  last_error: string | null;
  next_retry_at: string | null;
  processed_at: string | null;
  received_at: string;
  correlation_id: string | null;
};

export function WebhooksPanel() {
  const qc = useQueryClient();
  const { can } = usePlatformAdmin();
  const manage = can("billing.manage_providers");

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [page, setPage] = useState(1);
  const debounced = useDebounced(search);

  const [detailId, setDetailId] = useState<string | null>(null);
  const [action, setAction] = useState<{ id: string; kind: "dead_letter" | "reopen" } | null>(null);
  const [reason, setReason] = useState("");

  const listFn = useServerFn(billingListWebhooks);
  const detailFn = useServerFn(billingWebhookDetail);
  const retryFn = useServerFn(billingRetryWebhook);
  const retryAllFn = useServerFn(billingRetryWebhooks);
  const deadFn = useServerFn(billingDeadLetterWebhook);
  const reopenFn = useServerFn(billingReopenWebhook);

  const query = useQuery({
    queryKey: ["billing-webhooks", debounced, status, page],
    queryFn: () =>
      listFn({ data: { search: debounced || null, status, provider: null, page, pageSize: PAGE_SIZE } }),
  });

  const detail = useQuery({
    queryKey: ["billing-webhook-detail", detailId],
    queryFn: () => detailFn({ data: { id: detailId as string } }),
    enabled: Boolean(detailId),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["billing-webhooks"] });
    qc.invalidateQueries({ queryKey: ["billing-provider-stats"] });
  };

  const retry = useMutation({
    mutationFn: (id: string) => retryFn({ data: { id } }),
    onSuccess: (result) => {
      const outcome = result as { processed: boolean; status: string };
      if (outcome.processed) toast.success("تمت معالجة الرسالة وتحديث الدفعة.");
      else toast.warning(`لم تُطبَّق الرسالة — الحالة: ${WEBHOOK_STATUS_LABELS[outcome.status] ?? outcome.status}`);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const retryAll = useMutation({
    mutationFn: () => retryAllFn({ data: undefined as never }),
    onSuccess: (result) => {
      const outcome = result as { retried?: number };
      toast.success(`تمت إعادة محاولة ${outcome?.retried ?? 0} رسالة مستحقة.`);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const submitAction = useMutation({
    mutationFn: () => {
      if (!action) throw new Error("لا يوجد إجراء.");
      const payload = { data: { id: action.id, reason } };
      return action.kind === "dead_letter" ? deadFn(payload) : reopenFn(payload);
    },
    onSuccess: () => {
      toast.success(action?.kind === "dead_letter" ? "تم ترحيل الرسالة." : "تم إعادة فتح الرسالة.");
      setAction(null);
      setReason("");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const rows = (query.data?.rows ?? []) as unknown as WebhookRow[];
  const detailRow = detail.data as unknown as (WebhookRow & { raw_body: string; request_id: string | null }) | undefined;

  return (
    <div>
      <PageToolbar
        search={search}
        setSearch={(value) => {
          setSearch(value);
          setPage(1);
        }}
        placeholder="بحث بمعرّف الحدث أو نوعه أو معرّف الارتباط…"
        searching={query.isFetching}
        filters={
          <>
            <label className="sr-only" htmlFor="webhook-status">
              تصفية بالحالة
            </label>
            <select
              id="webhook-status"
              className={`${inputCls} h-11 w-48`}
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
            >
              {STATUSES.map((value) => (
                <option key={value} value={value}>
                  {value === "all" ? "كل الحالات" : (WEBHOOK_STATUS_LABELS[value] ?? value)}
                </option>
              ))}
            </select>
            {manage && (
              <Btn variant="outline" loading={retryAll.isPending} onClick={() => retryAll.mutate()}>
                <RotateCcw className="h-4 w-4" aria-hidden /> إعادة المحاولات المستحقة
              </Btn>
            )}
          </>
        }
      />

      {query.isPending ? (
        <LoadingBlock rows={6} cols={6} />
      ) : query.isError ? (
        <ErrorBlock message={(query.error as Error).message} />
      ) : rows.length === 0 ? (
        <EmptyState title="لا توجد رسائل واردة" hint="ستظهر هنا كل الأحداث القادمة من مزودي الدفع مع حالة معالجتها." />
      ) : (
        <DataCard>
          <div className="overflow-x-auto">
            <table className="w-full text-body-sm">
              <thead>
                <tr>
                  <Th>المزوّد / الحدث</Th>
                  <Th>النوع</Th>
                  <Th>الحالة</Th>
                  <Th>المحاولات</Th>
                  <Th>الاستلام</Th>
                  <Th>إعادة المحاولة</Th>
                  <Th className="text-left">إجراءات</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-border">
                    <Td>
                      <span className="block font-medium">{row.provider}</span>
                      <span className="text-caption block truncate tabular-nums">{row.event_id ?? "—"}</span>
                    </Td>
                    <Td>
                      <span className="block truncate">{row.event_type ?? "—"}</span>
                      <span className="mt-1 flex flex-wrap gap-1">
                        {!row.signature_valid && <Badge tone="red">توقيع غير صالح</Badge>}
                        {row.replay_detected && <Badge tone="warn">حدث مكرر</Badge>}
                      </span>
                    </Td>
                    <Td>
                      <WebhookStatusBadge status={row.status} />
                      {row.last_error && <span className="text-caption mt-1 block truncate">{row.last_error}</span>}
                    </Td>
                    <Td className="tabular-nums">{row.attempts}</Td>
                    <Td>{formatDateTime(row.received_at)}</Td>
                    <Td>{formatDateTime(row.next_retry_at)}</Td>
                    <Td className="text-left">
                      <div className="flex items-center justify-end gap-1">
                        <Btn variant="ghost" size="icon" aria-label="عرض التفاصيل" onClick={() => setDetailId(row.id)}>
                          <Eye className="h-4 w-4" aria-hidden />
                        </Btn>
                        {manage && row.status !== "processed" && row.status !== "dead_letter" && (
                          <Btn
                            variant="ghost"
                            size="icon"
                            aria-label="إعادة المعالجة"
                            loading={retry.isPending && retry.variables === row.id}
                            onClick={() => retry.mutate(row.id)}
                          >
                            <RotateCcw className="h-4 w-4" aria-hidden />
                          </Btn>
                        )}
                        {manage && (row.status === "failed" || row.status === "received") && (
                          <Btn
                            variant="ghost"
                            size="icon"
                            aria-label="ترحيل إلى الرسائل الفاشلة نهائياً"
                            onClick={() => {
                              setAction({ id: row.id, kind: "dead_letter" });
                              setReason("");
                            }}
                          >
                            <ShieldOff className="h-4 w-4" aria-hidden />
                          </Btn>
                        )}
                        {manage && row.status === "dead_letter" && (
                          <Btn
                            variant="ghost"
                            size="icon"
                            aria-label="إعادة فتح الرسالة"
                            onClick={() => {
                              setAction({ id: row.id, kind: "reopen" });
                              setReason("");
                            }}
                          >
                            <Undo2 className="h-4 w-4" aria-hidden />
                          </Btn>
                        )}
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DataCard>
      )}

      <Pagination page={page} setPage={setPage} total={query.data?.total ?? 0} pageSize={PAGE_SIZE} />

      <Modal
        open={Boolean(detailId)}
        onClose={() => setDetailId(null)}
        title="تفاصيل الرسالة الواردة"
        description="الحمولة معروضة منقّحة — لا تُخزَّن ولا تُعرض أي بيانات بطاقات أو مفاتيح."
        size="lg"
        busy={detail.isPending}
        busyLabel="جاري تحميل التفاصيل…"
      >
        {detailRow && (
          <div className="space-y-4">
            <dl className="grid gap-3 sm:grid-cols-2">
              {[
                ["المزوّد", detailRow.provider],
                ["معرّف الحدث", detailRow.event_id ?? "—"],
                ["نوع الحدث", detailRow.event_type ?? "—"],
                ["الحالة", WEBHOOK_STATUS_LABELS[detailRow.status] ?? detailRow.status],
                ["المحاولات", String(detailRow.attempts)],
                ["الاستلام", formatDateTime(detailRow.received_at)],
                ["المعالجة", formatDateTime(detailRow.processed_at)],
                ["معرّف الارتباط", detailRow.correlation_id ?? "—"],
                ["معرّف الطلب", detailRow.request_id ?? "—"],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-caption">{label}</dt>
                  <dd className="text-body-sm mt-0.5 break-all">{value}</dd>
                </div>
              ))}
            </dl>
            {detailRow.last_error && (
              <p className="rounded-[var(--radius-m)] bg-danger/8 p-3 text-[12px] text-danger">{detailRow.last_error}</p>
            )}
            <div>
              <p className="text-label mb-1.5">الحمولة</p>
              <pre
                dir="ltr"
                className="max-h-72 overflow-auto rounded-[var(--radius-m)] bg-surface-muted p-3 text-[11px] leading-5"
              >
                {detailRow.raw_body}
              </pre>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(action)}
        onClose={() => setAction(null)}
        title={action?.kind === "dead_letter" ? "ترحيل إلى الرسائل الفاشلة نهائياً" : "إعادة فتح الرسالة"}
        description="السبب يُسجّل في سجل التدقيق ولا يمكن حذفه."
      >
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            submitAction.mutate();
          }}
        >
          <FormField label="السبب" required hint="5 أحرف على الأقل.">
            <textarea
              className={`${inputCls} min-h-24`}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </FormField>
          <div className="flex justify-end gap-2">
            <Btn variant="outline" onClick={() => setAction(null)}>
              إلغاء
            </Btn>
            <Btn type="submit" variant={action?.kind === "dead_letter" ? "danger" : "primary"} loading={submitAction.isPending}>
              تأكيد
            </Btn>
          </div>
        </form>
      </Modal>
    </div>
  );
}
