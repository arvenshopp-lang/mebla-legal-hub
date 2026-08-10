/** أزرار التواصل — نفس الروابط ونفس أحداث القياس السابقة، بتسلسل بصري واضح. */
import { CalendarClock, Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TrackFn } from "./links";

export type OfficeLinks = {
  tel: string;
  wa: string;
  mail: string;
  mapUrl: string;
  leadEnabled: boolean;
};

const base =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--office-radius-sm)] px-4 text-body-sm font-semibold transition-colors";

export function OfficePublicActions({
  links,
  track,
  onHero = false,
  className,
}: {
  links: OfficeLinks;
  track: TrackFn;
  onHero?: boolean;
  className?: string;
}) {
  const secondary = onHero
    ? "border border-white/35 bg-white/10 text-white backdrop-blur-sm hover:bg-white/20"
    : "border border-border bg-surface text-foreground hover:bg-surface-muted";

  return (
    <nav aria-label="طرق التواصل" className={cn("flex flex-wrap gap-2.5", className)}>
      {links.tel && (
        <a
          href={links.tel}
          onClick={() => track("call")}
          className={cn(base, "bg-primary text-primary-foreground hover:bg-primary-hover")}
        >
          <Phone size={17} strokeWidth={1.9} aria-hidden="true" />
          اتصال
        </a>
      )}
      {links.wa && (
        <a
          href={links.wa}
          target="_blank"
          rel="noopener noreferrer nofollow"
          onClick={() => track("whatsapp")}
          className={cn(base, "text-white")}
          style={{ background: "var(--office-whatsapp)" }}
        >
          <MessageCircle size={17} strokeWidth={1.9} aria-hidden="true" />
          واتساب
        </a>
      )}
      {links.leadEnabled && (
        <a href="#lead" className={cn(base, secondary)}>
          <CalendarClock size={17} strokeWidth={1.9} aria-hidden="true" />
          طلب استشارة
        </a>
      )}
      {links.mail && (
        <a href={links.mail} onClick={() => track("email")} className={cn(base, secondary)}>
          <Mail size={17} strokeWidth={1.9} aria-hidden="true" />
          البريد الإلكتروني
        </a>
      )}
      {links.mapUrl && (
        <a
          href={links.mapUrl}
          target="_blank"
          rel="noopener noreferrer nofollow"
          onClick={() => track("map")}
          className={cn(base, secondary)}
        >
          <MapPin size={17} strokeWidth={1.9} aria-hidden="true" />
          الموقع
        </a>
      )}
    </nav>
  );
}
