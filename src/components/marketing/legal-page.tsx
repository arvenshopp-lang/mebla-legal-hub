import { MehlaLogo } from "@/components/brand/mehla-logo";
import { ArrowRight } from "lucide-react";
import { SiteFooter } from "@/components/marketing/site-footer";

export type LegalSection = { heading: string; paragraphs: string[]; items?: string[] };

/** قالب موحّد لصفحات المحتوى النظامي (الخصوصية والشروط) بهوية مِهلة. */
export function LegalPage({
  title,
  intro,
  updatedAt,
  sections,
}: {
  title: string;
  intro: string;
  updatedAt: string;
  sections: LegalSection[];
}) {
  return (
    <div dir="rtl" className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="border-b border-border bg-surface">
        <div className="container-page flex h-16 items-center justify-between gap-4">
          <a href="/" aria-label="مِهلة | MEHLA — الصفحة الرئيسية" className="text-primary">
            <MehlaLogo size="sm" />
          </a>
          <a
            href="/"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-[var(--radius-m)] px-3 text-[13.5px] text-muted-foreground transition hover:bg-surface-muted hover:text-foreground"
          >
            <ArrowRight className="h-4 w-4" aria-hidden /> العودة للرئيسية
          </a>
        </div>
      </header>

      <main className="container-page max-w-3xl flex-1 py-12 md:py-16">
        <h1 className="text-h1">{title}</h1>
        <p className="mt-2 text-caption">آخر تحديث: {updatedAt}</p>
        <p className="mt-5 text-body-lg text-muted-foreground">{intro}</p>

        <div className="mt-10 space-y-9">
          {sections.map((section) => (
            <section key={section.heading}>
              <h2 className="text-h4">{section.heading}</h2>
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph} className="mt-3 text-body-sm leading-7 text-muted-foreground">
                  {paragraph}
                </p>
              ))}
              {section.items && (
                <ul className="mt-3 space-y-2">
                  {section.items.map((item) => (
                    <li
                      key={item}
                      className="flex items-start gap-2.5 text-body-sm text-muted-foreground"
                    >
                      <span
                        className="mt-2.5 h-1 w-3 shrink-0 rounded-full bg-border-strong"
                        aria-hidden
                      />
                      {item}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>

        <p className="mt-12 rounded-[var(--radius-m)] bg-surface-muted p-4 text-body-sm text-muted-foreground">
          لأي استفسار نظامي يمكنك مراسلتنا على{" "}
          <a
            href="mailto:support@mehlalex.com"
            dir="ltr"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            support@mehlalex.com
          </a>
          .
        </p>
      </main>

      <SiteFooter />
    </div>
  );
}
