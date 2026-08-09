/** واجهة الهيرو — غلاف المكتب مع طبقة تباين مضبوطة تضمن قراءة النص مهما كانت الصورة. */
import { MapPin } from "lucide-react";
import type { OfficePageView } from "@/lib/office-page.shared";
import type { TrackFn } from "./links";
import { OfficePublicActions, type OfficeLinks } from "./actions";

export function OfficePublicHero({
  view,
  links,
  track,
}: {
  view: OfficePageView;
  links: OfficeLinks;
  track: TrackFn;
}) {
  return (
    <header className="relative isolate overflow-hidden bg-primary">
      {view.coverUrl ? (
        <img
          src={view.coverUrl}
          alt={`غلاف ${view.officeName}`}
          width={1600}
          height={900}
          loading="eager"
          fetchPriority="high"
          decoding="async"
          className="absolute inset-0 -z-10 size-full object-cover object-[center_35%]"
        />
      ) : (
        <div aria-hidden="true" className="absolute inset-0 -z-10">
          <div className="size-full bg-gradient-to-b from-primary to-primary-active" />
          <div className="grid-lines absolute inset-0 opacity-25" />
        </div>
      )}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10"
        style={{ background: "var(--office-hero-overlay)" }}
      />

      <div className="office-container flex flex-col gap-5 py-12 sm:gap-6 sm:py-16 lg:py-24">
        {view.logoUrl && (
          <img
            src={view.logoUrl}
            alt={`شعار ${view.officeName}`}
            width={112}
            height={112}
            loading="eager"
            decoding="async"
            className="size-20 shrink-0 rounded-[var(--office-radius)] border border-white/25 bg-white/95 object-contain p-2.5 shadow-lg sm:size-24 lg:size-28"
          />
        )}

        <div className="max-w-3xl space-y-3">
          <h1 className="text-h1 break-words text-white">{view.officeName}</h1>
          {view.city && (
            <p className="inline-flex items-center gap-1.5 text-body-sm text-white/85">
              <MapPin size={15} strokeWidth={1.9} aria-hidden="true" />
              {view.city}
            </p>
          )}
          {view.headline && (
            <p className="text-body-lg break-words font-semibold text-white sm:text-h3">
              {view.headline}
            </p>
          )}
          {view.tagline && (
            <p className="measure text-body break-words text-white/85">{view.tagline}</p>
          )}
        </div>

        <OfficePublicActions links={links} track={track} onHero className="pt-1" />
      </div>
    </header>
  );
}
