import { createFileRoute, Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  FileClock,
  Info,
  Loader2,
  Mail,
  Phone,
  Search,
  ShieldCheck,
  Building2,
  AlertTriangle,
} from "lucide-react";
import { lookupCaseStatus } from "@/lib/client-portal.functions";
import { CaseCodeField } from "@/components/track/case-code-field";
import { CASE_STATUS, fmtDate, fmtDateTime } from "@/lib/enums";

export const Route = createFileRoute("/track")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "متابعة القضية — مِهلة" },
      {
        name: "description",
        content: "أدخل رمز القضية المكوّن من 10 أرقام لمتابعة حالة قضيتك وآخر تحديثاتها ومواعيدها.",
      },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "متابعة القضية — مِهلة" },
      {
        property: "og:description",
        content: "متابعة حالة القضية عبر رمز القضية المكوّن من 10 أرقام.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TrackPage,
});

type Result = Extract<Awaited<ReturnType<typeof lookupCaseStatus>>, { state: "found" }>;
type Phase = "idle" | "loading" | "found" | "error";

const MESSAGES = {
  idle: "أدخل رمز القضية للمتابعة.",
  loading: "جارٍ التحقق من الرمز…",
  found: "تم العثور على القضية.",
  short: "رمز القضية يتكوّن من 10 أرقام، أكمل الرمز ثم أعد المحاولة.",
  notFound: "رمز القضية غير صحيح، تحقق من الرقم وحاول مرة أخرى.",
  unavailable: "هذا الرمز غير متاح حالياً، تواصل مع المكتب القانوني.",
  rateLimited: "تم تجاوز عدد المحاولات المسموح بها، أعد المحاولة بعد 15 دقيقة.",
  generic: "تعذّر إتمام الطلب حالياً، حاول مرة أخرى بعد لحظات.",
};

function TrackPage() {
  const lookup = useServerFn(lookupCaseStatus);
  const inputRef = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState(MESSAGES.idle);
  const [result, setResult] = useState<Result | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (code.length !== 10) {
      setPhase("error");
      setMessage(MESSAGES.short);
      setResult(null);
      inputRef.current?.focus();
      return;
    }
    setPhase("loading");
    setMessage(MESSAGES.loading);
    setResult(null);
    try {
      const res = await lookup({ data: { code } });
      if (res.state === "found") {
        setResult(res);
        setPhase("found");
        setMessage(MESSAGES.found);
      } else {
        setPhase("error");
        setMessage(
          res.state === "rate_limited"
            ? MESSAGES.rateLimited
            : res.state === "unavailable"
              ? MESSAGES.unavailable
              : MESSAGES.notFound,
        );
      }
    } catch {
      setPhase("error");
      setMessage(MESSAGES.generic);
    }
  };

  const loading = phase === "loading";

  return (
    <div dir="rtl" className="min-h-dvh bg-background text-foreground">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-16 w-full max-w-3xl items-center justify-between gap-3 px-4 sm:px-6">
          <a href="/" className="text-[16px] font-bold tracking-tight">
            مِهلة <span className="text-text-muted">·</span>{" "}
            <span className="text-[12px] tracking-[0.18em]">MEHLA</span>
          </a>
          <Link
            to="/"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-[var(--radius-m)] px-3 text-[13px] text-muted-foreground transition hover:bg-surface-muted hover:text-foreground"
          >
            <ArrowRight className="h-4 w-4" aria-hidden /> العودة للرئيسية
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
        <section className="surface-card p-5 text-center shadow-xs sm:p-9">
          <h1 className="text-h2">تابع مستجدات قضيتك</h1>
          <p className="measure mx-auto mt-3 text-body-sm text-muted-foreground">
            أدخل رمز القضية المكوّن من 10 أرقام للاطلاع على آخر تحديثات القضية والمواعيد المرتبطة
            بها.
          </p>

          <form onSubmit={submit} className="mx-auto mt-7 max-w-md text-right" noValidate>
            <label htmlFor="case-code" className="mb-2 block text-label">
              رمز القضية
            </label>
            <CaseCodeField
              ref={inputRef}
              value={code}
              onValueChange={(value) => {
                setCode(value);
                if (phase === "error") {
                  setPhase("idle");
                  setMessage(MESSAGES.idle);
                }
              }}
              invalid={phase === "error"}
              describedBy="case-code-status"
              disabled={loading}
            />

            <button
              type="submit"
              disabled={loading}
              className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[var(--radius-m)] bg-primary px-5 text-[15px] font-semibold text-primary-foreground shadow-xs transition hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-70"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Search className="h-4 w-4" aria-hidden />
              )}
              تحقق من القضية
            </button>

            <p
              id="case-code-status"
              role="status"
              aria-live="polite"
              className={[
                "mt-3 flex items-start justify-center gap-2 rounded-[var(--radius-m)] px-3 py-2.5 text-center text-[13px]",
                phase === "error"
                  ? "bg-danger-soft text-danger"
                  : phase === "found"
                    ? "bg-success-soft text-success"
                    : "text-muted-foreground",
              ].join(" ")}
            >
              {phase === "error" && (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              )}
              {phase === "found" && (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              )}
              <span>{message}</span>
            </p>

            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={() => setHelpOpen((open) => !open)}
                aria-expanded={helpOpen}
                aria-controls="case-code-help"
                className="inline-flex min-h-11 items-center gap-1.5 rounded-[var(--radius-m)] px-2 text-[13px] text-muted-foreground underline-offset-4 transition hover:text-foreground hover:underline"
              >
                <Info className="h-3.5 w-3.5" aria-hidden /> أين أجد رمز القضية؟
                <ChevronDown
                  className={`h-3.5 w-3.5 transition-transform ${helpOpen ? "rotate-180" : ""}`}
                  aria-hidden
                />
              </button>
              {helpOpen && (
                <p
                  id="case-code-help"
                  className="mx-auto mt-2 max-w-md rounded-[var(--radius-m)] bg-surface-muted p-3.5 text-right text-[13px] leading-6 text-muted-foreground"
                >
                  رمز القضية يصدره المكتب القانوني الذي يمثّلك، ويُرسل إليك عادةً في رسالة نصية أو
                  بريد إلكتروني أو ضمن مستندات القضية. إن لم يتوفّر لديك الرمز، تواصل مع مكتبك
                  لطلبه.
                </p>
              )}
            </div>
          </form>
        </section>

        {result && (
          <div className="mt-6 space-y-4">
            <section className="surface-card p-5 sm:p-7">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border pb-4">
                <div className="min-w-0">
                  <p className="text-caption">رقم القضية</p>
                  <p className="mt-0.5 text-[20px] font-bold tabular-nums" dir="ltr">
                    {result.code}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-primary-soft px-3 py-1.5 text-[12.5px] font-semibold text-primary">
                  {CASE_STATUS[result.status] ?? result.status}
                </span>
              </div>

              <dl className="mt-5 grid gap-3 sm:grid-cols-2">
                <Row
                  icon={<FileClock className="h-4 w-4" />}
                  label="آخر تحديث"
                  value={fmtDateTime(result.lastActivityAt)}
                />
                <Row
                  icon={<CalendarClock className="h-4 w-4" />}
                  label="الجلسة القادمة"
                  value={
                    result.nextHearingAt ? fmtDateTime(result.nextHearingAt) : "لا يوجد موعد معلن"
                  }
                />
                <Row
                  icon={<CalendarClock className="h-4 w-4" />}
                  label="الإجراء القادم"
                  value={result.nextActionAt ? fmtDate(result.nextActionAt) : "لا يوجد"}
                />
                <Row
                  icon={<FileClock className="h-4 w-4" />}
                  label="آخر مستند مضاف"
                  value={result.lastDocumentAt ? fmtDate(result.lastDocumentAt) : "لا يوجد"}
                />
              </dl>
            </section>

            {result.pendingRequests.length > 0 && (
              <section className="surface-card p-5 sm:p-7">
                <h2 className="text-h4">مطلوب منك</h2>
                <ul className="mt-4 space-y-4">
                  {result.pendingRequests.map((request, index) => (
                    <li key={index} className="rounded-[var(--radius-m)] bg-warning-soft/70 p-4">
                      <p className="text-[14px] font-semibold">{request.title}</p>
                      {request.items.length > 0 && (
                        <ul className="mt-2 space-y-1.5">
                          {request.items.map((item) => (
                            <li
                              key={item}
                              className="flex items-start gap-2 text-[13px] text-muted-foreground"
                            >
                              <span
                                className="mt-2 h-1 w-3 shrink-0 rounded-full bg-border-strong"
                                aria-hidden
                              />
                              {item}
                            </li>
                          ))}
                        </ul>
                      )}
                      {request.expiresAt && (
                        <p className="mt-2 text-[12px] text-muted-foreground">
                          آخر موعد للتسليم: {fmtDate(request.expiresAt)}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
                <p className="mt-4 text-[12.5px] text-muted-foreground">
                  يُرسل لك المكتب رابطاً خاصاً لرفع هذه المستندات، ولا يمكن الرفع من هذه الصفحة.
                </p>
              </section>
            )}

            <section className="surface-card p-5 sm:p-7">
              <h2 className="text-h4">آخر الإجراءات</h2>
              {result.updates.length === 0 ? (
                <p className="mt-4 text-[13px] text-muted-foreground">
                  لا توجد تحديثات معلنة حالياً.
                </p>
              ) : (
                <ol className="mt-4 space-y-4 border-r border-border pr-4">
                  {result.updates.map((update, index) => (
                    <li key={index} className="relative">
                      <span
                        className="absolute -right-[22px] top-1.5 h-3 w-3 rounded-full bg-gold"
                        aria-hidden
                      />
                      <p className="text-[14px] font-semibold">{update.title}</p>
                      {update.description && (
                        <p className="mt-0.5 text-[13px] leading-6 text-muted-foreground">
                          {update.description}
                        </p>
                      )}
                      <p className="mt-0.5 text-caption">{fmtDateTime(update.date)}</p>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            <section className="surface-card p-5 sm:p-7">
              <h2 className="text-h4">المكتب القانوني</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Row
                  icon={<Building2 className="h-4 w-4" />}
                  label="اسم المكتب"
                  value={result.office.name || "غير معلن"}
                />
                {result.office.city && (
                  <Row
                    icon={<Building2 className="h-4 w-4" />}
                    label="المدينة"
                    value={result.office.city}
                  />
                )}
                {result.office.phone && (
                  <Row
                    icon={<Phone className="h-4 w-4" />}
                    label="هاتف التواصل"
                    value={result.office.phone}
                    href={`tel:${result.office.phone}`}
                  />
                )}
                {result.office.email && (
                  <Row
                    icon={<Mail className="h-4 w-4" />}
                    label="البريد الرسمي"
                    value={result.office.email}
                    href={`mailto:${result.office.email}`}
                  />
                )}
              </div>
            </section>

            <p className="flex items-center justify-center gap-1.5 text-center text-[12px] text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden /> تُعرض هنا المعلومات
              المصرّح بمشاركتها من مكتبك فقط.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

function Row({
  icon,
  label,
  value,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  href?: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-[var(--radius-m)] bg-surface-muted/70 p-4">
      <span className="mt-0.5 shrink-0 text-text-muted" aria-hidden>
        {icon}
      </span>
      <div className="min-w-0">
        <dt className="text-caption">{label}</dt>
        <dd className="text-[14px] font-medium">
          {href ? (
            <a href={href} dir="ltr" className="underline-offset-4 hover:underline">
              {value}
            </a>
          ) : (
            value
          )}
        </dd>
      </div>
    </div>
  );
}
