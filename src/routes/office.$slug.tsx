import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { OfficePublicPage } from "@/components/office/public-page";
import { getPublicOfficePage } from "@/lib/office-page.public.functions";
import { officePageUrl } from "@/lib/office-page.shared";

export const Route = createFileRoute("/office/$slug")({
  loader: async ({ params }) => {
    const { view } = await getPublicOfficePage({ data: { slug: params.slug } });
    if (!view) throw notFound();
    return { view };
  },
  head: ({ loaderData, params }) => {
    if (!loaderData) {
      return {
        meta: [
          { title: "الصفحة غير متاحة | مِهلة" },
          { name: "robots", content: "noindex, follow" },
        ],
      };
    }
    const { view } = loaderData;
    const title = view.seo.title || `${view.officeName} | مكتب محاماة`;
    const description =
      view.seo.description ||
      (view.tagline || view.about).slice(0, 155) ||
      `صفحة ${view.officeName} للتواصل وطلب استشارة قانونية.`;
    const url = officePageUrl(params.slug);
    const image = view.seo.ogImageUrl?.startsWith("https://") ? view.seo.ogImageUrl : "";

    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:type", content: "profile" },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:url", content: url },
        { name: "twitter:card", content: image ? "summary_large_image" : "summary" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
        ...(image
          ? [
              { property: "og:image", content: image },
              { name: "twitter:image", content: image },
            ]
          : []),
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "LegalService",
            name: view.officeName,
            description,
            url,
            ...(image ? { image } : {}),
            ...(view.phone ? { telephone: view.phone } : {}),
            ...(view.email ? { email: view.email } : {}),
            ...(view.city || view.address
              ? {
                  address: {
                    "@type": "PostalAddress",
                    addressCountry: "SA",
                    ...(view.city ? { addressLocality: view.city } : {}),
                    ...(view.address ? { streetAddress: view.address } : {}),
                  },
                }
              : {}),
            areaServed: "SA",
          }),
        },
      ],
    };
  },
  errorComponent: () => <Unavailable />,
  notFoundComponent: () => <Unavailable />,
  component: OfficeRoute,
});

function OfficeRoute() {
  const { view } = Route.useLoaderData();
  return <OfficePublicPage view={view} />;
}

function Unavailable() {
  return (
    <div
      dir="rtl"
      className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center"
    >
      <h1 className="text-2xl font-bold">هذه الصفحة غير متاحة حالياً</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        قد يكون الرابط غير صحيح أو أن المكتب أوقف نشر صفحته العامة.
      </p>
      <Link
        to="/"
        className="inline-flex min-h-11 items-center rounded-[var(--radius-m,0.75rem)] bg-primary px-5 text-sm font-semibold text-primary-foreground"
      >
        الانتقال إلى منصة مِهلة
      </Link>
    </div>
  );
}
