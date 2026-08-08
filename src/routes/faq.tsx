import { createFileRoute } from "@tanstack/react-router";
import { publicSiteQueryOptions } from "@/lib/public-site.query";
import { ContentSections, PageHeading, PublicShell } from "@/components/marketing/public-shell";
import { FAQ_SECTIONS } from "@/content/faq";

const TITLE = "الأسئلة الشائعة — مِهلة";
const DESCRIPTION =
  "أسئلة مكاتب المحاماة عن منصة مِهلة: عزل البيانات، الصلاحيات، المهل والتنبيهات، المستندات، متابعة العميل، والاشتراك.";


export const Route = createFileRoute("/faq")({
  loader: ({ context }) => context.queryClient.ensureQueryData(publicSiteQueryOptions()),
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://mehlalex.com/faq" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "https://mehlalex.com/faq" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          inLanguage: "ar",
          mainEntity: FAQ_SECTIONS.map((item) => ({
            "@type": "Question",
            name: item.heading,
            acceptedAnswer: { "@type": "Answer", text: item.paragraphs?.[0] ?? "" },
          })),
        }),
      },
    ],
  }),
  component: FaqRoute,
});

function FaqRoute() {
  return (
    <PublicShell>
      <PageHeading
        eyebrow="مركز الثقة"
        title="الأسئلة الشائعة"
        intro="أكثر ما تسأل عنه مكاتب المحاماة قبل تشغيل المنصة، بإجابات مباشرة دون تعميم."
      />
      <div className="container-page max-w-3xl py-10 md:py-14">
        <ContentSections sections={FAQ_SECTIONS} />
      </div>
    </PublicShell>
  );
}
