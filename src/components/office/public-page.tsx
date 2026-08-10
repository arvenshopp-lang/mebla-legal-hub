/**
 * عرض الصفحة العامة للمكتب — مكوّن واحد يخدم الرابط العام والمعاينة الداخلية،
 * حتى لا تتحول المعاينة إلى تصميم وهمي. لا يقرأ هذا المكوّن أي جدول؛ يستقبل
 * اللقطة الجاهزة فقط. كل الأنماط من رموز قالب مِهلة المقصورة على هذا السطح.
 */
import { useEffect, useRef, useState } from "react";
import type { OfficePageView } from "@/lib/office-page.shared";
import {
  mailHref,
  safeHttps,
  telHref,
  waHref,
  type OfficeEventKind,
} from "@/components/office/public/links";
import { OfficePublicHero } from "@/components/office/public/hero";
import { OfficePublicAbout } from "@/components/office/public/about";
import { OfficePublicServices } from "@/components/office/public/services";
import { OfficePublicTeam } from "@/components/office/public/team";
import { OfficePublicContact } from "@/components/office/public/contact";
import { OfficePublicHours } from "@/components/office/public/hours";
import { OfficePublicLeadForm } from "@/components/office/public/lead-form";
import { OfficePublicFooter } from "@/components/office/public/footer";
import { OfficePublicStickyActions } from "@/components/office/public/sticky-actions";

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

  const track = (kind: OfficeEventKind) => {
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
  const links = { tel, wa, mail, mapUrl, leadEnabled: view.leadForm.enabled };

  const socials = view.socials
    .map((social) => ({ ...social, href: safeHttps(social.href) }))
    .filter((social) => social.href);
  const hasHours = view.hours.some((hour) => !hour.closed);
  const hasContact = Boolean(
    view.address || view.phone || view.email || website || view.licenseNumber || socials.length,
  );

  return (
    <div
      dir="rtl"
      data-surface="office-public"
      className="min-h-screen bg-background text-foreground"
    >
      {view.isPreview && (
        <div className="bg-primary px-4 py-2 text-center text-caption font-medium text-primary-foreground">
          معاينة المسودة — هذه النسخة غير منشورة للعامة.
        </div>
      )}

      <OfficePublicHero view={view} links={links} track={track} />

      <main>
        {view.about && <OfficePublicAbout about={view.about} />}
        {view.services.length > 0 && (
          <OfficePublicServices services={view.services} track={track} />
        )}
        {view.team.length > 0 && <OfficePublicTeam team={view.team} />}

        {(hasContact || hasHours) && (
          <section aria-labelledby={hasContact ? "contact-title" : "hours-title"} className="office-section">
            <div className="office-container grid items-start gap-4 lg:grid-cols-2">
              {hasContact && (
                <OfficePublicContact
                  address={view.address}
                  phone={view.phone}
                  whatsapp={view.whatsapp}
                  email={view.email}
                  website={website}
                  licenseNumber={view.licenseNumber}
                  socials={socials}
                />
              )}
              {hasHours && <OfficePublicHours hours={view.hours} />}
            </div>
          </section>
        )}

        {view.leadForm.enabled && <OfficePublicLeadForm view={view} channel={channel} />}
      </main>

      <OfficePublicFooter officeName={view.officeName} />

      {/* مساحة أسفل الصفحة حتى لا يغطي الشريط اللاصق المحتوى على الجوال */}
      <div aria-hidden="true" className="h-16 sm:hidden" />
      <OfficePublicStickyActions
        wa={wa}
        tel={tel}
        leadEnabled={view.leadForm.enabled}
        track={track}
      />
    </div>
  );
}
