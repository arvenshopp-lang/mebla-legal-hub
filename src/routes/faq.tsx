import { createFileRoute } from "@tanstack/react-router";
import { publicSiteQueryOptions } from "@/lib/public-site.query";
import {
  ContentSections,
  PageHeading,
  PublicShell,
  type ContentSection,
} from "@/components/marketing/public-shell";

const TITLE = "الأسئلة الشائعة — مِهلة";
const DESCRIPTION =
  "أسئلة مكاتب المحاماة عن منصة مِهلة: عزل البيانات، الصلاحيات، المهل والتنبيهات، المستندات، متابعة العميل، والاشتراك.";

const FAQ: ContentSection[] = [
  {
    id: "isolation",
    heading: "هل يمكن لمكتب آخر رؤية بيانات مكتبي؟",
    paragraphs: [
      "لا. كل مكتب يعمل في نطاق بيانات مستقل تماماً على مستوى قاعدة البيانات، والفصل مطبَّق على الخادم لا على الواجهة، ولا يوجد أي مسار يسمح لمكتب بالوصول إلى بيانات مكتب آخر.",
    ],
  },
  {
    id: "team",
    heading: "كيف أتحكم في صلاحيات فريق المكتب؟",
    paragraphs: [
      "تُدعى أعضاء الفريق بالبريد الإلكتروني، ويُمنح كل عضو دوراً محدداً: مالك، مدير، محام، مساعد قانوني، أو مطّلع. الصلاحيات تُتحقق على الخادم مع كل عملية، ويمكن تعديلها أو إيقاف وصول أي عضو في أي وقت.",
    ],
  },
  {
    id: "deadlines",
    heading: "هل تُحدد المنصة المهل النظامية تلقائياً؟",
    paragraphs: [
      "لا. المنصة تُسجّل وتُتابع ما يُدخله المكتب من مواعيد ومهل، وتُرسل تنبيهات قبل استحقاقها. تحديد المهلة نظاماً واحتساب بدايتها يبقى مسؤولية المحامي المختص.",
    ],
  },
  {
    id: "documents",
    heading: "كيف تُحفظ المستندات؟",
    paragraphs: [
      "تُحفظ في تخزين خاص غير معلن، ولا يُتاح رابط مباشر للملف الأصلي. العرض والتحميل يجريان عبر روابط مؤقتة تنتهي صلاحيتها تلقائياً، وتُسجَّل عمليات العرض والطباعة في سجل تدقيق داخلي.",
    ],
  },
  {
    id: "client",
    heading: "ماذا يرى العميل عند متابعة قضيته؟",
    paragraphs: [
      "يرى العميل — عبر رمز متابعة من عشرة أرقام — حالة قضيته والتحديثات التي صرّح المكتب بإظهارها فقط. لا تُعرض له مستندات، ولا ملاحظات داخلية، ولا بيانات أطراف أخرى.",
    ],
  },
  {
    id: "upload",
    heading: "هل يحتاج العميل حساباً لرفع مستند؟",
    paragraphs: [
      "لا. يُرسل المكتب طلب مستند عبر رابط رفع مؤقت مخصص للطلب، ويُرفع الملف مباشرة إلى ملف القضية دون إنشاء حساب، وتنتهي صلاحية الرابط بعد استخدامه أو انقضاء مدته.",
    ],
  },
  {
    id: "subscription",
    heading: "كيف يعمل الاشتراك وحدود الاستخدام؟",
    paragraphs: [
      "تُحدَّد حدود الاستخدام بحسب الباقة المشترك بها، وتُطبَّق تقنياً على مستوى الخادم. يبقى الاشتراك سارياً حتى نهاية مدته المدفوعة، وتفاصيل الشروط في صفحة الشروط والأحكام.",
    ],
  },
  {
    id: "advice",
    heading: "هل تُقدّم مِهلة استشارات قانونية؟",
    paragraphs: [
      "لا. مِهلة منصة تقنية تنظيمية فقط، وليست مكتب محاماة، ولا تُصدر رأياً قانونياً، ولا تنوب عن المحامي في أي إجراء نظامي.",
    ],
  },
];

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
          mainEntity: FAQ.map((item) => ({
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
        <ContentSections sections={FAQ} />
      </div>
    </PublicShell>
  );
}
