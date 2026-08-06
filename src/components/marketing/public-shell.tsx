import { Link } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSurfaceHref } from "@/hooks/use-surface-guard";
import { SiteFooter } from "@/components/marketing/site-footer";

const NAV = [
  { to: "/about", label: "من نحن" },
  { to: "/how-it-works", label: "كيف تستخدم مِهلة" },
  { to: "/faq", label: "الأسئلة الشائعة" },
  { to: "/security", label: "الأمان" },
  { to: "/contact", label: "تواصل معنا" },
] as const;

function PublicHeader() {
  const [open, setOpen] = useState(false);
  const loginHref = useSurfaceHref("/login");
  const registerHref = useSurfaceHref("/register");

  return (
    <header className="sticky top-0 z-[var(--z-sticky)] border-b border-border bg-surface/90 backdrop-blur">
      <div className="container-page flex h-16 items-center justify-between gap-4">
        <Link to="/" className="text-[17px] font-bold tracking-tight">
          مِهلة <span className="text-text-muted">·</span>{" "}
          <span className="text-[13px] tracking-[0.18em]">MEHLA</span>
        </Link>

        <nav aria-label="روابط الموقع" className="hidden items-center gap-6 lg:flex">
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className="text-[13.5px] text-muted-foreground transition hover:text-foreground"
              activeProps={{ className: "!text-foreground font-semibold" }}
            >
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 lg:flex">
          <a
            href={loginHref}
            className="inline-flex h-10 items-center rounded-[var(--radius-m)] px-4 text-[13.5px] font-medium transition hover:bg-surface-muted"
          >
            تسجيل الدخول
          </a>
          <a
            href={registerHref}
            className="inline-flex h-10 items-center rounded-[var(--radius-m)] bg-primary px-4 text-[13.5px] font-semibold text-primary-foreground transition hover:bg-primary-hover"
          >
            إنشاء حساب
          </a>
        </div>

        <button
          type="button"
          className="-m-2 rounded-[var(--radius-s)] p-2 lg:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? "إغلاق القائمة" : "فتح القائمة"}
        >
          {open ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
        </button>
      </div>

      {open && (
        <div className="border-t border-border bg-surface lg:hidden">
          <nav className="container-page flex flex-col py-3" aria-label="روابط الموقع للجوال">
            {NAV.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                onClick={() => setOpen(false)}
                className="flex min-h-11 items-center border-b border-border text-[14px] text-muted-foreground last:border-0"
              >
                {n.label}
              </Link>
            ))}
            <div className="mt-3 grid gap-2">
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
                إنشاء حساب
              </a>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}

/** هيكل موحّد لصفحات مركز الثقة والمعلومات العامة. */
export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div dir="rtl" className="flex min-h-dvh flex-col bg-background text-foreground">
      <PublicHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}

export function PageHeading({
  eyebrow,
  title,
  intro,
  updatedAt,
}: {
  eyebrow?: string;
  title: string;
  intro?: string;
  updatedAt?: string | null;
}) {
  return (
    <div className="border-b border-border bg-surface">
      <div className="container-page py-10 md:py-14">
        {eyebrow && (
          <p className="text-[12.5px] font-semibold tracking-wide text-muted-foreground">
            {eyebrow}
          </p>
        )}
        <h1 className="text-h1 mt-2 max-w-3xl">{title}</h1>
        {intro && <p className="measure mt-4 text-body-lg text-muted-foreground">{intro}</p>}
        {updatedAt && <p className="mt-4 text-caption">آخر تحديث: {updatedAt}</p>}
      </div>
    </div>
  );
}

/** فهرس تنقل داخلي للصفحات الطويلة. */
export function PageToc({ items }: { items: Array<{ id: string; label: string }> }) {
  return (
    <nav aria-label="فهرس الصفحة" className="lg:sticky lg:top-24">
      <p className="text-[12.5px] font-bold text-muted-foreground">محتويات الصفحة</p>
      <ol className="mt-3 space-y-1">
        {items.map((item, index) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              className="flex min-h-9 items-start gap-2 text-[13px] text-muted-foreground transition hover:text-foreground"
            >
              <span className="mt-[3px] shrink-0 text-[11px] tabular-nums text-text-muted">
                {String(index + 1).padStart(2, "0")}
              </span>
              {item.label}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

export type ContentSection = {
  id: string;
  heading: string;
  paragraphs?: string[];
  items?: string[];
  note?: string;
};

export function ContentSections({ sections }: { sections: ContentSection[] }) {
  return (
    <div className="space-y-10">
      {sections.map((section) => (
        <section key={section.id} id={section.id} className="scroll-mt-24">
          <h2 className="text-h4">{section.heading}</h2>
          {section.paragraphs?.map((p) => (
            <p key={p} className="mt-3 text-body-sm leading-7 text-muted-foreground">
              {p}
            </p>
          ))}
          {section.items && (
            <ul className="mt-3 space-y-2">
              {section.items.map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-2.5 text-body-sm leading-7 text-muted-foreground"
                >
                  <span
                    className="mt-3 h-1 w-3 shrink-0 rounded-full bg-border-strong"
                    aria-hidden
                  />
                  {item}
                </li>
              ))}
            </ul>
          )}
          {section.note && (
            <p className="mt-4 rounded-[var(--radius-m)] bg-surface-muted p-4 text-body-sm leading-7 text-muted-foreground">
              {section.note}
            </p>
          )}
        </section>
      ))}
    </div>
  );
}

const OFFICIAL_LINKS = [
  {
    label: "نظام حماية البيانات الشخصية السعودي",
    href: "https://dgp.sdaia.gov.sa/wps/portal/pdp/knowledgecenter/details/PDPL",
  },
  {
    label: "اللائحة التنفيذية لنظام حماية البيانات الشخصية",
    href: "https://dgp.sdaia.gov.sa/wps/portal/pdp/knowledgecenter/details/PDPL2",
  },
  {
    label: "نظام التجارة الإلكترونية",
    href: "https://laws.boe.gov.sa/BoeLaws/Laws/LawDetails/360de590-0286-4fa5-a243-aa9100c31979/1",
  },
] as const;

/** مراجع نظامية رسمية — تُدرج في أسفل الصفحات القانونية فقط. */
export function OfficialReferences() {
  return (
    <section className="mt-12 rounded-[var(--radius-m)] border border-border bg-surface p-5">
      <h2 className="text-[13px] font-bold">مراجع نظامية رسمية</h2>
      <p className="mt-2 text-body-sm text-muted-foreground">
        تخضع هذه الصفحة للأنظمة واللوائح المعمول بها في المملكة العربية السعودية.
      </p>
      <ul className="mt-3 space-y-2">
        {OFFICIAL_LINKS.map((l) => (
          <li key={l.href}>
            <a
              href={l.href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-body-sm text-muted-foreground underline-offset-4 transition hover:text-foreground hover:underline"
            >
              {l.label}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** إطار صفحة نظامية: عنوان + فهرس + أقسام + مراجع رسمية. */
export function LegalLayout({
  title,
  intro,
  updatedAt,
  sections,
  footer,
}: {
  title: string;
  intro: string;
  updatedAt: string | null;
  sections: ContentSection[];
  footer?: ReactNode;
}) {
  return (
    <PublicShell>
      <PageHeading eyebrow="مركز الثقة" title={title} intro={intro} updatedAt={updatedAt} />
      <div className="container-page grid gap-10 py-10 md:py-14 lg:grid-cols-[minmax(0,240px)_1fr]">
        <PageToc items={sections.map((s) => ({ id: s.id, label: s.heading }))} />
        <div className={cn("min-w-0")}>
          <ContentSections sections={sections} />
          {footer}
          <OfficialReferences />
        </div>
      </div>
    </PublicShell>
  );
}