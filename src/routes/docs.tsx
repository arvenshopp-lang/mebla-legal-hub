import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen, FileText, HelpCircle, ScrollText, ShieldCheck } from "lucide-react";
import { PageHeading, PublicShell } from "@/components/marketing/public-shell";
import { publicSiteQueryOptions } from "@/lib/public-site.query";
import { NOINDEX_FOLLOW_META } from "@/config/indexing";
import { socialPreviewMeta } from "@/config/brand-assets";

export const Route = createFileRoute("/docs")({
  loader: ({ context }) => context.queryClient.ensureQueryData(publicSiteQueryOptions()),
  head: () => ({
    // المحتوى قيد الإعداد: الصفحة تبقى متاحة (لا كسر للروابط) وممنوعة من الفهرسة مؤقتاً.
    meta: [
      { title: "مركز المساعدة — مِهلة" },
      {
        name: "description",
        content: "مركز مساعدة مِهلة قيد الإعداد. للحصول على مساعدة الآن تواصل مع فريق مِهلة.",
      },
      NOINDEX_FOLLOW_META,
      { property: "og:title", content: "مركز المساعدة — مِهلة" },
      {
        property: "og:description",
        content: "مركز مساعدة مِهلة قيد الإعداد. للحصول على مساعدة الآن تواصل مع فريق مِهلة.",
      },
      { property: "og:type", content: "website" },
      // نفس شعار مِهلة المعتمد في كل الصفحات العامة (المصدر المركزي).
      ...socialPreviewMeta({
        title: "مركز المساعدة — مِهلة",
        description:
          "مركز مساعدة مِهلة قيد الإعداد. للحصول على مساعدة الآن تواصل مع فريق مِهلة.",
      }),
    ],
  }),
  component: Page,
});


/** أقسام تشير إلى صفحات موجودة فعلاً — بلا أقسام «قريباً» بلا رابط. */
const SECTIONS = [
  {
    icon: BookOpen,
    title: "كيف تستخدم مِهلة",
    body: "خطوات إنشاء المكتب وإضافة العملاء والقضايا وإدارة الجلسات والمهل.",
    to: "/how-it-works" as const,
  },
  {
    icon: HelpCircle,
    title: "الأسئلة الشائعة",
    body: "إجابات عن الحساب والاشتراك والصلاحيات ومتابعة العميل والمستندات.",
    to: "/faq" as const,
  },
  {
    icon: ShieldCheck,
    title: "الأمان وحماية البيانات",
    body: "الضوابط المطبّقة فعلياً في المنصة لعزل بيانات المكاتب وحماية المستندات.",
    to: "/security" as const,
  },
  {
    icon: ScrollText,
    title: "الشروط والأحكام",
    body: "شروط استخدام المنصة والتزامات المكتب والمستخدمين.",
    to: "/terms" as const,
  },
  {
    icon: FileText,
    title: "سياسة الخصوصية",
    body: "فئات البيانات وأغراض المعالجة وحقوق صاحب البيانات.",
    to: "/privacy" as const,
  },
  {
    icon: HelpCircle,
    title: "تواصل مع فريق مِهلة",
    body: "لم تجد ما تبحث عنه؟ راسل فريق الدعم وسنعود إليك.",
    to: "/contact" as const,
  },
];

function Page() {
  return (
    <PublicShell>
      <PageHeading
        eyebrow="الدعم"
        title="مركز المساعدة"
        intro="مقالات الدعم التفصيلية قيد الإعداد. حتى ذلك الحين تجد أدناه الصفحات الرسمية التي تجيب عن أكثر الأسئلة تكراراً."
      />
      <div className="container-page max-w-3xl py-10 md:py-14">
        <div className="grid gap-4 sm:grid-cols-2">
          {SECTIONS.map((s) => (
            <Link
              key={s.title}
              to={s.to}
              className="rounded-[var(--radius-l)] border border-border bg-surface p-6 transition hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <s.icon className="h-5 w-5 text-gold" aria-hidden />
              <h2 className="mt-3 text-sm font-bold">{s.title}</h2>
              <p className="mt-1.5 text-xs leading-6 text-muted-foreground">{s.body}</p>
            </Link>
          ))}
        </div>
      </div>
    </PublicShell>
  );
}

