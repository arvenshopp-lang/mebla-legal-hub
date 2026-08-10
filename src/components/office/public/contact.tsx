/** معلومات التواصل والروابط الاجتماعية — تُعرض فقط الحقول المتاحة في اللقطة. */
import {
  BadgeCheck,
  ExternalLink,
  Globe,
  Instagram,
  Linkedin,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Twitter,
  Youtube,
  type LucideIcon,
} from "lucide-react";
import { ContactRow, SurfaceCard } from "./primitives";
import { displayHost, type TrackFn } from "./links";

const SOCIAL_ICONS: Record<string, LucideIcon> = {
  instagram: Instagram,
  x: Twitter,
  linkedin: Linkedin,
  youtube: Youtube,
};

export function OfficePublicContact({
  address,
  phone,
  whatsapp,
  email,
  website,
  licenseNumber,
  socials,
  track,
}: {
  address: string;
  phone: string;
  whatsapp: string;
  email: string;
  website: string;
  licenseNumber: string;
  socials: Array<{ key: string; label: string; href: string }>;
  track: TrackFn;
}) {
  return (
    <SurfaceCard>
      <h2 id="contact-title" className="text-h3">
        معلومات التواصل
      </h2>
      <dl className="mt-3">
        {address && (
          <ContactRow icon={MapPin} label="العنوان">
            <span className="break-words">{address}</span>
          </ContactRow>
        )}
        {phone && (
          <ContactRow icon={Phone} label="الجوال">
            <span dir="ltr" className="inline-block">
              {phone}
            </span>
          </ContactRow>
        )}
        {whatsapp && whatsapp !== phone && (
          <ContactRow icon={MessageCircle} label="واتساب">
            <span dir="ltr" className="inline-block">
              {whatsapp}
            </span>
          </ContactRow>
        )}
        {email && (
          <ContactRow icon={Mail} label="البريد الإلكتروني">
            <span dir="ltr" className="inline-block break-all">
              {email}
            </span>
          </ContactRow>
        )}
        {website && (
          <ContactRow icon={Globe} label="الموقع الإلكتروني">
            <a
              href={website}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline"
            >
              زيارة الموقع
              <ExternalLink size={14} strokeWidth={1.9} aria-hidden="true" />
              <span className="text-caption" dir="ltr">
                {displayHost(website)}
              </span>
            </a>
          </ContactRow>
        )}
        {licenseNumber && (
          <ContactRow icon={BadgeCheck} label="رقم الترخيص">
            <span dir="ltr" className="inline-block">
              {licenseNumber}
            </span>
          </ContactRow>
        )}
      </dl>

      {socials.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-2 border-t border-border/70 pt-4">
          {socials.map((social) => {
            const Icon = SOCIAL_ICONS[social.key] ?? Globe;
            return (
              <li key={social.key}>
                <a
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  aria-label={social.label}
                  title={social.label}
                  onClick={() => track("service_click")}
                  className="grid size-11 place-items-center rounded-[var(--office-radius-sm)] border border-border bg-surface text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                >
                  <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </SurfaceCard>
  );
}
