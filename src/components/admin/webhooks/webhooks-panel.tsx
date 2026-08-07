import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Copy,
  KeyRound,
  Plus,
  RotateCcw,
  ShieldOff,
  Webhook as WebhookIcon,
  Eye,
  Wifi,
} from "lucide-react";
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
} from "@/lib/list-utils";
import { fmtDateTime } from "@/lib/enums";
import {
  createWebhookEndpoint,
  deadLetterWebhookEvent,
  listWebhookEndpoints,
  listWebhookEvents,
  reprocessWebhookEvent,
  rotateWebhookSecret,
  setWebhookVerificationMode,
  setWebhookEndpointState,
  testWebhookEndpointConnection,
} from "@/lib/webhooks/webhooks.functions";
import {
  ADAPTER_LABELS,
  EVENT_STATUS_LABELS,
  EVENT_STATUS_TONES,
  VERIFICATION_MODE_LABELS,
  type WebhookEndpointView,
  type WebhookEventStatus,
  type WebhookEventView,
  type WebhookVerificationMode,
} from "@/lib/webhooks/webhooks.shared";

const PAGE_SIZE = 20;
const STATUS_FILTERS: (WebhookEventStatus | "all")[] = [
  "all",
  "received",
  "processed",
  "ignored",
  "failed",
  "dead_letter",
  "unauthorized",
  "rate_limited",
  "duplicate",
];

type NewEndpointDraft = {
  slug: string;
  displayName: string;
  adapterType: "whatsline" | "generic_json";
  verificationMode: WebhookVerificationMode;
  signatureHeader: string;
  timestampHeader: string;
  notes: string;
};

const EMPTY_DRAFT: NewEndpointDraft = {
  slug: "",
  displayName: "",
  adapterType: "generic_json",
  verificationMode: "hmac_sha256",
  signatureHeader: "x-webhook-signature",
  timestampHeader: "",
  notes: "",
};

async function copyToClipboard(value: string, message: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(message);
  } catch {
    toast.error("تعذّر النسخ — انسخ القيمة يدوياً.");
  }
}

export function WebhookGatewayPanel() {
  const queryClient = useQueryClient();

  const [slugFilter, setSlugFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState<NewEndpointDraft | null>(null);
  const [revealed, setRevealed] = useState<{ slug: string; secret: string } | null>(null);
  const [revealedUrl, setRevealedUrl] = useState<string | null>(null);
  const [detail, setDetail] = useState<WebhookEventView | null>(null);
  const [deadLetter, setDeadLetter] = useState<WebhookEventView | null>(null);
  const [reason, setReason] = useState("");

  const endpointsFn = useServerFn(listWebhookEndpoints);
  const eventsFn = useServerFn(listWebhookEvents);
  const createFn = useServerFn(createWebhookEndpoint);
  const rotateFn = useServerFn(rotateWebhookSecret);
  const modeFn = useServerFn(setWebhookVerificationMode);
  const stateFn = useServerFn(setWebhookEndpointState);
  const testConnectionFn = useServerFn(testWebhookEndpointConnection);
  const reprocessFn = useServerFn(reprocessWebhookEvent);
  const deadLetterFn = useServerFn(deadLetterWebhookEvent);

  const endpoints = useQuery({
    queryKey: ["webhook-endpoints"],
    queryFn: () => endpointsFn({ data: undefined as never }),
  });

  const events = useQuery({
    queryKey: ["webhook-events", slugFilter, statusFilter, page],
    queryFn: () =>
      eventsFn({ data: { slug: slugFilter, status: statusFilter, page, pageSize: PAGE_SIZE } }),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["webhook-endpoints"] });
    queryClient.invalidateQueries({ queryKey: ["webhook-events"] });
  };

  const create = useMutation({
    mutationFn: (value: NewEndpointDraft) =>
      createFn({
        data: {
          slug: value.slug.trim().toLowerCase(),
          displayName: value.displayName.trim(),
          adapterType: value.adapterType,
          verificationMode: value.verificationMode,
          signatureHeader: value.signatureHeader.trim().toLowerCase(),
          timestampHeader: value.timestampHeader.trim().toLowerCase() || null,
          notes: value.notes.trim() || null,
        },
      }),
    onSuccess: () => {
      toast.success("تمت إضافة المزوّد. ولّد سرّ التحقق ثم فعّل الاستقبال.");
      setDraft(null);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const rotate = useMutation({
    mutationFn: (id: string) => rotateFn({ data: { id } }),
    onSuccess: (result) => {
      setRevealed({ slug: result.slug, secret: result.secret });
      setRevealedUrl(result.url);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const changeMode = useMutation({
    mutationFn: (input: { id: string; verificationMode: WebhookVerificationMode }) =>
      modeFn({ data: input }),
    onSuccess: () => {
      toast.success("تم تحديث وضع التحقق. ولّد السرّ من جديد لتحصل على رابط مطابق.");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const setState = useMutation({
    mutationFn: (input: { id: string; isEnabled?: boolean; testMode?: boolean }) =>
      stateFn({ data: input }),
    onSuccess: () => {
      toast.success("تم تحديث حالة المزوّد.");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const testConnection = useMutation({
    mutationFn: (id: string) => testConnectionFn({ data: { id } }),
    onSuccess: (result) => {
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const reprocess = useMutation({
    mutationFn: (id: string) => reprocessFn({ data: { id } }),
    onSuccess: (result) => {
      toast.success(`نتيجة إعادة المعالجة: ${EVENT_STATUS_LABELS[result.status] ?? result.status}`);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const submitDeadLetter = useMutation({
    mutationFn: () => {
      if (!deadLetter) throw new Error("لا يوجد حدث محدد.");
      return deadLetterFn({ data: { id: deadLetter.id, reason } });
    },
    onSuccess: () => {
      toast.success("تم ترحيل الحدث وتسجيل السبب في سجل التدقيق.");
      setDeadLetter(null);
      setReason("");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const rows = endpoints.data ?? [];
  const eventRows = events.data?.rows ?? [];

  return (
    <section className="rounded-[var(--radius-l)] border border-border bg-surface p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <WebhookIcon className="mt-0.5 h-5 w-5 text-primary" aria-hidden />
          <div>
            <h2 className="text-h5">بوابة الويب هوك</h2>
            <p className="text-body-sm text-muted-foreground">
              رابط استقبال واحد لكل مزوّد. لا يُقبل أي طلب دون توقيع أو رمز سرّي مطابق، وكل استدعاء
              يُسجَّل بحمولة منقّحة.
            </p>
          </div>
        </div>
        <Btn variant="outline" onClick={() => setDraft({ ...EMPTY_DRAFT })}>
          <Plus className="h-4 w-4" aria-hidden /> إضافة مزوّد
        </Btn>
      </header>

      {endpoints.isPending ? (
        <div className="mt-5">
          <LoadingBlock rows={3} cols={3} />
        </div>
      ) : endpoints.isError ? (
        <div className="mt-5">
          <ErrorBlock message={(endpoints.error as Error).message} />
        </div>
      ) : rows.length === 0 ? (
        <div className="mt-5">
          <EmptyState
            title="لا يوجد مزوّد مضاف"
            hint="أضف مزوّداً لتحصل على رابط استقبال جاهز وسرّ تحقق خاص به."
          />
        </div>
      ) : (
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {rows.map((endpoint) => (
            <EndpointCard
              key={endpoint.id}
              endpoint={endpoint}
              busy={
                (rotate.isPending && rotate.variables === endpoint.id) ||
                (setState.isPending && setState.variables?.id === endpoint.id) ||
                (changeMode.isPending && changeMode.variables?.id === endpoint.id) ||
                (testConnection.isPending && testConnection.variables === endpoint.id)
              }
              onRotate={() => rotate.mutate(endpoint.id)}
              onChangeMode={(verificationMode) =>
                changeMode.mutate({ id: endpoint.id, verificationMode })
              }
              onToggleEnabled={() =>
                setState.mutate({ id: endpoint.id, isEnabled: !endpoint.isEnabled })
              }
              onToggleTestMode={() =>
                setState.mutate({ id: endpoint.id, testMode: !endpoint.testMode })
              }
              onTestConnection={() => testConnection.mutate(endpoint.id)}
              onFilter={() => {
                setSlugFilter(endpoint.slug);
                setPage(1);
              }}
            />
          ))}
        </div>
      )}

      <div className="mt-6 border-t border-border pt-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-h6">سجل الأحداث الواردة</h3>
          <div className="flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor="webhook-slug-filter">
              تصفية بالمزوّد
            </label>
            <select
              id="webhook-slug-filter"
              className={`${inputCls} h-11 w-44`}
              value={slugFilter ?? "all"}
              onChange={(event) => {
                setSlugFilter(event.target.value === "all" ? null : event.target.value);
                setPage(1);
              }}
            >
              <option value="all">كل المزوّدين</option>
              {rows.map((endpoint) => (
                <option key={endpoint.id} value={endpoint.slug}>
                  {endpoint.displayName}
                </option>
              ))}
            </select>
            <label className="sr-only" htmlFor="webhook-status-filter">
              تصفية بالحالة
            </label>
            <select
              id="webhook-status-filter"
              className={`${inputCls} h-11 w-44`}
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value);
                setPage(1);
              }}
            >
              {STATUS_FILTERS.map((value) => (
                <option key={value} value={value}>
                  {value === "all"
                    ? "كل الحالات"
                    : (EVENT_STATUS_LABELS[value as WebhookEventStatus] ?? value)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {events.isPending ? (
          <div className="mt-4">
            <LoadingBlock rows={5} cols={5} />
          </div>
        ) : events.isError ? (
          <div className="mt-4">
            <ErrorBlock message={(events.error as Error).message} />
          </div>
        ) : eventRows.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              title="لا توجد أحداث واردة"
              hint="سيظهر هنا كل استدعاء يصل من المزوّدين مع نتيجة التحقق والمعالجة."
            />
          </div>
        ) : (
          <div className="mt-4">
            <DataCard>
              <div className="overflow-x-auto">
                <table className="w-full text-body-sm">
                  <thead>
                    <tr>
                      <Th>المزوّد / النوع</Th>
                      <Th>الحالة</Th>
                      <Th>المحاولات</Th>
                      <Th>الاستلام</Th>
                      <Th className="text-left">إجراءات</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {eventRows.map((row) => (
                      <tr key={row.id} className="border-t border-border">
                        <Td>
                          <span className="block font-medium">{row.slug}</span>
                          <span className="text-caption block truncate">
                            {row.eventType ?? "—"}
                          </span>
                        </Td>
                        <Td>
                          <Badge tone={EVENT_STATUS_TONES[row.status] ?? "muted"}>
                            {EVENT_STATUS_LABELS[row.status] ?? row.status}
                          </Badge>
                          {(row.rejectReason ?? row.lastError) && (
                            <span className="text-caption mt-1 block truncate">
                              {row.rejectReason ?? row.lastError}
                            </span>
                          )}
                        </Td>
                        <Td className="tabular-nums">{row.attempts}</Td>
                        <Td>{fmtDateTime(row.receivedAt)}</Td>
                        <Td className="text-left">
                          <div className="flex items-center justify-end gap-1">
                            <Btn
                              variant="ghost"
                              size="icon"
                              aria-label="عرض تفاصيل الحدث"
                              onClick={() => setDetail(row)}
                            >
                              <Eye className="h-4 w-4" aria-hidden />
                            </Btn>
                            {(row.status === "failed" || row.status === "ignored") && (
                              <Btn
                                variant="ghost"
                                size="icon"
                                aria-label="إعادة معالجة الحدث"
                                loading={reprocess.isPending && reprocess.variables === row.id}
                                onClick={() => reprocess.mutate(row.id)}
                              >
                                <RotateCcw className="h-4 w-4" aria-hidden />
                              </Btn>
                            )}
                            {row.status !== "dead_letter" && row.status !== "processed" && (
                              <Btn
                                variant="ghost"
                                size="icon"
                                aria-label="ترحيل إلى الفاشل نهائياً"
                                onClick={() => {
                                  setDeadLetter(row);
                                  setReason("");
                                }}
                              >
                                <ShieldOff className="h-4 w-4" aria-hidden />
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
            <Pagination
              page={page}
              setPage={setPage}
              total={events.data?.total ?? 0}
              pageSize={PAGE_SIZE}
            />
          </div>
        )}
      </div>

      <Modal
        open={Boolean(draft)}
        onClose={() => setDraft(null)}
        title="إضافة مزوّد ويب هوك"
        description="يُنشأ المزوّد معطّلاً حتى توليد سرّ التحقق."
      >
        {draft && (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              create.mutate(draft);
            }}
          >
            <FormField label="المُعرّف في الرابط" required hint="حروف لاتينية صغيرة وأرقام و - _">
              <input
                className={inputCls}
                dir="ltr"
                value={draft.slug}
                onChange={(event) => setDraft({ ...draft, slug: event.target.value })}
              />
            </FormField>
            <FormField label="اسم المزوّد" required>
              <input
                className={inputCls}
                value={draft.displayName}
                onChange={(event) => setDraft({ ...draft, displayName: event.target.value })}
              />
            </FormField>
            <FormField label="المُحوِّل" required>
              <select
                className={inputCls}
                value={draft.adapterType}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    adapterType: event.target.value as NewEndpointDraft["adapterType"],
                  })
                }
              >
                {Object.entries(ADAPTER_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="طريقة التحقق" required>
              <select
                className={inputCls}
                value={draft.verificationMode}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    verificationMode: event.target.value as WebhookVerificationMode,
                    signatureHeader:
                      event.target.value === "shared_secret"
                        ? "x-webhook-token"
                        : "x-webhook-signature",
                  })
                }
              >
                {Object.entries(VERIFICATION_MODE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="ترويسة التوقيع أو الرمز" required>
              <input
                className={inputCls}
                dir="ltr"
                value={draft.signatureHeader}
                onChange={(event) => setDraft({ ...draft, signatureHeader: event.target.value })}
              />
            </FormField>
            {draft.verificationMode === "hmac_sha256" && (
              <FormField
                label="ترويسة الطابع الزمني"
                hint="اتركها فارغة إن كان المزوّد يوقّع الجسم وحده."
              >
                <input
                  className={inputCls}
                  dir="ltr"
                  value={draft.timestampHeader}
                  onChange={(event) => setDraft({ ...draft, timestampHeader: event.target.value })}
                />
              </FormField>
            )}
            <FormField label="ملاحظات">
              <textarea
                className={`${inputCls} min-h-20`}
                value={draft.notes}
                onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
              />
            </FormField>
            <div className="flex justify-end gap-2">
              <Btn variant="outline" onClick={() => setDraft(null)}>
                إلغاء
              </Btn>
              <Btn type="submit" variant="primary" loading={create.isPending}>
                إضافة
              </Btn>
            </div>
          </form>
        )}
      </Modal>

      <Modal
        open={Boolean(revealed)}
        onClose={() => {
          setRevealed(null);
          setRevealedUrl(null);
        }}
        title="سرّ التحقق الجديد"
        description="انسخ القيمة الآن والصقها في لوحة المزوّد — لن تُعرض مرة أخرى."
      >
        {revealed && (
          <div className="space-y-4">
            <p
              className="rounded-[var(--radius-m)] bg-surface-muted p-3 text-[12px] leading-6"
              dir="ltr"
            >
              {revealed.secret}
            </p>
            {revealedUrl?.includes("?key=") && (
              <div className="space-y-2">
                <p className="text-label">الرابط الكامل الجاهز للّصق في لوحة المزوّد</p>
                <p
                  className="rounded-[var(--radius-m)] bg-surface-muted p-3 text-[12px] leading-6 break-all"
                  dir="ltr"
                >
                  {revealedUrl}
                </p>
                <Btn
                  variant="outline"
                  onClick={() => copyToClipboard(revealedUrl, "تم نسخ الرابط الكامل.")}
                >
                  <Copy className="h-4 w-4" aria-hidden /> نسخ الرابط الكامل
                </Btn>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Btn
                variant="outline"
                onClick={() => copyToClipboard(revealed.secret, "تم نسخ سرّ التحقق.")}
              >
                <Copy className="h-4 w-4" aria-hidden /> نسخ
              </Btn>
              <Btn
                variant="primary"
                onClick={() => {
                  setRevealed(null);
                  setRevealedUrl(null);
                }}
              >
                حفظت السرّ
              </Btn>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title="تفاصيل الحدث الوارد"
        description="الحمولة معروضة منقّحة: الأسرار محجوبة وأرقام الجوال مقنّعة."
        size="lg"
      >
        {detail && (
          <div className="space-y-4">
            <dl className="grid gap-3 sm:grid-cols-2">
              {[
                ["المزوّد", detail.slug],
                [
                  "المُحوِّل",
                  ADAPTER_LABELS[detail.adapterType ?? ""] ?? detail.adapterType ?? "—",
                ],
                ["نوع الحدث", detail.eventType ?? "—"],
                ["معرّف الحدث", detail.providerEventId ?? "—"],
                ["الحالة", EVENT_STATUS_LABELS[detail.status] ?? detail.status],
                ["التوقيع", detail.signatureValid ? "مطابق" : "غير مطابق"],
                ["الاستلام", fmtDateTime(detail.receivedAt)],
                ["المعالجة", detail.processedAt ? fmtDateTime(detail.processedAt) : "—"],
                ["معرّف الارتباط", detail.correlationId],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-caption">{label}</dt>
                  <dd className="text-body-sm mt-0.5 break-all">{value}</dd>
                </div>
              ))}
            </dl>
            {(detail.rejectReason ?? detail.lastError) && (
              <p className="rounded-[var(--radius-m)] bg-danger/10 p-3 text-[12px] text-danger">
                {detail.rejectReason ?? detail.lastError}
              </p>
            )}
            <div>
              <p className="text-label mb-1.5">الحمولة المنقّحة</p>
              <pre
                dir="ltr"
                className="max-h-72 overflow-auto rounded-[var(--radius-m)] bg-surface-muted p-3 text-[11px] leading-5"
              >
                {JSON.stringify(detail.redactedPayload, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(deadLetter)}
        onClose={() => setDeadLetter(null)}
        title="ترحيل الحدث إلى الفاشل نهائياً"
        description="السبب يُسجّل في سجل التدقيق ولا يمكن حذفه."
      >
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            submitDeadLetter.mutate();
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
            <Btn variant="outline" onClick={() => setDeadLetter(null)}>
              إلغاء
            </Btn>
            <Btn type="submit" variant="danger" loading={submitDeadLetter.isPending}>
              تأكيد
            </Btn>
          </div>
        </form>
      </Modal>
    </section>
  );
}

function EndpointCard({
  endpoint,
  busy,
  onRotate,
  onChangeMode,
  onToggleEnabled,
  onToggleTestMode,
  onTestConnection,
  onFilter,
}: {
  endpoint: WebhookEndpointView;
  busy: boolean;
  onRotate: () => void;
  onChangeMode: (mode: WebhookVerificationMode) => void;
  onToggleEnabled: () => void;
  onToggleTestMode: () => void;
  onTestConnection: () => void;
  onFilter: () => void;
}) {
  const urlToken = endpoint.verificationMode === "url_token";
  return (
    <article className="rounded-[var(--radius-l)] border border-border bg-surface-muted/40 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-h6 truncate">{endpoint.displayName}</h3>
        <Badge tone={endpoint.isEnabled ? "green" : "muted"}>
          {endpoint.isEnabled ? "يستقبل الأحداث" : "معطّل"}
        </Badge>
        {endpoint.testMode && <Badge tone="gold">وضع اختبار</Badge>}
        <Badge tone={endpoint.hasSecret ? "green" : "red"}>
          {endpoint.hasSecret ? "سرّ التحقق مهيأ" : "بلا سرّ تحقق"}
        </Badge>
        {urlToken && <Badge tone="gold">سرّية الرابط هي الحماية</Badge>}
      </div>

      <p className="text-caption mt-2">
        {ADAPTER_LABELS[endpoint.adapterType] ?? endpoint.adapterType} —{" "}
        {VERIFICATION_MODE_LABELS[endpoint.verificationMode]}
      </p>

      <div className="mt-3">
        <p className="text-label mb-1">رابط الاستقبال</p>
        <div className="flex items-center gap-2">
          <code
            dir="ltr"
            className="min-w-0 flex-1 truncate rounded-[var(--radius-m)] bg-surface px-3 py-2 text-[11px]"
          >
            {endpoint.url}
          </code>
          {!urlToken && (
            <Btn
              variant="ghost"
              size="icon"
              aria-label="نسخ رابط الاستقبال"
              onClick={() => copyToClipboard(endpoint.url, "تم نسخ الرابط.")}
            >
              <Copy className="h-4 w-4" aria-hidden />
            </Btn>
          )}
        </div>
        {urlToken ? (
          <p className="text-caption mt-1.5">
            هذا المزوّد لا يرسل ترويسات، فالسرّ يُضاف داخل الرابط كمعامل{" "}
            <span dir="ltr">?key=</span> — استخدم الرابط الكامل الظاهر عند توليد السرّ، ولا تستخدم
            نطاق <span dir="ltr">www</span>.
          </p>
        ) : (
          <p className="text-caption mt-1.5">
            الترويسة المطلوبة: <span dir="ltr">{endpoint.signatureHeader}</span>
            {endpoint.timestampHeader ? (
              <>
                {" + "}
                <span dir="ltr">{endpoint.timestampHeader}</span>
              </>
            ) : null}
          </p>
        )}
      </div>

      <div className="mt-3">
        <label className="text-label mb-1 block" htmlFor={`webhook-mode-${endpoint.id}`}>
          وضع التحقق
        </label>
        <select
          id={`webhook-mode-${endpoint.id}`}
          className={`${inputCls} h-11`}
          value={endpoint.verificationMode}
          disabled={busy}
          onChange={(event) => onChangeMode(event.target.value as WebhookVerificationMode)}
        >
          {Object.entries(VERIFICATION_MODE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-3 text-body-sm">
        <div>
          <dt className="text-caption">آخر حدث</dt>
          <dd>{endpoint.lastEventAt ? fmtDateTime(endpoint.lastEventAt) : "—"}</dd>
        </div>
        <div>
          <dt className="text-caption">السجل التاريخي: الكل / المرفوض</dt>
          <dd className="tabular-nums">
            {endpoint.eventsTotal} / {endpoint.eventsFailed}
          </dd>
        </div>
      </dl>

      <div className="mt-3 rounded-[var(--radius-m)] border border-border bg-surface p-3">
        <p className="text-label">حالة الاتصال الحالية</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <Badge
            tone={
              endpoint.latestEventStatus === "processed" || endpoint.latestEventStatus === "ignored"
                ? "green"
                : endpoint.latestEventStatus
                  ? "red"
                  : "muted"
            }
          >
            {endpoint.latestEventStatus === "ignored"
              ? "فحص اتصال ناجح"
              : endpoint.latestEventStatus
                ? (EVENT_STATUS_LABELS[endpoint.latestEventStatus] ?? endpoint.latestEventStatus)
                : "لم تُفحص"}
          </Badge>
          {endpoint.latestEventAt && (
            <span className="text-caption">{fmtDateTime(endpoint.latestEventAt)}</span>
          )}
        </div>
      </div>

      {endpoint.lastError && (
        <p className="mt-3 rounded-[var(--radius-m)] bg-danger/10 p-2.5 text-[12px] text-danger">
          {endpoint.lastError}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Btn variant="outline" loading={busy} onClick={onRotate}>
          <KeyRound className="h-4 w-4" aria-hidden />
          {endpoint.hasSecret ? "تدوير السرّ" : "توليد السرّ"}
        </Btn>
        <Btn
          variant="outline"
          loading={busy}
          disabled={!endpoint.isEnabled || !endpoint.hasSecret}
          onClick={onTestConnection}
        >
          <Wifi className="h-4 w-4" aria-hidden /> فحص الاتصال المنشور
        </Btn>
        <Btn
          variant={endpoint.isEnabled ? "outline" : "primary"}
          loading={busy}
          onClick={onToggleEnabled}
        >
          {endpoint.isEnabled ? "تعطيل الاستقبال" : "تفعيل الاستقبال"}
        </Btn>
        <Btn variant="ghost" loading={busy} onClick={onToggleTestMode}>
          {endpoint.testMode ? "إيقاف وضع الاختبار" : "تشغيل وضع الاختبار"}
        </Btn>
        <Btn variant="ghost" onClick={onFilter}>
          أحداث هذا المزوّد
        </Btn>
      </div>
    </article>
  );
}
