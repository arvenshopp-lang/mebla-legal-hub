import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MessageSquare, Send } from "lucide-react";
import { AdminShell } from "@/components/admin/shell";
import { Btn, LoadingBlock, inputCls, Badge } from "@/lib/list-utils";
import { fmtDateTime } from "@/lib/enums";
import {
  getSmsSettingsAdmin,
  sendTestSmsAdmin,
  updateSmsSettingsAdmin,
} from "@/lib/sms/sms.functions";
import {
  SIGNUP_MODE_HINTS,
  SIGNUP_MODE_LABELS,
  SMS_HEALTH_LABELS,
  SMS_PROVIDER_LABELS,
  type SignupMode,
  type SmsHealthStatus,
  type SmsProvider,
} from "@/lib/sms/sms.shared";

export const Route = createFileRoute("/mehla-admin/sms")({
  component: SmsSettingsPage,
  head: () => ({
    meta: [
      { title: "خدمة الرسائل وتوثيق الجوال | إدارة مِهلة" },
      {
        name: "description",
        content:
          "إدارة مزوّد الرسائل النصية، نمط التسجيل، توثيق الجوال، وسجل الإرسال داخل منصة مِهلة.",
      },
      { property: "og:title", content: "خدمة الرسائل وتوثيق الجوال | إدارة مِهلة" },
      { property: "og:description", content: "تحكم كامل في مزوّد الرسائل وسياسات توثيق الجوال." },
    ],
  }),
});

type Draft = {
  enabled: boolean;
  active_provider: SmsProvider;
  provider_label: string | null;
  base_url: string | null;
  application_id: string | null;
  service_sid: string | null;
  sender_id: string | null;
  sender_name: string | null;
  default_country: string;
  default_dial_code: string;
  code_length: number;
  code_ttl_minutes: number;
  resend_wait_seconds: number;
  max_verify_attempts: number;
  rate_limit_per_hour: number;
  message_template: string;
  message_language: "ar" | "en";
  test_mode: boolean;
  signup_mode: SignupMode;
  show_phone_field: boolean;
  require_phone: boolean;
  hide_phone_when_disabled: boolean;
  allow_signup_during_outage: boolean;
  show_outage_notice: boolean;
  emergency_email_only: boolean;
  alert_admin_on_failure: boolean;
};

const PROVIDERS = Object.keys(SMS_PROVIDER_LABELS) as SmsProvider[];
const MODES = Object.keys(SIGNUP_MODE_LABELS) as SignupMode[];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[var(--radius-l)] border border-border bg-surface p-6">
      <h3 className="mb-4 text-sm font-bold">{title}</h3>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-label mb-1.5 block text-foreground">{label}</span>
      {children}
      {hint && <span className="text-caption mt-1 block">{hint}</span>}
    </label>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 rounded-[var(--radius-m)] border border-border bg-surface-muted p-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-4 w-4 accent-primary"
      />
      <span>
        <span className="block text-[13px] font-semibold text-foreground">{label}</span>
        {hint && <span className="mt-0.5 block text-[12px] leading-5 text-text-muted">{hint}</span>}
      </span>
    </label>
  );
}

const HEALTH_TONE: Record<SmsHealthStatus, "green" | "warn" | "red" | "muted"> = {
  operational: "green",
  degraded: "warn",
  unavailable: "red",
  disabled: "muted",
};

function SmsSettingsPage() {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [testPhone, setTestPhone] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-sms-settings"],
    queryFn: () => getSmsSettingsAdmin(),
  });

  useEffect(() => {
    if (!data?.settings) return;
    const s = data.settings;
    setDraft({
      enabled: s.enabled,
      active_provider: s.active_provider as SmsProvider,
      provider_label: s.provider_label,
      base_url: s.base_url,
      application_id: s.application_id,
      service_sid: s.service_sid,
      sender_id: s.sender_id,
      sender_name: s.sender_name,
      default_country: s.default_country,
      default_dial_code: s.default_dial_code,
      code_length: s.code_length,
      code_ttl_minutes: s.code_ttl_minutes,
      resend_wait_seconds: s.resend_wait_seconds,
      max_verify_attempts: s.max_verify_attempts,
      rate_limit_per_hour: s.rate_limit_per_hour,
      message_template: s.message_template,
      message_language: s.message_language === "en" ? "en" : "ar",
      test_mode: s.test_mode,
      signup_mode: s.signup_mode as SignupMode,
      show_phone_field: s.show_phone_field,
      require_phone: s.require_phone,
      hide_phone_when_disabled: s.hide_phone_when_disabled,
      allow_signup_during_outage: s.allow_signup_during_outage,
      show_outage_notice: s.show_outage_notice,
      emergency_email_only: s.emergency_email_only,
      alert_admin_on_failure: s.alert_admin_on_failure,
    });
  }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      if (!draft) throw new Error("لا توجد تغييرات للحفظ.");
      return updateSmsSettingsAdmin({ data: draft });
    },
    onSuccess: () => {
      toast.success("تم حفظ إعدادات خدمة الرسائل");
      qc.invalidateQueries({ queryKey: ["admin-sms-settings"] });
    },
    onError: (e: Error) => toast.error("تعذّر الحفظ", { description: e.message }),
  });

  const test = useMutation({
    mutationFn: () => sendTestSmsAdmin({ data: { phone: testPhone } }),
    onSuccess: (result) =>
      toast.success("تم إرسال رسالة الاختبار", { description: `مرجع التتبع: ${result.traceRef}` }),
    onError: (e: Error) => toast.error("فشل الاختبار", { description: e.message }),
  });

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((prev: Draft | null) => (prev ? { ...prev, [key]: value } : prev));

  return (
    <AdminShell
      title="خدمة الرسائل وتوثيق الجوال"
      description="تحكم كامل في المزوّد وسياسات التسجيل والتوثيق — توثيق الجوال مستقل تماماً عن التحقق بخطوتين."
      actions={
        draft ? (
          <Btn onClick={() => save.mutate()} loading={save.isPending}>
            حفظ الإعدادات
          </Btn>
        ) : null
      }
    >
      {isLoading || !draft ? (
        <LoadingBlock />
      ) : error ? (
        <div
          role="alert"
          className="rounded-[var(--radius-m)] border border-danger/25 bg-danger-soft p-4 text-sm text-danger"
        >
          {(error as Error).message}
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <Section title="حالة الخدمة">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <Badge tone={HEALTH_TONE[data!.settings.health_status]}>
                {SMS_HEALTH_LABELS[data!.settings.health_status]}
              </Badge>
              <Badge tone={data!.credentials.hasKey ? "green" : "red"}>
                {data!.credentials.hasKey ? "مفتاح المزوّد مُعرَّف" : "مفتاح المزوّد غير مُعرَّف"}
              </Badge>
              {draft.test_mode && <Badge tone="warn">وضع الاختبار — لا تُرسل رسائل فعلية</Badge>}
            </div>
            {data!.settings.last_error_reason && (
              <p className="text-[12px] leading-6 text-text-muted">
                آخر فشل: {fmtDateTime(data!.settings.last_failure_at)} —{" "}
                {data!.settings.last_error_reason}
                {data!.settings.last_trace_ref ? ` (مرجع: ${data!.settings.last_trace_ref})` : ""}
              </p>
            )}
            <Toggle
              label="تشغيل خدمة الرسائل النصية"
              hint="عند الإيقاف لا تُرسل أي رسالة ولا يُطلب توثيق الجوال في أي مكان."
              checked={draft.enabled}
              onChange={(v) => set("enabled", v)}
            />
            <Toggle
              label="وضع الاختبار (بدون إرسال فعلي)"
              hint="يُولَّد الرمز ويُسجَّل داخلياً دون إرسال رسالة للمزوّد."
              checked={draft.test_mode}
              onChange={(v) => set("test_mode", v)}
            />
            <div className="flex flex-wrap items-end gap-2">
              <Row label="رقم جوال للاختبار">
                <input
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                  inputMode="numeric"
                  placeholder="05XXXXXXXX"
                  className={inputCls}
                />
              </Row>
              <Btn variant="secondary" onClick={() => test.mutate()} loading={test.isPending}>
                <Send className="h-4 w-4" aria-hidden /> إرسال رسالة اختبار
              </Btn>
            </div>
          </Section>

          <Section title="المزوّد">
            <Row label="المزوّد النشط" hint="تغيير المزوّد لا يحتاج أي تعديل برمجي.">
              <select
                value={draft.active_provider}
                onChange={(e) => set("active_provider", e.target.value as SmsProvider)}
                className={inputCls}
              >
                {PROVIDERS.map((p) => (
                  <option key={p} value={p}>
                    {SMS_PROVIDER_LABELS[p]}
                  </option>
                ))}
              </select>
            </Row>
            <Row label="الاسم المعروض للمزوّد">
              <input
                value={draft.provider_label ?? ""}
                onChange={(e) => set("provider_label", e.target.value || null)}
                className={inputCls}
              />
            </Row>
            <Row
              label="الرابط الأساسي (Base URL)"
              hint="اتركه فارغاً لاستخدام الرابط الافتراضي للمزوّد."
            >
              <input
                value={draft.base_url ?? ""}
                onChange={(e) => set("base_url", e.target.value || null)}
                dir="ltr"
                className={inputCls}
              />
            </Row>
            <Row label="معرّف التطبيق / الحساب" hint="Twilio: Account SID — Unifonic: AppSid.">
              <input
                value={draft.application_id ?? ""}
                onChange={(e) => set("application_id", e.target.value || null)}
                dir="ltr"
                className={inputCls}
              />
            </Row>
            <Row label="معرّف الخدمة (Messaging Service SID)">
              <input
                value={draft.service_sid ?? ""}
                onChange={(e) => set("service_sid", e.target.value || null)}
                dir="ltr"
                className={inputCls}
              />
            </Row>
            <Row label="اسم أو رقم المُرسل">
              <input
                value={draft.sender_id ?? ""}
                onChange={(e) => set("sender_id", e.target.value || null)}
                dir="ltr"
                className={inputCls}
              />
            </Row>
            <p className="text-[12px] leading-6 text-text-muted">
              مفتاح المزوّد وسرّه محفوظان في أسرار المنصة (SMS_API_KEY و SMS_API_SECRET) ولا يظهران
              هنا إطلاقاً.
            </p>
          </Section>

          <Section title="سياسة التسجيل">
            <Row label="نمط التسجيل" hint={SIGNUP_MODE_HINTS[draft.signup_mode]}>
              <select
                value={draft.signup_mode}
                onChange={(e) => set("signup_mode", e.target.value as SignupMode)}
                className={inputCls}
              >
                {MODES.map((m) => (
                  <option key={m} value={m}>
                    {SIGNUP_MODE_LABELS[m]}
                  </option>
                ))}
              </select>
            </Row>
            <Toggle
              label="إظهار حقل الجوال في التسجيل"
              checked={draft.show_phone_field}
              onChange={(v) => set("show_phone_field", v)}
            />
            <Toggle
              label="إلزام إدخال رقم الجوال"
              hint="الإلزام هنا لا يعني التوثيق — التوثيق يحدده نمط التسجيل."
              checked={draft.require_phone}
              onChange={(v) => set("require_phone", v)}
            />
            <Toggle
              label="إخفاء الحقل تماماً عند تعطيل الخدمة"
              checked={draft.hide_phone_when_disabled}
              onChange={(v) => set("hide_phone_when_disabled", v)}
            />
          </Section>

          <Section title="سياسة الانقطاع والطوارئ">
            <Toggle
              label="السماح بإكمال التسجيل أثناء انقطاع المزوّد"
              hint="يُحفظ الرقم بحالة «بانتظار التوثيق» ويُكمل المستخدم لاحقاً من الإعدادات."
              checked={draft.allow_signup_during_outage}
              onChange={(v) => set("allow_signup_during_outage", v)}
            />
            <Toggle
              label="إظهار تنبيه انقطاع للمستخدمين"
              checked={draft.show_outage_notice}
              onChange={(v) => set("show_outage_notice", v)}
            />
            <Toggle
              label="وضع الطوارئ: البريد فقط"
              hint="يوقف كل رسائل الجوال مؤقتاً ويُكمل التسجيل بالبريد الإلكتروني."
              checked={draft.emergency_email_only}
              onChange={(v) => set("emergency_email_only", v)}
            />
            <Toggle
              label="تنبيه الإدارة عند فشل الإرسال"
              checked={draft.alert_admin_on_failure}
              onChange={(v) => set("alert_admin_on_failure", v)}
            />
          </Section>

          <Section title="الرمز والرسالة">
            <div className="grid gap-4 sm:grid-cols-2">
              <Row label="طول الرمز">
                <input
                  type="number"
                  min={4}
                  max={8}
                  value={draft.code_length}
                  onChange={(e) => set("code_length", Number(e.target.value))}
                  className={inputCls}
                />
              </Row>
              <Row label="مدة الصلاحية (دقائق)">
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={draft.code_ttl_minutes}
                  onChange={(e) => set("code_ttl_minutes", Number(e.target.value))}
                  className={inputCls}
                />
              </Row>
              <Row label="انتظار إعادة الإرسال (ثانية)">
                <input
                  type="number"
                  min={15}
                  max={600}
                  value={draft.resend_wait_seconds}
                  onChange={(e) => set("resend_wait_seconds", Number(e.target.value))}
                  className={inputCls}
                />
              </Row>
              <Row label="أقصى محاولات تحقق">
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={draft.max_verify_attempts}
                  onChange={(e) => set("max_verify_attempts", Number(e.target.value))}
                  className={inputCls}
                />
              </Row>
              <Row label="حد الرسائل بالساعة للرقم">
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={draft.rate_limit_per_hour}
                  onChange={(e) => set("rate_limit_per_hour", Number(e.target.value))}
                  className={inputCls}
                />
              </Row>
              <Row label="مفتاح الدولة">
                <input
                  value={draft.default_dial_code}
                  onChange={(e) => set("default_dial_code", e.target.value)}
                  dir="ltr"
                  className={inputCls}
                />
              </Row>
            </div>
            <Row label="قالب الرسالة" hint="استخدم {{code}} للرمز و {{minutes}} لمدة الصلاحية.">
              <textarea
                rows={3}
                value={draft.message_template}
                onChange={(e) => set("message_template", e.target.value)}
                className={inputCls}
              />
            </Row>
          </Section>

          <Section title="سجل الإرسال والتحقق">
            {data!.logs.length === 0 ? (
              <p className="text-sm text-text-muted">لا توجد محاولات إرسال بعد.</p>
            ) : (
              <ul className="divide-y divide-border text-[12.5px]">
                {data!.logs.map((log) => (
                  <li
                    key={log.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-2"
                  >
                    <span className="font-medium text-foreground" dir="ltr">
                      {log.phone_masked}
                    </span>
                    <span className="text-text-muted">
                      {log.action} · {log.provider}
                    </span>
                    <Badge tone={log.outcome === "success" ? "green" : "red"}>{log.outcome}</Badge>
                    <span className="text-text-muted">{fmtDateTime(log.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      )}
    </AdminShell>
  );
}

export const SmsIcon = MessageSquare;
