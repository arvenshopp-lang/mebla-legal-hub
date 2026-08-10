/**
 * نموذج طلب الاستشارة — إعادة تصميم بصرية فقط.
 * منطق الإرسال والتحقق ورسائل النتيجة ونقطة النهاية كما هي بلا أي تغيير.
 */
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { CheckCircle2, Send } from "lucide-react";
import type { OfficePageView } from "@/lib/office-page.shared";
import { PREFERRED_CONTACT_LABELS } from "@/lib/office-page.shared";

const inputStyle =
  "min-h-11 w-full rounded-[var(--office-radius-sm)] border border-border bg-background px-3.5 text-body-sm outline-none transition-colors focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30";

export function OfficePublicLeadForm({ view, channel }: { view: OfficePageView; channel: string }) {
  const form = view.leadForm;
  const [values, setValues] = useState({
    full_name: "",
    phone: "",
    email: "",
    city: "",
    service_key: "",
    message: "",
    preferred_contact: "phone" as "phone" | "whatsapp" | "email",
    consent: false,
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const utm = useMemo(() => {
    if (typeof window === "undefined") return {} as Record<string, string>;
    const params = new URLSearchParams(window.location.search);
    const out: Record<string, string> = {};
    for (const key of ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"]) {
      const value = params.get(key);
      if (value) out[key] = value.slice(0, 80);
    }
    return out;
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || view.isPreview) return;
    setBusy(true);
    setResult(null);
    try {
      const response = await fetch("/api/public/office/lead", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...values, slug: view.slug, channel, utm }),
      });
      const body = (await response.json()) as { ok?: boolean; message?: string };
      if (body.ok) {
        setResult({ ok: true, message: body.message ?? form.thank_you });
        setValues({ ...values, full_name: "", phone: "", email: "", message: "", consent: false });
      } else {
        setResult({ ok: false, message: body.message ?? "تعذّر إرسال الطلب، حاول مرة أخرى." });
      }
    } catch {
      setResult({ ok: false, message: "تعذّر الاتصال بالخدمة، تحقق من الشبكة ثم حاول مجدداً." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section id="lead" aria-labelledby="lead-title" className="office-section scroll-mt-6">
      <div className="office-container">
        <div className="office-card mx-auto max-w-3xl p-5 shadow-md sm:p-8">
          <h2 id="lead-title" className="text-h2">
            طلب استشارة
          </h2>
          <p className="mt-1.5 text-body-sm text-muted-foreground">
            أرسل طلبك وسيتواصل معك المكتب في أقرب وقت.
          </p>

          {result?.ok ? (
            <p
              role="status"
              className="mt-6 flex items-start gap-2.5 rounded-[var(--office-radius-sm)] bg-success-soft p-4 text-body-sm text-foreground"
            >
              <CheckCircle2
                size={18}
                strokeWidth={1.9}
                aria-hidden="true"
                className="mt-0.5 shrink-0 text-success"
              />
              <span>{result.message}</span>
            </p>
          ) : (
            <form onSubmit={submit} className="mt-6 grid gap-4 sm:grid-cols-2" noValidate>
              <Field label="الاسم الكامل" htmlFor="lead-name" required>
                <input
                  id="lead-name"
                  className={inputStyle}
                  required
                  maxLength={80}
                  value={values.full_name}
                  onChange={(e) => setValues({ ...values, full_name: e.target.value })}
                />
              </Field>
              <Field label="رقم الجوال" htmlFor="lead-phone" required={form.require_phone}>
                <input
                  id="lead-phone"
                  inputMode="tel"
                  dir="ltr"
                  className={inputStyle}
                  maxLength={20}
                  required={form.require_phone}
                  value={values.phone}
                  onChange={(e) => setValues({ ...values, phone: e.target.value })}
                />
              </Field>
              <Field label="البريد الإلكتروني" htmlFor="lead-email" required={form.require_email}>
                <input
                  id="lead-email"
                  type="email"
                  dir="ltr"
                  className={inputStyle}
                  maxLength={160}
                  required={form.require_email}
                  value={values.email}
                  onChange={(e) => setValues({ ...values, email: e.target.value })}
                />
              </Field>
              <Field label="المدينة" htmlFor="lead-city" required={form.require_city}>
                <input
                  id="lead-city"
                  className={inputStyle}
                  maxLength={60}
                  required={form.require_city}
                  value={values.city}
                  onChange={(e) => setValues({ ...values, city: e.target.value })}
                />
              </Field>
              {form.service_choice && view.services.length > 0 && (
                <Field label="الخدمة المطلوبة" htmlFor="lead-service">
                  <select
                    id="lead-service"
                    className={inputStyle}
                    value={values.service_key}
                    onChange={(e) => setValues({ ...values, service_key: e.target.value })}
                  >
                    <option value="">اختر الخدمة</option>
                    {view.services.map((service) => (
                      <option key={service.key} value={service.key}>
                        {service.title}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              <Field label="طريقة التواصل المفضّلة" htmlFor="lead-contact">
                <select
                  id="lead-contact"
                  className={inputStyle}
                  value={values.preferred_contact}
                  onChange={(e) =>
                    setValues({
                      ...values,
                      preferred_contact: e.target.value as "phone" | "whatsapp" | "email",
                    })
                  }
                >
                  {Object.entries(PREFERRED_CONTACT_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="sm:col-span-2">
                <Field label="تفاصيل الطلب" htmlFor="lead-message">
                  <textarea
                    id="lead-message"
                    rows={5}
                    maxLength={1500}
                    className={`${inputStyle} min-h-32 py-2.5 leading-relaxed`}
                    value={values.message}
                    onChange={(e) => setValues({ ...values, message: e.target.value })}
                  />
                </Field>
              </div>
              {form.consent_required && (
                <div className="sm:col-span-2">
                  <label className="flex items-start gap-2.5 rounded-[var(--office-radius-sm)] bg-surface-muted p-3.5 text-body-sm text-muted-foreground">
                    <input
                      type="checkbox"
                      className="mt-0.5 size-5 shrink-0 accent-[var(--office-primary)]"
                      checked={values.consent}
                      onChange={(e) => setValues({ ...values, consent: e.target.checked })}
                    />
                    <span>{form.consent_text}</span>
                  </label>
                </div>
              )}
              {result && !result.ok && (
                <p
                  role="alert"
                  className="rounded-[var(--office-radius-sm)] bg-danger-soft p-3.5 text-body-sm text-destructive sm:col-span-2"
                >
                  {result.message}
                </p>
              )}
              <div className="sm:col-span-2">
                <button
                  type="submit"
                  disabled={busy || view.isPreview}
                  className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[var(--office-radius-sm)] bg-primary px-6 text-body font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary-hover disabled:opacity-60 sm:w-auto"
                >
                  <Send size={17} strokeWidth={1.9} aria-hidden="true" />
                  {busy ? "جارٍ الإرسال…" : "إرسال الطلب"}
                </button>
                {view.isPreview && <p className="mt-2 text-caption">الإرسال معطّل في المعاينة.</p>}
              </div>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}

function Field({
  label,
  htmlFor,
  required,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-label">
        {label}
        {required && <span className="text-destructive"> *</span>}
      </label>
      {children}
    </div>
  );
}
