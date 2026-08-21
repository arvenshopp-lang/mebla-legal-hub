import { Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import { useSurfaceHref } from "@/hooks/use-surface-guard";
import { publicSiteQueryOptions } from "@/lib/public-site.query";
import {
  activeSocialLinks,
  publicContactEmail,
  supportContactEmail,
} from "@/lib/public-site.shared";
import { openCookiePreferences } from "@/lib/product-analytics";
import { PaymentMethodsBar } from "@/components/ui/payment-icons";

const ABOUT_LINKS = [
  { to: "/about", label: "من نحن" },
  { to: "/how-it-works", label: "كيف تستخدم مِهلة" },
  { to: "/pricing", label: "الباقات والأسعار" },
  { to: "/faq", label: "الأسئلة الشائعة" },
] as const;

const TRUST_LINKS = [
  { to: "/security", label: "الأمان وحماية البيانات" },
  { to: "/privacy", label: "سياسة الخصوصية" },
  { to: "/terms", label: "الشروط والأحكام" },
] as const;

const HELP_LINKS = [{ to: "/docs", label: "مركز المساعدة" }] as const;

const linkCls =
  "inline-flex min-h-9 items-center text-[13.5px] text-muted-foreground transition hover:text-foreground";

/** فوتر موحّد لكل الصفحات العامة — بيانات التواصل تأتي من إعدادات المنصة، بلا قيم تجريبية. */
export function SiteFooter() {
  const { data: info } = useSuspenseQuery(publicSiteQueryOptions());
  const trackHref = useSurfaceHref("/track");
  const socials = activeSocialLinks(info);
  const publicEmail = publicContactEmail(info);
  const supportEmail = supportContactEmail(info);

  return (
    <footer className="border-t border-border bg-surface">
      <div className="container-page py-12 md:py-14">
        <div className="mx-auto max-w-5xl">
          <div className="grid gap-9 text-center lg:grid-cols-[2fr_2fr_1.2fr] lg:items-start lg:text-start">
            {/* المجموعة الأولى: عن مِهلة + الخدمات والمساعدة — على اليسار في RTL */}
            <div className="order-2 grid grid-cols-1 gap-9 sm:grid-cols-2 lg:order-1">
              <nav aria-labelledby="footer-about">
                <h2 id="footer-about" className="text-[13px] font-bold">
                  عن مِهلة
                </h2>
                <ul className="mt-3 space-y-1">
                  {ABOUT_LINKS.map((l) => (
                    <li key={l.to}>
                      <Link to={l.to} className={linkCls}>
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>

              <nav aria-labelledby="footer-help">
                <h2 id="footer-help" className="text-[13px] font-bold">
                  الخدمات والمساعدة
                </h2>
                <ul className="mt-3 space-y-1">
                  {HELP_LINKS.map((l) => (
                    <li key={l.to}>
                      <Link to={l.to} className={linkCls}>
                        {l.label}
                      </Link>
                    </li>
                  ))}
                  <li>
                    <a href={trackHref} className={linkCls}>
                      متابعة القضية
                    </a>
                  </li>
                  <li>
                    <a href={uploadHref} className={linkCls}>
                      رفع مستند
                    </a>
                  </li>
                </ul>
              </nav>
            </div>

            {/* المجموعة الثانية: الثقة والخصوصية + الدعم والتواصل — في المنتصف في RTL */}
            <div className="order-3 grid grid-cols-1 gap-9 sm:grid-cols-2 lg:order-2">
              <nav aria-labelledby="footer-trust">
                <h2 id="footer-trust" className="text-[13px] font-bold">
                  الثقة والخصوصية
                </h2>
                <ul className="mt-3 space-y-1">
                  {TRUST_LINKS.map((l) => (
                    <li key={l.to}>
                      <Link to={l.to} className={linkCls}>
                        {l.label}
                      </Link>
                    </li>
                  ))}
                  <li>
                    <button type="button" onClick={openCookiePreferences} className={linkCls}>
                      إعدادات ملفات تعريف الارتباط
                    </button>
                  </li>
                </ul>
              </nav>

              <nav aria-labelledby="footer-support">
                <h2 id="footer-support" className="text-[13px] font-bold">
                  الدعم والتواصل
                </h2>
                <ul className="mt-3 space-y-1">
                  <li>
                    <Link to="/contact" className={linkCls}>
                      تواصل معنا
                    </Link>
                  </li>
                  {info.support_center_url && (
                    <li>
                      <a
                        href={info.support_center_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={linkCls}
                      >
                        مركز الدعم
                      </a>
                    </li>
                  )}
                  <li>
                    <a href={`mailto:${publicEmail}`} dir="ltr" className={linkCls}>
                      <Mail className="ms-0 me-1.5 h-3.5 w-3.5" aria-hidden />
                      {publicEmail}
                    </a>
                  </li>
                  <li>
                    <a href={`mailto:${supportEmail}`} dir="ltr" className={linkCls}>
                      <Mail className="me-1.5 h-3.5 w-3.5" aria-hidden />
                      {supportEmail}
                    </a>
                  </li>
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
                      {info.maps_url ? (
                        <a
                          href={info.maps_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="transition hover:text-foreground"
                        >
                          {info.address}
                        </a>
                      ) : (
                        <span>{info.address}</span>
                      )}
                    </li>
                  )}
                  <li className="pt-1">
                    <a href={loginHref} className={linkCls}>
                      تسجيل الدخول
                    </a>
                  </li>
                  <li>
                    <a href={registerHref} className={linkCls}>
                      إنشاء حساب
                    </a>
                  </li>
                </ul>
              </nav>
            </div>

            {/* العلامة التجارية — على اليمين في RTL */}
            <div className="order-1 text-center lg:order-3 lg:text-start">
              <p className="text-[17px] font-bold tracking-tight">
                مِهلة <span className="text-text-muted">·</span>{" "}
                <span className="text-[13px] tracking-[0.18em]">MEHLA</span>
              </p>
              <p className="mt-3 max-w-xs leading-7 text-muted-foreground text-body-sm lg:ms-auto lg:me-0">
                منصة تقنية عربية لإدارة أعمال مكاتب المحاماة. مِهلة ليست مكتب محاماة ولا تقدّم
                استشارات قانونية.
              </p>
              {socials.length > 0 && (
                <ul className="mt-4 flex flex-wrap justify-center gap-2 lg:justify-start">
                  {socials.map((s) => (
                    <li key={s.label}>
                      <a
                        href={s.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-9 items-center rounded-[var(--radius-s)] border border-border px-3 text-[12.5px] text-muted-foreground transition hover:text-foreground"
                      >
                        {s.label}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="mt-10 flex flex-col items-center gap-4 border-t border-border pt-6 text-center text-[12.5px] text-text-muted md:flex-row md:items-center md:justify-between md:text-start">
            <p>© {new Date().getFullYear()} مِهلة | MehlaLex — جميع الحقوق محفوظة.</p>
            <PaymentMethodsBar showLabel={false} />
            <div className="flex flex-col items-center gap-1 sm:flex-row sm:items-center sm:gap-4">
              {info.legal_name && <p>{info.legal_name}</p>}
              <p dir="ltr">mehlalex.com</p>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
