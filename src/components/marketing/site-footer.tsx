import { Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ArrowLeft, ChevronDown, MapPin, MessageCircle, Phone, SearchCheck } from "lucide-react";
import { useSurfaceHref } from "@/hooks/use-surface-guard";
import { publicSiteQueryOptions } from "@/lib/public-site.query";
import { activeSocialLinks } from "@/lib/public-site.shared";
import { PUBLIC_DOCS_LINK_ENABLED } from "@/config/public-marketing";
import { MehlaLogo } from "@/components/brand/mehla-logo";

type FooterLink = { label: string; to?: string; href?: string; external?: boolean };
type FooterGroup = { id: string; title: string; links: FooterLink[] };

const linkCls =
  "inline-flex min-h-11 w-full items-center rounded-[var(--radius-s)] px-1 text-[13.5px] text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface lg:min-h-9 lg:w-auto";

function FooterLinkItem({ link }: { link: FooterLink }) {
  if (link.to) {
    return (
      <Link to={link.to} className={linkCls}>
        {link.label}
      </Link>
    );
  }
  return (
    <a
      href={link.href}
      className={linkCls}
      {...(link.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      {link.label}
    </a>
  );
}

/** شريط دعوة موحّد فوق التذييل — تسجيل الدخول يبقى في الرأس فقط. */
function PreFooterCta({ registerHref, trackHref }: { registerHref: string; trackHref: string }) {
  return (
    <section aria-labelledby="prefooter-cta" className="border-t border-border bg-background">
      <div className="container-page py-10 md:py-12">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-5 text-center md:flex-row md:justify-between md:text-start">
          <h2 id="prefooter-cta" className="text-h3">
            جاهز لتنظيم عمل مكتبك؟
          </h2>
          <div className="flex w-full flex-col gap-2.5 sm:w-auto sm:flex-row">
            <a
              href={registerHref}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[var(--radius-m)] bg-primary px-6 text-[15px] font-semibold text-primary-foreground transition hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              إنشاء حساب <ArrowLeft className="h-4 w-4" aria-hidden />
            </a>
            <a
              href={trackHref}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[var(--radius-m)] border border-border-strong px-6 text-[15px] font-semibold transition hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <SearchCheck className="h-4 w-4 text-primary" aria-hidden />
              متابعة القضية
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * فوتر موحّد لكل الصفحات العامة.
 * الروابط تأتي من مصدر واحد داخل هذا الملف، وتُعرض بالترتيب نفسه على الجوال
 * (Accordion مغلق افتراضياً) وسطح المكتب (أعمدة) — بلا تكرار في الصفحات.
 */
export function SiteFooter({ showCta = true }: { showCta?: boolean } = {}) {
  const { data: info } = useSuspenseQuery(publicSiteQueryOptions());
  const trackHref = useSurfaceHref("/track");
  const registerHref = useSurfaceHref("/register");
  const socials = activeSocialLinks(info);

  const groups: FooterGroup[] = [
    {
      id: "product",
      title: "المنتج",
      links: [
        { label: "من نحن", to: "/about" },
        { label: "كيف تستخدم مِهلة", to: "/how-it-works" },
        { label: "الباقات والأسعار", to: "/pricing" },
      ],
    },
    {
      id: "customers",
      title: "العملاء والدعم",
      links: [
        { label: "متابعة القضية", href: trackHref },
        { label: "الأسئلة الشائعة", to: "/faq" },
        { label: "تواصل معنا", to: "/contact" },
        ...(PUBLIC_DOCS_LINK_ENABLED ? [{ label: "مركز المساعدة", to: "/docs" }] : []),
        ...(info.support_center_url
          ? [{ label: "مركز الدعم", href: info.support_center_url, external: true }]
          : []),
      ],
    },
    {
      id: "trust",
      title: "الثقة والقانونية",
      links: [
        { label: "الأمان وحماية البيانات", to: "/security" },
        { label: "سياسة الخصوصية", to: "/privacy" },
        { label: "الشروط والأحكام", to: "/terms" },
      ],
    },
  ];

  return (
    <>
      {showCta && <PreFooterCta registerHref={registerHref} trackHref={trackHref} />}
      <footer className="border-t border-border bg-surface">
        <div className="container-page py-10 md:py-14">
          <div className="mx-auto max-w-5xl">
            <div className="grid gap-8 lg:grid-cols-[1.4fr_2.4fr] lg:gap-12">
              {/* كتلة الهوية */}
              <div className="text-start">
                <MehlaLogo size="md" className="text-primary" />
                <p className="mt-3 max-w-xs text-body-sm leading-7 text-muted-foreground">
                  منصة تقنية لإدارة أعمال مكاتب المحاماة. مِهلة ليست مكتب محاماة ولا تقدّم استشارات
                  قانونية.
                </p>
                {socials.length > 0 && (
                  <ul className="mt-4 flex flex-wrap gap-2">
                    {socials.map((s) => (
                      <li key={s.label}>
                        <a
                          href={s.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`مِهلة على ${s.label}`}
                          className="inline-flex min-h-11 items-center rounded-[var(--radius-s)] border border-border px-3 text-[12.5px] text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                        >
                          {s.label}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
                {(info.phone || info.whatsapp || info.address) && (
                  <address className="mt-4 not-italic">
                    <ul className="space-y-1">
                      {info.phone && (
                        <li>
                          <a href={`tel:${info.phone}`} dir="ltr" className={linkCls}>
                            <Phone className="me-1.5 h-3.5 w-3.5" aria-hidden />
                            {info.phone}
                          </a>
                        </li>
                      )}
                      {info.whatsapp && (
                        <li>
                          <a
                            href={`https://wa.me/${info.whatsapp.replace("+", "")}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            dir="ltr"
                            aria-label="مِهلة على واتساب"
                            className={linkCls}
                          >
                            <MessageCircle className="me-1.5 h-3.5 w-3.5" aria-hidden />
                            {info.whatsapp}
                          </a>
                        </li>
                      )}
                      {info.address && (
                        <li className="flex items-start gap-1.5 py-1 text-[13.5px] text-muted-foreground">
                          <MapPin className="mt-1 h-3.5 w-3.5 shrink-0" aria-hidden />
                          <span>{info.address}</span>
                        </li>
                      )}
                    </ul>
                  </address>
                )}
              </div>

              {/* الأقسام — Accordion على الجوال */}
              <div className="lg:hidden">
                <ul className="divide-y divide-border border-y border-border">
                  {groups.map((group) => (
                    <li key={group.id}>
                      <details className="group">
                        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 py-3 text-[14px] font-bold marker:content-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60">
                          {group.title}
                          <ChevronDown
                            className="h-4 w-4 shrink-0 text-muted-foreground transition group-open:rotate-180"
                            aria-hidden
                          />
                        </summary>
                        <ul className="pb-2">
                          {group.links.map((l) => (
                            <li key={l.label}>
                              <FooterLinkItem link={l} />
                            </li>
                          ))}
                        </ul>
                      </details>
                    </li>
                  ))}
                </ul>
              </div>

              {/* الأقسام — أعمدة على سطح المكتب */}
              <div className="hidden lg:grid lg:grid-cols-3 lg:gap-8">
                {groups.map((group) => (
                  <nav key={group.id} aria-labelledby={`footer-${group.id}`}>
                    <h2 id={`footer-${group.id}`} className="text-[13px] font-bold">
                      {group.title}
                    </h2>
                    <ul className="mt-3 space-y-1">
                      {group.links.map((l) => (
                        <li key={l.label}>
                          <FooterLinkItem link={l} />
                        </li>
                      ))}
                    </ul>
                  </nav>
                ))}
              </div>
            </div>

            <div className="mt-8 flex flex-col items-center gap-1.5 border-t border-border pt-5 text-center text-[12.5px] text-text-muted sm:flex-row sm:flex-wrap sm:justify-center sm:gap-x-4">
              {info.legal_name && <p>{info.legal_name}</p>}
              <p>© 2026 مِهلة — جميع الحقوق محفوظة.</p>
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}
