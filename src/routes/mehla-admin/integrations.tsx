import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Plug,
  Activity,
  Trash2,
  Pencil,
  Send,
  Power,
  CheckCircle2,
  ScrollText,
} from "lucide-react";
import { AdminShell } from "@/components/admin/shell";
import { AgenticMailPanel } from "@/components/admin/mail/agentic-panel";
import { Badge, Btn, LoadingBlock, Modal, inputCls } from "@/lib/list-utils";
import { fmtDateTime } from "@/lib/enums";
import {
  activateIntegration,
  getIntegrationsHub,
  removeIntegration,
  saveIntegrationConfig,
  sendIntegrationTestMessage,
  setIntegrationEnabledState,
  testIntegrationConnection,
} from "@/lib/integrations/integrations.functions";
import {
  AUTH_TYPE_LABELS,
  DEFAULT_HEALTH_CHECK,
  EMPTY_MAPPING,
  ENVIRONMENT_LABELS,
  SECRET_FIELD_LABELS,
  STATUS_LABELS,
  STATUS_TONES,
  normalizeInternalName,
  type AuthType,
  type IntegrationDefinitionView,
  type IntegrationEnvironment,
  type IntegrationView,
  type SecretFieldKey,
} from "@/lib/integrations/integrations.shared";

export const Route = createFileRoute("/mehla-admin/integrations")({
  component: IntegrationsHubPage,
  head: () => ({
    meta: [
      { title: "مركز التكاملات | إدارة مِهلة" },
      {
        name: "description",
        content:
          "ربط مزوّدي خدمة التحقق عبر الرسائل وإدارة الأسرار وفحوصات الاتصال داخل منصة مِهلة.",
      },
      { property: "og:title", content: "مركز التكاملات | إدارة مِهلة" },
      {
        property: "og:description",
        content: "إدارة مزوّدي التحقق وفحص الاتصال الحقيقي وسجل الصحة.",
      },
    ],
  }),
});

const BRAND_TONES: Record<string, string> = {
  infobip: "bg-[#e8532f] text-white",
  twilio: "bg-[#f22f46] text-white",
  unifonic: "bg-[#1a2b6d] text-white",
  custom_rest: "bg-primary text-primary-foreground",
};

function ProviderLogo({ providerKey, name }: { providerKey: string; name: string }) {
  const initials =
    name
      .replace(/[^A-Za-z\u0621-\u064A]/g, "")
      .slice(0, 2)
      .toUpperCase() || "IN";
  return (
    <span
      aria-hidden
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-m)] text-sm font-bold ${
        BRAND_TONES[providerKey] ?? "bg-surface-muted text-foreground"
      }`}
    >
      {initials}
    </span>
  );
}

type Draft = {
  id: string | null;
  definitionId: string;
  internalName: string;
  displayName: string;
  environment: IntegrationEnvironment;
  baseUrl: string;
  authType: AuthType;
  timeoutMs: number;
  maxRetries: number;
  monitorIntervalMinutes: number;
  allowedHosts: string;
  senderId: string;
  notes: string;
  secrets: Record<string, string>;
};

function draftFromDefinition(def: IntegrationDefinitionView): Draft {
  return {
    id: null,
    definitionId: def.id,
    internalName: normalizeInternalName(def.providerKey),
    displayName: def.displayNameAr || def.displayName,
    environment: "production",
    baseUrl: def.defaultBaseUrl ?? "",
    authType: def.supportedAuthTypes[0] ?? "api_key_header",
    timeoutMs: 10000,
    maxRetries: 1,
    monitorIntervalMinutes: 60,
    allowedHosts: "",
    senderId: "",
    notes: "",
    secrets: {},
  };
}

function draftFromView(view: IntegrationView): Draft {
  return {
    id: view.id,
    definitionId: view.definitionId,
    internalName: view.internalName,
    displayName: view.displayName,
    environment: view.environment,
    baseUrl: view.baseUrl,
    authType: view.authType,
    timeoutMs: view.timeoutMs,
    maxRetries: view.maxRetries,
    monitorIntervalMinutes: view.monitorIntervalMinutes,
    allowedHosts: view.allowedHosts.join(", "),
    senderId: view.senderId ?? "",
    notes: view.notes ?? "",
    secrets: {},
  };
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-body-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}

function IntegrationsHubPage() {
  const queryClient = useQueryClient();
  const hub = useQuery({ queryKey: ["integrations-hub"], queryFn: () => getIntegrationsHub() });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [logsFor, setLogsFor] = useState<IntegrationView | null>(null);
  const [testPhone, setTestPhone] = useState("");
  const [testFor, setTestFor] = useState<IntegrationView | null>(null);

  const definitions = hub.data?.definitions ?? [];
  const integrations = hub.data?.integrations ?? [];
  const logs = hub.data?.logs ?? [];
  const activeIntegration = integrations.find((item) => item.isActive) ?? null;
  const definitionOf = (id: string) => definitions.find((def) => def.id === id) ?? null;

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["integrations-hub"] });

  const save = useMutation({
    mutationFn: async (value: Draft) => {
      const def = definitionOf(value.definitionId);
      return saveIntegrationConfig({
        data: {
          id: value.id,
          definitionId: value.definitionId,
          internalName: normalizeInternalName(value.internalName || value.displayName),
          displayName: value.displayName.trim(),
          environment: value.environment,
          baseUrl: value.baseUrl.trim(),
          authType: value.authType,
          timeoutMs: value.timeoutMs,
          maxRetries: value.maxRetries,
          monitorIntervalMinutes: value.monitorIntervalMinutes,
          allowedHosts: value.allowedHosts
            .split(",")
            .map((host) => host.trim())
            .filter(Boolean),
          configuration: { sender_id: value.senderId.trim() || null },
          healthCheck: DEFAULT_HEALTH_CHECK,
          mapping: EMPTY_MAPPING,
          notes: value.notes.trim() || null,
          secrets: Object.fromEntries(
            Object.entries(value.secrets).filter(([, secret]) => secret.trim().length > 0),
          ),
          removedSecretFields: [],
          ...(def ? {} : {}),
        },
      });
    },
    onSuccess: () => {
      toast.success("تم حفظ التكامل. نفّذ فحص اتصال لتأكيد الحالة.");
      setDraft(null);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const test = useMutation({
    mutationFn: (id: string) => testIntegrationConnection({ data: { id } }),
    onSuccess: (result) => {
      if (result.ok) toast.success(`فحص ناجح — ${result.latencyMs} م.ث (مرجع ${result.traceId})`);
      else toast.error(`فشل الفحص: ${result.detail ?? result.code} — مرجع ${result.traceId}`);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const toggle = useMutation({
    mutationFn: (input: { id: string; enabled: boolean }) =>
      setIntegrationEnabledState({ data: input }),
    onSuccess: () => {
      toast.success("تم تحديث حالة التشغيل.");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const activate = useMutation({
    mutationFn: (id: string) => activateIntegration({ data: { id } }),
    onSuccess: (view) => {
      toast.success(`تم اعتماد ${view.displayName} كخدمة التحقق الفعّالة.`);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => removeIntegration({ data: { id } }),
    onSuccess: () => {
      toast.success("تم حذف التكامل وإبطال أسراره.");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const sendTest = useMutation({
    mutationFn: (input: { id: string; phone: string }) =>
      sendIntegrationTestMessage({ data: input }),
    onSuccess: (result) => {
      if (result.ok) toast.success(`${result.message} — مرجع ${result.traceId}`);
      else toast.error(`${result.message} — مرجع ${result.traceId}`);
      setTestFor(null);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const draftDefinition = draft ? definitionOf(draft.definitionId) : null;
  const secretFields = useMemo<string[]>(() => {
    if (!draftDefinition) return [];
    return [...draftDefinition.requiredFields, ...draftDefinition.optionalFields].filter(
      (field) => field in SECRET_FIELD_LABELS,
    );
  }, [draftDefinition]);

  const filteredLogs = logsFor ? logs.filter((log) => log.integrationId === logsFor.id) : [];

  return (
    <AdminShell title="مركز التكاملات">
      <div className="space-y-6">
        <header className="rounded-[var(--radius-l)] border border-border bg-surface p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Plug className="h-5 w-5 text-primary" aria-hidden />
              <div>
                <h2 className="text-h5">مزوّدو خدمة التحقق عبر الرسائل</h2>
                <p className="text-body-sm text-muted-foreground">
                  حالة «متصل» لا تُمنح إلا بعد فحص اتصال حقيقي من الخادم. الأسرار مشفّرة ولا تعود
                  للمتصفح.
                </p>
              </div>
            </div>
            <Badge tone={activeIntegration ? "green" : "muted"}>
              {activeIntegration
                ? `المزوّد الفعّال: ${activeIntegration.displayName}`
                : "لا يوجد مزوّد فعّال"}
            </Badge>
          </div>
          {hub.data && !hub.data.vaultReady && (
            <p className="mt-3 rounded-[var(--radius-m)] bg-danger-soft px-4 py-3 text-body-sm text-danger">
              خزنة الأسرار غير مهيأة: أضف مفتاح التشفير الرئيسي قبل حفظ أي بيانات ربط.
            </p>
          )}
        </header>

        <AgenticMailPanel />

        {hub.isLoading ? (
          <LoadingBlock rows={4} cols={3} />
        ) : (
          <>
            <section className="grid gap-4 lg:grid-cols-2">
              {integrations.map((item) => (
                <article
                  key={item.id}
                  className="rounded-[var(--radius-l)] border border-border bg-surface p-5"
                >
                  <div className="flex items-start gap-3">
                    <ProviderLogo providerKey={item.providerKey} name={item.displayName} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-h6">{item.displayName}</h3>
                        <Badge tone={STATUS_TONES[item.status]}>{STATUS_LABELS[item.status]}</Badge>
                        {item.isActive && <Badge tone="green">فعّال</Badge>}
                        <Badge tone="muted">{ENVIRONMENT_LABELS[item.environment]}</Badge>
                      </div>
                      <p className="mt-1 truncate text-body-sm text-muted-foreground">
                        {item.baseUrl}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 space-y-1.5 border-t border-border pt-4">
                    <Row
                      label="آخر نجاح"
                      value={item.lastSuccessAt ? fmtDateTime(item.lastSuccessAt) : "—"}
                    />
                    <Row
                      label="آخر فشل"
                      value={item.lastFailureAt ? fmtDateTime(item.lastFailureAt) : "—"}
                    />
                    <Row
                      label="زمن الاستجابة"
                      value={item.latencyMs != null ? `${item.latencyMs} م.ث` : "—"}
                    />
                    <Row label="نوع المصادقة" value={AUTH_TYPE_LABELS[item.authType]} />
                    <Row
                      label="الأسرار المخزّنة"
                      value={
                        item.secretHints.length
                          ? item.secretHints.map((h) => `${h.label}: ${h.hint}`).join(" · ")
                          : "—"
                      }
                    />
                    {item.lastErrorCode && (
                      <p className="rounded-[var(--radius-m)] bg-danger-soft px-3 py-2 text-body-sm text-danger">
                        آخر خطأ: {item.lastErrorCode}
                        {item.lastTraceId ? ` — مرجع ${item.lastTraceId}` : ""}
                      </p>
                    )}
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Btn
                      size="sm"
                      variant="secondary"
                      onClick={() => test.mutate(item.id)}
                      loading={test.isPending}
                    >
                      <Activity className="h-4 w-4" aria-hidden /> اختبار الاتصال
                    </Btn>
                    <Btn size="sm" variant="secondary" onClick={() => setTestFor(item)}>
                      <Send className="h-4 w-4" aria-hidden /> إرسال OTP تجريبي
                    </Btn>
                    <Btn
                      size="sm"
                      variant="secondary"
                      onClick={() => toggle.mutate({ id: item.id, enabled: !item.isEnabled })}
                    >
                      <Power className="h-4 w-4" aria-hidden /> {item.isEnabled ? "إيقاف" : "تفعيل"}
                    </Btn>
                    {!item.isActive && (
                      <Btn
                        size="sm"
                        onClick={() => {
                          const message = activeIntegration
                            ? `سيتم تبديل المزوّد الفعّال من ${activeIntegration.displayName} إلى ${item.displayName}. هل تريد المتابعة؟`
                            : `اعتماد ${item.displayName} كخدمة التحقق الفعّالة؟`;
                          if (window.confirm(message)) activate.mutate(item.id);
                        }}
                      >
                        <CheckCircle2 className="h-4 w-4" aria-hidden /> اعتماد كمزوّد فعّال
                      </Btn>
                    )}
                    <Btn size="sm" variant="ghost" onClick={() => setDraft(draftFromView(item))}>
                      <Pencil className="h-4 w-4" aria-hidden /> تعديل
                    </Btn>
                    <Btn size="sm" variant="ghost" onClick={() => setLogsFor(item)}>
                      <ScrollText className="h-4 w-4" aria-hidden /> سجل الصحة
                    </Btn>
                    <Btn
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        if (window.confirm(`حذف ${item.displayName} وإبطال أسراره نهائياً؟`))
                          remove.mutate(item.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-danger" aria-hidden /> حذف
                    </Btn>
                  </div>
                </article>
              ))}
            </section>

            <section className="rounded-[var(--radius-l)] border border-border bg-surface p-5">
              <h3 className="text-h6">إضافة مزوّد</h3>
              <p className="mt-1 text-body-sm text-muted-foreground">
                اختر مزوّداً لبدء التهيئة. لن يُستخدم في أي طلب قبل نجاح فحص الاتصال واعتماده.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {definitions.map((def) => (
                  <button
                    key={def.id}
                    type="button"
                    onClick={() => setDraft(draftFromDefinition(def))}
                    className="flex items-center gap-3 rounded-[var(--radius-m)] border border-border bg-surface-muted p-3 text-right transition hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <ProviderLogo providerKey={def.providerKey} name={def.displayName} />
                    <span className="min-w-0">
                      <span className="block truncate text-body-sm font-semibold text-foreground">
                        {def.displayNameAr || def.displayName}
                      </span>
                      <span className="block truncate text-[12px] text-muted-foreground">
                        {def.categoryLabel}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          </>
        )}
      </div>

      <Modal
        open={Boolean(draft)}
        onClose={() => setDraft(null)}
        title={draft?.id ? "تعديل التكامل" : "إضافة تكامل"}
        description="القيم السرّية تُخزَّن مشفّرة ولا تُعاد للمتصفح. اترك الحقل فارغاً للإبقاء على القيمة الحالية."
        size="lg"
        busy={save.isPending}
      >
        {draft && (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              save.mutate(draft);
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-body-sm">
                الاسم الظاهر
                <input
                  className={inputCls}
                  value={draft.displayName}
                  onChange={(e) => setDraft({ ...draft, displayName: e.target.value })}
                  required
                />
              </label>
              <label className="block text-body-sm">
                الاسم الداخلي
                <input
                  className={inputCls}
                  value={draft.internalName}
                  onChange={(e) => setDraft({ ...draft, internalName: e.target.value })}
                  required
                />
              </label>
              <label className="block text-body-sm">
                الرابط الأساسي
                <input
                  className={inputCls}
                  type="url"
                  value={draft.baseUrl}
                  onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })}
                  required
                />
              </label>
              <label className="block text-body-sm">
                البيئة
                <select
                  className={inputCls}
                  value={draft.environment}
                  onChange={(e) =>
                    setDraft({ ...draft, environment: e.target.value as IntegrationEnvironment })
                  }
                >
                  {Object.entries(ENVIRONMENT_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-body-sm">
                نوع المصادقة
                <select
                  className={inputCls}
                  value={draft.authType}
                  onChange={(e) => setDraft({ ...draft, authType: e.target.value as AuthType })}
                >
                  {(draftDefinition?.supportedAuthTypes ?? []).map((value) => (
                    <option key={value} value={value}>
                      {AUTH_TYPE_LABELS[value]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-body-sm">
                اسم المُرسل (اختياري)
                <input
                  className={inputCls}
                  value={draft.senderId}
                  onChange={(e) => setDraft({ ...draft, senderId: e.target.value })}
                />
              </label>
              <label className="block text-body-sm">
                مدة الانتظار (م.ث)
                <input
                  className={inputCls}
                  type="number"
                  min={1000}
                  max={30000}
                  value={draft.timeoutMs}
                  onChange={(e) => setDraft({ ...draft, timeoutMs: Number(e.target.value) })}
                />
              </label>
              <label className="block text-body-sm">
                عدد إعادة المحاولة
                <input
                  className={inputCls}
                  type="number"
                  min={0}
                  max={5}
                  value={draft.maxRetries}
                  onChange={(e) => setDraft({ ...draft, maxRetries: Number(e.target.value) })}
                />
              </label>
              <label className="block text-body-sm">
                فاصل المراقبة (دقائق)
                <input
                  className={inputCls}
                  type="number"
                  min={5}
                  max={1440}
                  value={draft.monitorIntervalMinutes}
                  onChange={(e) =>
                    setDraft({ ...draft, monitorIntervalMinutes: Number(e.target.value) })
                  }
                />
              </label>
              <label className="block text-body-sm">
                النطاقات المسموحة (فاصلة)
                <input
                  className={inputCls}
                  value={draft.allowedHosts}
                  onChange={(e) => setDraft({ ...draft, allowedHosts: e.target.value })}
                  placeholder="api.example.com"
                />
              </label>
            </div>

            <fieldset className="rounded-[var(--radius-m)] border border-border p-4">
              <legend className="px-2 text-body-sm font-semibold">بيانات الربط السرّية</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {secretFields.map((field) => (
                  <label key={field} className="block text-body-sm">
                    {SECRET_FIELD_LABELS[field as SecretFieldKey] ?? field}
                    <input
                      className={inputCls}
                      type="password"
                      autoComplete="off"
                      value={draft.secrets[field] ?? ""}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          secrets: { ...draft.secrets, [field]: e.target.value },
                        })
                      }
                      placeholder={draft.id ? "بلا تغيير" : ""}
                    />
                  </label>
                ))}
                {secretFields.length === 0 && (
                  <p className="text-body-sm text-muted-foreground">
                    لا توجد حقول سرّية لهذا المزوّد.
                  </p>
                )}
              </div>
            </fieldset>

            <label className="block text-body-sm">
              ملاحظات داخلية
              <textarea
                className={`${inputCls} min-h-20`}
                value={draft.notes}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              />
            </label>

            <div className="flex justify-end gap-2">
              <Btn variant="ghost" onClick={() => setDraft(null)}>
                إلغاء
              </Btn>
              <Btn type="submit" loading={save.isPending}>
                حفظ التكامل
              </Btn>
            </div>
          </form>
        )}
      </Modal>

      <Modal
        open={Boolean(testFor)}
        onClose={() => setTestFor(null)}
        title="إرسال رمز تجريبي"
        description="تُرسل رسالة حقيقية عبر هذا المزوّد للتأكد من التسليم الفعلي."
      >
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (testFor) sendTest.mutate({ id: testFor.id, phone: testPhone });
          }}
        >
          <label className="block text-body-sm">
            رقم الجوال بالصيغة الدولية
            <input
              className={inputCls}
              value={testPhone}
              onChange={(e) => setTestPhone(e.target.value)}
              placeholder="+9665XXXXXXXX"
              required
            />
          </label>
          <div className="flex justify-end gap-2">
            <Btn variant="ghost" onClick={() => setTestFor(null)}>
              إلغاء
            </Btn>
            <Btn type="submit" loading={sendTest.isPending}>
              إرسال
            </Btn>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(logsFor)}
        onClose={() => setLogsFor(null)}
        title={`سجل صحة ${logsFor?.displayName ?? ""}`}
        size="lg"
      >
        <div className="space-y-2">
          {filteredLogs.length === 0 && (
            <p className="text-body-sm text-muted-foreground">لا توجد سجلات بعد.</p>
          )}
          {filteredLogs.map((log) => (
            <div
              key={log.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-m)] border border-border px-3 py-2 text-body-sm"
            >
              <Badge
                tone={
                  log.result === "success" ? "green" : log.result === "blocked" ? "gold" : "red"
                }
              >
                {log.result === "success" ? "ناجح" : log.result === "blocked" ? "محظور" : "فاشل"}
              </Badge>
              <span className="text-muted-foreground">{log.checkKind}</span>
              <span>{log.statusCode ?? "—"}</span>
              <span>{log.latencyMs != null ? `${log.latencyMs} م.ث` : "—"}</span>
              <span className="text-muted-foreground">{log.safeErrorCode ?? "—"}</span>
              <span className="text-muted-foreground">{log.traceId}</span>
              <span className="text-muted-foreground">{fmtDateTime(log.checkedAt)}</span>
            </div>
          ))}
        </div>
      </Modal>
    </AdminShell>
  );
}
