import { createFileRoute } from "@tanstack/react-router";
import { useSurfaceHref } from "@/hooks/use-surface-guard";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Menu, X, ArrowLeft, SearchCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { publicPlansQueryOptions } from "@/lib/pricing.query";
import { fmtNumber, } from "@/lib/format";
import {
  highlightedPlanCode,
  planLimitRows,
  yearlySavingPercent,
} from "@/lib/pricing.shared";

const TITLE = "مِهلة | منصة متابعة القضايا والجلسات والمهل للمحامين";
const DESCRIPTION =
  "منصة سعودية تساعد المحامين ومكاتب المحاماة على تنظيم القضايا ومتابعة الجلسات والمهل والمهام والمستندات من مكان واحد.";

export const Route = createFileRoute("/")({
  component: MehlaLanding,
  loader: ({ context }) => context.queryClient.prefetchQuery(publicPlansQueryOptions()),
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://mehlalex.com/" },
      { property: "og:site_name", content: "مِهلة | MehlaLex" },
      { property: "og:image", content: "https://mehlalex.com/og-mehlalex-v2.jpg" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:alt", content: "مِهلة | MehlaLex" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESCRIPTION },
      { name: "twitter:image", content: "https://mehlalex.com/og-mehlalex-v2.jpg" },
    ],
    links: [{ rel: "canonical", href: "https://mehlalex.com/" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "Organization",
              "@id": "https://mehlalex.com/#organization",
              name: "مِهلة | MehlaLex",
              alternateName: "MehlaLex",
              url: "https://mehlalex.com/",
              logo: "https://mehlalex.com/og-mehlalex-v2.jpg",
              description: DESCRIPTION,
              areaServed: { "@type": "Country", name: "السعودية" },
            },
            {
              "@type": "WebSite",
              "@id": "https://mehlalex.com/#website",
              url: "https://mehlalex.com/",
              name: TITLE,
              description: DESCRIPTION,
              inLanguage: "ar-SA",
              publisher: { "@id": "https://mehlalex.com/#organization" },
            },
            {
              "@type": "SoftwareApplication",
              name: "مِهلة | MehlaLex",
              applicationCategory: "BusinessApplication",
              operatingSystem: "Web",
              url: "https://mehlalex.com/",
              inLanguage: "ar-SA",
              description: DESCRIPTION,
              publisher: { "@id": "https://mehlalex.com/#organization" },
            },
          ],
        }),
      },
    ],
  }),
});

/* ---------------------------------------------------------------- utilities */

function useReveal() {
  useEffect(() => {
    const els = document.querySelectorAll<HTMLElement>(".reveal");
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      els.forEach((el) => el.classList.add("is-visible"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e, i) => {
          if (e.isIntersecting) {
            setTimeout(() => e.target.classList.add("is-visible"), i * 70);
            io.unobserve(e.target);
          }
        }),
      { threshold: 0.15, rootMargin: "0px 0px -40px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}

function useScrolled() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return scrolled;
}

/* ----------------------------------------------------------------- sections */

const NAV = [
  { href: "#product", label: "المنتج" },
  { href: "#capabilities", label: "المزايا" },
  { href: "#how", label: "كيف تعمل" },
  { href: "#workflow", label: "سير العمل" },
  { href: "/pricing", label: "الأسعار" },
  { href: "#security", label: "الأمان" },
];

type SurfaceLinks = { loginHref: string; registerHref: string; trackHref: string };

function Header({ loginHref, registerHref, trackHref }: SurfaceLinks) {
  const scrolled = useScrolled();
  const [open, setOpen] = useState(false);
  return (
    <header
      className={cn(
        "sticky top-0 z-[var(--z-sticky)] border-b bg-surface/85 backdrop-blur transition-colors duration-[var(--duration-base)]",
        scrolled ? "border-border" : "border-transparent",
      )}
    >
      <div className="container-page flex h-16 items-center justify-between gap-4">
        <a href="/" className="text-[17px] font-bold tracking-tight">
          مِهلة <span className="text-text-muted">·</span>{" "}
          <span className="text-[13px] tracking-[0.18em]">MEHLA</span>
        </a>

        <nav aria-label="روابط الموقع" className="hidden items-center gap-7 md:flex">
          {NAV.map((n) => (
            <a
              key={n.href}
              href={n.href}
              className="text-[13.5px] text-muted-foreground transition hover:text-foreground"
            >
              {n.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <a
            href={trackHref}
            className="inline-flex h-10 items-center gap-1.5 rounded-[var(--radius-m)] border border-border px-4 text-[13.5px] font-medium text-foreground transition hover:border-border-strong hover:bg-surface-muted"
          >
            <SearchCheck className="h-4 w-4 text-text-muted" aria-hidden />
            متابعة القضية
          </a>
          <a
            href={loginHref}
            className="inline-flex h-10 items-center rounded-[var(--radius-m)] px-4 text-[13.5px] font-medium text-foreground transition hover:bg-surface-muted"
          >
            تسجيل الدخول
          </a>
          <a
            href={registerHref}
            className="inline-flex h-10 items-center rounded-[var(--radius-m)] bg-primary px-4 text-[13.5px] font-semibold text-primary-foreground shadow-xs transition hover:bg-primary-hover"
          >
            ابدأ الآن
          </a>
        </div>

        <button
          className="-m-2 rounded-[var(--radius-s)] p-2 text-foreground md:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? "إغلاق القائمة" : "فتح القائمة"}
        >
          {open ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
        </button>
      </div>

      {open && (
        <div className="border-t border-border bg-surface md:hidden">
          <nav className="container-page flex flex-col py-3" aria-label="روابط الموقع للجوال">
            {NAV.map((n) => (
              <a
                key={n.href}
                href={n.href}
                onClick={() => setOpen(false)}
                className="flex min-h-11 items-center border-b border-border text-[14px] text-muted-foreground last:border-0"
              >
                {n.label}
              </a>
            ))}
            <div className="mt-3 grid gap-2">
              <a
                href={trackHref}
                className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-[var(--radius-m)] border border-border-strong text-[14px] font-semibold"
              >
                <SearchCheck className="h-4 w-4 text-text-muted" aria-hidden />
                متابعة القضية
              </a>
              <a
                href={loginHref}
                className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-m)] border border-border text-[14px] font-medium"
              >
                تسجيل الدخول
              </a>
              <a
                href={registerHref}
                className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-m)] bg-primary text-[14px] font-semibold text-primary-foreground"
              >
                ابدأ الآن
              </a>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}

/** معاينة واقعية لواجهة النظام — مبنية بعناصر حقيقية لا برسوم زخرفية. */
function AppPreview() {
  return (
    <div className="surface-card overflow-hidden shadow-lg">
      <div className="flex items-center justify-between border-b border-border bg-surface-muted/70 px-4 py-2.5">
        <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
          <span className="h-2 w-2 rounded-full bg-border-strong" aria-hidden />
          <span className="h-2 w-2 rounded-full bg-border-strong" aria-hidden />
          <span className="h-2 w-2 rounded-full bg-border-strong" aria-hidden />
          <span className="mr-2">app.mehlalex.com — لوحة التحكم</span>
        </div>
      </div>
      <div className="grid grid-cols-[1fr] md:grid-cols-[190px_1fr]" dir="rtl">
        <aside className="hidden border-l border-border p-3 md:block">
          {["الرئيسية", "القضايا", "الجلسات", "المهل", "المهام", "العملاء", "المستندات"].map(
            (l, i) => (
              <div
                key={l}
                className={cn(
                  "mb-1 flex items-center gap-2 rounded-[var(--radius-s)] px-3 py-2 text-[12.5px]",
                  i === 0 ? "bg-primary-soft font-semibold text-primary" : "text-muted-foreground",
                )}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-current opacity-40" aria-hidden />
                {l}
              </div>
            ),
          )}
        </aside>
        <div className="p-4 sm:p-5">
          <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            {[
              ["قضايا مفتوحة", "34"],
              ["جلسات اليوم", "3"],
              ["مهل خلال 7 أيام", "6"],
              ["مهام متأخرة", "2"],
            ].map(([l, v], i) => (
              <div
                key={l}
                className="relative overflow-hidden rounded-[var(--radius-m)] border border-border p-3"
              >
                <span
                  className={cn(
                    "absolute inset-y-0 right-0 w-[3px]",
                    ["bg-border-strong", "bg-primary", "bg-warning", "bg-danger"][i],
                  )}
                  aria-hidden
                />
                <p className="text-[11px] text-muted-foreground">{l}</p>
                <p className="mt-1 text-[20px] font-bold tabular-nums">{v}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-[var(--radius-m)] border border-border">
            <div className="border-b border-border px-4 py-2.5 text-[12.5px] font-semibold">
              الجلسات القادمة
            </div>
            <ul className="divide-y divide-border">
              {[
                ["مطالبة مالية — شركة الأفق", "المحكمة التجارية بالرياض", "الأحد ٠٩:٣٠"],
                ["نزاع عمالي — م. القحطاني", "المحكمة العمالية بجدة", "الاثنين ١١:٠٠"],
                ["اعتراض على حكم", "محكمة الاستئناف", "الأربعاء ١٠:١٥"],
              ].map(([t, c, d]) => (
                <li key={t} className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="min-w-0">
                    <span className="block truncate text-[12.5px] font-semibold">{t}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">{c}</span>
                  </span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">{d}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function Hero({ loginHref, registerHref, trackHref }: SurfaceLinks) {
  return (
    <section className="relative overflow-hidden border-b border-border">
      <div className="grid-lines pointer-events-none absolute inset-0 opacity-60" aria-hidden />
      <div className="container-page relative pb-14 pt-16 md:pb-20 md:pt-24">
        <div className="reveal measure">
          <p className="text-[12.5px] font-semibold tracking-wide text-muted-foreground">
            منصة سعودية لإدارة الممارسة القانونية
          </p>
          <h1 className="text-display mt-4">
            إدارة قانونية أوضح.
            <br />
            متابعة أدق للمهل والجلسات.
          </h1>
          <p className="mt-5 text-body-lg text-muted-foreground">
            مِهلة تجمع القضايا والعملاء والجلسات والمستندات في مساحة عمل واحدة منظمة، لتعرف في كل
            لحظة ما الذي يحتاج إجراءً اليوم وما الذي يقترب موعده.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a
              href={registerHref}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[var(--radius-m)] bg-primary px-6 text-[15px] font-semibold text-primary-foreground shadow-xs transition hover:bg-primary-hover"
            >
              ابدأ الاستخدام <ArrowLeft className="h-4 w-4" aria-hidden />
            </a>
            <a
              href={trackHref}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[var(--radius-m)] border border-border-strong bg-surface px-6 text-[15px] font-semibold transition hover:bg-surface-muted"
            >
              <SearchCheck className="h-4 w-4 text-text-muted" aria-hidden />
              متابعة القضية
            </a>
            <a
              href={loginHref}
              className="inline-flex min-h-12 items-center justify-center rounded-[var(--radius-m)] border border-border bg-surface px-6 text-[15px] font-medium transition hover:border-border-strong"
            >
              لدي حساب بالفعل
            </a>
          </div>
          <p className="mt-4 text-[13px] text-muted-foreground">
            عميل لدى أحد المكاتب؟ تابع قضيتك برمز مكوّن من 10 أرقام دون إنشاء حساب.
          </p>
        </div>

        <div className="reveal mt-12 md:mt-16">
          <AppPreview />
        </div>
      </div>
    </section>
  );
}

const CAPABILITIES = [
  {
    title: "مساحة عمل لكل قضية",
    body: "بيانات القضية والأطراف والجلسات والمستندات والمهام وسجل النشاط في صفحة واحدة، دون تنقل بين أدوات متفرقة.",
    points: [
      "تصنيف حسب النوع والحالة والمحكمة",
      "خط زمني للتحديثات",
      "ربط العميل والمستندات مباشرة",
    ],
  },
  {
    title: "متابعة المهل والجلسات",
    body: "تتبّع المواعيد النظامية والجلسات القادمة بترتيب زمني واضح، مع إبراز ما تجاوز موعده وما يقترب.",
    points: ["مهل نظامية بحالات محددة", "جلسات مجدولة ومنجزة", "تنبيه بصري للمتأخر"],
  },
  {
    title: "مستندات منظمة وآمنة",
    body: "رفع المستندات وحفظها في تخزين خاص مع روابط مؤقتة، وربط كل مستند بقضيته وعميله.",
    points: ["تخزين خاص غير عام", "روابط تحميل مؤقتة", "طلب مستندات من العميل برابط خاص"],
  },
  {
    title: "بوابة العميل",
    body: "يتابع العميل حالة قضيته برمز مكوّن من عشرة أرقام، ويرى فقط التحديثات التي تسمح أنت بإظهارها.",
    points: ["رمز متابعة بدون تسجيل", "تحكم كامل بما يُعرض", "رفع مستندات برابط مؤقت"],
  },
];

function Capabilities() {
  return (
    <section id="capabilities" className="section-y border-b border-border">
      <div className="container-page">
        <div className="reveal measure">
          <h2 className="text-h2">مبني على ما يحتاجه المكتب فعلاً</h2>
          <p className="mt-3 text-body text-muted-foreground">
            أربعة أنظمة أساسية تغطي دورة العمل القانونية من فتح القضية حتى إبلاغ العميل.
          </p>
        </div>
        <div className="mt-10 grid gap-px overflow-hidden rounded-[var(--radius-l)] border border-border bg-border md:grid-cols-2">
          {CAPABILITIES.map((c) => (
            <article key={c.title} className="reveal bg-surface p-6 md:p-8">
              <h3 className="text-h3">{c.title}</h3>
              <p className="mt-3 text-body-sm text-muted-foreground">{c.body}</p>
              <ul className="mt-5 space-y-2">
                {c.points.map((p) => (
                  <li
                    key={p}
                    className="flex items-start gap-2.5 text-[13.5px] text-muted-foreground"
                  >
                    <span
                      className="mt-2 h-1 w-4 shrink-0 rounded-full bg-border-strong"
                      aria-hidden
                    />
                    {p}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------- كيف تعمل مِهلة */

type HowStep = {
  key: string;
  label: string;
  title: string;
  body: string;
  example: {
    kind: string;
    heading: string;
    rows: [string, string][];
    timeline: { label: string; note: string; state: "done" | "now" | "next" }[];
    alert?: string;
  };
};

const HOW_STEPS: HowStep[] = [
  {
    key: "case",
    label: "١. القضية",
    title: "افتح القضية مرة واحدة",
    body: "تُسجّل بيانات القضية والمحكمة والعميل، فيصبح لكل جلسة ومهلة ومستند مكان واضح مرتبط بها.",
    example: {
      kind: "ملف قضية",
      heading: "مطالبة مالية · 4512/1447",
      rows: [
        ["المحكمة", "المحكمة التجارية — الرياض"],
        ["الموكل", "شركة نماء التجارية"],
        ["الدائرة", "الدائرة الثالثة"],
        ["رمز متابعة العميل", "8043 512 917"],
      ],
      timeline: [
        { label: "إنشاء الملف", note: "اليوم", state: "done" },
        { label: "إضافة الأطراف", note: "خطوة تالية", state: "now" },
        { label: "جدولة الجلسة", note: "بانتظار الموعد", state: "next" },
      ],
    },
  },
  {
    key: "hearing",
    label: "٢. الجلسة",
    title: "سجّل الجلسة وتابع نتيجتها",
    body: "تُضاف الجلسة بموعدها ومكانها، وتُذكّرك المنصة قبلها، ثم تُدوّن نتيجتها فتتحوّل تلقائياً إلى المهلة المترتبة عليها.",
    example: {
      kind: "جلسة قادمة",
      heading: "الجلسة الثانية · الأحد ١٤ رجب",
      rows: [
        ["الوقت", "١٠:٣٠ صباحاً"],
        ["النوع", "مرافعة — حضور أصالة"],
        ["الحاضر عن المكتب", "أ. سارة الدوسري"],
        ["نتيجة الجلسة السابقة", "تأجيل لتقديم مذكرة"],
      ],
      timeline: [
        { label: "الجلسة الأولى", note: "تمت — تأجيل", state: "done" },
        { label: "الجلسة الثانية", note: "بعد ٦ أيام", state: "now" },
        { label: "مذكرة جوابية", note: "مهلة مرتبطة", state: "next" },
      ],
      alert: "تذكير تلقائي قبل الجلسة بـ ٤٨ ساعة وقبلها بيوم واحد.",
    },
  },
  {
    key: "deadline",
    label: "٣. المهلة",
    title: "لا تفوتك مهلة نظامية",
    body: "تُحسب المهلة من تاريخ بدايتها وعدد أيامها، وتظهر في لوحة التحكم بترتيب القرب مع تمييز واضح للمهل الحرجة.",
    example: {
      kind: "مهلة نظامية",
      heading: "تقديم مذكرة جوابية",
      rows: [
        ["بدء المهلة", "٨ رجب"],
        ["المدة النظامية", "١٤ يوماً"],
        ["تاريخ الانتهاء", "٢٢ رجب"],
        ["المسؤول", "أ. عبدالله القحطاني"],
      ],
      timeline: [
        { label: "المسودة الأولى", note: "مكتملة", state: "done" },
        { label: "متبقٍ ٣ أيام", note: "حالة حرجة", state: "now" },
        { label: "الرفع للمحكمة", note: "قبل ٢٢ رجب", state: "next" },
      ],
      alert: "تتحول المهلة إلى اللون التحذيري تلقائياً عند تبقّي ثلاثة أيام أو أقل.",
    },
  },
  {
    key: "client",
    label: "٤. العميل",
    title: "أبلغ العميل بما تختاره فقط",
    body: "بعد كل جلسة أو مهلة تحدّد ما يظهر للعميل، فيتابع قضيته برمزه دون اتصالات متكررة ودون كشف أي بيانات سرية.",
    example: {
      kind: "بوابة المتابعة",
      heading: "الرمز 8043 512 917",
      rows: [
        ["حالة القضية", "منظورة أمام الدائرة الثالثة"],
        ["آخر تحديث ظاهر", "تم حضور الجلسة الأولى"],
        ["الجلسة القادمة", "١٤ رجب — ١٠:٣٠ ص"],
        ["مستندات مطلوبة", "صورة السجل التجاري"],
      ],
      timeline: [
        { label: "تحديث منشور", note: "ظاهر للعميل", state: "done" },
        { label: "ملاحظة داخلية", note: "مخفية", state: "next" },
        { label: "طلب مستند", note: "رابط مؤقت", state: "now" },
      ],
      alert: "المذكرات والملاحظات الداخلية لا تظهر في البوابة إطلاقاً.",
    },
  },
];

const STATE_STYLE: Record<"done" | "now" | "next", { dot: string; text: string }> = {
  done: { dot: "bg-primary", text: "text-muted-foreground" },
  now: { dot: "bg-gold", text: "text-foreground font-medium" },
  next: { dot: "bg-border-strong", text: "text-text-muted" },
};

function HowItWorks() {
  const [active, setActive] = useState(0);
  const step = HOW_STEPS[active];

  return (
    <section id="how" className="section-y border-b border-border bg-surface">
      <div className="container-page">
        <div className="reveal measure">
          <p className="text-label">كيف تعمل مِهلة</p>
          <h2 className="text-h2 mt-2">من فتح القضية إلى إبلاغ العميل — بمثال حقيقي</h2>
          <p className="mt-3 text-body text-muted-foreground">
            اختر أي خطوة لترى كيف تظهر داخل المنصة فعلياً: جلسة مجدولة، مهلة نظامية تُحسب تلقائياً،
            وتحديث يصل للعميل بإذنك.
          </p>
        </div>

        <div className="reveal mt-10 grid gap-px overflow-hidden rounded-[var(--radius-l)] border border-border bg-border lg:grid-cols-[minmax(0,320px)_1fr]">
          {/* الخطوات */}
          <div
            role="tablist"
            aria-label="خطوات عمل المنصة"
            aria-orientation="vertical"
            className="flex gap-px overflow-x-auto bg-border lg:flex-col lg:overflow-visible"
          >
            {HOW_STEPS.map((s, i) => {
              const isActive = i === active;
              return (
                <button
                  key={s.key}
                  role="tab"
                  id={`how-tab-${s.key}`}
                  aria-selected={isActive}
                  aria-controls={`how-panel-${s.key}`}
                  tabIndex={isActive ? 0 : -1}
                  onClick={() => setActive(i)}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowDown" || e.key === "ArrowLeft") {
                      e.preventDefault();
                      setActive((active + 1) % HOW_STEPS.length);
                    }
                    if (e.key === "ArrowUp" || e.key === "ArrowRight") {
                      e.preventDefault();
                      setActive((active - 1 + HOW_STEPS.length) % HOW_STEPS.length);
                    }
                  }}
                  className={cn(
                    "min-w-[190px] shrink-0 px-5 py-4 text-right transition-colors duration-[var(--duration-base)] lg:min-w-0 lg:flex-1 lg:px-6 lg:py-6",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "bg-surface hover:bg-surface-muted",
                  )}
                >
                  <span
                    className={cn(
                      "text-[12px] font-semibold tabular-nums",
                      isActive ? "text-primary-foreground/70" : "text-text-muted",
                    )}
                  >
                    {s.label}
                  </span>
                  <span className="text-h4 mt-1 block">{s.title}</span>
                  <span
                    className={cn(
                      "mt-1.5 hidden text-body-sm lg:block",
                      isActive ? "text-primary-foreground/80" : "text-muted-foreground",
                    )}
                  >
                    {s.body}
                  </span>
                </button>
              );
            })}
          </div>

          {/* المعاينة */}
          <div
            role="tabpanel"
            id={`how-panel-${step.key}`}
            aria-labelledby={`how-tab-${step.key}`}
            className="bg-surface p-6 md:p-8"
          >
            <p className="text-body-sm text-muted-foreground lg:hidden">{step.body}</p>

            <div className="mt-5 rounded-[var(--radius-m)] border border-border bg-background lg:mt-0">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3.5">
                <span className="rounded-full border border-border bg-surface px-3 py-1 text-[12px] text-muted-foreground">
                  {step.example.kind}
                </span>
                <span className="text-[14px] font-semibold">{step.example.heading}</span>
              </div>

              <dl className="grid gap-px bg-border sm:grid-cols-2">
                {step.example.rows.map(([k, v]) => (
                  <div key={k} className="bg-background px-5 py-4">
                    <dt className="text-[12px] text-text-muted">{k}</dt>
                    <dd className="mt-1 text-[13.5px] font-medium">{v}</dd>
                  </div>
                ))}
              </dl>

              <ol className="space-y-4 border-t border-border px-5 py-5">
                {step.example.timeline.map((t) => (
                  <li key={t.label} className="flex items-start gap-3">
                    <span
                      className={cn(
                        "mt-[7px] h-2 w-2 shrink-0 rounded-full",
                        STATE_STYLE[t.state].dot,
                      )}
                      aria-hidden
                    />
                    <span className={cn("text-[13.5px]", STATE_STYLE[t.state].text)}>
                      {t.label}
                    </span>
                    <span className="ms-auto text-[12.5px] text-text-muted">{t.note}</span>
                  </li>
                ))}
              </ol>

              {step.example.alert && (
                <p className="border-t border-border bg-surface-muted px-5 py-4 text-[13px] text-muted-foreground">
                  {step.example.alert}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

const STEPS = [
  ["فتح القضية", "سجّل بيانات القضية ورقمها والمحكمة المختصة."],
  ["ربط العميل", "أضف العميل وبيانات التواصل والأطراف ذات العلاقة."],
  ["إرفاق المستندات", "ارفع الملفات أو اطلبها من العميل برابط خاص."],
  ["تسجيل الجلسات", "دوّن مواعيد الجلسات ونتائجها أولاً بأول."],
  ["متابعة المهل", "راقب المواعيد النظامية قبل انتهائها."],
  ["إبلاغ العميل", "انشر التحديثات المسموح بها في بوابة المتابعة."],
];

function Workflow() {
  return (
    <section id="workflow" className="section-y border-b border-border bg-surface">
      <div className="container-page">
        <div className="reveal measure">
          <h2 className="text-h2">سير عمل واضح من البداية للنهاية</h2>
          <p className="mt-3 text-body text-muted-foreground">
            ست خطوات متتابعة تعكس طريقة عمل المكاتب القانونية في المملكة.
          </p>
        </div>
        <ol className="mt-10 grid gap-x-8 gap-y-6 md:grid-cols-2 lg:grid-cols-3">
          {STEPS.map(([t, d], i) => (
            <li key={t} className="reveal border-t border-border pt-5">
              <span className="text-[12px] font-semibold tabular-nums text-text-muted">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="text-h4 mt-1.5">{t}</h3>
              <p className="mt-1.5 text-body-sm text-muted-foreground">{d}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

const SECURITY = [
  [
    "عزل بيانات المكاتب",
    "كل مكتب يرى بياناته فقط عبر سياسات أمان على مستوى الصفوف في قاعدة البيانات.",
  ],
  [
    "صلاحيات حسب الدور",
    "مالك، مدير، محامٍ، مساعد — لكل دور صلاحيات محددة على الإنشاء والتعديل والحذف.",
  ],
  ["تخزين مستندات خاص", "الملفات محفوظة في تخزين غير عام، ويُصدر رابط مؤقت عند الحاجة فقط."],
  ["بوابة عميل محدودة", "لا تُعرض للعميل أي بيانات حساسة، بل التحديثات المسموح بها فقط."],
];

function Security() {
  return (
    <section id="security" className="section-y border-b border-border">
      <div className="container-page grid gap-10 lg:grid-cols-[minmax(0,380px)_1fr]">
        <div className="reveal">
          <h2 className="text-h2">الأمان ليس خياراً إضافياً</h2>
          <p className="mt-3 text-body text-muted-foreground">
            بيانات الموكلين أمانة مهنية، ولذلك بُنيت المنصة على فصل صارم للبيانات وصلاحيات دقيقة.
          </p>
        </div>
        <dl className="grid gap-px overflow-hidden rounded-[var(--radius-l)] border border-border bg-border sm:grid-cols-2">
          {SECURITY.map(([t, d]) => (
            <div key={t} className="reveal bg-surface p-6">
              <dt className="text-h4">{t}</dt>
              <dd className="mt-2 text-body-sm text-muted-foreground">{d}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

function CTA({ registerHref }: { registerHref: string }) {
  return (
    <section className="section-y">
      <div className="container-page">
        <div className="reveal rounded-[var(--radius-l)] bg-primary px-6 py-12 text-primary-foreground md:px-12 md:py-16">
          <h2 className="text-h2 measure">جاهز لتنظيم عمل مكتبك؟</h2>
          <p className="measure mt-3 text-body text-primary-foreground/80">
            أنشئ مكتبك خلال دقيقة، وابدأ بتسجيل أول قضية ومتابعة مهلها وجلساتها.
          </p>
          <a
            href={registerHref}
            className="mt-8 inline-flex min-h-12 items-center justify-center gap-2 rounded-[var(--radius-m)] bg-surface px-6 text-[15px] font-semibold text-primary transition hover:bg-surface-muted"
          >
            إنشاء حساب المكتب <ArrowLeft className="h-4 w-4" aria-hidden />
          </a>
        </div>
      </div>
    </section>
  );
}

const FOOTER_LINKS: Array<{ href: string; label: string }> = [
  { href: "#product", label: "المنتج" },
  { href: "#capabilities", label: "المزايا" },
  { href: "#security", label: "الأمان" },
  { href: "/docs", label: "مركز المساعدة" },
  { href: "/privacy", label: "سياسة الخصوصية" },
  { href: "/terms", label: "الشروط والأحكام" },
  { href: "mailto:support@mehlalex.com", label: "تواصل معنا" },
];

function Footer({ loginHref, registerHref, trackHref }: SurfaceLinks) {
  return (
    <footer className="border-t border-border bg-surface">
      <div className="container-page flex flex-col items-center gap-7 py-12 text-center">
        <div className="max-w-xl">
          <p className="text-[17px] font-bold">
            مِهلة <span className="text-text-muted">·</span> MEHLA
          </p>
          <p className="mx-auto mt-3 max-w-lg text-body-sm text-muted-foreground">
            منصة سعودية لإدارة الممارسة القانونية: القضايا، الجلسات، المهل، المستندات، ومتابعة
            العملاء.
          </p>
        </div>

        <div className="flex w-full flex-col items-center gap-2.5 sm:w-auto sm:flex-row">
          <a
            href={trackHref}
            className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-[var(--radius-m)] border border-border-strong px-5 text-[14px] font-semibold transition hover:bg-surface-muted sm:w-auto"
          >
            <SearchCheck className="h-4 w-4 text-text-muted" aria-hidden />
            متابعة القضية
          </a>
          <a
            href={registerHref}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-[var(--radius-m)] bg-primary px-5 text-[14px] font-semibold text-primary-foreground transition hover:bg-primary-hover sm:w-auto"
          >
            إنشاء حساب المكتب
          </a>
          <a
            href={loginHref}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-[var(--radius-m)] px-5 text-[14px] font-medium text-muted-foreground transition hover:text-foreground sm:w-auto"
          >
            تسجيل الدخول
          </a>
        </div>

        <nav aria-label="روابط الفوتر" className="w-full">
          <ul className="flex flex-wrap items-center justify-center gap-x-6 gap-y-1 text-body-sm text-muted-foreground">
            {FOOTER_LINKS.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  className="inline-flex min-h-11 items-center transition hover:text-foreground"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <div className="border-t border-border">
        <div className="container-page flex flex-col items-center gap-1 py-5 text-center text-[12.5px] text-muted-foreground">
          <p>© {new Date().getFullYear()} مِهلة | MehlaLex — جميع الحقوق محفوظة.</p>
          <p dir="ltr">mehlalex.com</p>
        </div>
      </div>
    </footer>
  );
}

/* --------------------------------------------------------------------- page */

function MehlaLanding() {
  useReveal();
  const loginHref = useSurfaceHref("/login");
  const registerHref = useSurfaceHref("/register");
  const trackHref = useSurfaceHref("/track");
  const links = { loginHref, registerHref, trackHref };

  return (
    <div dir="rtl" className="min-h-dvh bg-background text-foreground">
      <Header {...links} />
      <main id="product">
        <Hero {...links} />
        <Capabilities />
        <HowItWorks />
        <Workflow />
        <Security />
        <CTA registerHref={registerHref} />
      </main>
      <Footer {...links} />
    </div>
  );
}
