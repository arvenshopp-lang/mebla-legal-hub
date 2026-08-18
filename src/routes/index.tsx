import { createFileRoute } from "@tanstack/react-router";
import { useSurfaceHref } from "@/hooks/use-surface-guard";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Menu, X, ArrowLeft, SearchCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { publicPlansQueryOptions } from "@/lib/pricing.query";
import { publicRankingQueryOptions } from "@/lib/operational-score/ranking.query";
import { publicSiteQueryOptions } from "@/lib/public-site.query";
import { TopOffices } from "@/components/marketing/top-offices";
import { SiteFooter } from "@/components/marketing/site-footer";
import { Riyal } from "@/components/ui/riyal";
import { headerBtn, heroBtn, sheetBtn, publicBtnIcon } from "@/components/marketing/public-buttons";
import { fmtNumber } from "@/lib/format";
import { highlightedPlanCode, planLimitRows, yearlySavingPercent } from "@/lib/pricing.shared";
import { PublicBayanCopilot } from "@/components/public/public-bayan-copilot";
import { BayanHeroShowcase } from "@/components/marketing/bayan-hero-showcase";

const TITLE = "مِهلة | منصة متابعة القضايا والجلسات والمهل للمحامين";
const DESCRIPTION =
  "منصة سعودية تساعد المحامين ومكاتب المحاماة على تنظيم القضايا ومتابعة الجلسات والمهل والمهام والمستندات من مكان واحد.";

export const Route = createFileRoute("/")({
  component: MehlaLanding,
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.prefetchQuery(publicPlansQueryOptions()),
      context.queryClient.prefetchQuery(publicRankingQueryOptions()),
      context.queryClient.ensureQueryData(publicSiteQueryOptions()),
    ]);
  },
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
            className={headerBtn.secondary}
          >
            <SearchCheck className={cn(publicBtnIcon, "text-primary")} aria-hidden />
            متابعة القضية
          </a>
          <a
            href={loginHref}
            className={headerBtn.tertiary}
          >
            تسجيل الدخول
          </a>
          <a
            href={registerHref}
            className={headerBtn.primary}
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
                className={sheetBtn.secondary}
              >
                <SearchCheck className={cn(publicBtnIcon, "text-primary")} aria-hidden />
                متابعة القضية
              </a>
              <a
                href={loginHref}
                className={sheetBtn.tertiary}
              >
                تسجيل الدخول
              </a>
              <a
                href={registerHref}
                className={sheetBtn.primary}
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

/** معاينة واقعية تفاعلية لواجهة النظام — تبرز القضايا والجلسات والمطالبات المالية. */
function AppPreview() {
  return (
    <div className="surface-card overflow-hidden rounded-[var(--radius-l)] border border-border shadow-xl">
      <div className="flex items-center justify-between border-b border-border bg-surface-muted/80 px-4 py-3">
        <div className="flex items-center gap-2 text-[12.5px] font-medium text-muted-foreground">
          <span className="h-2.5 w-2.5 rounded-full bg-border-strong" aria-hidden />
          <span className="h-2.5 w-2.5 rounded-full bg-border-strong" aria-hidden />
          <span className="h-2.5 w-2.5 rounded-full bg-border-strong" aria-hidden />
          <span className="mr-2 font-mono text-[11.5px]">app.mehlalex.com · مساحة عمل المكتب</span>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> متصل ومؤمن
        </span>
      </div>
      <div className="grid grid-cols-[1fr] md:grid-cols-[200px_1fr]" dir="rtl">
        <aside className="hidden border-l border-border bg-surface-muted/30 p-3 md:block">
          {[
            { l: "الرئيسية", active: true },
            { l: "القضايا", count: "24" },
            { l: "الجلسات", count: "3" },
            { l: "المهل النظامية", count: "6" },
            { l: "المهام", count: "12" },
            { l: "المستندات والـ OCR", count: "48" },
            { l: "العقود الرقمية", count: "8" },
          ].map((item) => (
            <div
              key={item.l}
              className={cn(
                "mb-1 flex items-center justify-between rounded-[var(--radius-m)] px-3 py-2 text-[13px] transition",
                item.active
                  ? "bg-primary font-semibold text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:bg-surface-muted hover:text-foreground",
              )}
            >
              <span>{item.l}</span>
              {item.count && (
                <span className="rounded-full bg-border px-1.5 py-0.2 text-[11px] font-medium tabular-nums text-muted-foreground">
                  {item.count}
                </span>
              )}
            </div>
          ))}
        </aside>
        <div className="p-4 sm:p-6 bg-surface">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              ["قضايا منظورة", "24 قضية", "bg-primary", "text-primary"],
              ["جلسات اليوم", "3 جلسات", "bg-emerald-500", "text-emerald-600 dark:text-emerald-400"],
              ["مهل خلال 7 أيام", "6 مهل", "bg-amber-500", "text-amber-600 dark:text-amber-400"],
              ["أتعاب محصلة (الشهر)", "48,500", "bg-sky-500", "text-sky-600 dark:text-sky-400"],
            ].map(([l, v, barColor, txtColor]) => (
              <div
                key={l}
                className="relative overflow-hidden rounded-[var(--radius-m)] border border-border bg-background p-3.5 shadow-2xs"
              >
                <span className={cn("absolute inset-y-0 right-0 w-[3.5px]", barColor)} aria-hidden />
                <p className="text-[11.5px] font-medium text-muted-foreground">{l}</p>
                <p className={cn("mt-1.5 text-[18px] font-bold tabular-nums", txtColor)}>
                  {l === "أتعاب محصلة (الشهر)" ? (
                    <span className="inline-flex items-center gap-1" dir="ltr">
                      {v}
                      <Riyal />
                      <span className="sr-only">ريال سعودي</span>
                    </span>
                  ) : (
                    v
                  )}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <div className="rounded-[var(--radius-m)] border border-border bg-background">
              <div className="flex items-center justify-between border-b border-border px-4 py-3 text-[13px] font-bold">
                <span>الجلسات القادمة</span>
                <span className="text-[11px] text-muted-foreground">هذا الأسبوع</span>
              </div>
              <ul className="divide-y divide-border">
                {[
                  ["مطالبة تجارية — شركة الأفق", "المحكمة التجارية بالرياض", "الأحد ٠٩:٣٠ ص"],
                  ["نزاع عمالي — م. القحطاني", "المحكمة العمالية بجدة", "الاثنين ١١:٠٠ ص"],
                  ["لائحة اعتراض استئناف", "محكمة الاستئناف", "الأربعاء ١٠:١٥ ص"],
                ].map(([t, c, d]) => (
                  <li key={t} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-semibold text-foreground">{t}</span>
                      <span className="block truncate text-[11.5px] text-muted-foreground">{c}</span>
                    </span>
                    <span className="shrink-0 rounded bg-surface-muted px-2 py-0.5 text-[11.5px] font-medium text-muted-foreground">
                      {d}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-[var(--radius-m)] border border-border bg-background">
              <div className="flex items-center justify-between border-b border-border px-4 py-3 text-[13px] font-bold">
                <span>أحدث مطالبات الأتعاب</span>
                <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">مسددة</span>
              </div>
              <ul className="divide-y divide-border">
                {[
                  ["مطالبة أتعاب صياغة لائحة", "CLM-2026-8374", "7,000", "مسددة"],
                  ["عرض أتعاب تمثيل قضائي", "QTE-2026-0042", "15,000", "سارية"],
                  ["إشعار مطالبة أتعاب وساطة", "CLM-2026-8210", "4,500", "مسددة"],
                ].map(([t, ref, amount, status]) => (
                  <li key={ref} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-semibold text-foreground">{t}</span>
                      <span className="block truncate text-[11px] font-mono text-muted-foreground">{ref}</span>
                    </span>
                    <div className="text-left shrink-0">
                      <span className="flex items-center justify-end gap-1 text-[13px] font-bold tabular-nums text-foreground" dir="ltr">
                        {amount}
                        <Riyal />
                        <span className="sr-only">ريال سعودي</span>
                      </span>
                      <span className="text-[10.5px] font-medium text-emerald-600 dark:text-emerald-400">{status}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Hero({ loginHref, registerHref, trackHref }: SurfaceLinks) {
  return (
    <section className="relative overflow-hidden border-b border-border ambient-hero-bg">
      <div className="container-page relative pb-16 pt-16 md:pb-24 md:pt-24">
        <div className="measure mx-auto text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3.5 py-1 text-[13px] font-semibold text-primary">
            <span className="h-2 w-2 rounded-full bg-primary" />
            المنصة السحابية المتكاملة لمكاتب المحاماة السعودية
          </div>

          <h1 className="text-display mt-6 tracking-tight">
            مِهلة — إدارة قانونية أوضح.
            <br />
            متابعة دقيقة للمهل والجلسات والأتعاب.
          </h1>

          <p className="mt-5 text-body-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            مِهلة تجمع القضايا والعملاء والجلسات والمهل والمستندات الذكية ومطالبات الأتعاب في مساحة عمل واحدة منظمة، لتعرف في كل لحظة ما يحتاج إجراءً اليوم وما يقترب موعده.
          </p>
        </div>

        <div className="mx-auto max-w-3xl text-center">
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-3.5">
            <a
              href={registerHref}
              className={heroBtn.primary}
            >
              ابدأ الاستخدام مجاناً
              <ArrowLeft className={publicBtnIcon} aria-hidden />
            </a>
            <a
              href={trackHref}
              className={heroBtn.secondary}
            >
              <SearchCheck className={cn(publicBtnIcon, "text-primary")} aria-hidden />
              متابعة قضية برمز
            </a>
            <a
              href={loginHref}
              className={heroBtn.tertiary}
            >
              تسجيل الدخول
            </a>
          </div>

          <p className="mt-4 text-[13px] text-muted-foreground">
            لا يتطلب إدخال بطاقة دفع · تفعيل فوري خلال دقيقة واحدة · متوافق مع الأنظمة السعودية
          </p>
        </div>

        <div className="mt-12 md:mt-16 max-w-5xl mx-auto">
          <AppPreview />
        </div>
      </div>
    </section>
  );
}

const CAPABILITIES = [
  {
    title: "مساحة عمل لكل قضية",
    body: "بيانات القضية والأطراف والجلسات والمستندات والمهام والملخص المالي وسجل النشاط في صفحة واحدة، دون تشتت بين أدوات متفرقة.",
    points: [
      "تصنيف حسب المحكمة والدائرة والحالة",
      "خط زمني تفاعلي لتحديثات القضية",
      "بطاقة مالية مدمجة للأتعاب والمطالبات",
    ],
  },
  {
    title: "حساب المهل والجلسات القضائية",
    body: "تتبّع دقيق للمواعيد النظامية والجلسات القادمة بترتيب زمني، مع تنبيهات استباقية قبل انتهاء مهل الاعتراض والاستئناف.",
    points: [
      "حساب تلقائي لمدد المهل القضائية",
      "تذكيرات مجدولة قبل الجلسات",
      "تمييز بصري فوري للمهل الحرجة",
    ],
  },
  {
    title: "خزينة المستندات وقراءة الـ OCR",
    body: "مستودع وثائق مشفر مع استخراج النصوص وفهرستها والبحث داخل اللوائح والصكوك والمستندات الممسوحة ضوئياً.",
    points: [
      "تخزين خاص مشفر بروابط مؤقتة",
      "قراءة ضوئية OCR عالية الدقة للوثائق",
      "علامة مائية آلية لحماية سرية الأوراق",
    ],
  },
  {
    title: "عروض الأسعار ومطالبات الأتعاب",
    body: "إصدار عروض أتعاب مهنية وإشعارات مطالبات وسندات قبض بصيغة PDF أنيقة تحمل هوية وشعار وبيانات مكتبك.",
    points: [
      "عروض أسعار ومطالبات أتعاب مرقمة",
      "تصدير PDF فاخر بهوية وشعار المكتب",
      "تسجيل الدفعات وسندات القبض الفورية",
    ],
  },
  {
    title: "بوابة العميل والتتبع بالرمز",
    body: "يتابع الموكل مستجدات قضيته برمز سري مكوّن من عشرة أرقام دون تسجيل دخول، ويرى فقط ما تسمح به إدارة المكتب.",
    points: [
      "تتبع فوري برمز آمن دون إنشاء حساب",
      "تحكم كامل في مستوى سرية المنشورات",
      "استقبال طلبات الاستشارات العامة",
    ],
  },
  {
    title: "الأمان وعزل المستأجرين (RBAC)",
    body: "حماية تامة وسرية مطلقة للبيانات مع عزل صارم بين المكاتب وتشفير الهويات الوطنية والسجلات التجارية.",
    points: [
      "مصفوفة صلاحيات دقيقة للمحامين والمساعدين",
      "عزل تام على مستوى قاعدة البيانات (RLS)",
      "سجل تدقيق غير قابل للتعديل لكافة العمليات",
    ],
  },
];

function Capabilities() {
  return (
    <section id="capabilities" className="section-y border-b border-border bg-surface">
      <div className="container-page">
        <div className="measure mx-auto text-center">
          <h2 className="text-h2">كل ما يحتاجه المحامي السعودي في منصة واحدة</h2>
          <p className="mt-3 text-body text-muted-foreground">
            ستة أنظمة مترابطة تغطي دورة العمل القانونية كاملة من فتح ملف القضية حتى التحصيل وإبلاغ الموكل.
          </p>
        </div>
        <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {CAPABILITIES.map((c) => (
            <article
              key={c.title}
              className="rounded-[var(--radius-l)] border border-border bg-background p-6 md:p-7 shadow-2xs transition hover:border-primary/40 hover:shadow-xs"
            >
              <h3 className="text-h3 text-foreground font-bold">{c.title}</h3>
              <p className="mt-3 text-body-sm text-muted-foreground leading-relaxed">{c.body}</p>
              <ul className="mt-5 space-y-2.5 border-t border-border pt-4">
                {c.points.map((p) => (
                  <li
                    key={p}
                    className="flex items-center gap-2.5 text-[13.5px] text-muted-foreground font-medium"
                  >
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
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

function CTA({ registerHref, trackHref }: { registerHref: string; trackHref: string }) {
  return (
    <section className="section-y">
      <div className="container-page">
        <div className="reveal rounded-[var(--radius-l)] bg-primary px-6 py-12 text-primary-foreground md:px-12 md:py-16">
          <h2 className="text-h2 measure">جاهز لتنظيم عمل مكتبك؟</h2>
          <p className="measure mt-3 text-body text-primary-foreground/80">
            أنشئ مكتبك خلال دقيقة، وابدأ بتسجيل أول قضية ومتابعة مهلها وجلساتها.
          </p>
          <div className="mt-8 flex flex-col gap-2.5 sm:flex-row sm:items-center">
            <a
              href={registerHref}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[var(--radius-m)] bg-surface px-6 text-[15px] font-semibold text-primary transition hover:bg-surface-muted"
            >
              إنشاء حساب المكتب <ArrowLeft className="h-4 w-4" aria-hidden />
            </a>
            <a
              href={trackHref}
              className="inline-flex min-h-12 items-center justify-center gap-1.5 rounded-[var(--radius-m)] border border-primary-foreground/35 px-6 text-[15px] font-semibold text-primary-foreground transition hover:bg-primary-foreground/10"
            >
              <SearchCheck className="h-4 w-4" aria-hidden />
              متابعة القضية
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

/** لمحة الأسعار — أرقام حقيقية من كتالوج المنصة، والتفاصيل الكاملة في صفحة الأسعار. */
function PricingTeaser() {
  const { data } = useQuery(publicPlansQueryOptions());
  const plans = data ?? [];
  if (plans.length === 0) return null;
  const highlighted = highlightedPlanCode(plans);

  return (
    <section id="pricing" className="section-y border-b border-border bg-surface">
      <div className="container-page">
        <div className="reveal flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-h2">باقات واضحة بأسعار معلنة</h2>
            <p className="measure mt-3 text-body text-muted-foreground">
              اختر الباقة حسب عدد المستخدمين وحجم القضايا. لا تحتاج بطاقة دفع لإنشاء الحساب.
            </p>
          </div>
          <a
            href="/pricing"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-[var(--radius-m)] border border-border-strong px-5 text-[14px] font-semibold transition hover:bg-surface-muted"
          >
            كل تفاصيل الباقات <ArrowLeft className="h-4 w-4" aria-hidden />
          </a>
        </div>

        <ul className="mt-8 grid gap-5 lg:grid-cols-3">
          {plans.map((plan) => {
            const users = planLimitRows(plan).find((r) => r.key === "users")?.value;
            const cases = planLimitRows(plan).find((r) => r.key === "cases")?.value;
            const saving = yearlySavingPercent(plan);
            return (
              <li
                key={plan.code}
                className={cn(
                  "reveal rounded-[var(--radius-l)] border bg-background p-6",
                  plan.code === highlighted ? "border-primary" : "border-border",
                )}
              >
                <p className="text-h4">{plan.name_ar}</p>
                <p className="mt-4 flex flex-wrap items-baseline gap-1.5">
                  <span
                    className="inline-flex items-center gap-1.5 text-[26px] font-bold leading-none tabular-nums"
                    dir="ltr"
                  >
                    {fmtNumber(Math.round(plan.price_monthly))}
                    <Riyal className="text-muted-foreground" />
                    <span className="sr-only">ريال سعودي</span>
                  </span>
                  <span className="text-[12.5px] text-text-muted">/ شهرياً</span>
                </p>
                <p className="mt-3 text-body-sm text-muted-foreground">
                  {users} مستخدم · {cases} قضية
                </p>
                {saving !== null && (
                  <p className="mt-1.5 text-[12.5px] text-primary">
                    توفير {saving}% عند الدفع السنوي
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------------- page */

/**
 * قسم «الأكثر إنجازاً» — يعتمد كلياً على العقد الخادمي العام.
 * الميزة معطّلة أو القائمة فارغة أو الطلب فاشل = لا يُعرض القسم إطلاقاً.
 */
function TopOfficesSection() {
  const { data } = useQuery(publicRankingQueryOptions());
  if (!data) return null;
  return <TopOffices ranking={data} />;
}

function MehlaLanding() {
  useReveal();
  const [bayanOpen, setBayanOpen] = useState(false);
  const loginHref = useSurfaceHref("/login");
  const registerHref = useSurfaceHref("/register");
  const trackHref = useSurfaceHref("/track");
  const links = { loginHref, registerHref, trackHref };

  return (
    <div dir="rtl" className="min-h-dvh bg-background text-foreground">
      <Header {...links} />
      <main id="product">
        <Hero {...links} />
        <BayanHeroShowcase onOpenChat={() => setBayanOpen(true)} />
        <Capabilities />
        <HowItWorks />
        <Workflow />
        <Security />
        <TopOfficesSection />
        <PricingTeaser />
        <CTA registerHref={registerHref} trackHref={trackHref} />
      </main>
      <SiteFooter />
      <PublicBayanCopilot initialOpen={bayanOpen} onCloseExternal={() => setBayanOpen(false)} />
    </div>
  );
}
