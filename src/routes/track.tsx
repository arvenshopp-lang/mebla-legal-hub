import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, CalendarClock, FileClock, Loader2, Search, ShieldCheck } from "lucide-react";
import { lookupCaseStatus } from "@/lib/client-portal.functions";
import { CASE_STATUS, fmtDate, fmtDateTime } from "@/lib/enums";

export const Route = createFileRoute("/track")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "تحقق من حالة قضيتك — مِهلة" },
      { name: "description", content: "أدخل رمز القضية لمتابعة حالتها وآخر تحديثاتها من مكتب المحاماة." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "تحقق من حالة قضيتك — مِهلة" },
      { property: "og:description", content: "متابعة حالة القضية عبر رمز القضية المكوّن من 10 أرقام." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

type Result = Awaited<ReturnType<typeof lookupCaseStatus>>;

function Page() {
  const lookup = useServerFn(lookupCaseStatus);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    const clean = code.replace(/\D/g, "");
    if (clean.length !== 10) { setErr("رمز القضية يتكون من 10 أرقام."); return; }
    setLoading(true);
    setResult(null);
    try {
      const res = await lookup({ data: { code: clean } });
      if (res.state === "not_found") setErr("لم يتم العثور على قضية بهذا الرمز. تأكد من الرمز أو تواصل مع مكتبك.");
      else if (res.state === "rate_limited") setErr("تم تجاوز عدد المحاولات المسموح بها. يرجى المحاولة بعد 15 دقيقة.");
      else setResult(res);
    } catch {
      setErr("تعذّر إتمام الطلب، حاول مرة أخرى.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main dir="rtl" className="min-h-dvh bg-surface-muted px-4 py-8 text-foreground sm:py-14">
      <div className="mx-auto w-full max-w-2xl">
        <Link to="/" className="mb-6 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowRight className="h-3.5 w-3.5" /> العودة للرئيسية
        </Link>

        <div className="rounded-[var(--radius-l)] border border-border bg-surface p-6 shadow-[0_1px_2px_rgba(18,60,50,0.04)] sm:p-9">
          <div className="text-center">
            <div className="text-xl font-extrabold tracking-tight">مِهلة</div>
            <h1 className="mt-4 text-2xl font-bold">تحقق من حالة قضيتك</h1>
            <p className="mt-2 text-sm text-muted-foreground">أدخل رمز القضية المكوّن من 10 أرقام الذي زوّدك به مكتبك.</p>
          </div>

          <form onSubmit={submit} className="mx-auto mt-7 max-w-md space-y-3">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 10))}
              inputMode="numeric"
              autoComplete="off"
              placeholder="أدخل رمز القضية"
              dir="ltr"
              className="w-full rounded-[var(--radius-l)] border border-border bg-surface-muted/60 px-4 py-4 text-center text-lg tracking-[0.35em] outline-none focus:border-primary"
            />
            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-[var(--radius-l)] bg-primary px-5 py-3.5 text-sm font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-60"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} تحقق
            </button>
            {err && <p className="rounded-[var(--radius-m)] bg-danger-soft px-4 py-3 text-center text-sm text-danger">{err}</p>}
          </form>
        </div>

        {result?.state === "found" && (
          <div className="mt-5 space-y-4">
            <section className="rounded-[var(--radius-l)] border border-border bg-surface p-6 sm:p-8">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
                <div>
                  <div className="text-[11px] text-muted-foreground">رقم القضية</div>
                  <div className="text-lg font-bold tracking-widest" dir="ltr">{result.code}</div>
                </div>
                <span className="rounded-full bg-primary-soft px-3 py-1.5 text-xs font-semibold text-foreground">
                  {CASE_STATUS[result.status] ?? result.status}
                </span>
              </div>

              <dl className="mt-5 grid gap-4 sm:grid-cols-2">
                <Row icon={<FileClock className="h-4 w-4" />} label="آخر تحديث" value={fmtDateTime(result.lastActivityAt)} />
                <Row icon={<CalendarClock className="h-4 w-4" />} label="موعد الجلسة القادمة" value={result.nextHearingAt ? fmtDateTime(result.nextHearingAt) : "لا يوجد موعد معلن"} />
                <Row icon={<CalendarClock className="h-4 w-4" />} label="الإجراء القادم" value={result.nextActionAt ? fmtDate(result.nextActionAt) : "لا يوجد"} />
                <Row icon={<FileClock className="h-4 w-4" />} label="آخر تحديث للمستندات" value={result.lastDocumentAt ? fmtDate(result.lastDocumentAt) : "لا يوجد"} />
                <Row icon={<FileClock className="h-4 w-4" />} label="تاريخ آخر تعديل" value={fmtDateTime(result.updatedAt)} />
              </dl>
            </section>

            <section className="rounded-[var(--radius-l)] border border-border bg-surface p-6 sm:p-8">
              <h2 className="mb-4 text-sm font-bold">آخر الإجراءات</h2>
              {result.updates.length === 0 ? (
                <p className="py-4 text-center text-xs text-muted-foreground">لا توجد تحديثات معلنة حالياً.</p>
              ) : (
                <ol className="relative space-y-4 border-r border-border pr-4">
                  {result.updates.map((u, i) => (
                    <li key={i} className="relative">
                      <span className="absolute -right-[22px] top-1.5 h-3 w-3 rounded-full bg-gold" />
                      <div className="text-sm font-medium">{u.title}</div>
                      {u.description && <div className="text-xs leading-6 text-muted-foreground">{u.description}</div>}
                      <div className="mt-0.5 text-[11px] text-text-muted">{fmtDateTime(u.date)}</div>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            <p className="flex items-center justify-center gap-1.5 pb-4 text-[11px] text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5" /> تُعرض هنا المعلومات المصرّح بمشاركتها من مكتبك فقط.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 rounded-[var(--radius-l)] bg-surface-muted/70 p-4">
      <span className="mt-0.5 text-text-muted">{icon}</span>
      <div>
        <dt className="text-[11px] text-muted-foreground">{label}</dt>
        <dd className="text-sm font-medium">{value}</dd>
      </div>
    </div>
  );
}
