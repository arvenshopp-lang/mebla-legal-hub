/**
 * عرض الصفحة العامة للمكتب — مكوّن واحد يخدم الرابط العام والمعاينة الداخلية،
 * حتى لا تتحول المعاينة إلى تصميم وهمي. لا يقرأ هذا المكوّن أي جدول؛ يستقبل
 * اللقطة الجاهزة فقط. الأنماط تستخدم رموز التصميم القائمة فقط ليسهل تغيير الهوية لاحقاً.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { OfficePageView } from "@/lib/office-page.shared";
import { PREFERRED_CONTACT_LABELS } from "@/lib/office-page.shared";

/** لا نبني أي رابط إلا من مخطط آمن معروف. */
function safeHttps(url: string): string {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" ? parsed.toString() : "";
  } catch {
    return "";
  }
}

function telHref(phone: string): string {
  return /^\+\d{8,15}$/.test(phone) ? `tel:${phone}` : "";
}

function waHref(phone: string): string {
  return /^\+\d{8,15}$/.test(phone) ? `https://wa.me/${phone.replace("+", "")}` : "";
}

function mailHref(email: string): string {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? `mailto:${email}` : "";
}

type EventKind = "view" | "whatsapp" | "call" | "email" | "map" | "service_click";

function useChannel() {
  const [channel, setChannel] = useState("direct");
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const source = (params.get("utm_source") ?? params.get("src") ?? "").toLowerCase();
    setChannel(source || "direct");
  }, []);
  return channel;
}

export function OfficePublicPage({ view }: { view: OfficePageView }) {
  const channel = useChannel();
  const viewSent = useRef(false);

  const track = (kind: EventKind) => {
    if (view.isPreview) return;
    try {
      void fetch("/api/public/office/event", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug: view.slug, kind, channel }),
        keepalive: true,
      }).catch(() => undefined);
    } catch {
      // القياس لا يمنع الزائر من استخدام الصفحة.
    }
  };

  useEffect(() => {
    if (view.isPreview || viewSent.current) return;
    viewSent.current = true;
    track("view");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.slug, view.isPreview, channel]);

  const website = safeHttps(view.website);
  const mapUrl = safeHttps(view.mapUrl);
  const tel = telHref(view.phone);
  const wa = waHref(view.whatsapp);
  const mail = mailHref(view.email);

  return (
    <div dir="rtl" className="min-h-screen bg-background text-foreground">
      {view.isPreview && (
        <div className="bg-primary px-4 py-2 text-center text-xs font-medium text-primary-foreground">
          معاينة المسودة — هذه النسخة غير منشورة للعامة.
        </div>
      )}

      <header className="relative overflow-hidden border-b border-border bg-surface">
        {view.coverUrl && (
          <img
            src={view.coverUrl}
            alt={`غلاف ${view.officeName}`}
            className="absolute inset-0 h-full w-full object-cover opacity-25"
            loading="lazy"
          />
        )}
        <div className="relative mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-10 sm:px-6 sm:py-14">
          <div className="flex flex-wrap items-center gap-4">
            {view.logoUrl && (
              <img
                src={view.logoUrl}
                alt={`شعار ${view.officeName}`}
                className="h-16 w-16 shrink-0 rounded-[var(--radius-m,0.75rem)] border border-border bg-background object-contain p-1 sm:h-20 sm:w-20"
              />
            )}
            <div className="min-w-0 flex-1">
              <h1 className="break-words text-2xl font-bold leading-tight sm:text-3xl">
                {view.officeName}
              </h1>
              {view.city && <p className="mt-1 text-sm text-muted-foreground">{view.city}</p>}
            </div>
          </div>
          {view.headline && (
            <p className="max-w-3xl break-words text-lg font-semibold sm:text-xl">{view.headline}</p>
          )}
          {view.tagline && (
            <p className="max-w-3xl break-words text-sm leading-relaxed text-muted-foreground sm:text-base">
              {view.tagline}
            </p>
          )}

          <nav aria-label="طرق التواصل" className="flex flex-wrap gap-2">
            {tel && (
              <a
                href={tel}
                onClick={() => track("call")}
                className="inline-flex min-h-11 items-center rounded-[var(--radius-m,0.75rem)] bg-primary px-4 text-sm font-medium text-primary-foreground"
              >
                اتصال
              </a>
            )}
            {wa && (
              <a
                href={wa}
                target="_blank"
                rel="noopener noreferrer nofollow"
                onClick={() => track("whatsapp")}
                className="inline-flex min-h-11 items-center rounded-[var(--radius-m,0.75rem)] border border-border bg-background px-4 text-sm font-medium"
              >
                واتساب
              </a>
            )}
            {mail && (
              <a
                href={mail}
                onClick={() => track("email")}
                className="inline-flex min-h-11 items-center rounded-[var(--radius-m,0.75rem)] border border-border bg-background px-4 text-sm font-medium"
              >
                البريد الإلكتروني
              </a>
            )}
            {mapUrl && (
              <a
                href={mapUrl}
                target="_blank"
                rel="noopener noreferrer nofollow"
                onClick={() => track("map")}
                className="inline-flex min-h-11 items-center rounded-[var(--radius-m,0.75rem)] border border-border bg-background px-4 text-sm font-medium"
              >
                الموقع
              </a>
            )}
            {view.leadForm.enabled && (
              <a
                href="#lead"
                className="inline-flex min-h-11 items-center rounded-[var(--radius-m,0.75rem)] border border-primary px-4 text-sm font-medium text-primary"
              >
                طلب استشارة
              </a>
            )}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl space-y-10 px-4 py-10 sm:px-6">
        {view.about && (
          <section aria-labelledby="about-title" className="space-y-3">
            <h2 id="about-title" className="text-xl font-bold">
              عن المكتب
            </h2>
            <p className="whitespace-pre-line break-words text-sm leading-relaxed text-muted-foreground sm:text-base">
              {view.about}
            </p>
          </section>
        )}

        {view.services.length > 0 && (
          <section aria-labelledby="services-title" className="space-y-4">
            <h2 id="services-title" className="text-xl font-bold">
              مجالات العمل
            </h2>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {view.services.map((service) => (
                <li
                  key={service.key + service.title}
                  onClick={() => track("service_click")}
                  className="rounded-[var(--radius-l,1rem)] border border-border bg-surface p-4"
                >
                  <h3 className="break-words text-sm font-semibold">{service.title}</h3>
                  {service.description && (
                    <p className="mt-2 break-words text-xs leading-relaxed text-muted-foreground">
                      {service.description}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {view.team.length > 0 && (
          <section aria-labelledby="team-title" className="space-y-4">
            <h2 id="team-title" className="text-xl font-bold">
              فريق المكتب
            </h2>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {view.team.map((member) => (
                <li
                  key={member.name + member.title}
                  className="rounded-[var(--radius-l,1rem)] border border-border bg-surface p-4"
                >
                  <div className="flex items-center gap-3">
                    {member.photoUrl && (
                      <img
                        src={member.photoUrl}
                        alt={member.name}
                        className="h-12 w-12 shrink-0 rounded-full object-cover"
                        loading="lazy"
                      />
                    )}
                    <div className="min-w-0">
                      <p className="break-words text-sm font-semibold">{member.name}</p>
                      {member.title && (
                        <p className="break-words text-xs text-muted-foreground">{member.title}</p>
                      )}
                    </div>
                  </div>
                  {member.bio && (
                    <p className="mt-3 break-words text-xs leading-relaxed text-muted-foreground">
                      {member.bio}
                    </p>
                  )}
                  {member.specialties.length > 0 && (
                    <p className="mt-2 break-words text-[11px] text-muted-foreground">
                      {member.specialties.join(" · ")}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section aria-labelledby="contact-title" className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3 rounded-[var(--radius-l,1rem)] border border-border bg-surface p-5">
            <h2 id="contact-title" className="text-xl font-bold">
              معلومات التواصل
            </h2>
            <dl className="space-y-2 text-sm">
              {view.address && (
                <Row label="العنوان">
                  <span className="break-words">{view.address}</span>
                </Row>
              )}
              {view.phone && <Row label="الجوال">{view.phone}</Row>}
              {view.email && <Row label="البريد">{view.email}</Row>}
              {website && (
                <Row label="الموقع الإلكتروني">
                  <a
                    href={website}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="break-all text-primary underline"
                  >
                    {website}
                  </a>
                </Row>
              )}
              {view.licenseNumber && <Row label="رقم الترخيص">{view.licenseNumber}</Row>}
            </dl>
            {view.socials.length > 0 && (
              <ul className="flex flex-wrap gap-2 pt-2">
                {view.socials.map((social) => {
                  const href = safeHttps(social.href);
                  if (!href) return null;
                  return (
                    <li key={social.key}>
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        className="inline-flex min-h-11 items-center rounded-[var(--radius-m,0.75rem)] border border-border px-3 text-xs font-medium"
                      >
                        {social.label}
                      </a>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {view.hours.some((h) => !h.closed) && (
            <div className="rounded-[var(--radius-l,1rem)] border border-border bg-surface p-5">
              <h2 className="text-xl font-bold">أوقات العمل</h2>
              <ul className="mt-3 space-y-1.5 text-sm">
                {view.hours.map((hour) => (
                  <li key={hour.day} className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">{hour.label}</span>
                    <span>{hour.closed ? "مغلق" : `${hour.from} — ${hour.to}`}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {view.leadForm.enabled && <LeadForm view={view} channel={channel} />}
      </main>

      <footer className="border-t border-border bg-surface px-4 py-6 text-center text-xs text-muted-foreground">
        صفحة {view.officeName} على منصة مِهلة
      </footer>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-2">
      <dt className="shrink-0 text-muted-foreground">{label}:</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

const inputStyle =
  "min-h-11 w-full rounded-[var(--radius-m,0.75rem)] border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary";

function LeadForm({ view, channel }: { view: OfficePageView; channel: string }) {
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
    <section id="lead" aria-labelledby="lead-title" className="scroll-mt-8">
      <div className="rounded-[var(--radius-l,1rem)] border border-border bg-surface p-5 sm:p-6">
        <h2 id="lead-title" className="text-xl font-bold">
          طلب استشارة
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          أرسل طلبك وسيتواصل معك المكتب في أقرب وقت.
        </p>

        {result?.ok ? (
          <p role="status" className="mt-4 rounded-[var(--radius-m,0.75rem)] bg-background p-4 text-sm">
            {result.message}
          </p>
        ) : (
          <form onSubmit={submit} className="mt-4 grid gap-4 sm:grid-cols-2" noValidate>
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
                  rows={4}
                  maxLength={1500}
                  className={`${inputStyle} min-h-24 py-2`}
                  value={values.message}
                  onChange={(e) => setValues({ ...values, message: e.target.value })}
                />
              </Field>
            </div>
            {form.consent_required && (
              <div className="sm:col-span-2">
                <label className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-5 w-5 shrink-0"
                    checked={values.consent}
                    onChange={(e) => setValues({ ...values, consent: e.target.checked })}
                  />
                  <span>{form.consent_text}</span>
                </label>
              </div>
            )}
            {result && !result.ok && (
              <p role="alert" className="text-sm text-destructive sm:col-span-2">
                {result.message}
              </p>
            )}
            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={busy || view.isPreview}
                className="inline-flex min-h-11 w-full items-center justify-center rounded-[var(--radius-m,0.75rem)] bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-60 sm:w-auto"
              >
                {busy ? "جارٍ الإرسال…" : "إرسال الطلب"}
              </button>
              {view.isPreview && (
                <p className="mt-2 text-xs text-muted-foreground">
                  الإرسال معطّل في المعاينة.
                </p>
              )}
            </div>
          </form>
        )}
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
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-xs font-medium">
        {label}
        {required && <span className="text-destructive"> *</span>}
      </label>
      {children}
    </div>
  );
}
