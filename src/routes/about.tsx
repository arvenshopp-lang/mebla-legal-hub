import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { publicSiteQueryOptions } from "@/lib/public-site.query";
import { publicContactEmail } from "@/lib/public-site.shared";
import {
  ContentSections,
  PageHeading,
  PublicShell,
  type ContentSection,
} from "@/components/marketing/public-shell";
import { socialPreviewMeta } from "@/config/brand-assets";

const TITLE = "من نحن — مِهلة | MEHLA";
const DESCRIPTION =
  "مِهلة منصة تقنية سعودية لإدارة أعمال مكاتب المحاماة: القضايا والجلسات والمهل والمستندات، بمعايير خصوصية وحفظ بيانات صارمة.";

export const Route = createFileRoute("/about")({
  loader: ({ context }) => context.queryClient.ensureQueryData(publicSiteQueryOptions()),
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://mehlalex.com/about" },
      ...socialPreviewMeta({ title: TITLE, description: DESCRIPTION }),
    ],
    links: [{ rel: "canonical", href: "https://mehlalex.com/about" }],
  }),
  component: AboutRoute,
});

const SECTIONS: ContentSection[] = [
  {
    id: "identity",
    heading: "هوية المنصة",
    paragraphs: [
      "مِهلة منصة تقنية عربية موجّهة للسوق السعودي، تُستخدم داخل مكاتب المحاماة وإدارات الشؤون القانونية لتنظيم العمل اليومي: ملفات القضايا، مواعيد الجلسات، المهل النظامية، المهام، والمستندات.",
      "المنصة أداة تنظيمية بحتة. مِهلة ليست مكتب محاماة، ولا تُقدّم استشارات قانونية، ولا تنوب عن المحامي في أي إجراء أمام الجهات القضائية أو التنفيذية.",
    ],
  },
  {
    id: "mission",
    heading: "لماذا بُنيت مِهلة",
    paragraphs: [
      "أكثر ما يهدد جودة العمل القانوني ليس نقص الخبرة، بل تعدد الملفات وتشتت المواعيد. تُبنى مِهلة حول فكرة واحدة: أن يعرف المحامي — في نظرة واحدة — ما الذي يستحق انتباهه اليوم.",
      "لذلك تُصمَّم كل شاشة لتقليل العبء الذهني: معلومات أقل على الشاشة، ترتيب ثابت، ومسار واضح لكل إجراء.",
    ],
  },
  {
    id: "audience",
    heading: "لمن نعمل",
    paragraphs: ["تُخدم المنصة الممارسين النظاميين على اختلاف أحجام أعمالهم:"],
    subsections: [
      {
        heading: "الممارسة الفردية",
        items: [
          "المحامون المرخّصون العاملون بصفة فردية.",
          "المستشارون القانونيون ومقدّمو الخدمات النظامية.",
        ],
      },
      {
        heading: "الفرق والجهات",
        items: [
          "مكاتب وشركات المحاماة ذات الفرق المتعددة.",
          "إدارات الشؤون القانونية داخل الشركات والجهات.",
        ],
      },
    ],
  },
  {
    id: "principles",
    heading: "مبادئ نعمل بها",
    subsections: [
      {
        heading: "الخصوصية والسرّية",
        items: [
          "سرّية العميل أولاً: بيانات كل مكتب معزولة تماماً على مستوى قاعدة البيانات.",
          "الشفافية: ما نجمعه من بيانات وكيف نحفظه معلن في سياسة الخصوصية.",
        ],
      },
      {
        heading: "منهج التصميم والمسؤولية",
        items: [
          "الوضوح قبل الكثرة: لا نضيف ميزة تزيد الضجيج ولا تخدم قراراً مهنياً.",
          "المسؤولية تبقى للمحامي: التنبيهات مساندة تنظيمية ولا تُغني عن المتابعة المهنية.",
        ],
      },
    ],
  },
  {
    id: "scope",
    heading: "حدود الخدمة",
    paragraphs: [
      "لا تُصدر مِهلة رأياً قانونياً، ولا تُحدد المهل النظامية نيابةً عن المستخدم، ولا تتحقق من صحة البيانات التي يُدخلها المكتب. صحة المواعيد والمهل والمستندات مسؤولية المكتب وحده.",
    ],
    subsections: [
      {
        heading: "ما تقوم به المنصة",
        items: [
          "تنظيم ملفات القضايا والجلسات والمهل والمهام والمستندات.",
          "تنبيهات تنظيمية بناءً على ما يُدخله المكتب.",
        ],
      },
      {
        heading: "ما لا تقوم به المنصة",
        items: [
          "لا تُقدّم استشارة أو رأياً قانونياً.",
          "لا تنوب عن المحامي أمام الجهات القضائية أو التنفيذية.",
        ],
      },
    ],
    note: "أي معلومة نظامية تظهر في المنصة تعتمد على ما يُدخله المكتب، ويجب مراجعتها من المحامي المختص قبل الاعتماد عليها.",
  },
];

function AboutRoute() {
  const { data: info } = useSuspenseQuery(publicSiteQueryOptions());
  const email = publicContactEmail(info);

  return (
    <PublicShell>
      <PageHeading
        eyebrow="مركز الثقة"
        title="من نحن"
        intro="مِهلة منصة تقنية سعودية تُنظّم أعمال مكاتب المحاماة اليومية، بمعايير خصوصية وحفظ بيانات مبنية على طبيعة العمل القانوني."
      />
      <div className="container-page max-w-3xl py-10 md:py-14">
        <ContentSections sections={SECTIONS} />
        <div className="mt-12 rounded-[var(--radius-m)] border border-border bg-surface p-5">
          <h2 className="text-[13px] font-bold">للتواصل الرسمي</h2>
          <p className="mt-2 text-body-sm leading-7 text-muted-foreground">
            للاستفسارات العامة والشراكات يمكنك مراسلتنا على{" "}
            <a
              href={`mailto:${email}`}
              dir="ltr"
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              {email}
            </a>{" "}
            أو عبر{" "}
            <Link
              to="/contact"
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              صفحة التواصل
            </Link>
            .
          </p>
        </div>
      </div>
    </PublicShell>
  );
}
