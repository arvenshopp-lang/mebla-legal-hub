import { createFileRoute } from "@tanstack/react-router";
import { BookOpen, FileText, HelpCircle, ScrollText, ShieldCheck } from "lucide-react";
import { PageHeading, PublicShell } from "@/components/marketing/public-shell";
import { publicSiteQueryOptions } from "@/lib/public-site.query";

export const Route = createFileRoute("/docs")({
  loader: ({ context }) => context.queryClient.ensureQueryData(publicSiteQueryOptions()),
  head: () => ({
    meta: [
      { title: "مركز المساعدة — مِهلة" },
      {
        name: "description",
        content: "دليل استخدام منصة مِهلة، الأسئلة الشائعة، توثيق API، الشروط وسياسة الخصوصية.",
      },
      { property: "og:title", content: "مركز المساعدة — مِهلة" },
      {
        property: "og:description",
        content:
          "دليل الاستخدام، الأسئلة الشائعة، وتوثيق واجهة API لمنصة مِهلة لإدارة الممارسة القانونية.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://mehlalex.com/docs" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "https://mehlalex.com/docs" }],
  }),
  component: Page,
});

const SECTIONS = [
  {
    icon: BookOpen,
    title: "دليل الاستخدام",
    body: "خطوات إنشاء المكتب، إضافة العملاء والقضايا، وإدارة الجلسات والمهل.",
  },
  {
    icon: HelpCircle,
    title: "الأسئلة الشائعة",
    body: "إجابات عن الاشتراك، الصلاحيات، عزل بيانات المكاتب، واستعادة الحساب.",
  },
  {
    icon: FileText,
    title: "توثيق API",
    body: "واجهة مِهلة الرسمية على api.mehlalex.com عبر REST وWebhooks.",
  },
  {
    icon: ScrollText,
    title: "الشروط والأحكام",
    body: "شروط استخدام المنصة والتزامات المكتب والمستخدمين.",
  },
  {
    icon: ShieldCheck,
    title: "سياسة الخصوصية",
    body: "كيفية حفظ البيانات وحمايتها ومشاركتها داخل المنصة.",
  },
];

function Page() {
  return (
    <PublicShell>
      <PageHeading
        eyebrow="الدعم"
        title="مركز المساعدة"
        intro="نعمل على إثراء هذا المركز بالمحتوى الكامل. تجد أدناه أقسام الدعم الرسمية للمنصة."
      />
      <div className="container-page max-w-3xl py-10 md:py-14">
        <div className="grid gap-4 sm:grid-cols-2">
          {SECTIONS.map((s) => (
            <section
              key={s.title}
              className="rounded-[var(--radius-l)] border border-border bg-surface p-6"
            >
              <s.icon className="h-5 w-5 text-gold" />
              <h2 className="mt-3 text-sm font-bold">{s.title}</h2>
              <p className="mt-1.5 text-xs leading-6 text-muted-foreground">{s.body}</p>
              <span className="mt-3 inline-block rounded-full bg-surface-muted px-2.5 py-1 text-[10px] text-muted-foreground">
                قريباً
              </span>
            </section>
          ))}
        </div>
      </div>
    </PublicShell>
  );
}
