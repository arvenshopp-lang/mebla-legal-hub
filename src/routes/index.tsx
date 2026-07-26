import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  BellRing,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Clock,
  FileText,
  FolderKanban,
  Gavel,
  History,
  LayoutDashboard,
  Lock,
  Menu,
  Scale,
  Shield,
  ShieldCheck,
  Sparkles,
  Timer,
  Users,
  X,
} from "lucide-react";

const TITLE = "مِهلة | منصة متابعة القضايا والجلسات والمهل للمحامين";
const DESCRIPTION =
  "منصة سعودية تساعد المحامين ومكاتب المحاماة على تنظيم القضايا ومتابعة الجلسات والمهل والمهام والمستندات من مكان واحد.";

export const Route = createFileRoute("/")({
  component: MehlaLanding,
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "/" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESCRIPTION },
    ],
    links: [{ rel: "canonical", href: "/" }],
  }),
});

/* ---------- Reveal on scroll ---------- */
function useReveal() {
  useEffect(() => {
    const els = document.querySelectorAll<HTMLElement>(".mehla-reveal");
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e, i) => {
          if (e.isIntersecting) {
            setTimeout(() => e.target.classList.add("is-visible"), i * 60);
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}

/* ---------- Primitives ---------- */
function BtnPrimary({
  children,
  as = "link",
  to = "/register",
  ariaLabel,
}: {
  children: React.ReactNode;
  as?: "link" | "button";
  to?: string;
  ariaLabel?: string;
}) {
  const cls =
    "inline-flex items-center justify-center gap-2 rounded-xl bg-[color:var(--color-mehla-primary)] px-5 py-3 text-sm font-semibold text-white shadow-[0_1px_0_rgba(255,255,255,0.15)_inset,0_10px_24px_-16px_rgba(18,60,50,0.65)] transition-all duration-300 hover:bg-[color:var(--color-mehla-primary-dark)] hover:-translate-y-[1px] active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-mehla-primary-soft)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-mehla-bg)] disabled:opacity-50";
  if (as === "button") return <button className={cls} aria-label={ariaLabel}>{children}</button>;
  return (
    <a href={to} className={cls} aria-label={ariaLabel}>
      {children}
    </a>
  );
}
function BtnGhost({ children, to = "/login" }: { children: React.ReactNode; to?: string }) {
  return (
    <a
      href={to}
      className="inline-flex items-center justify-center gap-2 rounded-xl border border-[color:var(--color-mehla-border)] bg-transparent px-5 py-3 text-sm font-semibold text-[color:var(--color-mehla-ink)] transition-all duration-300 hover:border-[color:var(--color-mehla-primary)] hover:text-[color:var(--color-mehla-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-mehla-primary-soft)]"
    >
      {children}
    </a>
  );
}
function BtnText({ children, to = "#how" }: { children: React.ReactNode; to?: string }) {
  return (
    <a
      href={to}
      className="group inline-flex items-center gap-1.5 text-sm font-semibold text-[color:var(--color-mehla-primary)] transition-colors hover:text-[color:var(--color-mehla-primary-dark)]"
    >
      {children}
      <ArrowLeft className="h-4 w-4 transition-transform duration-300 group-hover:-translate-x-1" />
    </a>
  );
}

/* ---------- Navbar ---------- */
function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 12);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  const links = [
    { href: "#how", label: "كيف تعمل" },
    { href: "#features", label: "المميزات" },
    { href: "#audience", label: "لمن المنصة" },
    { href: "#pricing", label: "الأسعار" },
    { href: "#faq", label: "الأسئلة الشائعة" },
  ];

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
        scrolled
          ? "border-b border-[color:var(--color-mehla-border)] bg-[color:var(--color-mehla-bg)]/85 backdrop-blur-md"
          : "bg-transparent"
      }`}
    >
      <div className="mx-auto flex max-w-[1240px] items-center justify-between gap-6 px-5 py-3.5 md:px-8">
        <a href="#top" className="flex items-center gap-2.5" aria-label="مِهلة">
          <span className="flex flex-col leading-none">
            <span className="text-lg font-bold tracking-tight text-[color:var(--color-mehla-ink)]">
              مِهلة
            </span>
            <span className="mt-0.5 text-[10px] font-medium tracking-[0.18em] text-[color:var(--color-mehla-muted)]">
              MEHLA
            </span>
          </span>
        </a>

        <nav className="hidden items-center gap-7 lg:flex" aria-label="التنقل الرئيسي">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-sm font-medium text-[color:var(--color-mehla-ink)]/80 transition-colors hover:text-[color:var(--color-mehla-primary)]"
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-2.5 lg:flex">
          <BtnGhost to="/login">تسجيل الدخول</BtnGhost>
          <BtnPrimary to="/register">ابدأ الآن</BtnPrimary>
        </div>

        <button
          onClick={() => setOpen((v) => !v)}
          className="grid h-10 w-10 place-items-center rounded-lg border border-[color:var(--color-mehla-border)] bg-white/60 text-[color:var(--color-mehla-ink)] lg:hidden"
          aria-label={open ? "إغلاق القائمة" : "فتح القائمة"}
          aria-expanded={open}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <div className="lg:hidden">
          <div className="mx-4 mb-4 rounded-2xl border border-[color:var(--color-mehla-border)] bg-white p-4 shadow-lg">
            <nav className="flex flex-col divide-y divide-[color:var(--color-mehla-border)]">
              {links.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="py-3 text-sm font-medium text-[color:var(--color-mehla-ink)]"
                >
                  {l.label}
                </a>
              ))}
            </nav>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <BtnGhost to="/login">تسجيل الدخول</BtnGhost>
              <BtnPrimary to="/register">ابدأ الآن</BtnPrimary>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

/* ---------- Dashboard Mockup ---------- */
function DashboardMockup() {
  return (
    <div className="mehla-float relative">
      <div
        className="pointer-events-none absolute -inset-8 rounded-[32px] opacity-60 blur-2xl"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 40%, rgba(45,102,86,0.18), transparent 70%)",
        }}
        aria-hidden
      />
      <div className="relative overflow-hidden rounded-2xl border border-[color:var(--color-mehla-border)] bg-white shadow-[0_30px_60px_-30px_rgba(16,23,22,0.25)]">
        {/* window chrome */}
        <div className="flex items-center justify-between border-b border-[color:var(--color-mehla-border)] bg-[color:var(--color-mehla-bg)]/70 px-4 py-2.5">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#e5e7e5]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#e5e7e5]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#e5e7e5]" />
          </div>
          <div className="rounded-md bg-white px-3 py-1 text-[10px] text-[color:var(--color-mehla-muted)]">
            app.mehla.sa / لوحة اليوم
          </div>
          <span className="w-10" />
        </div>

        <div className="grid grid-cols-[1fr] gap-4 p-4 sm:grid-cols-[130px_1fr] sm:p-5">
          {/* sidebar */}
          <aside className="hidden flex-col gap-1 rounded-xl bg-[color:var(--color-mehla-bg)]/60 p-2.5 sm:flex">
            {[
              { i: LayoutDashboard, l: "لوحة اليوم", active: true },
              { i: FolderKanban, l: "القضايا" },
              { i: CalendarClock, l: "التقويم" },
              { i: ClipboardList, l: "المهام" },
              { i: FileText, l: "المستندات" },
            ].map(({ i: Icon, l, active }) => (
              <div
                key={l}
                className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-[11px] font-medium ${
                  active
                    ? "bg-white text-[color:var(--color-mehla-primary)] shadow-sm"
                    : "text-[color:var(--color-mehla-muted)]"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{l}</span>
              </div>
            ))}
          </aside>

          {/* main */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[11px] text-[color:var(--color-mehla-muted)]">صباح الخير</div>
                <div className="text-sm font-bold text-[color:var(--color-mehla-ink)]">
                  لديك 4 عناصر تحتاج إجراء اليوم
                </div>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-[color:var(--color-mehla-primary)]/8 px-2.5 py-1 text-[10px] font-semibold text-[color:var(--color-mehla-primary)]">
                <span className="mehla-pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-[color:var(--color-mehla-sand)]" />
                عاجل
              </span>
            </div>

            {/* metric row */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { n: "12", l: "قضية مفتوحة" },
                { n: "03", l: "جلسة هذا الأسبوع" },
                { n: "05", l: "مهلة قادمة" },
              ].map((s) => (
                <div
                  key={s.l}
                  className="rounded-xl border border-[color:var(--color-mehla-border)] bg-[color:var(--color-mehla-bg)]/50 p-2.5"
                >
                  <div className="text-lg font-bold text-[color:var(--color-mehla-primary)]">
                    {s.n}
                  </div>
                  <div className="text-[10px] text-[color:var(--color-mehla-muted)]">{s.l}</div>
                </div>
              ))}
            </div>

            {/* items */}
            <div className="flex flex-col gap-2">
              <MockItem
                tone="urgent"
                icon={Gavel}
                title="جلسة اليوم — قضية تجارية رقم 4582"
                meta="المحكمة التجارية بالرياض · 10:30 صباحًا"
              />
              <MockItem
                tone="warn"
                icon={Timer}
                title="مهلة اعتراض تنتهي خلال 3 أيام"
                meta="إعداد مذكرة الرد قبل 05 أغسطس"
                progress={72}
              />
              <MockItem
                tone="stale"
                icon={History}
                title="قضية عمالية رقم 2210 لم تُحدَّث منذ 32 يومًا"
                meta="آخر إجراء: تقديم لائحة"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
function MockItem({
  tone,
  icon: Icon,
  title,
  meta,
  progress,
}: {
  tone: "urgent" | "warn" | "stale";
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  meta: string;
  progress?: number;
}) {
  const toneMap = {
    urgent: "bg-[color:var(--color-mehla-primary)]/6 text-[color:var(--color-mehla-primary)]",
    warn: "bg-[color:var(--color-mehla-sand)]/12 text-[color:var(--color-mehla-sand)]",
    stale: "bg-[color:var(--color-mehla-muted)]/10 text-[color:var(--color-mehla-muted)]",
  } as const;
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-[color:var(--color-mehla-border)] bg-white p-2.5 transition-transform duration-300 hover:-translate-y-0.5">
      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${toneMap[tone]}`}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12px] font-semibold text-[color:var(--color-mehla-ink)]">
          {title}
        </div>
        <div className="mt-0.5 truncate text-[10.5px] text-[color:var(--color-mehla-muted)]">
          {meta}
        </div>
        {typeof progress === "number" && (
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[color:var(--color-mehla-border)]">
            <div
              className="h-full rounded-full bg-[color:var(--color-mehla-sand)]"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- Section wrapper ---------- */
function Section({
  id,
  eyebrow,
  title,
  desc,
  children,
  center,
}: {
  id?: string;
  eyebrow?: string;
  title?: string;
  desc?: string;
  children: React.ReactNode;
  center?: boolean;
}) {
  return (
    <section id={id} className="py-16 sm:py-24 lg:py-28">
      <div className="mx-auto max-w-[1240px] px-5 md:px-8">
        {(title || eyebrow) && (
          <div className={`mehla-reveal ${center ? "mx-auto max-w-3xl text-center" : "max-w-2xl"}`}>
            {eyebrow && (
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[color:var(--color-mehla-border)] bg-white px-3 py-1 text-[11px] font-semibold text-[color:var(--color-mehla-primary)]">
                <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--color-mehla-primary)]" />
                {eyebrow}
              </div>
            )}
            {title && (
              <h2 className="text-balance text-2xl font-bold leading-[1.35] tracking-tight text-[color:var(--color-mehla-ink)] sm:text-3xl md:text-[38px] md:leading-[1.25]">
                {title}
              </h2>
            )}
            {desc && (
              <p className="mt-4 text-base leading-[1.9] text-[color:var(--color-mehla-muted)] sm:text-[17px]">
                {desc}
              </p>
            )}
          </div>
        )}
        <div className={title || eyebrow ? "mt-10 sm:mt-14" : ""}>{children}</div>
      </div>
    </section>
  );
}

/* ---------- FAQ item ---------- */
function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mehla-reveal rounded-xl border border-[color:var(--color-mehla-border)] bg-white">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-right"
      >
        <span className="text-[15px] font-semibold text-[color:var(--color-mehla-ink)]">{q}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-[color:var(--color-mehla-primary)] transition-transform duration-300 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      <div
        className={`grid overflow-hidden px-5 transition-all duration-500 ${
          open ? "grid-rows-[1fr] pb-5" : "grid-rows-[0fr]"
        }`}
      >
        <div className="min-h-0 text-[14px] leading-[1.95] text-[color:var(--color-mehla-muted)]">
          {a}
        </div>
      </div>
    </div>
  );
}

/* ---------- Interactive Demo ---------- */
function InteractiveDemo() {
  const tabs = ["اليوم", "القضايا", "التقويم", "المهام"] as const;
  const [tab, setTab] = useState<(typeof tabs)[number]>("اليوم");
  return (
    <div className="overflow-hidden rounded-2xl border border-[color:var(--color-mehla-border)] bg-white shadow-[0_20px_50px_-30px_rgba(16,23,22,0.25)]">
      <div className="flex flex-wrap gap-1 border-b border-[color:var(--color-mehla-border)] bg-[color:var(--color-mehla-bg)]/60 p-2">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
              tab === t
                ? "bg-white text-[color:var(--color-mehla-primary)] shadow-sm"
                : "text-[color:var(--color-mehla-muted)] hover:text-[color:var(--color-mehla-ink)]"
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="p-5 sm:p-7">
        {tab === "اليوم" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <DemoRow icon={Gavel} title="جلسة بعد ساعتين" meta="محكمة الاستئناف · قضية 4582" tone="primary" />
            <DemoRow icon={Timer} title="مهلة اعتراض بعد 4 أيام" meta="إعداد مذكرة الرد" tone="warn" />
            <DemoRow icon={ClipboardList} title="مهمتان متأخرتان" meta="تحديث ملف العميل · تجهيز البينات" tone="warn" />
            <DemoRow icon={History} title="3 قضايا لم تُحدَّث منذ 30 يومًا" meta="بحاجة إلى مراجعة" tone="muted" />
          </div>
        )}
        {tab === "القضايا" && (
          <div className="space-y-3">
            {[
              { n: "4582", t: "قضية تجارية", s: "جلسة اليوم", tone: "primary" as const },
              { n: "2210", t: "قضية عمالية", s: "بحاجة تحديث", tone: "muted" as const },
              { n: "1174", t: "قضية عقارية", s: "مهلة خلال 4 أيام", tone: "warn" as const },
            ].map((c) => (
              <DemoRow
                key={c.n}
                icon={FolderKanban}
                title={`${c.t} — رقم ${c.n}`}
                meta={c.s}
                tone={c.tone}
              />
            ))}
          </div>
        )}
        {tab === "التقويم" && (
          <div className="grid grid-cols-7 gap-1.5 text-center">
            {Array.from({ length: 28 }).map((_, i) => {
              const hot = [4, 9, 12, 18, 22].includes(i);
              const today = i === 9;
              return (
                <div
                  key={i}
                  className={`aspect-square rounded-lg border text-[11px] font-medium leading-[2.2] ${
                    today
                      ? "border-[color:var(--color-mehla-primary)] bg-[color:var(--color-mehla-primary)] text-white"
                      : hot
                        ? "border-[color:var(--color-mehla-sand)]/40 bg-[color:var(--color-mehla-sand)]/10 text-[color:var(--color-mehla-ink)]"
                        : "border-[color:var(--color-mehla-border)] bg-white text-[color:var(--color-mehla-muted)]"
                  }`}
                >
                  {i + 1}
                </div>
              );
            })}
          </div>
        )}
        {tab === "المهام" && (
          <div className="space-y-3">
            {[
              { t: "تحضير مذكرة الرد", who: "أ. عبدالله", done: false },
              { t: "مراجعة ملف العميل", who: "أ. نورة", done: true },
              { t: "تجهيز البينات للجلسة", who: "أ. سعد", done: false },
            ].map((k) => (
              <div
                key={k.t}
                className="flex items-center gap-3 rounded-xl border border-[color:var(--color-mehla-border)] bg-white p-3.5"
              >
                <span
                  className={`grid h-6 w-6 place-items-center rounded-md border ${
                    k.done
                      ? "border-[color:var(--color-mehla-primary)] bg-[color:var(--color-mehla-primary)] text-white"
                      : "border-[color:var(--color-mehla-border)] bg-white"
                  }`}
                >
                  {k.done && <CheckCircle2 className="h-4 w-4" />}
                </span>
                <div className="flex-1">
                  <div className={`text-sm font-semibold ${k.done ? "text-[color:var(--color-mehla-muted)] line-through" : "text-[color:var(--color-mehla-ink)]"}`}>
                    {k.t}
                  </div>
                  <div className="text-[11px] text-[color:var(--color-mehla-muted)]">{k.who}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
function DemoRow({
  icon: Icon,
  title,
  meta,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  meta: string;
  tone: "primary" | "warn" | "muted";
}) {
  const toneMap = {
    primary: "bg-[color:var(--color-mehla-primary)]/8 text-[color:var(--color-mehla-primary)]",
    warn: "bg-[color:var(--color-mehla-sand)]/12 text-[color:var(--color-mehla-sand)]",
    muted: "bg-[color:var(--color-mehla-muted)]/10 text-[color:var(--color-mehla-muted)]",
  } as const;
  return (
    <div className="flex items-start gap-3 rounded-xl border border-[color:var(--color-mehla-border)] bg-white p-3.5 transition-transform duration-300 hover:-translate-y-0.5">
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${toneMap[tone]}`}>
        <Icon className="h-4.5 w-4.5" />
      </span>
      <div className="min-w-0">
        <div className="text-sm font-semibold text-[color:var(--color-mehla-ink)]">{title}</div>
        <div className="mt-0.5 text-[12px] text-[color:var(--color-mehla-muted)]">{meta}</div>
      </div>
    </div>
  );
}

/* ---------- Page ---------- */
function MehlaLanding() {
  useReveal();

  const features = [
    { i: LayoutDashboard, t: "لوحة اليوم", d: "تعرض الجلسات والمهل والمهام العاجلة في مكان واحد." },
    { i: FolderKanban, t: "متابعة القضايا", d: "اعرف حالة كل قضية وآخر إجراء تم فيها." },
    { i: CalendarClock, t: "الجلسات والمهل", d: "تابع المواعيد النظامية قبل انتهائها بوقت كافٍ." },
    { i: ClipboardList, t: "إدارة المهام", d: "حدد المهمة والمسؤول عنها وموعد التنفيذ." },
    { i: FileText, t: "المستندات", d: "احفظ مستندات كل قضية في مكان منظم وواضح." },
    { i: History, t: "سجل الإجراءات", d: "خط زمني كامل لجميع تحديثات القضية." },
  ];

  return (
    <div id="top" className="min-h-screen bg-[color:var(--color-mehla-bg)] text-[color:var(--color-mehla-ink)]">
      <Navbar />

      {/* ================= HERO ================= */}
      <main>
        <section className="relative overflow-hidden pt-32 pb-16 sm:pt-36 sm:pb-24 lg:pt-40 lg:pb-28">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10"
            style={{
              backgroundImage:
                "radial-gradient(60% 40% at 80% 0%, rgba(45,102,86,0.10), transparent 60%), radial-gradient(50% 40% at 20% 10%, rgba(200,155,60,0.06), transparent 60%)",
            }}
          />
          <div className="mx-auto grid max-w-[1240px] gap-14 px-5 md:px-8 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-10">
            <div className="text-right">
              <div className="mehla-reveal inline-flex items-center gap-2 rounded-full border border-[color:var(--color-mehla-border)] bg-white px-3 py-1.5 text-[12px] font-medium text-[color:var(--color-mehla-primary)]">
                <Sparkles className="h-3.5 w-3.5" />
                مصممة للمحامين ومكاتب المحاماة في السعودية
              </div>
              <h1 className="mehla-reveal mt-5 text-balance text-[34px] font-bold leading-[1.25] tracking-tight text-[color:var(--color-mehla-ink)] sm:text-5xl md:text-[56px] md:leading-[1.15]">
                لا جلسة تفوتك،
                <br />
                ولا مهلة تنتهي دون تنبيه.
              </h1>
              <p className="mehla-reveal mt-5 max-w-xl text-[16px] leading-[2] text-[color:var(--color-mehla-muted)] sm:text-[18px]">
                مِهلة تجمع قضاياك وجلساتك ومهامك ومواعيدك القانونية في مكان واحد، حتى تعرف كل صباح ما الذي يحتاج إلى إجراء.
              </p>
              <div className="mehla-reveal mt-8 flex flex-wrap items-center gap-3">
                <BtnPrimary to="/register">ابدأ تجربتك</BtnPrimary>
                <BtnGhost to="#demo">شاهد كيف تعمل</BtnGhost>
              </div>
              <div className="mehla-reveal mt-6 flex items-center gap-2 text-[13px] text-[color:var(--color-mehla-muted)]">
                <ShieldCheck className="h-4 w-4 text-[color:var(--color-mehla-primary-soft)]" />
                منصة سعودية · واجهة عربية كاملة · جاهزة للفرق القانونية
              </div>
            </div>

            <div className="mehla-reveal">
              <DashboardMockup />
            </div>
          </div>
        </section>

        {/* ================= TRUST BAR ================= */}
        <section className="border-y border-[color:var(--color-mehla-border)] bg-white/60">
          <div className="mx-auto grid max-w-[1240px] grid-cols-2 gap-6 px-5 py-8 md:grid-cols-4 md:px-8">
            {[
              { i: LayoutDashboard, t: "وضوح في المتابعة" },
              { i: BellRing, t: "تنبيهات قبل المواعيد" },
              { i: Shield, t: "حماية وتنظيم البيانات" },
              { i: Users, t: "مناسب للمكاتب والفرق" },
            ].map(({ i: Icon, t }) => (
              <div key={t} className="mehla-reveal flex items-center gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[color:var(--color-mehla-primary)]/8 text-[color:var(--color-mehla-primary)]">
                  <Icon className="h-4.5 w-4.5" />
                </span>
                <span className="text-sm font-semibold text-[color:var(--color-mehla-ink)]">{t}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ================= PROBLEM ================= */}
        <Section
          eyebrow="المشكلة"
          title="المشكلة ليست في كثرة القضايا، بل في معرفة ما يجب إنجازه الآن."
          desc="قد يدير المحامي عدة قضايا وجلسات ومهل ومهام في وقت واحد، بين ملفات ومحادثات وجداول متفرقة. النتيجة: قرارات تُؤجَّل ومهل تقترب دون تنبيه."
        >
          <div className="grid gap-4 md:grid-cols-3">
            {[
              {
                i: History,
                t: "قضية لم يتم تحديثها",
                d: "ملف بلا حركة منذ أسابيع، لا تعرف ما آخر إجراء تم فيه.",
                tone: "muted" as const,
              },
              {
                i: Timer,
                t: "مهلة قاربت على الانتهاء",
                d: "موعد نظامي يقترب دون تنبيه واضح داخل فريق العمل.",
                tone: "warn" as const,
              },
              {
                i: Gavel,
                t: "جلسة قادمة دون تجهيز",
                d: "الجلسة بعد ساعات، والمذكرات والمستندات موزعة في أماكن متفرقة.",
                tone: "primary" as const,
              },
            ].map(({ i: Icon, t, d, tone }) => {
              const toneMap = {
                primary: "bg-[color:var(--color-mehla-primary)]/8 text-[color:var(--color-mehla-primary)]",
                warn: "bg-[color:var(--color-mehla-sand)]/12 text-[color:var(--color-mehla-sand)]",
                muted: "bg-[color:var(--color-mehla-muted)]/10 text-[color:var(--color-mehla-muted)]",
              };
              return (
                <div
                  key={t}
                  className="mehla-reveal rounded-2xl border border-[color:var(--color-mehla-border)] bg-white p-6 transition-all duration-300 hover:-translate-y-1 hover:border-[color:var(--color-mehla-primary)]/40"
                >
                  <span className={`grid h-10 w-10 place-items-center rounded-xl ${toneMap[tone]}`}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-4 text-lg font-bold text-[color:var(--color-mehla-ink)]">{t}</h3>
                  <p className="mt-2 text-[14.5px] leading-[1.9] text-[color:var(--color-mehla-muted)]">{d}</p>
                </div>
              );
            })}
          </div>
        </Section>

        {/* ================= SOLUTION ================= */}
        <Section
          id="solution"
          eyebrow="الحل"
          title="مِهلة ترتب لك الأولويات قبل أن تبدأ يومك."
          desc="بدلًا من البحث داخل الملفات والمحادثات والجداول، تخبرك مِهلة مباشرة بما يحتاج إلى إجراء الآن، وما يمكن تأجيله."
        >
          <div className="mehla-reveal overflow-hidden rounded-2xl border border-[color:var(--color-mehla-border)] bg-white p-4 sm:p-6">
            <div className="grid gap-3 md:grid-cols-5">
              {[
                { t: "عاجل اليوم", n: 4, tone: "primary" },
                { t: "خلال 3 أيام", n: 6, tone: "warn" },
                { t: "خلال أسبوع", n: 9, tone: "soft" },
                { t: "متأخر", n: 2, tone: "muted" },
                { t: "تحتاج متابعة", n: 5, tone: "soft" },
              ].map((c) => {
                const map: Record<string, string> = {
                  primary: "bg-[color:var(--color-mehla-primary)] text-white",
                  warn: "bg-[color:var(--color-mehla-sand)]/15 text-[color:var(--color-mehla-ink)] border border-[color:var(--color-mehla-sand)]/30",
                  soft: "bg-[color:var(--color-mehla-bg)] text-[color:var(--color-mehla-ink)] border border-[color:var(--color-mehla-border)]",
                  muted: "bg-[color:var(--color-mehla-muted)]/10 text-[color:var(--color-mehla-ink)] border border-[color:var(--color-mehla-border)]",
                };
                return (
                  <div key={c.t} className={`rounded-xl p-4 ${map[c.tone]}`}>
                    <div className="text-3xl font-bold">{String(c.n).padStart(2, "0")}</div>
                    <div className="mt-1 text-[13px] opacity-90">{c.t}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </Section>

        {/* ================= HOW IT WORKS ================= */}
        <Section
          id="how"
          eyebrow="كيف تعمل"
          title="كيف تعمل مِهلة"
          desc="أربع خطوات واضحة لتبدأ متابعة قضاياك ومواعيدك دون تعقيد."
        >
          <ol className="relative grid gap-6 md:grid-cols-4">
            <div
              aria-hidden
              className="absolute right-0 top-6 hidden h-px w-full bg-gradient-to-l from-transparent via-[color:var(--color-mehla-border)] to-transparent md:block"
            />
            {[
              { n: "01", t: "أضف القضية", d: "أدخل معلومات القضية والعميل والمحكمة والمحامي المسؤول." },
              { n: "02", t: "أضف الجلسات والمهل", d: "حدد مواعيد الجلسات والاعتراض والاستئناف والمهام." },
              { n: "03", t: "استقبل التنبيهات", d: "تصل التنبيهات قبل المواعيد حسب الفترة التي تحددها." },
              { n: "04", t: "تابع التنفيذ", d: "سجّل الإجراءات المنجزة واعرف آخر تحديث لكل قضية." },
            ].map((s) => (
              <li key={s.n} className="mehla-reveal relative">
                <div className="grid h-12 w-12 place-items-center rounded-xl bg-[color:var(--color-mehla-primary)] text-sm font-bold text-white">
                  {s.n}
                </div>
                <h3 className="mt-4 text-lg font-bold text-[color:var(--color-mehla-ink)]">{s.t}</h3>
                <p className="mt-1.5 text-[14.5px] leading-[1.9] text-[color:var(--color-mehla-muted)]">{s.d}</p>
              </li>
            ))}
          </ol>
        </Section>

        {/* ================= FEATURES ================= */}
        <Section
          id="features"
          eyebrow="المميزات"
          title="كل ما يحتاجه المحامي للمتابعة اليومية."
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map(({ i: Icon, t, d }) => (
              <div
                key={t}
                className="mehla-reveal group rounded-2xl border border-[color:var(--color-mehla-border)] bg-white p-6 transition-all duration-300 hover:-translate-y-1 hover:border-[color:var(--color-mehla-primary)]/50 hover:shadow-[0_20px_40px_-24px_rgba(18,60,50,0.25)]"
              >
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-[color:var(--color-mehla-primary)]/8 text-[color:var(--color-mehla-primary)] transition-colors group-hover:bg-[color:var(--color-mehla-primary)] group-hover:text-white">
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="mt-4 text-lg font-bold text-[color:var(--color-mehla-ink)]">{t}</h3>
                <p className="mt-2 text-[14.5px] leading-[1.9] text-[color:var(--color-mehla-muted)]">{d}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* ================= DEMO ================= */}
        <Section
          id="demo"
          eyebrow="عرض تفاعلي"
          title="ابدأ يومك وأنت تعرف بالضبط ما ينتظرك."
          desc="تصفّح لوحة اليوم والقضايا والتقويم والمهام بشكل تفاعلي — هذه بيانات توضيحية داخل الصفحة فقط."
        >
          <div className="mehla-reveal">
            <InteractiveDemo />
          </div>
        </Section>

        {/* ================= AUDIENCE ================= */}
        <Section
          id="audience"
          eyebrow="لمن المنصة"
          title="مصممة لطريقة عمل المحامين."
        >
          <div className="grid gap-4 md:grid-cols-3">
            {[
              { i: Scale, t: "المحامي المستقل", d: "لمتابعة جميع القضايا والمواعيد من مكان واحد." },
              { i: Users, t: "مكتب المحاماة", d: "لتوزيع القضايا والمهام على أعضاء الفريق." },
              { i: ShieldCheck, t: "الإدارة القانونية", d: "لمتابعة الملفات والإجراءات والمواعيد القانونية الداخلية." },
            ].map(({ i: Icon, t, d }) => (
              <div
                key={t}
                className="mehla-reveal rounded-2xl border border-[color:var(--color-mehla-border)] bg-white p-7 transition-all duration-300 hover:-translate-y-1 hover:border-[color:var(--color-mehla-primary)]/40"
              >
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-[color:var(--color-mehla-primary)]/8 text-[color:var(--color-mehla-primary)]">
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="mt-4 text-xl font-bold text-[color:var(--color-mehla-ink)]">{t}</h3>
                <p className="mt-2 text-[14.5px] leading-[1.95] text-[color:var(--color-mehla-muted)]">{d}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* ================= SECURITY ================= */}
        <Section
          eyebrow="الأمان والثقة"
          title="بيانات القضايا تحتاج حماية قبل أي شيء."
          desc="تُصمَّم مِهلة لتطبيق صلاحيات واضحة، وفصل بيانات كل مكتب، وحماية الوصول إلى القضايا والمستندات."
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {[
              { i: Users, t: "صلاحيات المستخدمين" },
              { i: FolderKanban, t: "فصل بيانات كل مكتب" },
              { i: History, t: "سجل العمليات" },
              { i: Lock, t: "حماية المستندات" },
              { i: Shield, t: "نسخ احتياطي" },
            ].map(({ i: Icon, t }) => (
              <div
                key={t}
                className="mehla-reveal flex items-center gap-3 rounded-xl border border-[color:var(--color-mehla-border)] bg-white p-4"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[color:var(--color-mehla-primary)]/8 text-[color:var(--color-mehla-primary)]">
                  <Icon className="h-4.5 w-4.5" />
                </span>
                <span className="text-[13.5px] font-semibold text-[color:var(--color-mehla-ink)]">{t}</span>
              </div>
            ))}
          </div>
        </Section>

        {/* ================= PRICING ================= */}
        <Section
          id="pricing"
          eyebrow="الأسعار"
          title="ابدأ حسب حجم عملك."
          desc="الأسعار تجريبية وقابلة للتحديث عند الإطلاق الرسمي."
          center
        >
          <div className="grid gap-5 md:grid-cols-3">
            {[
              {
                n: "باقة المحامي",
                p: 49,
                items: ["مستخدم واحد", "حتى 50 قضية", "تنبيهات أساسية", "إدارة الجلسات والمهام"],
                highlight: false,
              },
              {
                n: "باقة المكتب",
                p: 149,
                items: ["حتى 5 مستخدمين", "قضايا غير محدودة", "صلاحيات الفريق", "تقارير المتابعة"],
                highlight: true,
              },
              {
                n: "باقة الاحتراف",
                p: 299,
                items: ["حتى 15 مستخدمًا", "تقارير متقدمة", "أولوية الدعم", "خصائص متقدمة"],
                highlight: false,
              },
            ].map((tier) => (
              <div
                key={tier.n}
                className={`mehla-reveal relative flex flex-col rounded-2xl border p-7 transition-all duration-300 ${
                  tier.highlight
                    ? "border-[color:var(--color-mehla-primary)] bg-[color:var(--color-mehla-primary)] text-white shadow-[0_30px_60px_-30px_rgba(18,60,50,0.55)]"
                    : "border-[color:var(--color-mehla-border)] bg-white hover:-translate-y-1"
                }`}
              >
                {tier.highlight && (
                  <span className="absolute -top-3 right-6 rounded-full bg-[color:var(--color-mehla-sand)] px-3 py-1 text-[11px] font-bold text-[color:var(--color-mehla-ink)]">
                    الأكثر اختيارًا
                  </span>
                )}
                <h3 className={`text-lg font-bold ${tier.highlight ? "text-white" : "text-[color:var(--color-mehla-ink)]"}`}>
                  {tier.n}
                </h3>
                <div className="mt-4 flex items-baseline gap-1.5">
                  <span className={`text-5xl font-bold tracking-tight ${tier.highlight ? "text-white" : "text-[color:var(--color-mehla-ink)]"}`}>
                    {tier.p}
                  </span>
                  <span className={`text-sm ${tier.highlight ? "text-white/80" : "text-[color:var(--color-mehla-muted)]"}`}>
                    ريال / شهريًا
                  </span>
                </div>
                <ul className={`mt-6 flex-1 space-y-3 text-[14px] ${tier.highlight ? "text-white/90" : "text-[color:var(--color-mehla-muted)]"}`}>
                  {tier.items.map((it) => (
                    <li key={it} className="flex items-start gap-2">
                      <CheckCircle2
                        className={`mt-0.5 h-4 w-4 shrink-0 ${
                          tier.highlight ? "text-[color:var(--color-mehla-sand)]" : "text-[color:var(--color-mehla-primary)]"
                        }`}
                      />
                      <span>{it}</span>
                    </li>
                  ))}
                </ul>
                <a
                  href="/pricing"
                  className={`mt-8 inline-flex items-center justify-center rounded-xl px-5 py-3 text-sm font-semibold transition-all ${
                    tier.highlight
                      ? "bg-white text-[color:var(--color-mehla-primary)] hover:bg-[color:var(--color-mehla-bg)]"
                      : "bg-[color:var(--color-mehla-primary)] text-white hover:bg-[color:var(--color-mehla-primary-dark)]"
                  }`}
                >
                  اختر الباقة
                </a>
              </div>
            ))}
          </div>
          <p className="mehla-reveal mt-6 text-center text-[13px] text-[color:var(--color-mehla-muted)]">
            الأسعار تجريبية وقابلة للتحديث عند الإطلاق.
          </p>
        </Section>

        {/* ================= FAQ ================= */}
        <Section
          id="faq"
          eyebrow="الأسئلة الشائعة"
          title="إجابات مختصرة على الأسئلة المتكررة."
        >
          <div className="mx-auto grid max-w-3xl gap-3">
            {[
              {
                q: "هل مِهلة بديل عن ناجز؟",
                a: "لا. مِهلة منصة تنظيم ومتابعة داخلية للمحامي، ولا تستبدل الخدمات الحكومية الرسمية.",
              },
              {
                q: "هل يمكن إضافة أكثر من محامٍ؟",
                a: "نعم. حسب الباقة يمكن إضافة أعضاء المكتب وتحديد صلاحيات كل مستخدم.",
              },
              {
                q: "هل يمكن رفع مستندات القضية؟",
                a: "نعم. يمكن تنظيم مستندات كل قضية داخل ملفها الخاص.",
              },
              {
                q: "كيف تصل التنبيهات؟",
                a: "في النسخة الأولى تكون داخل المنصة والبريد الإلكتروني، ويمكن إضافة قنوات أخرى لاحقًا.",
              },
              {
                q: "هل تقدم المنصة استشارات قانونية؟",
                a: "لا. مِهلة أداة تنظيم وتشغيل، ولا تقدم رأيًا أو استشارة قانونية.",
              },
              {
                q: "هل تعمل المنصة على الجوال؟",
                a: "نعم. الواجهة متجاوبة بالكامل مع الجوال والتابلت والكمبيوتر.",
              },
            ].map((f) => (
              <FaqItem key={f.q} q={f.q} a={f.a} />
            ))}
          </div>
        </Section>

        {/* ================= FINAL CTA ================= */}
        <section className="px-5 pb-16 md:px-8 md:pb-24">
          <div className="relative mx-auto max-w-[1240px] overflow-hidden rounded-3xl bg-[color:var(--color-mehla-primary)] px-6 py-14 text-center sm:px-12 sm:py-20">
            <div aria-hidden className="mehla-pattern absolute inset-0 opacity-70" />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                backgroundImage:
                  "radial-gradient(60% 60% at 50% 0%, rgba(200,155,60,0.10), transparent 60%)",
              }}
            />
            <div className="relative">
              <h2 className="mx-auto max-w-3xl text-balance text-3xl font-bold leading-[1.3] tracking-tight text-white sm:text-4xl md:text-[44px] md:leading-[1.2]">
                ابدأ يومك وأنت تعرف بالضبط ما الذي يحتاج إلى إجراء.
              </h2>
              <p className="mx-auto mt-4 max-w-2xl text-[15px] leading-[2] text-white/80 sm:text-[17px]">
                رتّب قضاياك وجلساتك ومهامك ومواعيدك القانونية في منصة واحدة واضحة.
              </p>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <a
                  href="/register"
                  className="inline-flex items-center justify-center rounded-xl bg-white px-6 py-3 text-sm font-semibold text-[color:var(--color-mehla-primary)] transition-all hover:-translate-y-0.5 hover:bg-[color:var(--color-mehla-bg)]"
                >
                  ابدأ الآن
                </a>
                <a
                  href="/login"
                  className="inline-flex items-center justify-center rounded-xl border border-white/30 px-6 py-3 text-sm font-semibold text-white transition-all hover:border-white/60"
                >
                  تسجيل الدخول
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* ================= FOOTER ================= */}
      <footer className="border-t border-[color:var(--color-mehla-border)] bg-white/60">
        <div className="mx-auto max-w-[1240px] px-5 py-14 md:px-8">
          <div className="grid gap-10 md:grid-cols-[1.3fr_1fr_1fr_1fr]">
            <div>
              <div className="flex items-center gap-2.5">
                <span className="flex flex-col leading-none">
                  <span className="text-lg font-bold text-[color:var(--color-mehla-ink)]">مِهلة</span>
                  <span className="mt-0.5 text-[10px] font-medium tracking-[0.18em] text-[color:var(--color-mehla-muted)]">
                    MEHLA
                  </span>
                </span>
              </div>
              <p className="mt-4 max-w-sm text-[14px] leading-[1.95] text-[color:var(--color-mehla-muted)]">
                منصة سعودية لتنظيم ومتابعة القضايا والجلسات والمهل والمهام القانونية.
              </p>
            </div>

            {[
              {
                h: "المنصة",
                links: [
                  { l: "الرئيسية", href: "#top" },
                  { l: "كيف تعمل", href: "#how" },
                  { l: "المميزات", href: "#features" },
                  { l: "الأسعار", href: "#pricing" },
                ],
              },
              {
                h: "المساعدة",
                links: [
                  { l: "الأسئلة الشائعة", href: "#faq" },
                  { l: "تواصل معنا", href: "/contact" },
                ],
              },
              {
                h: "قانوني",
                links: [
                  { l: "سياسة الخصوصية", href: "/privacy" },
                  { l: "الشروط والأحكام", href: "/terms" },
                ],
              },
            ].map((col) => (
              <div key={col.h}>
                <h4 className="text-sm font-bold text-[color:var(--color-mehla-ink)]">{col.h}</h4>
                <ul className="mt-4 space-y-2.5">
                  {col.links.map((l) => (
                    <li key={l.l}>
                      <a
                        href={l.href}
                        className="text-[13.5px] text-[color:var(--color-mehla-muted)] transition-colors hover:text-[color:var(--color-mehla-primary)]"
                      >
                        {l.l}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t border-[color:var(--color-mehla-border)] pt-6 text-[12.5px] text-[color:var(--color-mehla-muted)]">
            <span>© 2026 مِهلة — جميع الحقوق محفوظة.</span>
            <span className="tracking-[0.2em]">MEHLA</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

// Silence unused import warning when Link isn't used directly
void Link;
