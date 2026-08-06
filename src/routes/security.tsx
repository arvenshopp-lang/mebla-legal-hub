import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { publicSiteQueryOptions } from "@/lib/public-site.query";
import { privacyContactEmail } from "@/lib/public-site.shared";
import {
  ContentSections,
  PageHeading,
  PublicShell,
  type ContentSection,
} from "@/components/marketing/public-shell";

const TITLE = "الأمان وحماية البيانات — مِهلة";
const DESCRIPTION =
  "كيف تحمي منصة مِهلة بيانات مكاتب المحاماة: عزل البيانات، التحقق بخطوتين، تشفير المستندات، الروابط المؤقتة، وسجلات التدقيق.";

const SECTIONS: ContentSection[] = [
  {
    id: "tenant",
    heading: "عزل بيانات كل مكتب",
    paragraphs: [
      "تُفصل بيانات المكاتب على مستوى قاعدة البيانات بسياسات وصول تُقيّم مع كل استعلام على الخادم. لا يُعتمد على الواجهة في الحماية، ولا يوجد مسار يسمح لمكتب بقراءة بيانات مكتب آخر.",
    ],
  },
  {
    id: "access",
    heading: "الدخول والتحقق بخطوتين",
    paragraphs: [
      "يدعم الحساب التحقق بخطوتين، وتُفحص كلمات المرور مقابل قوائم كلمات المرور المسرّبة المعروفة قبل قبولها. صلاحيات كل عضو تُتحقق على الخادم مع كل عملية.",
    ],
  },
  {
    id: "documents",
    heading: "المستندات والتخزين",
    paragraphs: [
      "تُحفظ المستندات في تخزين خاص غير معلن بلا روابط مباشرة. العرض والتحميل يجريان عبر روابط مؤقتة تنتهي صلاحيتها تلقائياً، وتُختم النسخ المعروضة بعلامة مائية تُولَّد على الخادم.",
    ],
  },
  {
    id: "audit",
    heading: "سجلات التدقيق",
    paragraphs: [
      "تُسجَّل العمليات الحساسة — الوصول إلى المستندات والطباعة وتغييرات الصلاحيات — في سجلات تدقيق غير قابلة للتعديل أو الحذف من داخل التطبيق.",
    ],
  },
  {
    id: "operations",
    heading: "التشغيل والمراقبة",
    paragraphs: [
      "تُراقب أعطال التشغيل وحالات فشل المهام الخلفية داخلياً لمعالجتها، ولا تحتوي هذه السجلات على محتوى ملفات القضايا.",
    ],
  },
  {
    id: "responsibility",
    heading: "مسؤولية المكتب",
    paragraphs: ["الأمان مسؤولية مشتركة، ويبقى على المكتب:"],
    items: [
      "عدم مشاركة بيانات الدخول مع أي طرف خارج المكتب.",
      "تفعيل التحقق بخطوتين لأعضاء الفريق.",
      "مراجعة الصلاحيات دورياً وإيقاف وصول من انتهت علاقته بالمكتب.",
      "مشاركة روابط المتابعة والرفع مع أصحابها فقط.",
    ],
  },
];

export const Route = createFileRoute("/security")({
  loader: ({ context }) => context.queryClient.ensureQueryData(publicSiteQueryOptions()),
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://mehlalex.com/security" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "https://mehlalex.com/security" }],
  }),
  component: SecurityRoute,
});

function SecurityRoute() {
  const { data: info } = useSuspenseQuery(publicSiteQueryOptions());
  const email = privacyContactEmail(info);

  return (
    <PublicShell>
      <PageHeading
        eyebrow="مركز الثقة"
        title="الأمان وحماية البيانات"
        intro="سرّية ملفات القضايا شرط أساسي للعمل القانوني. هذه الصفحة توضح الضوابط المطبّقة فعلياً في المنصة."
      />
      <div className="container-page max-w-3xl py-10 md:py-14">
        <ContentSections sections={SECTIONS} />
        <div className="mt-12 rounded-[var(--radius-m)] border border-border bg-surface p-5">
          <h2 className="text-[13px] font-bold">الإبلاغ عن ثغرة أمنية</h2>
          <p className="mt-2 text-body-sm leading-7 text-muted-foreground">
            إذا لاحظت ثغرة محتملة، راسلنا على{" "}
            <a
              href={`mailto:${email}`}
              dir="ltr"
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              {email}
            </a>{" "}
            مع وصف واضح للمشكلة، ودون محاولة الوصول إلى بيانات أي مكتب أو الإضرار بالخدمة.
          </p>
        </div>
      </div>
    </PublicShell>
  );
}