/** مجالات العمل — بطاقات موحّدة من الخدمات المنشورة فقط، بلا أي خدمة مثبّتة في الواجهة. */
import {
  Building2,
  FileSignature,
  Gavel,
  Handshake,
  HeartHandshake,
  Home,
  Landmark,
  Lightbulb,
  Scale,
  ScrollText,
  ShieldAlert,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Section } from "./primitives";
import type { TrackFn } from "./links";

const SERVICE_ICONS: Record<string, LucideIcon> = {
  litigation: Gavel,
  execution: ScrollText,
  commercial: Building2,
  labor: Users,
  family: HeartHandshake,
  real_estate: Home,
  criminal: ShieldAlert,
  corporate: Landmark,
  contracts: FileSignature,
  arbitration: Handshake,
  ip: Lightbulb,
  consulting: Scale,
};

export function OfficePublicServices({
  services,
  track,
}: {
  services: Array<{ key: string; title: string; description: string }>;
  track: TrackFn;
}) {
  const wide = services.length > 8;

  return (
    <Section titleId="services-title" title="مجالات العمل" icon={Scale} alt>
      <ul
        className={`grid items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3 ${
          wide ? "xl:grid-cols-4" : ""
        }`}
      >
        {services.map((service) => {
          const Icon = SERVICE_ICONS[service.key] ?? Scale;
          return (
            <li key={service.key + service.title} className="h-full">
              <div
                onClick={() => track("service_click")}
                className="office-card group h-full p-5 shadow-xs transition-shadow hover:shadow-md"
              >
                <span
                  aria-hidden="true"
                  className="grid size-11 place-items-center rounded-[var(--office-radius-sm)] bg-primary/8 text-primary"
                >
                  <Icon size={20} strokeWidth={1.75} />
                </span>
                <h3 className="mt-4 text-h4 break-words">{service.title}</h3>
                {service.description && (
                  <p className="mt-2 text-body-sm break-words text-muted-foreground">
                    {service.description}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
