/** عن المكتب — نص عربي طويل بعرض سطر مضبوط وارتفاع سطر مريح. */
import { BookOpenText } from "lucide-react";
import { Section, SurfaceCard } from "./primitives";

export function OfficePublicAbout({ about }: { about: string }) {
  return (
    <Section titleId="about-title" title="عن المكتب" icon={BookOpenText}>
      <SurfaceCard>
        <p className="measure text-body whitespace-pre-line break-words text-foreground/90">
          {about}
        </p>
      </SurfaceCard>
    </Section>
  );
}
