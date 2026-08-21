import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { OfficePublicPage } from "@/components/office/public-page";
import { getPublicOfficePage } from "@/lib/office-page.public.functions";
import { NOINDEX_META } from "@/config/indexing";

export const Route = createFileRoute("/office/$slug")({
  loader: async ({ params }) => {
    const { view } = await getPublicOfficePage({ data: { slug: params.slug } });
    if (!view) throw notFound();
    return { view };
  },
  /**
   * صفحات المكاتب ليست صفحات مِهلة الرسمية: تبقى متاحة لمن يملك الرابط، لكنها
   * ممنوعة من الفهرسة، ولا تنشر أي بيانات مشترك (اسم المكتب أو هاتفه أو
   * بريده أو عنوانه) في Metadata أو Open Graph أو Schema.org.
   */
  head: () => ({
    meta: [{ title: "صفحة مكتب — مِهلة" }, NOINDEX_META],
  }),
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
