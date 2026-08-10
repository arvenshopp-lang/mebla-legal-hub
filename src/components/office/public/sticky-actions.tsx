/** شريط تواصل لاصق على الجوال فقط — يختفي عند ظهور نموذج الاستشارة حتى لا يزاحم الإرسال. */
import { useEffect, useState } from "react";
import { CalendarClock, MessageCircle, Phone } from "lucide-react";
import type { TrackFn } from "./links";

export function OfficePublicStickyActions({
  wa,
  tel,
  leadEnabled,
  track,
}: {
  wa: string;
  tel: string;
  leadEnabled: boolean;
  track: TrackFn;
}) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (!leadEnabled) return;
    const target = document.getElementById("lead");
    if (!target || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => setHidden(entries.some((entry) => entry.isIntersecting)),
      { rootMargin: "0px 0px -35% 0px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [leadEnabled]);

  const primary = wa || tel;
  if (!primary && !leadEnabled) return null;
  if (hidden) return null;

  return (
    <div className="office-safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 backdrop-blur-sm sm:hidden">
      <div className="flex gap-2 px-4 py-2.5">
        {wa ? (
          <a
            href={wa}
            target="_blank"
            rel="noopener noreferrer nofollow"
            onClick={() => track("whatsapp")}
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-[var(--office-radius-sm)] text-body-sm font-semibold text-white"
            style={{ background: "var(--office-whatsapp)" }}
          >
            <MessageCircle size={17} strokeWidth={1.9} aria-hidden="true" />
            واتساب
          </a>
        ) : (
          tel && (
            <a
              href={tel}
              onClick={() => track("call")}
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-[var(--office-radius-sm)] bg-primary text-body-sm font-semibold text-primary-foreground"
            >
              <Phone size={17} strokeWidth={1.9} aria-hidden="true" />
              اتصال
            </a>
          )
        )}
        {leadEnabled && (
          <a
            href="#lead"
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-[var(--office-radius-sm)] border border-border bg-surface text-body-sm font-semibold"
          >
            <CalendarClock size={17} strokeWidth={1.9} aria-hidden="true" />
            طلب استشارة
          </a>
        )}
      </div>
    </div>
  );
}
